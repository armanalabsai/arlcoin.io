// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";

import {ARLStakingRewards} from "../src/ARLStakingRewards.sol";
import {ARLDeployPlan, Plan} from "./ARLDeployPlan.sol";
import {ARLStakingVerify} from "./ARLStakingVerify.sol";

/// @title Verify a deployed staking contract (read-only)
/// @notice Inputs (environment): `ARL_PLAN`, `ARL_DEPLOYMENT` (its `.token` is the ARL token),
/// `ARL_STAKING` (the staking contract address) and optionally `ARL_STAKING_FRESH` (default
/// true: run right after deployment). Run without `--broadcast`. Reverts with the name of the
/// first check that fails; in particular, the reward distributor must be the plan's Community &
/// Staking holder.
contract VerifyStaking is Script {
    function run() external view {
        Plan memory plan = ARLDeployPlan.load(vm.readFile(vm.envString("ARL_PLAN")));
        string memory deployment = vm.readFile(vm.envString("ARL_DEPLOYMENT"));
        if (vm.parseJsonUint(deployment, ".chainId") != block.chainid) {
            revert ARLStakingVerify.StakingVerifyUintMismatch(
                "deployment chain id", vm.parseJsonUint(deployment, ".chainId"), block.chainid
            );
        }
        ARLStakingVerify.verify(
            plan,
            vm.parseJsonAddress(deployment, ".token"),
            ARLStakingRewards(vm.envAddress("ARL_STAKING")),
            vm.envOr("ARL_STAKING_FRESH", true)
        );
    }
}
