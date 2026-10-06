// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ARLStakingRewards} from "../src/ARLStakingRewards.sol";
import {Plan} from "./ARLDeployPlan.sol";

/// @title Staking deployment verification
/// @notice Read-only. Checks a deployed `ARLStakingRewards` against the deployment plan and the
/// deployed token, and reverts with the name of the first check that fails.
///
/// The staking contract cannot know where the reward tokens it receives come from. What it can
/// fix is who may fund it: `rewardsDistribution`. This verifier binds that role to the
/// Community & Staking allocation holder named in the plan (`recipients.communityStaking`), the
/// address the token mints that allocation to (checked by `ARLVerify`). It adds no on-chain
/// privilege: it only reads public state.
library ARLStakingVerify {
    error StakingVerifyFailed(string check);
    error StakingVerifyAddressMismatch(string check, address expected, address actual);
    error StakingVerifyUintMismatch(string check, uint256 expected, uint256 actual);

    /// @param p The deployment plan the ARL system was deployed from.
    /// @param token The deployed ARL token.
    /// @param staking The deployed staking contract.
    /// @param fresh True right after deployment: nothing staked, funded or returned yet.
    function verify(Plan memory p, address token, ARLStakingRewards staking, bool fresh)
        internal
        view
    {
        if (p.chainId != block.chainid) {
            revert StakingVerifyUintMismatch("chain id", p.chainId, block.chainid);
        }
        if (address(staking).code.length == 0) revert StakingVerifyFailed("staking has code");
        if (token.code.length == 0) revert StakingVerifyFailed("token has code");

        _addr("staking token is ARL", token, address(staking.stakingToken()));
        _addr("reward token is ARL", token, address(staking.rewardsToken()));

        address holder = p.recipients.communityStaking;
        if (holder == address(0)) revert StakingVerifyFailed("community staking holder set");
        _addr(
            "distributor is the Community & Staking holder", holder, staking.rewardsDistribution()
        );
        if (staking.rewardsDuration() == 0) revert StakingVerifyFailed("reward duration set");

        if (fresh) {
            _eq("nothing staked", 0, staking.totalSupply());
            _eq("nothing funded", 0, staking.rewardsFunded());
            _eq("nothing returned", 0, staking.rewardsReturned());
            _eq("no active period", 0, staking.periodFinish());
        }
    }

    function _addr(string memory check, address expected, address actual) private pure {
        if (expected != actual) revert StakingVerifyAddressMismatch(check, expected, actual);
    }

    function _eq(string memory check, uint256 expected, uint256 actual) private pure {
        if (expected != actual) revert StakingVerifyUintMismatch(check, expected, actual);
    }
}
