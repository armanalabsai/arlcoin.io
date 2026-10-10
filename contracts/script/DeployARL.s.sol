// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
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
/// addresses are written. Any failure reverts the script. The deployment record is written only
/// when the transactions are actually sent (`--broadcast` or `--resume`); a dry run, including
/// the one prepared for signing from a phone, writes nothing.
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

        if (!_broadcasting()) {
            console2.log("Dry run: nothing was deployed, so no deployment record is written.");
            return d;
        }

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

    /// @dev True only when forge sends the transactions; false in a dry run and in tests.
    function _broadcasting() private view returns (bool) {
        return vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)
            || vm.isContext(VmSafe.ForgeContext.ScriptResume);
    }
}
