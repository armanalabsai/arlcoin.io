// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import {ARLAllocation} from "./ARLAllocation.sol";

/// @title ARL token
/// @notice Fixed-supply ERC-20. The full 21,000,000 ARL is minted once, in the constructor,
/// to the eleven allocation holders. The contract has no owner, no admin role, no pause, no
/// upgrade path and no function that can mint after deployment.
/// @dev All ERC-20 behavior is OpenZeppelin Contracts v5.6.1 `ERC20`, unmodified. `_mint` is
/// internal and is called only from this constructor. `ERC20Permit` (EIP-2612, unmodified) adds
/// signed approvals; it sets allowances only and cannot change supply.
contract ARLToken is ERC20, ERC20Permit {
    /// @notice Holder of each allocation, in canonical order. Holders are vesting wallets, the
    /// treasury timelock or dedicated Safes; the deployment plan requires each to be distinct.
    /// The Founder Safe receives no privilege; it is an ordinary ERC-20 holder after genesis.
    struct Recipients {
        address publicLaunch;
        address communityStaking;
        address ecosystemGrowth;
        address strategicPartnerships;
        address liquidity;
        address founder;
        address investors;
        address treasury;
        address team;
        address earlyUsers;
        address grantsBugBounty;
    }

    /// @notice Hard cap. Equal to `totalSupply()` for the life of the contract.
    uint256 public constant MAX_SUPPLY = ARLAllocation.MAX_SUPPLY;

    /// @dev Unreachable while the allocation constants sum to MAX_SUPPLY; kept as a guard
    /// against a future edit to ARLAllocation.
    error ARLSupplyMismatch(uint256 minted, uint256 expected);

    /// @dev A zero recipient reverts inside `_mint` with `ERC20InvalidReceiver(address(0))`.
    constructor(Recipients memory r) ERC20("ARL", "ARL") ERC20Permit("ARL") {
        _mint(r.publicLaunch, ARLAllocation.PUBLIC_LAUNCH);
        _mint(r.communityStaking, ARLAllocation.COMMUNITY_STAKING);
        _mint(r.ecosystemGrowth, ARLAllocation.ECOSYSTEM_GROWTH);
        _mint(r.strategicPartnerships, ARLAllocation.STRATEGIC_PARTNERSHIPS);
        _mint(r.liquidity, ARLAllocation.LIQUIDITY);
        _mint(r.founder, ARLAllocation.FOUNDER);
        _mint(r.investors, ARLAllocation.INVESTORS);
        _mint(r.treasury, ARLAllocation.TREASURY);
        _mint(r.team, ARLAllocation.TEAM);
        _mint(r.earlyUsers, ARLAllocation.EARLY_USERS);
        _mint(r.grantsBugBounty, ARLAllocation.GRANTS_BUG_BOUNTY);

        if (totalSupply() != MAX_SUPPLY) revert ARLSupplyMismatch(totalSupply(), MAX_SUPPLY);
    }
}
