// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLStakingRewards} from "../../src/ARLStakingRewards.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev Random stakes, withdrawals, claims, exits, fundings, duration changes, returns of
/// unallocated rewards (including attempts during an active period), direct transfers that
/// bypass the accounting, and time moves, by a fixed set of stakers.
contract ARLStakingHandler is Test {
    ARLStakingRewards internal immutable staking;
    ARLToken internal immutable token;
    address internal immutable distributor;
    address[] public stakers;

    uint256 public ghostStaked;
    uint256 public ghostDonated;
    address internal immutable donor = makeAddr("donor");

    constructor(
        ARLStakingRewards staking_,
        ARLToken token_,
        address distributor_,
        address[] memory stakers_
    ) {
        staking = staking_;
        token = token_;
        distributor = distributor_;
        stakers = stakers_;
    }

    function stakersLength() external view returns (uint256) {
        return stakers.length;
    }

    function stake(uint256 who, uint256 amount) external {
        address s = stakers[who % stakers.length];
        amount = bound(amount, 1, token.balanceOf(s) == 0 ? 1 : token.balanceOf(s));
        if (token.balanceOf(s) < amount) return;
        vm.prank(s);
        staking.stake(amount);
        ghostStaked += amount;
    }

    function withdraw(uint256 who, uint256 amount) external {
        address s = stakers[who % stakers.length];
        uint256 bal = staking.balanceOf(s);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(s);
        staking.withdraw(amount);
        ghostStaked -= amount;
    }

    function getReward(uint256 who) external {
        vm.prank(stakers[who % stakers.length]);
        staking.getReward();
    }

    function exit(uint256 who) external {
        address s = stakers[who % stakers.length];
        uint256 bal = staking.balanceOf(s);
        vm.prank(s);
        staking.exit();
        ghostStaked -= bal;
    }

    function fund(uint256 amount) external {
        uint256 duration = staking.rewardsDuration();
        // The distributor holds a finite allocation: a long campaign can spend it, and funding
        // more than it holds reverts in the token, not in the staking contract.
        uint256 available = token.balanceOf(distributor);
        if (available < duration) return;
        amount = bound(amount, duration, available < 100_000 ether ? available : 100_000 ether);
        vm.prank(distributor);
        staking.notifyRewardAmount(amount);
    }

    function setDuration(uint256 duration) external {
        if (block.timestamp <= staking.periodFinish()) return;
        vm.prank(distributor);
        staking.setRewardsDuration(bound(duration, 1 days, 365 days));
    }

    function returnUnallocated() external {
        if (block.timestamp <= staking.periodFinish() || staking.unallocatedRewards() == 0) return;
        vm.prank(distributor);
        staking.returnUnallocated();
    }

    /// Returning during an active period must always fail, whatever is unallocated.
    function returnUnallocatedEarly() external {
        if (block.timestamp > staking.periodFinish()) return;
        vm.prank(distributor);
        vm.expectRevert(ARLStakingRewards.StakingPeriodActive.selector);
        staking.returnUnallocated();
    }

    /// A plain transfer to the contract, bypassing `stake` and `notifyRewardAmount`.
    function donate(uint256 amount) external {
        amount = bound(amount, 0, token.balanceOf(donor));
        vm.prank(donor);
        token.transfer(address(staking), amount);
        ghostDonated += amount;
    }

    function warp(uint256 by) external {
        vm.warp(block.timestamp + bound(by, 0, 20 days));
    }
}

contract ARLStakingInvariantTest is ARLTestBase {
    ARLStakingRewards internal staking;
    ARLStakingHandler internal handler;
    address[] internal stakers;

    function setUp() public override {
        super.setUp();
        staking = new ARLStakingRewards(token, token, communitySafe, 30 days);
        for (uint256 i = 0; i < 4; i++) {
            address s = makeAddr(string.concat("staker", vm.toString(i)));
            stakers.push(s);
            vm.prank(communitySafe);
            token.transfer(s, 200_000 ether);
            vm.prank(s);
            token.approve(address(staking), type(uint256).max);
        }
        handler = new ARLStakingHandler(staking, token, communitySafe, stakers);
        vm.prank(communitySafe);
        token.transfer(makeAddr("donor"), 100_000 ether);
        vm.prank(communitySafe);
        token.approve(address(staking), type(uint256).max);
        targetContract(address(handler));
    }

    /// Staked principal and every allocated but unpaid reward are always held.
    function invariant_Solvent() public view {
        uint256 owed = staking.rewardsAccrued() - staking.rewardsPaid();
        assertGe(token.balanceOf(address(staking)), staking.totalSupply() + owed);
    }

    /// Rewards allocated plus returned never exceed what was funded.
    function invariant_NoRewardsFromNothing() public view {
        assertLe(staking.rewardsAccrued() + staking.rewardsReturned(), staking.rewardsFunded());
        assertLe(staking.rewardsPaid(), staking.rewardsAccrued());
    }

    /// Total staked equals the sum of balances and the handler's record.
    function invariant_StakeAccounting() public view {
        uint256 sum;
        for (uint256 i = 0; i < stakers.length; i++) {
            sum += staking.balanceOf(stakers[i]);
        }
        assertEq(sum, staking.totalSupply());
        assertEq(sum, handler.ghostStaked());
    }

    /// What stakers can still claim never exceeds the allocated, unpaid rewards.
    function invariant_ClaimableCovered() public view {
        uint256 claimable;
        for (uint256 i = 0; i < stakers.length; i++) {
            claimable += staking.earned(stakers[i]);
        }
        uint256 pending = staking.totalSupply() == 0
            ? 0
            : (staking.lastTimeRewardApplicable() - staking.lastUpdateTime()) * staking.rewardRate();
        assertLe(claimable, staking.rewardsAccrued() + pending - staking.rewardsPaid());
    }

    /// Every funded reward is exactly one of: allocated to stakers, reserved for the rest of the
    /// active period, unallocated, or returned. `unallocatedRewards()` never underflows.
    function invariant_AccountingIdentity() public view {
        assertEq(
            staking.accruedRewards() + staking.reservedRewards() + staking.unallocatedRewards()
                + staking.rewardsReturned(),
            staking.rewardsFunded()
        );
    }

    /// The reserve is exactly what the active period still has to pay out.
    function invariant_ReserveIsRemainingSchedule() public view {
        assertEq(
            staking.reservedRewards(),
            staking.rewardRate() * (staking.periodFinish() - staking.lastTimeRewardApplicable())
        );
    }

    /// The balance is exactly principal, allocated-but-unpaid rewards, the reserve, the
    /// unallocated rewards and direct transfers. Rounding dust sits inside the allocated part.
    function invariant_BalanceFullyExplained() public view {
        assertEq(
            token.balanceOf(address(staking)),
            staking.totalSupply() + staking.accruedRewards() - staking.rewardsPaid()
                + staking.reservedRewards() + staking.unallocatedRewards() + handler.ghostDonated()
        );
    }
}
