// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev `treasurySafe` and `guardianSafe` stand in for the production Safes. Their thresholds are
/// Safe configuration and are verified when the production Safes are created; these tests cover
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

    // ------------------------------------------------------------------ L-3: zero addresses

    function test_RevertWhen_ZeroProposer() public {
        address[] memory safe = _one(treasurySafe);
        address[] memory withZero = _two(treasurySafe, address(0));
        vm.expectRevert(ARLTimelock.ARLTimelockZeroAddress.selector);
        new ARLTimelock(48 hours, withZero, safe, guardianSafe);
        vm.expectRevert(ARLTimelock.ARLTimelockZeroAddress.selector);
        new ARLTimelock(48 hours, _one(address(0)), safe, guardianSafe);
    }

    /// @dev Upstream TimelockController would accept this and open execution to everyone.
    function test_RevertWhen_ZeroExecutor() public {
        address[] memory safe = _one(treasurySafe);
        vm.expectRevert(ARLTimelock.ARLTimelockZeroAddress.selector);
        new ARLTimelock(48 hours, safe, _two(treasurySafe, address(0)), guardianSafe);
        vm.expectRevert(ARLTimelock.ARLTimelockZeroAddress.selector);
        new ARLTimelock(48 hours, safe, _one(address(0)), guardianSafe);
    }

    function test_RevertWhen_ZeroGuardian() public {
        address[] memory safe = _one(treasurySafe);
        vm.expectRevert(ARLTimelock.ARLTimelockZeroAddress.selector);
        new ARLTimelock(48 hours, safe, safe, address(0));
    }

    function testFuzz_RevertWhen_ZeroInAnyRoleList(uint8 position, bool inProposers) public {
        address[] memory list = new address[](3);
        list[0] = makeAddr("a");
        list[1] = makeAddr("b");
        list[2] = makeAddr("c");
        list[position % 3] = address(0);
        address[] memory safe = _one(treasurySafe);
        vm.expectRevert(ARLTimelock.ARLTimelockZeroAddress.selector);
        if (inProposers) new ARLTimelock(48 hours, list, safe, guardianSafe);
        else new ARLTimelock(48 hours, safe, list, guardianSafe);
    }

    // ------------------------------------------------------------------ M-1: guardian

    function test_GuardianIsCancellerOnly() public view {
        assertTrue(treasury.hasRole(treasury.CANCELLER_ROLE(), guardianSafe));
        assertFalse(treasury.hasRole(treasury.PROPOSER_ROLE(), guardianSafe));
        assertFalse(treasury.hasRole(treasury.EXECUTOR_ROLE(), guardianSafe));
        assertFalse(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), guardianSafe));
    }

    function test_RevertWhen_GuardianIsProposerOrExecutor() public {
        address[] memory safe = _one(treasurySafe);
        address[] memory withGuardian = _two(treasurySafe, guardianSafe);
        bytes memory err = abi.encodeWithSelector(
            ARLTimelock.ARLTimelockGuardianNotIndependent.selector, guardianSafe
        );
        vm.expectRevert(err);
        new ARLTimelock(48 hours, withGuardian, safe, guardianSafe);
        vm.expectRevert(err);
        new ARLTimelock(48 hours, safe, withGuardian, guardianSafe);
        bytes memory sameAsSafe = abi.encodeWithSelector(
            ARLTimelock.ARLTimelockGuardianNotIndependent.selector, treasurySafe
        );
        vm.expectRevert(sameAsSafe);
        new ARLTimelock(48 hours, safe, safe, treasurySafe);
    }

    function test_GuardianCanCancelPendingOperation() public {
        bytes memory data = abi.encodeCall(token.transfer, (payee, 1_000e18));
        vm.prank(treasurySafe);
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);
        bytes32 id = treasury.hashOperation(address(token), 0, data, bytes32(0), SALT);

        vm.prank(guardianSafe);
        treasury.cancel(id);
        assertFalse(treasury.isOperation(id));

        vm.warp(vm.getBlockTimestamp() + 48 hours);
        vm.prank(treasurySafe);
        vm.expectRevert(); // TimelockUnexpectedOperationState: the operation no longer exists
        treasury.execute(address(token), 0, data, bytes32(0), SALT);
        assertEq(token.balanceOf(payee), 0);
        assertEq(token.balanceOf(address(treasury)), ARLAllocation.TREASURY);
    }

    function test_RevertWhen_GuardianSchedules() public {
        bytes memory data = abi.encodeCall(token.transfer, (guardianSafe, 1));
        bytes32 role = treasury.PROPOSER_ROLE();
        vm.prank(guardianSafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardianSafe, role
            )
        );
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);
    }

    function test_RevertWhen_GuardianExecutes() public {
        bytes memory data = abi.encodeCall(token.transfer, (payee, 1));
        vm.prank(treasurySafe);
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);
        vm.warp(vm.getBlockTimestamp() + 48 hours);
        bytes32 role = treasury.EXECUTOR_ROLE();
        vm.prank(guardianSafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, guardianSafe, role
            )
        );
        treasury.execute(address(token), 0, data, bytes32(0), SALT);
    }

    function test_RevertWhen_GuardianGrantsRoleDirectly() public {
        bytes32 proposer = treasury.PROPOSER_ROLE();
        vm.prank(guardianSafe);
        vm.expectRevert();
        treasury.grantRole(proposer, guardianSafe);
        assertFalse(treasury.hasRole(proposer, guardianSafe));
    }

    function test_RevertWhen_GuardianCancelsUnknownOperation() public {
        vm.prank(guardianSafe);
        vm.expectRevert(); // TimelockUnexpectedOperationState
        treasury.cancel(keccak256("not scheduled"));
    }

    /// @dev Key-loss recovery: the Treasury can replace the guardian through the delay.
    function test_GuardianReplacedThroughTheTimelock() public {
        address newGuardian = makeAddr("newGuardian");
        bytes32 canceller = treasury.CANCELLER_ROLE();
        address[] memory targets = new address[](2);
        targets[0] = address(treasury);
        targets[1] = address(treasury);
        uint256[] memory values = new uint256[](2);
        bytes[] memory payloads = new bytes[](2);
        payloads[0] = abi.encodeCall(treasury.revokeRole, (canceller, guardianSafe));
        payloads[1] = abi.encodeCall(treasury.grantRole, (canceller, newGuardian));

        vm.prank(treasurySafe);
        treasury.scheduleBatch(targets, values, payloads, bytes32(0), SALT, 48 hours);
        vm.warp(vm.getBlockTimestamp() + 48 hours);
        vm.prank(treasurySafe);
        treasury.executeBatch(targets, values, payloads, bytes32(0), SALT);

        assertFalse(treasury.hasRole(canceller, guardianSafe));
        assertTrue(treasury.hasRole(canceller, newGuardian));
    }

    function test_GuardianCanRenounce() public {
        bytes32 canceller = treasury.CANCELLER_ROLE();
        vm.prank(guardianSafe);
        treasury.renounceRole(canceller, guardianSafe);
        assertFalse(treasury.hasRole(canceller, guardianSafe));
    }

    function testFuzz_RevertWhen_NonCancellerCancels(address caller) public {
        vm.assume(caller != treasurySafe && caller != guardianSafe);
        bytes memory data = abi.encodeCall(token.transfer, (payee, 1));
        vm.prank(treasurySafe);
        treasury.schedule(address(token), 0, data, bytes32(0), SALT, 48 hours);
        bytes32 id = treasury.hashOperation(address(token), 0, data, bytes32(0), SALT);
        bytes32 role = treasury.CANCELLER_ROLE();
        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role
            )
        );
        treasury.cancel(id);
    }

    function test_RevertWhen_DelayBelowFloor() public {
        address[] memory safe = _one(treasurySafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLTimelock.ARLTimelockDelayBelowFloor.selector, 48 hours - 1, 48 hours
            )
        );
        new ARLTimelock(48 hours - 1, safe, safe, guardianSafe);
    }

    function testFuzz_ConstructorDelay(uint256 delay) public {
        delay = bound(delay, 0, 365 days);
        address[] memory safe = _one(treasurySafe);
        if (delay < 48 hours) vm.expectRevert();
        new ARLTimelock(delay, safe, safe, guardianSafe);
    }

    function test_RevertWhen_NoProposersOrExecutors() public {
        address[] memory none = new address[](0);
        address[] memory safe = _one(treasurySafe);
        vm.expectRevert(ARLTimelock.ARLTimelockNoProposers.selector);
        new ARLTimelock(48 hours, none, safe, guardianSafe);
        vm.expectRevert(ARLTimelock.ARLTimelockNoExecutors.selector);
        new ARLTimelock(48 hours, safe, none, guardianSafe);
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

    function _two(address a, address b) private pure returns (address[] memory list) {
        list = new address[](2);
        list[0] = a;
        list[1] = b;
    }

    // ------------------------------------------------------------------ Mythril SWC-101 triage

    /// @dev Mythril flags an arithmetic underflow in `onERC1155BatchReceived` (inherited from
    /// OpenZeppelin's ERC1155Holder) when it is called with malformed ABI data. The function only
    /// returns its selector; this is the exact transaction Mythril reported, and it must leave the
    /// timelock unchanged whether it reverts or returns.
    function test_MythrilSwc101CalldataChangesNothing() public {
        bytes memory data =
            hex"bc197c810000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004d";
        _assertCallChangesNothing(data);
    }

    function testFuzz_ERC1155BatchReceivedChangesNothing(bytes calldata tail) public {
        _assertCallChangesNothing(abi.encodePacked(bytes4(0xbc197c81), tail));
    }

    function _assertCallChangesNothing(bytes memory data) internal {
        uint256 delay = treasury.getMinDelay();
        uint256 balance = token.balanceOf(address(treasury));
        (bool ok, bytes memory ret) = address(treasury).call(data);
        if (ok) assertEq(bytes4(ret), bytes4(0xbc197c81));
        assertEq(treasury.getMinDelay(), delay);
        assertEq(token.balanceOf(address(treasury)), balance);
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), address(treasury)));
        assertFalse(treasury.hasRole(treasury.PROPOSER_ROLE(), address(this)));
        assertFalse(treasury.hasRole(treasury.EXECUTOR_ROLE(), address(this)));
    }
}
