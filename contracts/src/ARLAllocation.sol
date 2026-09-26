// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

/// @title ARL allocation table
/// @notice On-chain copy of `packages/tokenomics/src/allocations.ts`. A test in that package
/// parses this file and fails if the two ever differ.
/// @dev Amounts are in base units (18 decimals).
library ARLAllocation {
    uint256 internal constant UNIT = 1e18;

    uint256 internal constant MAX_SUPPLY = 21_000_000 * UNIT;

    uint256 internal constant FOUNDER = 2_100_000 * UNIT;
    uint256 internal constant ECOSYSTEM_RESERVE = 7_000_000 * UNIT;
    uint256 internal constant TREASURY = 3_000_000 * UNIT;
    uint256 internal constant COMMUNITY_STAKING = 3_000_000 * UNIT;
    uint256 internal constant LIQUIDITY = 2_000_000 * UNIT;
    uint256 internal constant STRATEGIC_PARTNERSHIPS = 1_500_000 * UNIT;
    uint256 internal constant PUBLIC_LAUNCH = 1_000_000 * UNIT;
    uint256 internal constant GRANTS_BUG_BOUNTY = 400_000 * UNIT;
    uint256 internal constant TEAM = 500_000 * UNIT;
    uint256 internal constant EARLY_USER_REWARDS = 500_000 * UNIT;

    /// @dev Ecosystem Reserve release: linear over 5 x 366 days, so no calendar year
    /// (365 or 366 days) can release more than 1,400,000 ARL.
    uint256 internal constant ECOSYSTEM_RESERVE_ANNUAL_CAP = 1_400_000 * UNIT;
    uint64 internal constant ECOSYSTEM_RESERVE_DURATION = 5 * 366 days;
}
