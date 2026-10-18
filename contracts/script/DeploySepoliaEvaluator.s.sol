// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";

import {ARLJobs} from "../src/ARLJobs.sol";
import {
    ARLVerifiedEvaluator,
    IERC8004Identity,
    IERC8004Reputation
} from "../src/ARLVerifiedEvaluator.sol";
import {ARLDeployPlan} from "./ARLDeployPlan.sol";
import {ISafe} from "./CreateSafes.s.sol";

/// @title Base Sepolia verified evaluator for the deployed jobs escrow
/// @notice Base Sepolia (84532) and the local chain (31337) only. Deploys `ARLVerifiedEvaluator`
/// for an existing `ARLJobs`; stakes and bonds are in that escrow's payment token. On Base
/// Sepolia the arbiter must be a genuine Safe v1.5.0 with a threshold of at least two (created
/// with `CreateArbiterSafe`, see docs/arbiter-safe.md), and the evaluator writes job outcomes to
/// the canonical ERC-8004 registries; on the local chain it writes none. The contract has no
/// owner: the deployer keeps no role. Every parameter is fixed at deployment.
///
/// Inputs (environment): `ARL_JOBS`, `ARL_ARBITER`, optionally `ARL_MIN_CHALLENGE_WINDOW`
/// (seconds, default 1 hour) and `ARL_MIN_BOND` (wei of the escrow token, default 1 token).
///   forge script script/DeploySepoliaEvaluator.s.sol:DeploySepoliaEvaluator \
///     --rpc-url https://sepolia.base.org --broadcast --account <keystore> --slow
contract DeploySepoliaEvaluator is Script {
    uint256 internal constant BASE_SEPOLIA = 84_532;
    uint256 internal constant LOCAL = 31_337;
    /// @notice Canonical ERC-8004 registries on Base Sepolia (`apps/dapp/lib/registry.ts`,
    /// `apps/dapp/lib/reputation.ts`).
    address public constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address public constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    uint64 public constant DEFAULT_MIN_CHALLENGE_WINDOW = 1 hours;
    /// @notice Testnet floor: a technical gate against zero-cost votes, not an economic bond.
    uint96 public constant DEFAULT_MIN_BOND = 1 ether;
    /// @notice Fewest signatures the arbiter Safe may require.
    uint256 public constant MIN_ARBITER_THRESHOLD = 2;

    error ChainNotAllowed(uint256 chainId);
    error NoCode(string what, address account);
    error ArbiterNotASafe(address arbiter);
    error ArbiterThresholdTooLow(uint256 threshold);

    function run() external returns (ARLVerifiedEvaluator evaluator) {
        address jobs = vm.envAddress("ARL_JOBS");
        address arbiter = vm.envAddress("ARL_ARBITER");
        uint64 window =
            uint64(vm.envOr("ARL_MIN_CHALLENGE_WINDOW", uint256(DEFAULT_MIN_CHALLENGE_WINDOW)));
        uint96 minBond = uint96(vm.envOr("ARL_MIN_BOND", uint256(DEFAULT_MIN_BOND)));
        vm.startBroadcast();
        evaluator = deploy(jobs, arbiter, window, minBond);
        vm.stopBroadcast();
    }

    /// @notice Checks the chain and the inputs, then deploys. Reverts on any other chain, when
    /// the jobs contract or its token has no code, and on Base Sepolia when the registries are
    /// missing or the arbiter is not a Safe of at least two signatures.
    function deploy(address jobs, address arbiter, uint64 minChallengeWindow, uint96 minBond)
        public
        returns (ARLVerifiedEvaluator)
    {
        if (block.chainid != BASE_SEPOLIA && block.chainid != LOCAL) {
            revert ChainNotAllowed(block.chainid);
        }
        if (jobs.code.length == 0) revert NoCode("jobs", jobs);
        address token = address(ARLJobs(jobs).paymentToken());
        if (token.code.length == 0) revert NoCode("token", token);
        // The local chain has no ERC-8004 registries: the evaluator then writes no feedback.
        bool sepolia = block.chainid == BASE_SEPOLIA;
        address identity = sepolia ? IDENTITY_REGISTRY : address(0);
        address reputation = sepolia ? REPUTATION_REGISTRY : address(0);
        if (sepolia) {
            if (identity.code.length == 0) revert NoCode("identity registry", identity);
            if (reputation.code.length == 0) revert NoCode("reputation registry", reputation);
            checkArbiter(arbiter);
        }
        return new ARLVerifiedEvaluator(
            ARLJobs(jobs),
            arbiter,
            minChallengeWindow,
            minBond,
            IERC8004Identity(identity),
            IERC8004Reputation(reputation)
        );
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
