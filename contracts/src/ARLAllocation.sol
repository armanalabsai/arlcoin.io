// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

/// @title ARL allocation table
/// @notice On-chain copy of `packages/tokenomics/src/allocations.ts` (the 11-allocation model
/// approved on 2026-09-27). A test in that package parses this file and fails if the two ever
/// differ.
/// @dev Amounts are in base units (18 decimals). Listed in canonical order.
library ARLAllocation {
    uint256 internal constant UNIT = 1e18;

    uint256 internal constant MAX_SUPPLY = 21_000_000 * UNIT;

    uint256 internal constant PUBLIC_LAUNCH = 5_000_000 * UNIT;
    uint256 internal constant COMMUNITY_STAKING = 3_000_000 * UNIT;
    uint256 internal constant ECOSYSTEM_GROWTH = 2_000_000 * UNIT;
    uint256 internal constant STRATEGIC_PARTNERSHIPS = 2_000_000 * UNIT;
    uint256 internal constant LIQUIDITY = 2_000_000 * UNIT;
    uint256 internal constant FOUNDER = 2_100_000 * UNIT;
    uint256 internal constant INVESTORS = 1_500_000 * UNIT;
    uint256 internal constant TREASURY = 1_000_000 * UNIT;
    uint256 internal constant TEAM = 900_000 * UNIT;
    uint256 internal constant EARLY_USERS = 1_100_000 * UNIT;
    uint256 internal constant GRANTS_BUG_BOUNTY = 400_000 * UNIT;
}
