// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ARLStakingRewards} from "../src/ARLStakingRewards.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev The distributor here is the Community & Staking Safe acting directly; in production it is
/// intended to be the treasury timelock. Durations and amounts are test values only.
contract ARLStakingRewardsTest is ARLTestBase {
    ARLStakingRewards internal staking;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal constant DURATION = 30 days;
    uint256 internal constant REWARD = 300_000 ether;

    function setUp() public override {
        super.setUp();
        staking = new ARLStakingRewards(token, token, communitySafe, DURATION);
        vm.startPrank(communitySafe);
        token.transfer(alice, 100_000 ether);
        token.transfer(bob, 100_000 ether);
        token.approve(address(staking), type(uint256).max);
        vm.stopPrank();
        vm.prank(alice);
        token.approve(address(staking), type(uint256).max);
        vm.prank(bob);
        token.approve(address(staking), type(uint256).max);
    }

    function _fund(uint256 amount) internal {
        vm.prank(communitySafe);
        staking.notifyRewardAmount(amount);
    }

    // ---------------------------------------------------------------- construction

    function test_RevertWhen_ZeroAddressOrDuration() public {
        vm.expectRevert(ARLStakingRewards.StakingZeroAddress.selector);
        new ARLStakingRewards(token, token, address(0), DURATION);
        vm.expectRevert(ARLStakingRewards.StakingZeroDuration.selector);
        new ARLStakingRewards(token, token, communitySafe, 0);
    }

    function test_HasNoOwnerMintOrRecovery() public view {
        // The only privileged address is the immutable distributor.
        assertEq(staking.rewardsDistribution(), communitySafe);
    }

    // ---------------------------------------------------------------- accrual

    function test_SingleStakerEarnsWholePeriod() public {
        vm.prank(alice);
        staking.stake(10_000 ether);
        _fund(REWARD);
        vm.warp(block.timestamp + DURATION);
        uint256 rate = REWARD / DURATION;
        assertEq(staking.earned(alice), rate * DURATION - _dust(rate * DURATION, 10_000 ether));
        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        staking.exit();
        assertEq(token.balanceOf(alice) - before, 10_000 ether + staking.rewardsPaid());
        assertApproxEqAbs(staking.rewardsPaid(), REWARD, DURATION);
    }

    function test_TwoStakersSplitByShareAndTime() public {
        vm.prank(alice);
        staking.stake(10_000 ether);
        _fund(REWARD);
        vm.warp(block.timestamp + DURATION / 2);
        vm.prank(bob);
        staking.stake(30_000 ether);
        vm.warp(block.timestamp + DURATION / 2);
        uint256 rate = REWARD / DURATION;
        uint256 half = rate * (DURATION / 2);
        // Alice: all of the first half, a quarter of the second. Bob: three quarters.
        assertApproxEqAbs(staking.earned(alice), half + half / 4, 1e6);
        assertApproxEqAbs(staking.earned(bob), (half * 3) / 4, 1e6);
    }

    function test_NoRewardsAfterPeriodEnds() public {
        vm.prank(alice);
        staking.stake(1 ether);
        _fund(REWARD);
        vm.warp(block.timestamp + DURATION);
        uint256 atEnd = staking.earned(alice);
        vm.warp(block.timestamp + 365 days);
        assertEq(staking.earned(alice), atEnd);
    }

    function test_TopUpRollsLeftoverIntoNewPeriod() public {
        vm.prank(alice);
        staking.stake(1 ether);
        _fund(REWARD);
        vm.warp(block.timestamp + DURATION / 3);
        uint256 oldRate = staking.rewardRate();
        uint256 leftover = (staking.periodFinish() - block.timestamp) * oldRate;
        _fund(REWARD);
        assertEq(staking.rewardRate(), (REWARD + leftover) / DURATION);
        assertEq(staking.periodFinish(), block.timestamp + DURATION);
    }

    // ---------------------------------------------------------------- principal

    function test_WithdrawReturnsExactPrincipal() public {
        vm.prank(alice);
        staking.stake(5_000 ether);
        _fund(REWARD);
        vm.warp(block.timestamp + 10 days);
        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        staking.withdraw(5_000 ether);
        assertEq(token.balanceOf(alice) - before, 5_000 ether);
        assertEq(staking.balanceOf(alice), 0);
    }

    function test_RevertWhen_WithdrawMoreThanStaked() public {
        vm.prank(alice);
        staking.stake(1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLStakingRewards.StakingInsufficientBalance.selector, 1 ether, 2 ether
            )
        );
        vm.prank(alice);
        staking.withdraw(2 ether);
    }

    function test_RevertWhen_ZeroStakeOrWithdraw() public {
        vm.startPrank(alice);
        vm.expectRevert(ARLStakingRewards.StakingZeroAmount.selector);
        staking.stake(0);
        vm.expectRevert(ARLStakingRewards.StakingZeroAmount.selector);
        staking.withdraw(0);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- permit

    function test_StakeWithPermit() public {
        (address owner, uint256 key) = makeAddrAndKey("permitOwner");
        vm.prank(communitySafe);
        token.transfer(owner, 10 ether);
        (uint8 v, bytes32 r, bytes32 s) = _permit(owner, key, 10 ether, block.timestamp + 1 hours);
        vm.prank(owner);
        staking.stakeWithPermit(10 ether, block.timestamp + 1 hours, v, r, s);
        assertEq(staking.balanceOf(owner), 10 ether);
    }

    function test_StakeWithPermitSurvivesFrontRunPermit() public {
        (address owner, uint256 key) = makeAddrAndKey("permitOwner");
        vm.prank(communitySafe);
        token.transfer(owner, 10 ether);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(owner, key, 10 ether, deadline);
        // Someone submits the permit first; the stake must still go through.
        token.permit(owner, address(staking), 10 ether, deadline, v, r, s);
        vm.prank(owner);
        staking.stakeWithPermit(10 ether, deadline, v, r, s);
        assertEq(staking.balanceOf(owner), 10 ether);
    }

    // ---------------------------------------------------------------- distributor

    function test_RevertWhen_NotDistributor() public {
        vm.startPrank(alice);
        vm.expectRevert(ARLStakingRewards.StakingNotDistributor.selector);
        staking.notifyRewardAmount(1 ether);
        vm.expectRevert(ARLStakingRewards.StakingNotDistributor.selector);
        staking.setRewardsDuration(1 days);
        vm.expectRevert(ARLStakingRewards.StakingNotDistributor.selector);
        staking.returnUnallocated();
        vm.stopPrank();
    }

    function test_RevertWhen_RewardRoundsToZeroRate() public {
        vm.expectRevert(ARLStakingRewards.StakingRewardTooLow.selector);
        _fund(DURATION - 1);
    }

    function test_DurationChangesOnlyBetweenPeriods() public {
        _fund(REWARD);
        vm.prank(communitySafe);
        vm.expectRevert(ARLStakingRewards.StakingPeriodActive.selector);
        staking.setRewardsDuration(7 days);
        vm.warp(staking.periodFinish() + 1);
        vm.prank(communitySafe);
        staking.setRewardsDuration(7 days);
        assertEq(staking.rewardsDuration(), 7 days);
    }

    function test_UnallocatedRewardsReturnedWithoutTouchingStakes() public {
        _fund(REWARD);
        // Nobody stakes for the first half: that half is never allocated.
        vm.warp(block.timestamp + DURATION / 2);
        vm.prank(alice);
        staking.stake(1_000 ether);
        vm.warp(staking.periodFinish() + 1);

        uint256 unallocated = staking.unallocatedRewards();
        uint256 rate = REWARD / DURATION;
        assertEq(unallocated, REWARD - rate * (DURATION - DURATION / 2));

        vm.warp(staking.periodFinish());
        vm.prank(communitySafe);
        vm.expectRevert(ARLStakingRewards.StakingPeriodActive.selector);
        staking.returnUnallocated();
        vm.warp(staking.periodFinish() + 1);

        uint256 before = token.balanceOf(communitySafe);
        vm.prank(communitySafe);
        staking.returnUnallocated();
        assertEq(token.balanceOf(communitySafe) - before, unallocated);

        // Alice still gets her principal and her full allocated reward.
        uint256 aliceBefore = token.balanceOf(alice);
        uint256 owed = staking.earned(alice);
        vm.prank(alice);
        staking.exit();
        assertEq(token.balanceOf(alice) - aliceBefore, 1_000 ether + owed);
        assertApproxEqAbs(owed, rate * (DURATION - DURATION / 2), 1e6);
    }

    function test_RevertWhen_ReturnUnallocatedDuringPeriod() public {
        _fund(REWARD);
        vm.prank(communitySafe);
        vm.expectRevert(ARLStakingRewards.StakingPeriodActive.selector);
        staking.returnUnallocated();
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_SolvencyAfterRandomActions(
        uint96 a,
        uint96 b,
        uint32 t1,
        uint32 t2,
        uint96 reward
    ) public {
        uint256 stakeA = bound(a, 1, 100_000 ether);
        uint256 stakeB = bound(b, 1, 100_000 ether);
        uint256 amount = bound(reward, DURATION, 1_000_000 ether);
        vm.prank(alice);
        staking.stake(stakeA);
        _fund(amount);
        vm.warp(block.timestamp + bound(t1, 0, DURATION));
        vm.prank(bob);
        staking.stake(stakeB);
        vm.warp(block.timestamp + bound(t2, 0, 2 * DURATION));
        vm.prank(alice);
        staking.exit();
        vm.prank(bob);
        staking.exit();
        assertEq(staking.totalSupply(), 0);
        assertLe(staking.rewardsPaid(), amount);
        assertEq(token.balanceOf(address(staking)), amount - staking.rewardsPaid());
    }

    // ---------------------------------------------------------------- helpers

    /// Rounding lost by a single staker holding `stake` over the whole period.
    function _dust(uint256 total, uint256 stakeAmount) internal pure returns (uint256) {
        uint256 perToken = (total * 1e18) / stakeAmount;
        return total - (stakeAmount * perToken) / 1e18;
    }

    function _permit(address owner, uint256 key, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                owner,
                address(staking),
                value,
                token.nonces(owner),
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(key, digest);
    }
}
