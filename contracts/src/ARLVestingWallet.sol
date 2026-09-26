// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

/// @title ARL vesting wallet
/// @notice OpenZeppelin `VestingWallet` with two ARL-specific changes:
/// 1. The schedule is set with explicit timestamps: nothing vests during the cliff
///    (`cliffStart` .. `cliffEnd`), then tokens vest linearly from `cliffEnd` to `vestingEnd`.
/// 2. The beneficiary cannot be changed. `transferOwnership` and `renounceOwnership` revert.
///
/// @dev Why not the OpenZeppelin primitives alone:
/// - `VestingWalletCliff` vests linearly from `start`, so at cliff expiry it releases the whole
///   cliff period's share at once. Here the linear period starts only when the cliff ends, which
///   is `VestingWallet` with `start = cliffEnd`. No vesting math is changed.
/// - `VestingWallet` is `Ownable`. Its owner is the beneficiary and can transfer ownership, which
///   hands over all unvested tokens. OpenZeppelin v5.6.1 offers no non-transferable variant.
///   Renouncing would also leave tokens stuck, because releases are sent to `owner()`.
///
/// Consequence: if a beneficiary loses its key, the tokens in this wallet cannot be recovered.
/// Beneficiaries should be multisigs or keys with a documented recovery procedure.
contract ARLVestingWallet is VestingWallet {
    /// @notice Start of the cliff: the grant or launch date. Informational; nothing vests before
    /// `cliffEnd` regardless of this value.
    uint64 public immutable cliffStart;

    error ARLVestingInvalidSchedule(uint64 cliffStart, uint64 cliffEnd, uint64 vestingEnd);
    error ARLVestingBeneficiaryImmutable();

    /// @param beneficiary Receives released tokens. Must be non-zero (enforced by `Ownable`).
    /// @param cliffStart_ Grant or launch timestamp. Must be non-zero and not after `cliffEnd`.
    /// @param cliffEnd_ Timestamp at which linear vesting begins. Equal to `cliffStart_` for no cliff.
    /// @param vestingEnd_ Timestamp at which everything is vested. Must be after `cliffEnd_`.
    constructor(address beneficiary, uint64 cliffStart_, uint64 cliffEnd_, uint64 vestingEnd_)
        VestingWallet(beneficiary, cliffEnd_, _linearDuration(cliffStart_, cliffEnd_, vestingEnd_))
    {
        cliffStart = cliffStart_;
    }

    /// @notice Timestamp at which linear vesting begins. Same as `start()`.
    function cliffEnd() external view returns (uint256) {
        return start();
    }

    /// @notice Timestamp at which the full balance is vested. Same as `end()`.
    function vestingEnd() external view returns (uint256) {
        return end();
    }

    /// @dev Always reverts: the beneficiary is fixed for the life of the wallet.
    function transferOwnership(address) public pure override {
        revert ARLVestingBeneficiaryImmutable();
    }

    /// @dev Always reverts: renouncing would send future releases to the zero address.
    function renounceOwnership() public pure override {
        revert ARLVestingBeneficiaryImmutable();
    }

    function _linearDuration(uint64 cliffStart_, uint64 cliffEnd_, uint64 vestingEnd_)
        private
        pure
        returns (uint64)
    {
        if (cliffStart_ == 0 || cliffStart_ > cliffEnd_ || cliffEnd_ >= vestingEnd_) {
            revert ARLVestingInvalidSchedule(cliffStart_, cliffEnd_, vestingEnd_);
        }
        return vestingEnd_ - cliffEnd_;
    }
}
