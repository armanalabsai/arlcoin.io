// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLDeployPlan} from "../../script/ARLDeployPlan.sol";
import {DeployDistributor} from "../../script/DeployDistributor.s.sol";

contract DeployDistributorTest is Test {
    DeployDistributor internal script;
    string internal list;

    function setUp() public {
        script = new DeployDistributor();
        list = vm.readFile("test/fixtures/distribution.json");
    }

    /// @dev The launch parameters are still TBD; the flag records that and opens nothing.
    function test_LaunchParametersAreNotApprovedYet() public view {
        assertFalse(script.LAUNCH_PARAMETERS_APPROVED());
    }

    /// @dev The distributor uses the shared network gate: local Anvil and Base Sepolia pass,
    /// Base Mainnet and every other chain revert.
    function test_NetworkGate() public {
        script.networkGate(31337);
        script.networkGate(84532);
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanProductionLocked.selector, 8453));
        script.networkGate(8453);
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanChainNotSupported.selector, 1));
        script.networkGate(1);
    }

    /// @dev `run` checks the network before reading any input, so no environment variable or
    /// file can reach a Base Mainnet deployment.
    function test_RevertWhen_RunOnBaseMainnet() public {
        vm.chainId(8453);
        vm.setEnv("ARL_PLAN", "test/fixtures/distribution.json");
        vm.setEnv("ARL_DEPLOYMENT", "test/fixtures/distribution.json");
        vm.setEnv("ARL_DISTRIBUTION", "test/fixtures/distribution.json");
        vm.setEnv("ARL_CLAIM_END", "4102444800");
        vm.setEnv("ARL_DISTRIBUTOR", "deploy/deployments/never.json");
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanProductionLocked.selector, 8453));
        script.run();
    }

    function test_CheckListAcceptsToolingOutput() public view {
        (bytes32 root, uint256 total) = script.checkList(list);
        assertEq(root, vm.parseJsonBytes32(list, ".merkleRoot"));
        assertEq(total, vm.parseJsonUint(list, ".total"));
    }

    function test_RevertWhen_ListHasOtherSchema() public {
        string memory other = vm.replace(list, '"arl-distribution/1"', '"arl-distribution/0"');
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorSchemaMismatch.selector, "arl-distribution/0"
            )
        );
        script.checkList(other);
    }

    function test_RevertWhen_ListFundedByAnotherAllocation() public {
        string memory other = vm.replace(list, '"publicLaunch"', '"liquidity"');
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorWrongAllocation.selector, "liquidity"
            )
        );
        script.checkList(other);
    }

    function test_RevertWhen_TotalExceedsPublicLaunch() public {
        string memory total = vm.toString(vm.parseJsonUint(list, ".total"));
        string memory other = vm.replace(
            list,
            string.concat('"total": "', total, '"'),
            string.concat('"total": "', vm.toString(ARLAllocation.PUBLIC_LAUNCH + 1), '"')
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorTotalExceedsAllocation.selector,
                ARLAllocation.PUBLIC_LAUNCH + 1,
                ARLAllocation.PUBLIC_LAUNCH
            )
        );
        script.checkList(other);
    }
}
