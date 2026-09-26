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

    // ---------------------------------------------------------------- ecosystem reserve

    function test_ReserveFullyReleasedAfterDuration() public view {
        uint64 end = LAUNCH + ARLAllocation.ECOSYSTEM_RESERVE_DURATION;
        assertEq(reserveVesting.vestedAmount(address(token), end), ARLAllocation.ECOSYSTEM_RESERVE);
        assertLt(
            reserveVesting.vestedAmount(address(token), end - 1), ARLAllocation.ECOSYSTEM_RESERVE
        );
    }

    /// @dev Five calendar years from 2027-01-01 contain a leap year (2028). A plain five-year
    /// linear schedule would release more than 1,400,000 ARL in 2028; 5 x 366 days does not.
    function test_ReserveCapHoldsInEveryCalendarYear() public view {
        // 2027-01-01 .. 2033-01-01; 2028 and 2032 are leap years.
        uint64[7] memory yearStarts = [
            LAUNCH,
            LAUNCH_PLUS_1Y,
            LAUNCH_PLUS_2Y,
            uint64(1_893_456_000),
            uint64(1_924_992_000),
            LAUNCH_PLUS_5Y,
            uint64(1_988_150_400)
        ];
        uint256 total;
        for (uint256 i = 0; i + 1 < yearStarts.length; i++) {
            uint256 released = reserveVesting.vestedAmount(address(token), yearStarts[i + 1])
                - reserveVesting.vestedAmount(address(token), yearStarts[i]);
            assertLe(released, ARLAllocation.ECOSYSTEM_RESERVE_ANNUAL_CAP);
            total += released;
        }
        assertEq(total, ARLAllocation.ECOSYSTEM_RESERVE);
    }

    /// @dev Stronger than calendar years: no window of up to 366 days releases more than the cap.
    function testFuzz_ReserveCapHoldsInAnyWindow(uint64 from, uint64 length) public view {
        from = uint64(bound(from, LAUNCH - 30 days, LAUNCH + 6 * 366 days));
        length = uint64(bound(length, 0, 366 days));
        uint256 released = reserveVesting.vestedAmount(address(token), from + length)
            - reserveVesting.vestedAmount(address(token), from);
        assertLe(released, ARLAllocation.ECOSYSTEM_RESERVE_ANNUAL_CAP);
    }

    /// @dev Documents why the duration is 5 x 366 days rather than the five calendar years.
    function test_PlainFiveCalendarYearsWouldBreachCap() public {
        ARLVestingWallet naive = new ARLVestingWallet(ecosystemSafe, LAUNCH, LAUNCH, LAUNCH_PLUS_5Y);
        vm.prank(communitySafe);
        token.transfer(address(naive), ARLAllocation.ECOSYSTEM_RESERVE / 7 * 3); // 3M sample
        uint256 in2028 = naive.vestedAmount(address(token), LAUNCH_PLUS_2Y)
            - naive.vestedAmount(address(token), LAUNCH_PLUS_1Y);
        // Scale the 3M sample to 7M: the 2028 share exceeds 1.4M.
        assertGt(in2028 * 7 / 3, ARLAllocation.ECOSYSTEM_RESERVE_ANNUAL_CAP);
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
