// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";

import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";
import {ARLDeployPlan, Plan} from "./ARLDeployPlan.sol";
import {Deployment} from "./ARLDeployer.sol";
import {ARLVerify} from "./ARLVerify.sol";

/// @title Verify a deployed ARL system (read-only)
/// @notice Inputs (environment): `ARL_PLAN` and `ARL_DEPLOYMENT`. Run without `--broadcast`.
/// Reverts with the name of the first check that fails.
contract VerifyARL is Script {
    function run() external view {
        Plan memory plan = ARLDeployPlan.load(vm.readFile(vm.envString("ARL_PLAN")));
        string memory json = vm.readFile(vm.envString("ARL_DEPLOYMENT"));

        if (vm.parseJsonUint(json, ".chainId") != block.chainid) {
            revert ARLVerify.VerifyUintMismatch(
                "deployment chain id", vm.parseJsonUint(json, ".chainId"), block.chainid
            );
        }

        // A deployment record from the superseded founder-vesting architecture is not accepted.
        if (vm.keyExistsJson(json, ".founderVesting")) {
            revert ARLVerify.VerifyFailed("no founder vesting wallet");
        }

        Deployment memory d = Deployment({
            deployer: vm.parseJsonAddress(json, ".deployer"),
            token: ARLToken(vm.parseJsonAddress(json, ".token")),
            investorsVesting: ARLVestingWallet(
                payable(vm.parseJsonAddress(json, ".investorsVesting"))
            ),
            partnershipsVesting: ARLVestingWallet(
                payable(vm.parseJsonAddress(json, ".partnershipsVesting"))
            ),
            timelock: ARLTimelock(payable(vm.parseJsonAddress(json, ".timelock")))
        });

        ARLVerify.verify(plan, d);
    }
}
