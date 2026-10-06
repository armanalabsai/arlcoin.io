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
    ARLVestingWallet internal immutable investorsVesting;
    ARLVestingWallet internal immutable partnershipsVesting;
    ARLTimelock internal immutable treasury;
    address internal immutable treasurySafe;

    address[] internal actors;

    uint256 public ghostTreasuryPaid;
    uint256 public ghostOwnershipChanges;
    uint256 internal nonce;

    constructor(
        ARLToken token_,
        ARLVestingWallet investorsVesting_,
        ARLVestingWallet partnershipsVesting_,
        ARLTimelock treasury_,
        address treasurySafe_,
        address[] memory actors_
    ) {
        token = token_;
        investorsVesting = investorsVesting_;
        partnershipsVesting = partnershipsVesting_;
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

    function releaseInvestors() external {
        investorsVesting.release(address(token));
    }

    function releasePartnerships() external {
        partnershipsVesting.release(address(token));
    }

    function warp(uint256 seconds_) external {
        vm.warp(vm.getBlockTimestamp() + bound(seconds_, 1, 200 days));
    }

    function tryTakeOverVesting(uint256 callerSeed, address newOwner) external {
        vm.prank(_actor(callerSeed));
        try investorsVesting.transferOwnership(newOwner) {
            ghostOwnershipChanges++;
        } catch {}
        vm.prank(_actor(callerSeed));
        try investorsVesting.renounceOwnership() {
            ghostOwnershipChanges++;
        } catch {}
        vm.prank(_actor(callerSeed));
        try partnershipsVesting.transferOwnership(newOwner) {
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

        address[] memory actors = new address[](14);
        actors[0] = founderSafe;
        actors[1] = investorsSafe;
        actors[2] = partnershipsSafe;
        actors[3] = launchSafe;
        actors[4] = communitySafe;
        actors[5] = growthSafe;
        actors[6] = liquiditySafe;
        actors[7] = teamPoolSafe;
        actors[8] = earlyUsersSafe;
        actors[9] = grantsSafe;
        actors[10] = treasurySafe;
        actors[11] = guardianSafe;
        actors[12] = makeAddr("userA");
        actors[13] = makeAddr("userB");

        handler = new ARLHandler(
            token, investorsVesting, partnershipsVesting, treasury, treasurySafe, actors
        );

        for (uint256 i = 0; i < actors.length; i++) {
            holders.push(actors[i]);
        }
        holders.push(address(investorsVesting));
        holders.push(address(partnershipsVesting));
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
        _assertVesting(investorsVesting, ARLAllocation.INVESTORS, now_);
        _assertVesting(partnershipsVesting, ARLAllocation.STRATEGIC_PARTNERSHIPS, now_);
    }

    /// Nothing vests for investors before the cliff ends.
    function invariant_NoInvestorsReleaseBeforeCliff() public view {
        if (block.timestamp < INVESTORS_CLIFF_END) {
            assertEq(investorsVesting.released(address(token)), 0);
        }
    }

    /// The only vesting wallets hold exactly the investor and strategic partnership allocations
    /// (less what they released). No vesting wallet holds any Founder tokens, and the Founder
    /// holder is a plain account, not a contract.
    function invariant_NoFounderVesting() public view {
        assertEq(
            investorsVesting.released(address(token)) + token.balanceOf(address(investorsVesting)),
            ARLAllocation.INVESTORS
        );
        assertEq(
            partnershipsVesting.released(address(token))
                + token.balanceOf(address(partnershipsVesting)),
            ARLAllocation.STRATEGIC_PARTNERSHIPS
        );
        assertEq(founderSafe.code.length, 0);
    }

    /// Genesis reconciles exactly: the eleven allocation constants add up to the maximum supply.
    function invariant_AllocationsReconcile() public pure {
        assertEq(ARLAllocation.FOUNDER, 2_100_000e18);
        assertEq(
            ARLAllocation.PUBLIC_LAUNCH + ARLAllocation.COMMUNITY_STAKING
                + ARLAllocation.ECOSYSTEM_GROWTH + ARLAllocation.STRATEGIC_PARTNERSHIPS
                + ARLAllocation.LIQUIDITY + ARLAllocation.FOUNDER + ARLAllocation.INVESTORS
                + ARLAllocation.TREASURY + ARLAllocation.TEAM + ARLAllocation.EARLY_USERS
                + ARLAllocation.GRANTS_BUG_BOUNTY,
            ARLAllocation.MAX_SUPPLY
        );
    }

    /// Beneficiaries cannot be changed.
    function invariant_BeneficiariesFixed() public view {
        assertEq(investorsVesting.owner(), investorsSafe);
        assertEq(partnershipsVesting.owner(), partnershipsSafe);
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

    function _assertVesting(ARLVestingWallet w, uint256 allocation, uint64 now_) private view {
        uint256 released = w.released(address(token));
        assertLe(released, w.vestedAmount(address(token), now_));
        assertEq(released + token.balanceOf(address(w)), allocation);
    }
}
