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
///
/// The plan is validated before anything is broadcast and the simulated result is verified.
/// Any failure reverts the script. The script writes no deployment record: forge runs it before
/// it sends anything, so it cannot know what reached the chain. The record is written afterwards
/// by `packages/deploy/src/record-cli.ts arl`, from Foundry's run file and only after every
/// created contract is checked on chain.
contract DeployARL is Script {
    function run() external returns (Deployment memory d) {
        // Refuse Base Mainnet before the TGE and unsupported chains before reading any input.
        ARLDeployPlan.networkGate(block.chainid);
        Plan memory plan = ARLDeployPlan.load(vm.readFile(vm.envString("ARL_PLAN")));
        ARLDeployPlan.validate(plan);

        vm.startBroadcast();
        (VmSafe.CallerMode mode, address deployer, address origin) = vm.readCallers();
        if (mode != VmSafe.CallerMode.RecurrentBroadcast) revert("DeployARL: not broadcasting");
        if (origin != deployer) revert("DeployARL: broadcaster is not the transaction origin");
        d = ARLDeployer.deploy(plan, deployer);
        vm.stopBroadcast();

        ARLVerify.verify(plan, d);
    }
}
