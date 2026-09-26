// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev `treasurySafe` stands in for the production Safe. The Safe's own 3-of-5 threshold is
/// Safe configuration and is verified when the production Safe is created; these tests cover
/// what the timelock enforces.
contract ARLTimelockTest is ARLTestBase {
    address internal payee = makeAddr("payee");
    bytes32 internal constant SALT = keccak256("arl-test");

    function test_Configuration() public view {
        assertEq(treasury.getMinDelay(), 48 hours);
        assertTrue(treasury.hasRole(treasury.PROPOSER_ROLE(), treasurySafe));
        assertTrue(treasury.hasRole(treasury.CANCELLER_ROLE(), treasurySafe));
        assertTrue(treasury.hasRole(treasury.EXECUTOR_ROLE(), treasurySafe));
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), address(treasury)));
        assertFalse(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), address(this)));
        assertFalse(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), treasurySafe));
        assertFalse(treasury.hasRole(treasury.EXECUTOR_ROLE(), address(0))); // not open
    }

    function test_RevertWhen_DelayBelowFloor() public {
        address[] memory safe = _one(treasurySafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLTimelock.ARLTimelockDelayBelowFloor.selector, 48 hours - 1, 48 hours
            )
        );
        new ARLTimelock(48 hours - 1, safe, safe);
    }

    function testFuzz_ConstructorDelay(uint256 delay) public {
        delay = bound(delay, 0, 365 days);
        address[] memory safe = _one(treasurySafe);
        if (delay < 48 hours) vm.expectRevert();
        new ARLTimelock(delay, safe, safe);
    }

    function test_RevertWhen_NoProposersOrExecutors() public {
        address[] memory none = new address[](0);
        address[] memory safe = _one(treasurySafe);
        vm.expectRevert(ARLTimelock.ARLTimelockNoProposers.selector);
        new ARLTimelock(48 hours, none, safe);
        vm.expectRevert(ARLTimelock.ARLTimelockNoExecutors.selector);
        new ARLTimelock(48 hours, safe, none);
    }

    function test_TransferAfterDelay() public {
        bytes memory data = abi.encodeCall(token.transfer, (payee, 1_000e18));
        vm.prank(treasurySafe);
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);

        vm.warp(vm.getBlockTimestamp() + 48 hours - 1);
        vm.prank(treasurySafe);
        vm.expectRevert();
        treasury.execute(address(token), 0, data, bytes32(0), SALT);

        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(treasurySafe);
        treasury.execute(address(token), 0, data, bytes32(0), SALT);
        assertEq(token.balanceOf(payee), 1_000e18);
        assertEq(token.balanceOf(address(treasury)), ARLAllocation.TREASURY - 1_000e18);
    }

    function test_RevertWhen_ScheduledWithShorterDelay() public {
        bytes memory data = abi.encodeCall(token.transfer, (payee, 1));
        vm.prank(treasurySafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockInsufficientDelay.selector, 48 hours - 1, 48 hours
            )
        );
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours - 1);
    }

    function testFuzz_RevertWhen_UnauthorizedSchedule(address caller) public {
        vm.assume(caller != treasurySafe && caller != address(treasury));
        bytes memory data = abi.encodeCall(token.transfer, (caller, 1));
        bytes32 role = treasury.PROPOSER_ROLE();
        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role
            )
        );
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);
    }

    function testFuzz_RevertWhen_UnauthorizedExecute(address caller) public {
        vm.assume(caller != treasurySafe && caller != address(treasury));
        bytes memory data = abi.encodeCall(token.transfer, (payee, 1));
        vm.prank(treasurySafe);
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);
        vm.warp(vm.getBlockTimestamp() + 48 hours);
        bytes32 role = treasury.EXECUTOR_ROLE();
        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role
            )
        );
        treasury.execute(address(token), 0, data, bytes32(0), SALT);
    }

    function test_SafeCanCancel() public {
        bytes memory data = abi.encodeCall(token.transfer, (payee, 1));
        vm.startPrank(treasurySafe);
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);
        bytes32 id = treasury.hashOperation(address(token), 0, data, bytes32(0), SALT);
        treasury.cancel(id);
        vm.stopPrank();
        assertFalse(treasury.isOperation(id));
    }

    function test_RevertWhen_UpdateDelayCalledDirectly() public {
        vm.prank(treasurySafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnauthorizedCaller.selector, treasurySafe
            )
        );
        treasury.updateDelay(72 hours);
    }

    function test_DelayCanBeRaisedThroughTheTimelock() public {
        _scheduleAndExecuteSelfCall(abi.encodeCall(treasury.updateDelay, (72 hours)));
        assertEq(treasury.getMinDelay(), 72 hours);
    }

    /// @dev Upstream TimelockController would accept this and drop the delay to zero.
    function test_RevertWhen_DelayLoweredBelowFloorThroughTheTimelock() public {
        bytes memory data = abi.encodeCall(treasury.updateDelay, (0));
        vm.prank(treasurySafe);
        treasury.schedule(address(treasury), 0, data, bytes32(0), SALT, 48 hours);
        vm.warp(vm.getBlockTimestamp() + 48 hours);
        vm.prank(treasurySafe);
        vm.expectRevert(); // FailedCall wrapping ARLTimelockDelayBelowFloor
        treasury.execute(address(treasury), 0, data, bytes32(0), SALT);
        assertEq(treasury.getMinDelay(), 48 hours);
    }

    function test_RevertWhen_RoleGrantedOutsideTheTimelock() public {
        bytes32 proposer = treasury.PROPOSER_ROLE();
        vm.prank(treasurySafe);
        vm.expectRevert();
        treasury.grantRole(proposer, address(0xBAD));
        assertFalse(treasury.hasRole(proposer, address(0xBAD)));
    }

    function test_RoleChangesMustPassTheDelay() public {
        bytes32 proposer = treasury.PROPOSER_ROLE();
        _scheduleAndExecuteSelfCall(abi.encodeCall(treasury.grantRole, (proposer, address(0x5AFE))));
        assertTrue(treasury.hasRole(proposer, address(0x5AFE)));
    }

    function _scheduleAndExecuteSelfCall(bytes memory data) private {
        vm.prank(treasurySafe);
        treasury.schedule(address(treasury), 0, data, bytes32(0), SALT, 48 hours);
        vm.warp(vm.getBlockTimestamp() + 48 hours);
        vm.prank(treasurySafe);
        treasury.execute(address(treasury), 0, data, bytes32(0), SALT);
    }

    function _one(address a) private pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = a;
    }
}
