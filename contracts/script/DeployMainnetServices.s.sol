// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLStakingRewards} from "../src/ARLStakingRewards.sol";
import {ComputePayment} from "../src/ComputePayment.sol";
import {ARLDeployPlan} from "./ARLDeployPlan.sol";
import {ISafe} from "./CreateSafes.s.sol";

/// @title Base Mainnet network services: compute payment and staking rewards
/// @notice Base Mainnet (8453) and the local chain (31337) only. Deploys `ComputePayment`
/// (per-second streams in ARL) and `ARLStakingRewards` (stake ARL, rewards in ARL), in two
/// transactions from the sender. Neither contract has an owner: the deployer keeps no role.
/// On Base Mainnet both use the ARL token, and the only account that can fund a reward period is
/// the Community & Staking Safe (docs/mainnet-plan.md), which must be a Safe of at least two
/// signatures. Nothing is funded here: the Safe funds a period afterwards (`approve` +
/// `notifyRewardAmount`).
///
/// Inputs (environment, local chain only): `ARL_TOKEN`, `ARL_REWARDS_DISTRIBUTION`; optionally
/// `ARL_REWARDS_DURATION` (seconds, default 180 days).
///   forge script script/DeployMainnetServices.s.sol:DeployMainnetServices \
///     --rpc-url https://mainnet.base.org --sender <deployer>
/// (a dry run; the owner signs the run file on the app's Deploy screen).
contract DeployMainnetServices is Script {
    uint256 internal constant BASE_MAINNET = 8453;
    uint256 internal constant LOCAL = 31_337;
    /// @notice The ARL token on Base Mainnet (docs/mainnet-plan.md).
    address public constant ARL_TOKEN = 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4;
    /// @notice The Community & Staking allocation Safe on Base Mainnet (docs/mainnet-plan.md).
    address public constant COMMUNITY_STAKING_SAFE = 0xfF12597A671ebAF0cAe37999EE659e03c4f444B5;
    /// @notice Length of a reward period (owner decision of 2026-11-01).
    uint256 public constant DEFAULT_REWARDS_DURATION = 180 days;
    /// @notice Fewest signatures the rewards Safe may require.
    uint256 public constant MIN_SAFE_THRESHOLD = 2;

    error ChainNotAllowed(uint256 chainId);
    error NoCode(string what, address account);
    error WrongToken(address token);
    error WrongDistribution(address distribution);
    error DistributionNotASafe(address distribution);
    error DistributionThresholdTooLow(uint256 threshold);
    error DeploymentCheckFailed();

    function run() external returns (ComputePayment payment, ARLStakingRewards staking) {
        if (block.chainid == BASE_MAINNET) {
            return deploy(ARL_TOKEN, COMMUNITY_STAKING_SAFE, DEFAULT_REWARDS_DURATION);
        }
        return deploy(
            vm.envAddress("ARL_TOKEN"),
            vm.envAddress("ARL_REWARDS_DISTRIBUTION"),
            vm.envOr("ARL_REWARDS_DURATION", DEFAULT_REWARDS_DURATION)
        );
    }

    /// @notice The deployment itself, with every input explicit (`run` reads them from the
    /// environment). Tests call this, so they never depend on process-wide environment variables
    /// that other test suites set in parallel.
    function deploy(address token, address distribution, uint256 duration)
        public
        returns (ComputePayment payment, ARLStakingRewards staking)
    {
        check(token, distribution, duration);
        vm.startBroadcast();
        payment = new ComputePayment(IERC20(token));
        staking = new ARLStakingRewards(IERC20(token), IERC20(token), distribution, duration);
        vm.stopBroadcast();

        if (
            address(payment.paymentToken()) != token || payment.streamCounter() != 0
                || address(staking.stakingToken()) != token
                || address(staking.rewardsToken()) != token
                || staking.rewardsDistribution() != distribution
                || staking.rewardsDuration() != duration || staking.totalSupply() != 0
        ) revert DeploymentCheckFailed();
    }

    /// @notice Reverts on any other chain, when the token has no code, and on Base Mainnet when
    /// the token is not ARL, the period is not 180 days, or the distributor is not the Community
    /// & Staking Safe with at least two signatures.
    function check(address token, address distribution, uint256 duration) public view {
        if (block.chainid != BASE_MAINNET && block.chainid != LOCAL) {
            revert ChainNotAllowed(block.chainid);
        }
        ARLDeployPlan.networkGate(block.chainid);
        if (token.code.length == 0) revert NoCode("token", token);
        if (block.chainid == BASE_MAINNET) {
            if (token != ARL_TOKEN) revert WrongToken(token);
            if (distribution != COMMUNITY_STAKING_SAFE || duration != DEFAULT_REWARDS_DURATION) {
                revert WrongDistribution(distribution);
            }
            if (distribution.code.length == 0) revert DistributionNotASafe(distribution);
            // A low-level read: an account that answers nothing, or reverts, is not a Safe.
            (bool ok, bytes memory out) =
                distribution.staticcall(abi.encodeCall(ISafe.getThreshold, ()));
            if (!ok || out.length != 32) revert DistributionNotASafe(distribution);
            uint256 threshold = abi.decode(out, (uint256));
            if (threshold < MIN_SAFE_THRESHOLD) revert DistributionThresholdTooLow(threshold);
        }
    }
}
