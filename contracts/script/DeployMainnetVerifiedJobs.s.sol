// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../src/ARLJobs.sol";
import {
    ARLVerifiedEvaluator,
    IERC8004Identity,
    IERC8004Reputation
} from "../src/ARLVerifiedEvaluator.sol";
import {ARLDeployPlan} from "./ARLDeployPlan.sol";
import {ISafe} from "./CreateSafes.s.sol";

/// @title Base Mainnet jobs escrow and verified evaluator
/// @notice Base Mainnet (8453) and the local chain (31337) only. Deploys `ARLJobs` (ERC-8183
/// escrow) and `ARLVerifiedEvaluator` for it, in two transactions from the sender. On Base
/// Mainnet the escrow is paid in ARL or in USDC and validator bonds are always in ARL; the
/// arbiter must be a genuine Safe v1.5.0 with a threshold of at least two (created with
/// `CreateArbiterSafe`, see docs/arbiter-safe.md), and the evaluator writes job outcomes to the
/// canonical ERC-8004 v2.0.0 registries on Base. Neither contract has an owner: the deployer
/// keeps no role, and every parameter is fixed at deployment.
///
/// Inputs (environment): `ARL_ARBITER`; optionally `ARL_TOKEN` (the escrow's payment token,
/// default: the Base Mainnet ARL token; required on the local chain), `ARL_STAKE_TOKEN` (the
/// bond token, default: ARL on Base Mainnet, the payment token on the local chain),
/// `ARL_MIN_CHALLENGE_WINDOW` (seconds, default 24 hours) and `ARL_MIN_BOND` (wei of the stake
/// token, default 100 ARL). With `ARL_JOBS` set to an escrow already on chain, only the evaluator
/// is deployed, for that escrow.
///   forge script script/DeployMainnetVerifiedJobs.s.sol:DeployMainnetVerifiedJobs \
///     --rpc-url https://mainnet.base.org --sender <deployer>
/// (a dry run; the owner signs the run file on the app's Deploy screen).
contract DeployMainnetVerifiedJobs is Script {
    uint256 internal constant BASE_MAINNET = 8453;
    uint256 internal constant LOCAL = 31_337;
    /// @notice The ARL token on Base Mainnet (docs/mainnet-plan.md).
    address public constant ARL_TOKEN = 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4;
    /// @notice Circle's native USDC on Base Mainnet.
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    /// @notice Canonical ERC-8004 v2.0.0 registries on Base Mainnet.
    address public constant IDENTITY_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address public constant REPUTATION_REGISTRY = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;
    uint64 public constant DEFAULT_MIN_CHALLENGE_WINDOW = 24 hours;
    /// @notice Floor of a validator's bond per job: 100 ARL (20 USD at the 0.20 USD listing price).
    /// For the escrow paid in ARL a job's bond is the larger of this floor and a tenth of its
    /// budget; for the escrow paid in USDC it is the job's floor, at least this.
    uint96 public constant DEFAULT_MIN_BOND = 100 ether;
    /// @notice Fewest signatures the arbiter Safe may require.
    uint256 public constant MIN_ARBITER_THRESHOLD = 2;

    error ChainNotAllowed(uint256 chainId);
    error NoCode(string what, address account);
    error WrongToken(address token);
    error WrongStakeToken(address token);
    error ArbiterNotASafe(address arbiter);
    error ArbiterThresholdTooLow(uint256 threshold);
    error WrongJobsToken(address jobs);
    error NotARLJobs(address jobs);

    function run() external returns (ARLJobs jobs, ARLVerifiedEvaluator evaluator) {
        address arbiter = vm.envAddress("ARL_ARBITER");
        address payment = vm.envOr("ARL_TOKEN", ARL_TOKEN);
        address stake =
            vm.envOr("ARL_STAKE_TOKEN", block.chainid == BASE_MAINNET ? ARL_TOKEN : payment);
        uint64 window =
            uint64(vm.envOr("ARL_MIN_CHALLENGE_WINDOW", uint256(DEFAULT_MIN_CHALLENGE_WINDOW)));
        uint96 minBond = uint96(vm.envOr("ARL_MIN_BOND", uint256(DEFAULT_MIN_BOND)));
        address existing = vm.envOr("ARL_JOBS", address(0));
        if (existing != address(0)) {
            jobs = ARLJobs(existing);
            return (jobs, deployEvaluator(jobs, payment, stake, arbiter, window, minBond));
        }
        return deploy(payment, stake, arbiter, window, minBond);
    }

    /// @notice Only the evaluator, for an escrow already on chain (`ARL_JOBS`): reverts unless
    /// the escrow runs the `ARLJobs` code and is paid in `payment`.
    function deployEvaluator(
        ARLJobs jobs,
        address payment,
        address stake,
        address arbiter,
        uint64 window,
        uint96 minBond
    ) public returns (ARLVerifiedEvaluator evaluator) {
        check(payment, stake, arbiter);
        checkJobs(jobs, payment);
        vm.startBroadcast();
        evaluator = _evaluator(jobs, stake, arbiter, window, minBond);
        vm.stopBroadcast();
    }

    /// @notice Reverts unless `jobs` holds the runtime code of `ARLJobs` for `token` and is paid
    /// in it.
    function checkJobs(ARLJobs jobs, address token) public {
        if (address(jobs).code.length == 0) revert NoCode("jobs escrow", address(jobs));
        if (address(jobs.paymentToken()) != token) revert WrongJobsToken(address(jobs));
        ARLJobs expected = new ARLJobs(IERC20(token));
        if (address(jobs).codehash != address(expected).codehash) {
            revert NotARLJobs(address(jobs));
        }
    }

    /// @notice The deployment itself, with every input explicit (`run` reads them from the
    /// environment). Tests call this, so they never depend on process-wide environment variables
    /// that other test suites set in parallel.
    function deploy(address payment, address stake, address arbiter, uint64 window, uint96 minBond)
        public
        returns (ARLJobs jobs, ARLVerifiedEvaluator evaluator)
    {
        check(payment, stake, arbiter);
        vm.startBroadcast();
        jobs = new ARLJobs(IERC20(payment));
        evaluator = _evaluator(jobs, stake, arbiter, window, minBond);
        vm.stopBroadcast();
    }

    /// @notice A stake token equal to the payment token is passed as zero, so the evaluator takes
    /// the escrow's token and bonds follow the budget.
    function _evaluator(ARLJobs jobs, address stake, address arbiter, uint64 window, uint96 minBond)
        internal
        returns (ARLVerifiedEvaluator)
    {
        address stakeArg = stake == address(jobs.paymentToken()) ? address(0) : stake;
        return new ARLVerifiedEvaluator(
            jobs,
            arbiter,
            window,
            minBond,
            IERC8004Identity(identity()),
            IERC8004Reputation(reputation()),
            IERC20(stakeArg)
        );
    }

    /// @notice Reverts on any other chain, when a token has no code, and on Base Mainnet when the
    /// payment token is neither ARL nor USDC, bonds are not in ARL, the registries are missing or
    /// the arbiter is not a Safe of at least two signatures.
    function check(address payment, address stake, address arbiter) public view {
        if (block.chainid != BASE_MAINNET && block.chainid != LOCAL) {
            revert ChainNotAllowed(block.chainid);
        }
        ARLDeployPlan.networkGate(block.chainid);
        if (payment.code.length == 0) revert NoCode("token", payment);
        if (stake.code.length == 0) revert NoCode("stake token", stake);
        if (block.chainid == BASE_MAINNET) {
            if (payment != ARL_TOKEN && payment != USDC) revert WrongToken(payment);
            if (stake != ARL_TOKEN) revert WrongStakeToken(stake);
            if (IDENTITY_REGISTRY.code.length == 0) {
                revert NoCode("identity registry", IDENTITY_REGISTRY);
            }
            if (REPUTATION_REGISTRY.code.length == 0) {
                revert NoCode("reputation registry", REPUTATION_REGISTRY);
            }
            checkArbiter(arbiter);
        }
    }

    /// @notice The local chain has no ERC-8004 registries: the evaluator then writes no feedback.
    function identity() public view returns (address) {
        return block.chainid == BASE_MAINNET ? IDENTITY_REGISTRY : address(0);
    }

    function reputation() public view returns (address) {
        return block.chainid == BASE_MAINNET ? REPUTATION_REGISTRY : address(0);
    }

    /// @notice Reverts unless `arbiter` runs the Safe v1.5.0 proxy code over one of the two
    /// canonical singletons and requires at least `MIN_ARBITER_THRESHOLD` signatures.
    function checkArbiter(address arbiter) public view {
        address[] memory singletons = new address[](2);
        singletons[0] = ARLDeployPlan.SAFE_SINGLETON_V150;
        singletons[1] = ARLDeployPlan.SAFE_L2_SINGLETON_V150;
        if (!ARLDeployPlan.isSafeProxy(arbiter, singletons, ARLDeployPlan.SAFE_PROXY_V150_CODEHASH))
        {
            revert ArbiterNotASafe(arbiter);
        }
        uint256 threshold = ISafe(arbiter).getThreshold();
        if (threshold < MIN_ARBITER_THRESHOLD) revert ArbiterThresholdTooLow(threshold);
    }
}
