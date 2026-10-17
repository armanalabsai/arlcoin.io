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

/// @title Base Sepolia verified evaluator for the deployed jobs escrow
/// @notice Base Sepolia (84532) and the local chain (31337) only. Deploys `ARLVerifiedEvaluator`
/// for an existing `ARLJobs`, with ARL as the stake token. On Base Sepolia the evaluator writes
/// job outcomes to the canonical ERC-8004 registries; on the local chain it writes none. The
/// contract has no owner: the deployer keeps no role. Every parameter is fixed at deployment.
///
/// Inputs (environment): `ARL_JOBS`, `ARL_TOKEN`, `ARL_ARBITER`, optionally
/// `ARL_CHALLENGE_WINDOW` (seconds, default 1 hour) and `ARL_MIN_BOND` (wei, default 10 ARL).
///   forge script script/DeploySepoliaEvaluator.s.sol:DeploySepoliaEvaluator \
///     --rpc-url https://sepolia.base.org --broadcast --account <keystore> --slow
contract DeploySepoliaEvaluator is Script {
    uint256 internal constant BASE_SEPOLIA = 84_532;
    uint256 internal constant LOCAL = 31_337;
    /// @notice Canonical ERC-8004 registries on Base Sepolia (`apps/dapp/lib/registry.ts`,
    /// `apps/dapp/lib/reputation.ts`).
    address public constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address public constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    uint64 public constant DEFAULT_CHALLENGE_WINDOW = 1 hours;
    uint96 public constant DEFAULT_MIN_BOND = 10 ether;

    error ChainNotAllowed(uint256 chainId);
    error NoCode(string what, address account);

    function run() external returns (ARLVerifiedEvaluator evaluator) {
        address jobs = vm.envAddress("ARL_JOBS");
        address token = vm.envAddress("ARL_TOKEN");
        address arbiter = vm.envAddress("ARL_ARBITER");
        uint64 window = uint64(vm.envOr("ARL_CHALLENGE_WINDOW", uint256(DEFAULT_CHALLENGE_WINDOW)));
        uint96 minBond = uint96(vm.envOr("ARL_MIN_BOND", uint256(DEFAULT_MIN_BOND)));
        vm.startBroadcast();
        evaluator = deploy(jobs, token, arbiter, window, minBond);
        vm.stopBroadcast();
    }

    /// @notice Checks the chain and the inputs, then deploys. Reverts on any other chain, when
    /// the jobs contract or the token has no code, or when the registries are missing on Base
    /// Sepolia.
    function deploy(address jobs, address token, address arbiter, uint64 window, uint96 minBond)
        public
        returns (ARLVerifiedEvaluator)
    {
        if (block.chainid != BASE_SEPOLIA && block.chainid != LOCAL) {
            revert ChainNotAllowed(block.chainid);
        }
        if (jobs.code.length == 0) revert NoCode("jobs", jobs);
        if (token.code.length == 0) revert NoCode("token", token);
        // The local chain has no ERC-8004 registries: the evaluator then writes no feedback.
        bool sepolia = block.chainid == BASE_SEPOLIA;
        address identity = sepolia ? IDENTITY_REGISTRY : address(0);
        address reputation = sepolia ? REPUTATION_REGISTRY : address(0);
        if (sepolia) {
            if (identity.code.length == 0) revert NoCode("identity registry", identity);
            if (reputation.code.length == 0) revert NoCode("reputation registry", reputation);
        }
        return new ARLVerifiedEvaluator(
            ARLJobs(jobs),
            IERC20(token),
            arbiter,
            window,
            minBond,
            IERC8004Identity(identity),
            IERC8004Reputation(reputation)
        );
    }
}
