// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import {ARLAllocation} from "./ARLAllocation.sol";

/// @title ARL token
/// @notice Fixed-supply ERC-20. The full 21,000,000 ARL is minted once, in the constructor,
/// to the ten allocation holders. The contract has no owner, no admin role, no pause, no
/// upgrade path and no function that can mint after deployment.
/// @dev All ERC-20 behavior is OpenZeppelin Contracts v5.6.1 `ERC20`, unmodified. `_mint` is
/// internal and is called only from this constructor. `ERC20Permit` (EIP-2612, unmodified) adds
/// signed approvals; it sets allowances only and cannot change supply.
contract ARLToken is ERC20, ERC20Permit {
    /// @notice Holder of each allocation. Holders are expected to be vesting wallets, a
    /// timelock or multisigs; the same address may hold more than one allocation.
    struct Recipients {
        address founder;
        address ecosystemReserve;
        address treasury;
        address communityStaking;
        address liquidity;
        address strategicPartnerships;
        address publicLaunch;
        address grantsBugBounty;
        address team;
        address earlyUserRewards;
    }

    /// @notice Hard cap. Equal to `totalSupply()` for the life of the contract.
    uint256 public constant MAX_SUPPLY = ARLAllocation.MAX_SUPPLY;

    /// @dev Unreachable while the allocation constants sum to MAX_SUPPLY; kept as a guard
    /// against a future edit to ARLAllocation.
    error ARLSupplyMismatch(uint256 minted, uint256 expected);

    /// @dev A zero recipient reverts inside `_mint` with `ERC20InvalidReceiver(address(0))`.
    constructor(Recipients memory r) ERC20("ARL", "ARL") ERC20Permit("ARL") {
        _mint(r.founder, ARLAllocation.FOUNDER);
        _mint(r.ecosystemReserve, ARLAllocation.ECOSYSTEM_RESERVE);
        _mint(r.treasury, ARLAllocation.TREASURY);
        _mint(r.communityStaking, ARLAllocation.COMMUNITY_STAKING);
        _mint(r.liquidity, ARLAllocation.LIQUIDITY);
        _mint(r.strategicPartnerships, ARLAllocation.STRATEGIC_PARTNERSHIPS);
        _mint(r.publicLaunch, ARLAllocation.PUBLIC_LAUNCH);
        _mint(r.grantsBugBounty, ARLAllocation.GRANTS_BUG_BOUNTY);
        _mint(r.team, ARLAllocation.TEAM);
        _mint(r.earlyUserRewards, ARLAllocation.EARLY_USER_REWARDS);

        if (totalSupply() != MAX_SUPPLY) revert ARLSupplyMismatch(totalSupply(), MAX_SUPPLY);
    }
}
