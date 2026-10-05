// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";

/// @dev Test fixture that assembles the full 11-allocation model (the Founder allocation is
/// minted to the Founder Safe, fully unlocked, with no vesting). Every address here is a
/// labelled test account created by forge-std; none is a real wallet. The dates and vesting
/// schedules are example parameters for tests only: the approved schedules are TBD.
abstract contract ARLTestBase is Test {
    // Explicit UTC calendar timestamps.
    uint64 internal constant LAUNCH = 1_798_761_600; // 2027-01-01
    uint64 internal constant LAUNCH_PLUS_1Y = 1_830_297_600; // 2028-01-01
    uint64 internal constant LAUNCH_PLUS_2Y = 1_861_920_000; // 2029-01-01
    uint64 internal constant LAUNCH_PLUS_5Y = 1_956_528_000; // 2032-01-01

    uint64 internal constant TEAM_GRANT = 1_814_400_000; // 2027-07-01
    uint64 internal constant TEAM_CLIFF_END = 1_846_022_400; // 2028-07-01
    uint64 internal constant TEAM_VESTING_END = 1_940_630_400; // 2031-07-01

    // Fixture schedule for the generic vesting tests. The approved 12 + 36 month schedule is
    // enforced by the deployment plan (`ARLDeployPlan`, `packages/deploy`), not by this fixture.
    uint64 internal constant INVESTORS_CLIFF_END = LAUNCH_PLUS_1Y;
    uint64 internal constant INVESTORS_VESTING_END = LAUNCH_PLUS_2Y;

    // Holders. Every allocation has its own dedicated holder.
    address internal founderSafe = makeAddr("founderSafe");
    address internal investorsSafe = makeAddr("investorsSafe");
    address internal partnershipsSafe = makeAddr("partnershipsSafe");
    address internal treasurySafe = makeAddr("treasurySafe");
    address internal guardianSafe = makeAddr("guardianSafe");
    address internal launchSafe = makeAddr("launchSafe");
    address internal communitySafe = makeAddr("communitySafe");
    address internal growthSafe = makeAddr("growthSafe");
    address internal liquiditySafe = makeAddr("liquiditySafe");
    address internal teamPoolSafe = makeAddr("teamPoolSafe");
    address internal earlyUsersSafe = makeAddr("earlyUsersSafe");
    address internal grantsSafe = makeAddr("grantsSafe");

    ARLToken internal token;
    ARLVestingWallet internal investorsVesting;
    ARLVestingWallet internal partnershipsVesting;
    ARLTimelock internal treasury;

    function setUp() public virtual {
        investorsVesting =
            new ARLVestingWallet(investorsSafe, LAUNCH, INVESTORS_CLIFF_END, INVESTORS_VESTING_END);
        partnershipsVesting = new ARLVestingWallet(partnershipsSafe, LAUNCH, LAUNCH, LAUNCH_PLUS_2Y);

        address[] memory safe = new address[](1);
        safe[0] = treasurySafe;
        treasury = new ARLTimelock(48 hours, safe, safe, guardianSafe);

        token = new ARLToken(
            ARLToken.Recipients({
                publicLaunch: launchSafe,
                communityStaking: communitySafe,
                ecosystemGrowth: growthSafe,
                strategicPartnerships: address(partnershipsVesting),
                liquidity: liquiditySafe,
                founder: founderSafe,
                investors: address(investorsVesting),
                treasury: address(treasury),
                team: teamPoolSafe,
                earlyUsers: earlyUsersSafe,
                grantsBugBounty: grantsSafe
            })
        );

        vm.warp(LAUNCH);
    }

    function _recipients() internal view returns (ARLToken.Recipients memory) {
        return ARLToken.Recipients({
            publicLaunch: launchSafe,
            communityStaking: communitySafe,
            ecosystemGrowth: growthSafe,
            strategicPartnerships: partnershipsSafe,
            liquidity: liquiditySafe,
            founder: founderSafe,
            investors: investorsSafe,
            treasury: treasurySafe,
            team: teamPoolSafe,
            earlyUsers: earlyUsersSafe,
            grantsBugBounty: grantsSafe
        });
    }
}
