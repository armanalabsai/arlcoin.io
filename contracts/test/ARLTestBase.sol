// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTimelock} from "../src/ARLTimelock.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";

/// @dev Test fixture that assembles the full Phase 1 allocation model. Every address here is a
/// labelled test account created by forge-std; none is a real wallet. The dates are example
/// parameters for tests only, not a launch schedule.
abstract contract ARLTestBase is Test {
    // Explicit UTC calendar timestamps.
    uint64 internal constant LAUNCH = 1_798_761_600; // 2027-01-01
    uint64 internal constant LAUNCH_PLUS_1Y = 1_830_297_600; // 2028-01-01
    uint64 internal constant LAUNCH_PLUS_2Y = 1_861_920_000; // 2029-01-01
    uint64 internal constant LAUNCH_PLUS_5Y = 1_956_528_000; // 2032-01-01

    uint64 internal constant TEAM_GRANT = 1_814_400_000; // 2027-07-01
    uint64 internal constant TEAM_CLIFF_END = 1_846_022_400; // 2028-07-01
    uint64 internal constant TEAM_VESTING_END = 1_940_630_400; // 2031-07-01

    uint64 internal constant FOUNDER_CLIFF_END = LAUNCH_PLUS_2Y; // 24 months
    uint64 internal constant FOUNDER_VESTING_END = LAUNCH_PLUS_5Y; // + 36 months

    address internal founder = makeAddr("founder");
    address internal ecosystemSafe = makeAddr("ecosystemSafe");
    address internal treasurySafe = makeAddr("treasurySafe");
    address internal guardianSafe = makeAddr("guardianSafe");
    address internal communitySafe = makeAddr("communitySafe");
    address internal liquiditySafe = makeAddr("liquiditySafe");
    address internal partnershipsSafe = makeAddr("partnershipsSafe");
    address internal launchSafe = makeAddr("launchSafe");
    address internal grantsSafe = makeAddr("grantsSafe");
    address internal teamPoolSafe = makeAddr("teamPoolSafe");
    address internal rewardsSafe = makeAddr("rewardsSafe");

    ARLToken internal token;
    ARLVestingWallet internal founderVesting;
    ARLVestingWallet internal reserveVesting;
    ARLTimelock internal treasury;

    function setUp() public virtual {
        founderVesting =
            new ARLVestingWallet(founder, LAUNCH, FOUNDER_CLIFF_END, FOUNDER_VESTING_END);
        reserveVesting = new ARLVestingWallet(
            ecosystemSafe, LAUNCH, LAUNCH, LAUNCH + ARLAllocation.ECOSYSTEM_RESERVE_DURATION
        );

        address[] memory safe = new address[](1);
        safe[0] = treasurySafe;
        treasury = new ARLTimelock(48 hours, safe, safe, guardianSafe);

        token = new ARLToken(
            ARLToken.Recipients({
                founder: address(founderVesting),
                ecosystemReserve: address(reserveVesting),
                treasury: address(treasury),
                communityStaking: communitySafe,
                liquidity: liquiditySafe,
                strategicPartnerships: partnershipsSafe,
                publicLaunch: launchSafe,
                grantsBugBounty: grantsSafe,
                team: teamPoolSafe,
                earlyUserRewards: rewardsSafe
            })
        );

        vm.warp(LAUNCH);
    }

    function _recipients() internal view returns (ARLToken.Recipients memory) {
        return ARLToken.Recipients({
            founder: founder,
            ecosystemReserve: ecosystemSafe,
            treasury: treasurySafe,
            communityStaking: communitySafe,
            liquidity: liquiditySafe,
            strategicPartnerships: partnershipsSafe,
            publicLaunch: launchSafe,
            grantsBugBounty: grantsSafe,
            team: teamPoolSafe,
            earlyUserRewards: rewardsSafe
        });
    }
}
