// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {DeployDistributor} from "../../script/DeployDistributor.s.sol";

contract DeployDistributorTest is Test {
    DeployDistributor internal script;
    string internal list;

    function setUp() public {
        script = new DeployDistributor();
        list = vm.readFile("test/fixtures/distribution.json");
    }

    /// @dev Flipping this requires approved launch parameters (economic specification
    /// section 7).
    function test_LaunchParametersAreNotApprovedYet() public view {
        assertFalse(script.LAUNCH_PARAMETERS_APPROVED());
    }

    function test_LaunchGate() public {
        script.launchGate(31337, false);
        script.launchGate(11155111, true);
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorLaunchParametersNotApproved.selector, 11155111
            )
        );
        script.launchGate(11155111, false);
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorLaunchParametersNotApproved.selector, 1
            )
        );
        script.launchGate(1, false);
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
