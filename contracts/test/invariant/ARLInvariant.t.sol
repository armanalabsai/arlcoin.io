// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLTimelock} from "../../src/ARLTimelock.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {ARLVestingWallet} from "../../src/ARLVestingWallet.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev Drives random, valid activity against the deployed system. Only externally owned test
/// accounts are pranked; the vesting wallets and the timelock move tokens only through their own
/// logic.
contract ARLHandler is Test {
    ARLToken internal immutable token;
    ARLVestingWallet internal immutable founderVesting;
    ARLVestingWallet internal immutable reserveVesting;
    ARLTimelock internal immutable treasury;
    address internal immutable treasurySafe;

    address[] internal actors;

    uint256 public ghostTreasuryPaid;
    uint256 public ghostOwnershipChanges;
    uint256 internal nonce;

    constructor(
        ARLToken token_,
        ARLVestingWallet founderVesting_,
        ARLVestingWallet reserveVesting_,
        ARLTimelock treasury_,
        address treasurySafe_,
        address[] memory actors_
    ) {
        token = token_;
        founderVesting = founderVesting_;
        reserveVesting = reserveVesting_;
        treasury = treasury_;
        treasurySafe = treasurySafe_;
        actors = actors_;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        vm.prank(from);
        token.transfer(to, amount);
    }

    function approveAndTransferFrom(uint256 ownerSeed, uint256 spenderSeed, uint256 amount)
        external
    {
        address owner = _actor(ownerSeed);
        address spender = _actor(spenderSeed);
        amount = bound(amount, 0, token.balanceOf(owner));
        vm.prank(owner);
        token.approve(spender, amount);
        vm.prank(spender);
        token.transferFrom(owner, spender, amount);
    }

    function releaseFounder() external {
        founderVesting.release(address(token));
    }

    function releaseReserve() external {
        reserveVesting.release(address(token));
    }

    function warp(uint256 seconds_) external {
        vm.warp(vm.getBlockTimestamp() + bound(seconds_, 1, 200 days));
    }

    function tryTakeOverVesting(uint256 callerSeed, address newOwner) external {
        vm.prank(_actor(callerSeed));
        try founderVesting.transferOwnership(newOwner) {
            ghostOwnershipChanges++;
        } catch {}
        vm.prank(_actor(callerSeed));
        try reserveVesting.renounceOwnership() {
            ghostOwnershipChanges++;
        } catch {}
    }

    /// @dev Full treasury path: schedule, try early execution, wait 48 hours, execute.
    function treasuryPay(uint256 toSeed, uint256 amount) external {
        address to = _actor(toSeed);
        amount = bound(amount, 0, token.balanceOf(address(treasury)));
        bytes memory data = abi.encodeCall(token.transfer, (to, amount));
        bytes32 salt = bytes32(++nonce);

        vm.prank(treasurySafe);
        treasury.schedule(address(token), 0, data, bytes32(0), salt, 48 hours);

        vm.prank(treasurySafe);
        try treasury.execute(address(token), 0, data, bytes32(0), salt) {
            revert("executed before delay");
        } catch {}

        vm.warp(vm.getBlockTimestamp() + 48 hours);
        vm.prank(treasurySafe);
        treasury.execute(address(token), 0, data, bytes32(0), salt);
        ghostTreasuryPaid += amount;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }
}

contract ARLInvariantTest is ARLTestBase {
    ARLHandler internal handler;
    address[] internal holders;

    function setUp() public override {
        super.setUp();

        address[] memory actors = new address[](12);
        actors[0] = founder;
        actors[1] = ecosystemSafe;
        actors[2] = communitySafe;
        actors[3] = liquiditySafe;
        actors[4] = partnershipsSafe;
        actors[5] = launchSafe;
        actors[6] = grantsSafe;
        actors[7] = teamPoolSafe;
        actors[8] = rewardsSafe;
        actors[9] = treasurySafe;
        actors[10] = makeAddr("userA");
        actors[11] = makeAddr("userB");

        handler =
            new ARLHandler(token, founderVesting, reserveVesting, treasury, treasurySafe, actors);

        for (uint256 i = 0; i < actors.length; i++) {
            holders.push(actors[i]);
        }
        holders.push(address(founderVesting));
        holders.push(address(reserveVesting));
        holders.push(address(treasury));

        targetContract(address(handler));
    }

    /// Supply is exactly the cap, forever.
    function invariant_TotalSupplyIsExactlyMax() public view {
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
        assertLe(token.totalSupply(), 21_000_000e18);
    }

    /// Every token is accounted for: nothing is created, nothing leaves the tracked set.
    function invariant_BalancesSumToSupply() public view {
        uint256 sum;
        for (uint256 i = 0; i < holders.length; i++) {
            sum += token.balanceOf(holders[i]);
        }
        assertEq(sum, token.totalSupply());
    }

    /// Vesting wallets never release more than has vested, nor more than their allocation.
    function invariant_VestingNeverOverReleases() public view {
        uint64 now_ = uint64(block.timestamp);
        uint256 founderReleased = founderVesting.released(address(token));
        assertLe(founderReleased, founderVesting.vestedAmount(address(token), now_));
        assertLe(founderReleased, ARLAllocation.FOUNDER);
        assertEq(founderReleased + token.balanceOf(address(founderVesting)), ARLAllocation.FOUNDER);

        uint256 reserveReleased = reserveVesting.released(address(token));
        assertLe(reserveReleased, reserveVesting.vestedAmount(address(token), now_));
        assertEq(
            reserveReleased + token.balanceOf(address(reserveVesting)),
            ARLAllocation.ECOSYSTEM_RESERVE
        );
    }

    /// Nothing vests for the founder before the cliff ends.
    function invariant_NoFounderReleaseBeforeCliff() public view {
        if (block.timestamp < FOUNDER_CLIFF_END) {
            assertEq(founderVesting.released(address(token)), 0);
        }
    }

    /// Beneficiaries cannot be changed.
    function invariant_BeneficiariesFixed() public view {
        assertEq(founderVesting.owner(), founder);
        assertEq(reserveVesting.owner(), ecosystemSafe);
        assertEq(handler.ghostOwnershipChanges(), 0);
    }

    /// Treasury funds leave only through executed timelock operations.
    function invariant_TreasuryOnlyPaysThroughTimelock() public view {
        assertEq(
            token.balanceOf(address(treasury)), ARLAllocation.TREASURY - handler.ghostTreasuryPaid()
        );
        assertGe(treasury.getMinDelay(), 48 hours);
    }

    /// The guardian can only ever cancel; the handler never changes roles.
    function invariant_GuardianIsCancellerOnly() public view {
        assertTrue(treasury.hasRole(treasury.CANCELLER_ROLE(), guardianSafe));
        assertFalse(treasury.hasRole(treasury.PROPOSER_ROLE(), guardianSafe));
        assertFalse(treasury.hasRole(treasury.EXECUTOR_ROLE(), guardianSafe));
        assertFalse(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), guardianSafe));
        assertFalse(treasury.hasRole(treasury.EXECUTOR_ROLE(), address(0)));
    }
}
