// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLStakingRewards} from "../src/ARLStakingRewards.sol";
import {ARLJobs} from "../src/ARLJobs.sol";

/// @title Base Sepolia ecosystem contracts: staking and the jobs escrow
/// @notice Base Sepolia (84532) only. Deploys `ARLStakingRewards` (stake ARL, rewards in ARL,
/// funded by the Community & Staking Safe) and `ARLJobs` (ERC-8183 escrow paid in ARL) against
/// the deployed testnet ARL token. Neither contract has an owner or admin: the deployer keeps no
/// role. The reward period is funded afterwards by the Community & Staking Safe
/// (`approve` + `notifyRewardAmount`), which is the only account the staking contract accepts.
///
/// Inputs (environment): `ARL_TOKEN`, `ARL_REWARDS_DISTRIBUTION` (the Community & Staking Safe),
/// optionally `ARL_ECOSYSTEM_OUT` (default `deploy/deployments/84532-ecosystem.json`).
///   forge script script/DeploySepoliaEcosystem.s.sol:DeploySepoliaEcosystem \
///     --rpc-url https://sepolia.base.org --broadcast --account <keystore> --slow
contract DeploySepoliaEcosystem is Script {
    uint256 internal constant BASE_SEPOLIA = 84_532;
    /// @dev Testnet reward period, as on the local chain (docs/app.md).
    uint256 public constant REWARDS_DURATION = 30 days;

    error SepoliaOnly(uint256 chainId);
    error NoCode(string what, address account);

    function run() external returns (ARLStakingRewards staking, ARLJobs jobs) {
        if (block.chainid != BASE_SEPOLIA) revert SepoliaOnly(block.chainid);
        address token = vm.envAddress("ARL_TOKEN");
        address distribution = vm.envAddress("ARL_REWARDS_DISTRIBUTION");
        if (token.code.length == 0) revert NoCode("ARL token", token);
        // The Community & Staking holder is a Safe: a contract, never an EOA.
        if (distribution.code.length == 0) revert NoCode("rewards distribution", distribution);

        vm.startBroadcast();
        staking =
            new ARLStakingRewards(IERC20(token), IERC20(token), distribution, REWARDS_DURATION);
        jobs = new ARLJobs(IERC20(token));
        vm.stopBroadcast();

        vm.createDir("deploy/deployments", true);
        vm.writeJson(
            string.concat(
                '{"chainId":84532,"token":"',
                vm.toString(token),
                '","rewardsDistribution":"',
                vm.toString(distribution),
                '","staking":"',
                vm.toString(address(staking)),
                '","jobs":"',
                vm.toString(address(jobs)),
                '","rewardsDuration":',
                vm.toString(REWARDS_DURATION),
                "}"
            ),
            vm.envOr("ARL_ECOSYSTEM_OUT", string("deploy/deployments/84532-ecosystem.json"))
        );
    }
}
