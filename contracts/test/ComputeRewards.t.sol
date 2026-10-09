// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ComputeRewards} from "../src/ComputeRewards.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev Runs against the real `ARLToken` deployed by `ARLTestBase` (no mock token). The user is
/// funded from the Community & Staking allocation holder.
contract ComputeRewardsTest is ARLTestBase {
    ComputeRewards internal rewards;

    address internal user = makeAddr("user");
    address internal rewardPool = makeAddr("rewardPool");
    address internal creditTreasury = makeAddr("creditTreasury");

    uint256 internal constant USER_FUNDS = 10_000e18;

    event CreditsConverted(
        address indexed user, uint256 arlAmount, uint256 burned, uint256 pooled, uint256 credits
    );
    event Staked(address indexed user, uint256 amount, uint256 newStake);
    event Unstaked(address indexed user, uint256 amount, uint256 newStake);
    event TierChanged(
        address indexed user, ComputeRewards.Tier oldTier, ComputeRewards.Tier newTier
    );

    function setUp() public override {
        super.setUp();
        rewards = new ComputeRewards(token, rewardPool, creditTreasury);

        vm.prank(communitySafe);
        assertTrue(token.transfer(user, USER_FUNDS));

        vm.prank(user);
        token.approve(address(rewards), type(uint256).max);
    }

    // ---------------------------------------------------------------- credits and burn

    function testConvertToCreditsAndBurn() public {
        uint256 supplyBefore = token.totalSupply();

        vm.expectEmit(address(rewards));
        emit CreditsConverted(user, 1_000e18, 50e18, 50e18, 900e18);
        vm.prank(user);
        uint256 credits = rewards.convertToCredits(1_000e18);

        assertEq(credits, 900e18);
        assertEq(rewards.userCredits(user), 900e18);
        // 5% burned: supply shrinks by exactly 50 ARL.
        assertEq(token.totalSupply(), supplyBefore - 50e18);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY - 50e18);
        assertEq(token.balanceOf(rewardPool), 50e18);
        assertEq(token.balanceOf(creditTreasury), 900e18);
        assertEq(token.balanceOf(user), USER_FUNDS - 1_000e18);
        // Converted ARL never sits in the contract.
        assertEq(token.balanceOf(address(rewards)), 0);
    }

    function test_ConvertAccumulatesCredits() public {
        vm.startPrank(user);
        rewards.convertToCredits(1_000e18);
        rewards.convertToCredits(200e18);
        vm.stopPrank();
        assertEq(rewards.userCredits(user), 900e18 + 180e18);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY - 60e18);
    }

    /// @dev Rounding remainders stay with the user's credits; burn and pool round down.
    function test_ConvertRoundingFavorsUser() public {
        vm.prank(user);
        assertEq(rewards.convertToCredits(19), 19); // 5% of 19 wei rounds to 0
        vm.prank(user);
        assertEq(rewards.convertToCredits(41), 37); // burn 2, pool 2
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY - 2);
        assertEq(token.balanceOf(rewardPool), 2);
        assertEq(rewards.userCredits(user), 56);
    }

    function test_RevertWhen_ConvertZero() public {
        vm.prank(user);
        vm.expectRevert(ComputeRewards.ComputeRewardsZeroAmount.selector);
        rewards.convertToCredits(0);
    }

    function test_RevertWhen_ConvertWithoutAllowance() public {
        address other = makeAddr("other");
        vm.prank(communitySafe);
        assertTrue(token.transfer(other, 1_000e18));
        vm.prank(other);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(rewards), 0, 50e18
            )
        );
        rewards.convertToCredits(1_000e18);
    }

    /// @dev The whole conversion reverts, including the burn already applied in the same call.
    function test_RevertWhen_ConvertMoreThanBalance() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, user, 8_900e18, 9_900e18
            )
        );
        rewards.convertToCredits(USER_FUNDS + 1_000e18);
    }

    // ---------------------------------------------------------------- staking and tiers

    function testStakeAndTierUpgrade() public {
        assertEq(uint8(rewards.userTier(user)), uint8(ComputeRewards.Tier.Bronze));

        vm.expectEmit(address(rewards));
        emit TierChanged(user, ComputeRewards.Tier.Bronze, ComputeRewards.Tier.Silver);
        vm.prank(user);
        rewards.stake(100e18);
        assertEq(rewards.userStakes(user), 100e18);
        assertEq(uint8(rewards.userTier(user)), uint8(ComputeRewards.Tier.Silver));

        vm.expectEmit(address(rewards));
        emit TierChanged(user, ComputeRewards.Tier.Silver, ComputeRewards.Tier.Gold);
        vm.prank(user);
        rewards.stake(400e18);
        assertEq(rewards.userStakes(user), 500e18);
        assertEq(uint8(rewards.userTier(user)), uint8(ComputeRewards.Tier.Gold));

        assertEq(token.balanceOf(address(rewards)), 500e18);
        assertEq(token.balanceOf(user), USER_FUNDS - 500e18);
        // Staking never burns.
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    function test_DiamondTier() public {
        vm.prank(user);
        rewards.stake(2_000e18);
        assertEq(uint8(rewards.userTier(user)), uint8(ComputeRewards.Tier.Diamond));
    }

    function test_TierThresholds() public view {
        assertEq(uint8(rewards.tierFor(0)), uint8(ComputeRewards.Tier.Bronze));
        assertEq(uint8(rewards.tierFor(100e18 - 1)), uint8(ComputeRewards.Tier.Bronze));
        assertEq(uint8(rewards.tierFor(100e18)), uint8(ComputeRewards.Tier.Silver));
        assertEq(uint8(rewards.tierFor(500e18 - 1)), uint8(ComputeRewards.Tier.Silver));
        assertEq(uint8(rewards.tierFor(500e18)), uint8(ComputeRewards.Tier.Gold));
        assertEq(uint8(rewards.tierFor(2_000e18 - 1)), uint8(ComputeRewards.Tier.Gold));
        assertEq(uint8(rewards.tierFor(2_000e18)), uint8(ComputeRewards.Tier.Diamond));
    }

    function test_StakeWithinTierEmitsNoTierChange() public {
        vm.prank(user);
        rewards.stake(10e18);
        vm.recordLogs();
        vm.prank(user);
        rewards.stake(10e18);
        // Staked and the token's Transfer; no TierChanged.
        assertEq(vm.getRecordedLogs().length, 2);
        assertEq(uint8(rewards.userTier(user)), uint8(ComputeRewards.Tier.Bronze));
    }

    function test_UnstakeDowngradesTierAndReturnsTokens() public {
        vm.prank(user);
        rewards.stake(2_000e18);

        vm.expectEmit(address(rewards));
        emit Unstaked(user, 1_600e18, 400e18);
        vm.expectEmit(address(rewards));
        emit TierChanged(user, ComputeRewards.Tier.Diamond, ComputeRewards.Tier.Silver);
        vm.prank(user);
        rewards.unstake(1_600e18);
        assertEq(rewards.userStakes(user), 400e18);
        assertEq(uint8(rewards.userTier(user)), uint8(ComputeRewards.Tier.Silver));

        vm.prank(user);
        rewards.unstake(400e18);
        assertEq(rewards.userStakes(user), 0);
        assertEq(uint8(rewards.userTier(user)), uint8(ComputeRewards.Tier.Bronze));
        assertEq(token.balanceOf(user), USER_FUNDS);
        assertEq(token.balanceOf(address(rewards)), 0);
    }

    function test_RevertWhen_UnstakeMoreThanStaked() public {
        vm.prank(user);
        rewards.stake(100e18);
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                ComputeRewards.ComputeRewardsInsufficientStake.selector, 100e18, 100e18 + 1
            )
        );
        rewards.unstake(100e18 + 1);
    }

    function test_RevertWhen_UnstakeOtherUsersStake() public {
        vm.prank(user);
        rewards.stake(100e18);
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(ComputeRewards.ComputeRewardsInsufficientStake.selector, 0, 1)
        );
        rewards.unstake(1);
    }

    function test_RevertWhen_StakeOrUnstakeZero() public {
        vm.startPrank(user);
        vm.expectRevert(ComputeRewards.ComputeRewardsZeroAmount.selector);
        rewards.stake(0);
        vm.expectRevert(ComputeRewards.ComputeRewardsZeroAmount.selector);
        rewards.unstake(0);
        vm.stopPrank();
    }

    /// @dev Conversions never draw on staked principal.
    function test_StakeIsSeparateFromCredits() public {
        vm.startPrank(user);
        rewards.stake(1_000e18);
        rewards.convertToCredits(1_000e18);
        vm.stopPrank();
        assertEq(token.balanceOf(address(rewards)), 1_000e18);
        assertEq(rewards.userStakes(user), 1_000e18);
    }

    // ---------------------------------------------------------------- gas budgets

    /// @dev Budgets per transaction: convertToCredits < 150k, stake < 100k. Both calls are
    /// first-time (cold, zero-to-nonzero storage), the most expensive case. The in-test
    /// measurement is within 1% of the isolated transaction gas, intrinsic cost included
    /// (`forge test --isolate --gas-report`: convertToCredits 117,111, stake 84,249 at most).
    function test_GasBudgets() public {
        vm.prank(user);
        uint256 start = gasleft();
        rewards.convertToCredits(1_000e18);
        assertLt(start - gasleft(), 150_000);

        vm.prank(user);
        start = gasleft();
        rewards.stake(1_000e18);
        assertLt(start - gasleft(), 100_000);
    }

    // ---------------------------------------------------------------- deployment

    function test_ConstructorSetsImmutables() public view {
        assertEq(address(rewards.arl()), address(token));
        assertEq(rewards.rewardPool(), rewardPool);
        assertEq(rewards.creditTreasury(), creditTreasury);
    }

    function test_RevertWhen_ConstructorZeroAddress() public {
        vm.expectRevert(ComputeRewards.ComputeRewardsZeroAddress.selector);
        new ComputeRewards(ERC20Burnable(address(0)), rewardPool, creditTreasury);
        vm.expectRevert(ComputeRewards.ComputeRewardsZeroAddress.selector);
        new ComputeRewards(token, address(0), creditTreasury);
        vm.expectRevert(ComputeRewards.ComputeRewardsZeroAddress.selector);
        new ComputeRewards(token, rewardPool, address(0));
    }

    function test_RevertWhen_RecipientIsSelf() public {
        address next = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(
            abi.encodeWithSelector(ComputeRewards.ComputeRewardsInvalidRecipient.selector, next)
        );
        new ComputeRewards(token, next, creditTreasury);
    }

    /// @dev No owner, admin, pause, upgrade or token recovery function exists.
    function test_NoAdminFunctions() public {
        address me = address(this);
        bytes[] memory calls = new bytes[](6);
        calls[0] = abi.encodeWithSignature("owner()");
        calls[1] = abi.encodeWithSignature("pause()");
        calls[2] = abi.encodeWithSignature("transferOwnership(address)", me);
        calls[3] = abi.encodeWithSignature("recoverERC20(address,uint256)", address(token), 1);
        calls[4] = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", me, "");
        calls[5] = abi.encodeWithSignature("setRewardPool(address)", me);
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok,) = address(rewards).call(calls[i]);
            assertFalse(ok);
        }
    }

    // ---------------------------------------------------------------- fuzz

    /// @dev Burned + pooled + credited always equals the amount converted.
    function testFuzz_ConvertConservesValue(uint256 amount) public {
        amount = bound(amount, 1, USER_FUNDS);
        uint256 supplyBefore = token.totalSupply();
        vm.prank(user);
        uint256 credits = rewards.convertToCredits(amount);

        uint256 burned = supplyBefore - token.totalSupply();
        uint256 pooled = token.balanceOf(rewardPool);
        assertEq(burned + pooled + credits, amount);
        assertEq(burned, amount * 500 / 10_000);
        assertEq(pooled, burned);
        assertEq(token.balanceOf(creditTreasury), credits);
        assertGe(credits * 10_000, amount * 9_000);
    }

    function testFuzz_StakeUnstakeRoundTrip(uint256 stakeAmount, uint256 unstakeAmount) public {
        stakeAmount = bound(stakeAmount, 1, USER_FUNDS);
        unstakeAmount = bound(unstakeAmount, 1, stakeAmount);
        vm.startPrank(user);
        rewards.stake(stakeAmount);
        rewards.unstake(unstakeAmount);
        vm.stopPrank();

        uint256 remaining = stakeAmount - unstakeAmount;
        assertEq(rewards.userStakes(user), remaining);
        assertEq(uint8(rewards.userTier(user)), uint8(rewards.tierFor(remaining)));
        assertEq(token.balanceOf(address(rewards)), remaining);
        assertEq(token.balanceOf(user), USER_FUNDS - remaining);
    }
}
