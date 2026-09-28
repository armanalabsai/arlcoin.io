// SPDX-License-Identifier: MIT
//
// Adapted from curvefi/unipool-fork, commit 262a5747a32acd3bf7124bc21058d6905f86e22a,
// file contracts/StakingRewards.sol, itself a modified Synthetix StakingRewards. Both carry
// the MIT License, reproduced here as they require:
//
// Copyright (c) 2020 Synthetix
// Copyright (c) 2020 Ben Hauser
// Modifications Copyright (c) 2026 ARL Protocol contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ARL staking rewards
/// @notice Stake ARL and earn ARL rewards paid from a funded pool, linearly over fixed reward
/// periods. Rewards come only from tokens that `rewardsDistribution` transfers in through
/// `notifyRewardAmount`; nothing is minted.
///
/// Privileged role. `rewardsDistribution` is a single address fixed at deployment. The intended
/// holder is the Community & Staking allocation holder (the plan's
/// `recipients.communityStaking`). This contract cannot tell where the tokens it receives came
/// from economically; the deployment verifier (`script/ARLStakingVerify.sol`) enforces that the
/// distributor is that holder. The role can:
/// - fund a reward period (`notifyRewardAmount`), pulling the tokens from itself;
/// - change the period length, only between periods (`setRewardsDuration`);
/// - take back rewards that were never allocated and are not reserved for an active period,
///   only between periods (`returnUnallocated`).
/// It cannot: withdraw or freeze staked principal, take allocated rewards, mint, pause, upgrade,
/// change itself, or recover arbitrary tokens. There is no owner.
///
/// Tokens that reach the contract other than through `stake` or `notifyRewardAmount` (a direct
/// transfer) and reward-per-token rounding dust are not accounted to anyone and stay in the
/// contract permanently; there is deliberately no recovery function.
///
/// @dev Changes from the source: Solidity 0.8 checked arithmetic and OpenZeppelin v5
/// `SafeERC20` / `ReentrancyGuard`; owner, pause, `recoverERC20` and the owner-set duration
/// removed; immutable `rewardsDistribution`; funded / accrued / paid / returned accounting so the
/// staking and reward token can both be ARL; `unallocatedRewards` and `returnUnallocated`;
/// `stakeWithPermit` that tolerates a front-run permit; a zero-rate guard; custom errors. The
/// reward-per-token and earned formulas are unchanged.
///
/// Accounting identity (all terms in reward tokens, at any time):
///   rewardsFunded = accrued + reserved + unallocated + rewardsReturned
/// where accrued = rewardsAccrued plus the accrual pending since the last checkpoint (only while
/// something is staked), reserved = rewardRate × (periodFinish − lastTimeRewardApplicable()), the
/// part of the active period still to be paid out, and unallocated ≥ 0.
contract ARLStakingRewards is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PRECISION = 1e18;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;
    /// @notice The limited privileged role described above. Fixed at deployment.
    address public immutable rewardsDistribution;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public rewardsDuration;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    /// @notice Total reward tokens transferred in by the distributor.
    uint256 public rewardsFunded;
    /// @notice Rewards allocated to stakers so far (claimed or not).
    uint256 public rewardsAccrued;
    /// @notice Rewards paid out to stakers.
    uint256 public rewardsPaid;
    /// @notice Unallocated rewards returned to the distributor.
    uint256 public rewardsReturned;

    mapping(address account => uint256) public userRewardPerTokenPaid;
    mapping(address account => uint256) public rewards;

    uint256 private _totalSupply;
    mapping(address account => uint256) private _balances;

    event RewardAdded(uint256 reward, uint256 rewardRate, uint256 periodFinish);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);
    event UnallocatedReturned(address indexed to, uint256 amount);

    error StakingZeroAddress();
    error StakingZeroAmount();
    error StakingZeroDuration();
    error StakingNotDistributor();
    error StakingPeriodActive();
    error StakingRewardTooLow();
    error StakingInsufficientBalance(uint256 balance, uint256 amount);

    modifier onlyRewardsDistribution() {
        if (msg.sender != rewardsDistribution) revert StakingNotDistributor();
        _;
    }

    modifier updateReward(address account) {
        _updateReward(account);
        _;
    }

    /// @param stakingToken_ Token staked (ARL).
    /// @param rewardsToken_ Token paid as reward (ARL).
    /// @param rewardsDistribution_ Funds periods; must be the Community & Staking allocation holder
    /// (checked by the deployment verifier, not here).
    /// @param rewardsDuration_ Length of each reward period in seconds. Must be non-zero.
    constructor(
        IERC20 stakingToken_,
        IERC20 rewardsToken_,
        address rewardsDistribution_,
        uint256 rewardsDuration_
    ) {
        if (
            address(stakingToken_) == address(0) || address(rewardsToken_) == address(0)
                || rewardsDistribution_ == address(0)
        ) revert StakingZeroAddress();
        if (rewardsDuration_ == 0) revert StakingZeroDuration();
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
        rewardsDistribution = rewardsDistribution_;
        rewardsDuration = rewardsDuration_;
    }

    // ---------------------------------------------------------------- views

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    // Reward periods are days long; block-timestamp drift of seconds does not change an outcome
    // that matters. The same applies to every timestamp comparison below.
    function lastTimeRewardApplicable() public view returns (uint256) {
        // slither-disable-next-line timestamp
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) return rewardPerTokenStored;
        return rewardPerTokenStored
            + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * PRECISION)
            / _totalSupply;
    }

    function earned(address account) public view returns (uint256) {
        return (_balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account]))
            / PRECISION + rewards[account];
    }

    function getRewardForDuration() external view returns (uint256) {
        return rewardRate * rewardsDuration;
    }

    /// @notice Rewards of the active period not yet paid out over time:
    /// `rewardRate × (periodFinish − lastTimeRewardApplicable())`. Zero between periods.
    function reservedRewards() public view returns (uint256) {
        return (periodFinish - lastTimeRewardApplicable()) * rewardRate;
    }

    /// @notice Rewards allocated to stakers so far, including the accrual pending since the last
    /// checkpoint. Allocation happens only while something is staked.
    function accruedRewards() public view returns (uint256) {
        if (_totalSupply == 0) return rewardsAccrued;
        return rewardsAccrued + (lastTimeRewardApplicable() - lastUpdateTime) * rewardRate;
    }

    /// @notice Funded rewards that are neither allocated to stakers, nor reserved for the rest of
    /// the active period, nor already returned: time elapsed with nothing staked and the
    /// remainder of the rate division. Only this amount can be returned, between periods.
    function unallocatedRewards() public view returns (uint256) {
        return rewardsFunded - accruedRewards() - reservedRewards() - rewardsReturned;
    }

    // ---------------------------------------------------------------- staking

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        _stake(amount);
    }

    /// @notice Stake with an EIP-2612 permit. A permit already used (for example by a
    /// front-runner) does not block the stake as long as the allowance is in place.
    function stakeWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        // The permit comes first so that no state changes before an external call. The state
        // written after it is benign: the call goes to the immutable staking token (ARL, which
        // has no hooks) and the function is nonReentrant.
        // slither-disable-next-line reentrancy-benign
        try IERC20Permit(address(stakingToken))
            .permit(msg.sender, address(this), amount, deadline, v, r, s) {}
            catch {}
        _updateReward(msg.sender);
        _stake(amount);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert StakingZeroAmount();
        uint256 balance = _balances[msg.sender];
        if (balance < amount) revert StakingInsufficientBalance(balance, amount);
        _totalSupply -= amount;
        _balances[msg.sender] = balance - amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardsPaid += reward;
            rewardsToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        uint256 balance = _balances[msg.sender];
        if (balance > 0) withdraw(balance);
        getReward();
    }

    // ---------------------------------------------------------------- distributor

    /// @notice Funds a reward period of `rewardsDuration` starting now. Tokens are pulled from the
    /// distributor, so the rate always matches what was actually transferred. Rewards left in
    /// an active period are rolled into the new one.
    function notifyRewardAmount(uint256 reward)
        external
        nonReentrant
        onlyRewardsDistribution
        updateReward(address(0))
    {
        if (reward == 0) revert StakingZeroAmount();
        rewardsToken.safeTransferFrom(msg.sender, address(this), reward);
        rewardsFunded += reward;

        uint256 duration = rewardsDuration;
        uint256 newRate;
        // slither-disable-next-line timestamp
        if (block.timestamp >= periodFinish) {
            newRate = reward / duration;
        } else {
            uint256 leftover = (periodFinish - block.timestamp) * rewardRate;
            newRate = (reward + leftover) / duration;
        }
        // A value check on a computed rate, not a balance comparison.
        // slither-disable-next-line incorrect-equality,timestamp
        if (newRate == 0) revert StakingRewardTooLow();
        rewardRate = newRate;
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;
        emit RewardAdded(reward, newRate, block.timestamp + duration);
    }

    /// @notice Sets the length of the next period. Only between periods.
    function setRewardsDuration(uint256 duration) external onlyRewardsDistribution {
        // slither-disable-next-line timestamp
        if (block.timestamp <= periodFinish) revert StakingPeriodActive();
        if (duration == 0) revert StakingZeroDuration();
        rewardsDuration = duration;
        emit RewardsDurationUpdated(duration);
    }

    /// @notice Returns rewards that were never allocated (periods with no stakers, rate rounding)
    /// to the distributor. Only between periods; staked principal and allocated rewards are
    /// never touched.
    function returnUnallocated()
        external
        nonReentrant
        onlyRewardsDistribution
        updateReward(address(0))
    {
        // slither-disable-next-line timestamp
        if (block.timestamp <= periodFinish) revert StakingPeriodActive();
        uint256 amount = unallocatedRewards();
        // slither-disable-next-line incorrect-equality,timestamp
        if (amount == 0) revert StakingZeroAmount();
        rewardsReturned += amount;
        rewardsToken.safeTransfer(rewardsDistribution, amount);
        emit UnallocatedReturned(rewardsDistribution, amount);
    }

    // ---------------------------------------------------------------- internal

    function _stake(uint256 amount) private {
        if (amount == 0) revert StakingZeroAmount();
        _totalSupply += amount;
        _balances[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function _updateReward(address account) private {
        uint256 applicable = lastTimeRewardApplicable();
        if (_totalSupply > 0) {
            // Rewards for this interval are allocated only when someone is staked.
            rewardsAccrued += (applicable - lastUpdateTime) * rewardRate;
        }
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = applicable;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }
}
