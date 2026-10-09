// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title ARL compute credits and staking tiers
/// @notice Two independent functions:
/// - `convertToCredits` spends ARL for compute credits. Of every conversion, 5% is burned
///   (total supply goes down), 5% goes to the reward pool and the remaining 90% (including any
///   rounding remainder) is paid to the credit treasury and recorded as the caller's credits.
/// - `stake` / `unstake` lock ARL in this contract and assign a tier from the amount staked:
///   Bronze below 100 ARL, Silver from 100, Gold from 500, Diamond from 2,000.
///
/// There is no owner, admin, pause, upgrade or recovery function. All parameters are constants
/// or immutables fixed at deployment. Staked ARL can only leave through `unstake`, to the staker.
/// Credits are an on-chain ledger only: they cannot be withdrawn or transferred, and the compute
/// provider reads them to grant usage.
///
/// @dev Burn, transfer and reentrancy logic is OpenZeppelin Contracts v5.6.1 (`ERC20Burnable`,
/// `SafeERC20`, `ReentrancyGuardTransient`, `SafeCast`), unmodified. The tier model follows the
/// Synthetix `StakingRewards` stake/withdraw pattern (balance mapping, checks-effects-interactions,
/// `nonReentrant`) without the reward stream, which ARL already runs in `ARLStakingRewards`.
/// Converted ARL never touches this contract's balance, so the contract's ARL balance is at least
/// the sum of all stakes (it exceeds it only by tokens sent to it directly, which no function can
/// move). There is no total-staked counter: it would cost every stake an extra storage write, and
/// the sum is available from the contract's balance and the `Staked` / `Unstaked` events.
contract ComputeRewards is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum Tier {
        Bronze,
        Silver,
        Gold,
        Diamond
    }

    /// @dev One storage slot per staker. 2^128 is far above the 21,000,000 ARL supply.
    struct StakeInfo {
        uint128 amount;
        Tier tier;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant BURN_BPS = 500;
    uint256 public constant POOL_BPS = 500;

    uint256 public constant SILVER_THRESHOLD = 100e18;
    uint256 public constant GOLD_THRESHOLD = 500e18;
    uint256 public constant DIAMOND_THRESHOLD = 2_000e18;

    /// @notice The ARL token. Must implement `burnFrom` (OpenZeppelin `ERC20Burnable`).
    ERC20Burnable public immutable arl;
    /// @notice Receives 5% of every conversion.
    address public immutable rewardPool;
    /// @notice Receives the 90% of every conversion that backs compute credits.
    address public immutable creditTreasury;

    /// @notice Compute credits per account, in ARL base units (18 decimals).
    mapping(address account => uint256) public userCredits;

    mapping(address account => StakeInfo) private _stakes;

    event CreditsConverted(
        address indexed user, uint256 arlAmount, uint256 burned, uint256 pooled, uint256 credits
    );
    event Staked(address indexed user, uint256 amount, uint256 newStake);
    event Unstaked(address indexed user, uint256 amount, uint256 newStake);
    event TierChanged(address indexed user, Tier oldTier, Tier newTier);

    error ComputeRewardsZeroAddress();
    error ComputeRewardsInvalidRecipient(address recipient);
    error ComputeRewardsZeroAmount();
    error ComputeRewardsInsufficientStake(uint256 staked, uint256 amount);

    /// @param arl_ The ARL token.
    /// @param rewardPool_ Receiver of the 5% pool share (intended: the Community & Staking
    /// allocation holder, which funds `ARLStakingRewards`). Not this contract.
    /// @param creditTreasury_ Receiver of the 90% credit share (intended: the compute payment
    /// receiver). Not this contract.
    constructor(ERC20Burnable arl_, address rewardPool_, address creditTreasury_) {
        if (
            address(arl_) == address(0) || rewardPool_ == address(0)
                || creditTreasury_ == address(0)
        ) revert ComputeRewardsZeroAddress();
        if (rewardPool_ == address(this)) revert ComputeRewardsInvalidRecipient(rewardPool_);
        if (creditTreasury_ == address(this)) {
            revert ComputeRewardsInvalidRecipient(creditTreasury_);
        }
        arl = arl_;
        rewardPool = rewardPool_;
        creditTreasury = creditTreasury_;
    }

    // ---------------------------------------------------------------- credits

    /// @notice Converts `arlAmount` ARL from the caller into compute credits. Requires an
    /// allowance of at least `arlAmount` to this contract.
    /// @return credits Credits added to the caller (90% of `arlAmount`, rounded in the caller's
    /// favor).
    function convertToCredits(uint256 arlAmount) external nonReentrant returns (uint256 credits) {
        if (arlAmount == 0) revert ComputeRewardsZeroAmount();
        uint256 burned = arlAmount * BURN_BPS / BPS;
        uint256 pooled = arlAmount * POOL_BPS / BPS;
        credits = arlAmount - burned - pooled;

        userCredits[msg.sender] += credits;
        emit CreditsConverted(msg.sender, arlAmount, burned, pooled, credits);

        arl.burnFrom(msg.sender, burned);
        IERC20(address(arl)).safeTransferFrom(msg.sender, rewardPool, pooled);
        IERC20(address(arl)).safeTransferFrom(msg.sender, creditTreasury, credits);
    }

    // ---------------------------------------------------------------- staking

    /// @notice Stakes `amount` ARL from the caller. Requires an allowance of at least `amount`.
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ComputeRewardsZeroAmount();
        StakeInfo storage s = _stakes[msg.sender];
        uint256 newStake = s.amount + amount;
        s.amount = SafeCast.toUint128(newStake);
        emit Staked(msg.sender, amount, newStake);
        _updateTier(msg.sender);

        IERC20(address(arl)).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Returns `amount` of the caller's staked ARL to the caller.
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ComputeRewardsZeroAmount();
        StakeInfo storage s = _stakes[msg.sender];
        uint256 staked = s.amount;
        if (amount > staked) revert ComputeRewardsInsufficientStake(staked, amount);
        uint256 newStake;
        unchecked {
            newStake = staked - amount;
        }
        // Cannot truncate: newStake <= staked, which was read from a uint128.
        // forge-lint: disable-next-line(unsafe-typecast)
        s.amount = uint128(newStake);
        emit Unstaked(msg.sender, amount, newStake);
        _updateTier(msg.sender);

        IERC20(address(arl)).safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    /// @notice ARL staked by `user`.
    function userStakes(address user) external view returns (uint256) {
        return _stakes[user].amount;
    }

    /// @notice Current tier of `user`.
    function userTier(address user) external view returns (Tier) {
        return _stakes[user].tier;
    }

    /// @notice Tier for a staked amount.
    function tierFor(uint256 amount) public pure returns (Tier) {
        if (amount >= DIAMOND_THRESHOLD) return Tier.Diamond;
        if (amount >= GOLD_THRESHOLD) return Tier.Gold;
        if (amount >= SILVER_THRESHOLD) return Tier.Silver;
        return Tier.Bronze;
    }

    // ---------------------------------------------------------------- internal

    /// @dev Recomputes the tier from the stored stake; writes and emits only on a change.
    function _updateTier(address user) internal {
        StakeInfo storage s = _stakes[user];
        Tier oldTier = s.tier;
        Tier newTier = tierFor(s.amount);
        if (newTier != oldTier) {
            s.tier = newTier;
            emit TierChanged(user, oldTier, newTier);
        }
    }
}
