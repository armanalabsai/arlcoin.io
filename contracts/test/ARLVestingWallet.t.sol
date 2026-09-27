// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

contract ARLVestingWalletTest is ARLTestBase {
    address internal member = makeAddr("teamMember");
    uint256 internal constant GRANT = 50_000e18; // example grant from the team pool

    ARLVestingWallet internal teamVesting;

    function setUp() public override {
        super.setUp();
        teamVesting = new ARLVestingWallet(member, TEAM_GRANT, TEAM_CLIFF_END, TEAM_VESTING_END);
        vm.prank(teamPoolSafe);
        token.transfer(address(teamVesting), GRANT);
    }

    // ---------------------------------------------------------------- schedule parameters

    function test_FounderSchedule() public view {
        assertEq(founderVesting.owner(), founder);
        assertEq(founderVesting.cliffStart(), LAUNCH);
        assertEq(founderVesting.cliffEnd(), FOUNDER_CLIFF_END);
        assertEq(founderVesting.vestingEnd(), FOUNDER_VESTING_END);
        assertEq(founderVesting.start(), FOUNDER_CLIFF_END);
        assertEq(founderVesting.duration(), FOUNDER_VESTING_END - FOUNDER_CLIFF_END);
    }

    function test_TeamSchedule() public view {
        assertEq(teamVesting.cliffStart(), TEAM_GRANT);
        assertEq(teamVesting.cliffEnd(), TEAM_CLIFF_END);
        assertEq(teamVesting.vestingEnd(), TEAM_VESTING_END);
    }

    function test_RevertWhen_ZeroBeneficiary() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new ARLVestingWallet(address(0), LAUNCH, FOUNDER_CLIFF_END, FOUNDER_VESTING_END);
    }

    function test_RevertWhen_ZeroCliffStart() public {
        _expectInvalid(0, FOUNDER_CLIFF_END, FOUNDER_VESTING_END);
    }

    function test_RevertWhen_CliffStartAfterCliffEnd() public {
        _expectInvalid(FOUNDER_CLIFF_END + 1, FOUNDER_CLIFF_END, FOUNDER_VESTING_END);
    }

    function test_RevertWhen_VestingEndNotAfterCliffEnd() public {
        _expectInvalid(LAUNCH, FOUNDER_CLIFF_END, FOUNDER_CLIFF_END);
        _expectInvalid(LAUNCH, FOUNDER_CLIFF_END, FOUNDER_CLIFF_END - 1);
    }

    function testFuzz_ConstructorValidation(uint64 cliffStart, uint64 cliffEnd, uint64 vestingEnd)
        public
    {
        bool valid = cliffStart != 0 && cliffStart <= cliffEnd && cliffEnd < vestingEnd;
        if (!valid) {
            _expectInvalid(cliffStart, cliffEnd, vestingEnd);
            return;
        }
        ARLVestingWallet w = new ARLVestingWallet(member, cliffStart, cliffEnd, vestingEnd);
        assertEq(w.start(), cliffEnd);
        assertEq(w.end(), vestingEnd);
    }

    // ---------------------------------------------------------------- cliff and linear release

    function test_NothingVestsBeforeCliffEnd() public {
        vm.warp(FOUNDER_CLIFF_END - 1);
        assertEq(founderVesting.releasable(address(token)), 0);
        founderVesting.release(address(token));
        assertEq(token.balanceOf(founder), 0);
    }

    function test_NothingVestsExactlyAtCliffEnd() public {
        vm.warp(FOUNDER_CLIFF_END);
        assertEq(founderVesting.vestedAmount(address(token), FOUNDER_CLIFF_END), 0);
    }

    /// @dev The property that rules out VestingWalletCliff: no lump sum when the cliff ends.
    function test_NoLumpSumAtCliffExpiry() public view {
        uint256 oneSecond =
            founderVesting.vestedAmount(address(token), uint64(FOUNDER_CLIFF_END + 1));
        uint256 duration = FOUNDER_VESTING_END - FOUNDER_CLIFF_END;
        assertEq(oneSecond, ARLAllocation.FOUNDER / duration);
    }

    function test_HalfVestedAtMidpoint() public view {
        uint64 mid = FOUNDER_CLIFF_END + (FOUNDER_VESTING_END - FOUNDER_CLIFF_END) / 2;
        assertEq(founderVesting.vestedAmount(address(token), mid), ARLAllocation.FOUNDER / 2);
    }

    function test_BoundariesAtVestingEnd() public view {
        assertLt(
            founderVesting.vestedAmount(address(token), FOUNDER_VESTING_END - 1),
            ARLAllocation.FOUNDER
        );
        assertEq(
            founderVesting.vestedAmount(address(token), FOUNDER_VESTING_END), ARLAllocation.FOUNDER
        );
        assertEq(
            founderVesting.vestedAmount(address(token), type(uint64).max), ARLAllocation.FOUNDER
        );
    }

    function test_FullReleaseAfterVestingEnd() public {
        vm.warp(FOUNDER_VESTING_END);
        founderVesting.release(address(token));
        assertEq(token.balanceOf(founder), ARLAllocation.FOUNDER);
        assertEq(token.balanceOf(address(founderVesting)), 0);

        vm.warp(FOUNDER_VESTING_END + 365 days);
        founderVesting.release(address(token));
        assertEq(token.balanceOf(founder), ARLAllocation.FOUNDER);
    }

    function test_TeamCliffAndLinear() public {
        vm.warp(TEAM_CLIFF_END - 1);
        assertEq(teamVesting.releasable(address(token)), 0);
        vm.warp(TEAM_CLIFF_END + (TEAM_VESTING_END - TEAM_CLIFF_END) / 4);
        teamVesting.release(address(token));
        assertEq(token.balanceOf(member), GRANT / 4);
        vm.warp(TEAM_VESTING_END);
        teamVesting.release(address(token));
        assertEq(token.balanceOf(member), GRANT);
    }

    function test_AnyoneCanTriggerReleaseButOnlyBeneficiaryReceives() public {
        vm.warp(FOUNDER_VESTING_END);
        vm.prank(address(0xBAD));
        founderVesting.release(address(token));
        assertEq(token.balanceOf(founder), ARLAllocation.FOUNDER);
        assertEq(token.balanceOf(address(0xBAD)), 0);
    }

    function testFuzz_ReleasedMatchesLinearFormula(uint64 t) public {
        t = uint64(bound(t, LAUNCH, FOUNDER_VESTING_END + 1000 days));
        vm.warp(t);
        founderVesting.release(address(token));

        uint256 expected;
        if (t < FOUNDER_CLIFF_END) {
            expected = 0;
        } else if (t >= FOUNDER_VESTING_END) {
            expected = ARLAllocation.FOUNDER;
        } else {
            expected = ARLAllocation.FOUNDER * (t - FOUNDER_CLIFF_END)
                / (FOUNDER_VESTING_END - FOUNDER_CLIFF_END);
        }
        assertEq(token.balanceOf(founder), expected);
    }

    function testFuzz_RepeatedReleasesNeverExceedAllocation(uint64[5] memory steps) public {
        uint64 t = LAUNCH;
        uint256 previous;
        for (uint256 i = 0; i < steps.length; i++) {
            t += uint64(bound(steps[i], 0, 800 days));
            vm.warp(t);
            founderVesting.release(address(token));
            uint256 balance = token.balanceOf(founder);
            assertGe(balance, previous);
            assertLe(balance, ARLAllocation.FOUNDER);
            assertEq(balance + token.balanceOf(address(founderVesting)), ARLAllocation.FOUNDER);
            previous = balance;
        }
    }

    function testFuzz_VestedIsMonotonic(uint64 a, uint64 b) public view {
        a = uint64(bound(a, 0, type(uint64).max - 1));
        b = uint64(bound(b, a, type(uint64).max));
        assertLe(
            founderVesting.vestedAmount(address(token), a),
            founderVesting.vestedAmount(address(token), b)
        );
    }

    // ---------------------------------------------------------------- beneficiary is fixed

    function test_RevertWhen_BeneficiaryTransfersOwnership() public {
        vm.prank(founder);
        vm.expectRevert(ARLVestingWallet.ARLVestingBeneficiaryImmutable.selector);
        founderVesting.transferOwnership(address(0xBEEF));
        assertEq(founderVesting.owner(), founder);
    }

    function test_RevertWhen_BeneficiaryRenounces() public {
        vm.prank(founder);
        vm.expectRevert(ARLVestingWallet.ARLVestingBeneficiaryImmutable.selector);
        founderVesting.renounceOwnership();
        assertEq(founderVesting.owner(), founder);
    }

    function testFuzz_NobodyCanChangeBeneficiary(address caller, address newOwner) public {
        vm.startPrank(caller);
        vm.expectRevert(ARLVestingWallet.ARLVestingBeneficiaryImmutable.selector);
        founderVesting.transferOwnership(newOwner);
        vm.expectRevert(ARLVestingWallet.ARLVestingBeneficiaryImmutable.selector);
        founderVesting.renounceOwnership();
        vm.stopPrank();
        assertEq(founderVesting.owner(), founder);
    }

    // ---------------------------------------------------------------- investors and partnerships

    /// @dev Investor tokens are not unlocked at launch: nothing is releasable before the cliff.
    function test_InvestorsNotUnlockedAtLaunch() public {
        assertEq(investorsVesting.owner(), investorsSafe);
        assertEq(token.balanceOf(address(investorsVesting)), ARLAllocation.INVESTORS);
        assertEq(investorsVesting.releasable(address(token)), 0);
        investorsVesting.release(address(token));
        assertEq(token.balanceOf(investorsSafe), 0);
        assertEq(investorsVesting.vestedAmount(address(token), LAUNCH_PLUS_1Y), 0);
    }

    function test_InvestorsFullyVestedAtEnd() public view {
        assertEq(
            investorsVesting.vestedAmount(address(token), LAUNCH_PLUS_2Y), ARLAllocation.INVESTORS
        );
        assertLt(
            investorsVesting.vestedAmount(address(token), LAUNCH_PLUS_2Y - 1),
            ARLAllocation.INVESTORS
        );
    }

    /// @dev Strategic partnership tokens are released only through the vesting wallet, only to
    /// its beneficiary Safe, and never faster than the schedule.
    function test_PartnershipsReleaseOnlyVestedAmountToBeneficiary() public {
        vm.warp(LAUNCH + (LAUNCH_PLUS_2Y - LAUNCH) / 4);
        uint256 vested = partnershipsVesting.vestedAmount(address(token), uint64(block.timestamp));
        assertEq(vested, ARLAllocation.STRATEGIC_PARTNERSHIPS / 4);
        vm.prank(makeAddr("anyone"));
        partnershipsVesting.release(address(token));
        assertEq(token.balanceOf(partnershipsSafe), vested);
        assertEq(
            token.balanceOf(address(partnershipsVesting)),
            ARLAllocation.STRATEGIC_PARTNERSHIPS - vested
        );
    }

    // ---------------------------------------------------------------- helpers

    function _expectInvalid(uint64 cliffStart, uint64 cliffEnd, uint64 vestingEnd) private {
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLVestingWallet.ARLVestingInvalidSchedule.selector,
                cliffStart,
                cliffEnd,
                vestingEnd
            )
        );
        new ARLVestingWallet(member, cliffStart, cliffEnd, vestingEnd);
    }
}
