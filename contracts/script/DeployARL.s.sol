// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ARLDeployPlan, Plan} from "./ARLDeployPlan.sol";
import {ARLDeployer, Deployment} from "./ARLDeployer.sol";
import {ARLVerify} from "./ARLVerify.sol";

/// @title Deploy the ARL system
/// @notice Inputs (environment):
/// - `ARL_PLAN`: plan produced by `packages/deploy` (under `contracts/deploy/`).
/// - `ARL_DEPLOYMENT`: where to write the deployed addresses (under
///   `contracts/deploy/deployments/`, which is git-ignored).
///
/// The plan is validated before anything is broadcast, and the result is verified before the
/// addresses are written. Any failure reverts the script.
contract DeployARL is Script {
    function run() external returns (Deployment memory d) {
        Plan memory plan = ARLDeployPlan.load(vm.readFile(vm.envString("ARL_PLAN")));
        ARLDeployPlan.validate(plan);

        vm.startBroadcast();
        (VmSafe.CallerMode mode, address deployer, address origin) = vm.readCallers();
        if (mode != VmSafe.CallerMode.RecurrentBroadcast) revert("DeployARL: not broadcasting");
        if (origin != deployer) revert("DeployARL: broadcaster is not the transaction origin");
        d = ARLDeployer.deploy(plan, deployer);
        vm.stopBroadcast();

        ARLVerify.verify(plan, d);

        string memory json = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"deployer":"',
            vm.toString(d.deployer),
            '","token":"',
            vm.toString(address(d.token)),
            '","investorsVesting":"',
            vm.toString(address(d.investorsVesting)),
            '","partnershipsVesting":"',
            vm.toString(address(d.partnershipsVesting)),
            '","timelock":"',
            vm.toString(address(d.timelock)),
            '"}'
        );
        vm.writeFile(vm.envString("ARL_DEPLOYMENT"), json);
    }
}
