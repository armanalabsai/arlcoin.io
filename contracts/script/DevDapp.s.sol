// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLToken} from "../src/ARLToken.sol";
import {ARLVestingWallet} from "../src/ARLVestingWallet.sol";
import {ARLStakingRewards} from "../src/ARLStakingRewards.sol";

/// @title Local development fixture for the ARL web app (apps/dapp)
/// @notice Deploys ARL, one vesting wallet and the staking contract on a local Anvil chain so the
/// app can be run and tested end to end. It is NOT the deployment path: the real deployment is
/// `DeployARL` with a reviewed plan. This script refuses every chain except local Anvil (31337).
///
/// Every value here is a development placeholder, not an economic parameter: holders are Anvil's
/// publicly known development accounts, the vesting schedule is shortened so that it can be seen
/// moving, and the staking reward amount and period are arbitrary.
///
/// Run (Anvil unlocks its development accounts; no private key is used):
///   forge script script/DevDapp.s.sol:DevDapp --rpc-url http://127.0.0.1:8545 \
///     --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
contract DevDapp is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31_337;

    /// @dev Anvil development account 0: deploys, holds every allocation except Public Launch and
    /// Investors, and funds staking rewards (the Community & Staking holder).
    address internal constant DEV_OPERATOR = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    /// @dev Anvil development account 1: the app's demo user. Holds Public Launch and is the
    /// beneficiary of the vesting wallet.
    address internal constant DEV_USER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    uint64 internal constant VESTING_CLIFF = 5 minutes;
    uint64 internal constant VESTING_LENGTH = 30 days;
    uint256 internal constant REWARDS_DURATION = 30 days;
    uint256 internal constant REWARD_AMOUNT = 30_000 ether;

    string internal constant OUTPUT = "deploy/deployments/31337-dapp.json";

    error DevDappLocalOnly(uint256 chainId);
    error DevDappApproveFailed();

    function run()
        external
        returns (ARLToken token, ARLVestingWallet vesting, ARLStakingRewards staking)
    {
        if (block.chainid != LOCAL_CHAIN_ID) revert DevDappLocalOnly(block.chainid);

        uint64 start = uint64(block.timestamp);
        vm.startBroadcast(DEV_OPERATOR);

        vesting =
            new ARLVestingWallet(DEV_USER, start, start + VESTING_CLIFF, start + VESTING_LENGTH);
        token = new ARLToken(
            ARLToken.Recipients({
                publicLaunch: DEV_USER,
                communityStaking: DEV_OPERATOR,
                ecosystemGrowth: DEV_OPERATOR,
                strategicPartnerships: DEV_OPERATOR,
                liquidity: DEV_OPERATOR,
                founder: DEV_OPERATOR,
                investors: address(vesting),
                treasury: DEV_OPERATOR,
                team: DEV_OPERATOR,
                earlyUsers: DEV_OPERATOR,
                grantsBugBounty: DEV_OPERATOR
            })
        );
        staking = new ARLStakingRewards(
            IERC20(address(token)), IERC20(address(token)), DEV_OPERATOR, REWARDS_DURATION
        );
        if (!token.approve(address(staking), REWARD_AMOUNT)) revert DevDappApproveFailed();
        staking.notifyRewardAmount(REWARD_AMOUNT);
        vm.stopBroadcast();

        vm.writeJson(
            string.concat(
                '{"chainId":',
                vm.toString(block.chainid),
                ',"token":"',
                vm.toString(address(token)),
                '","vesting":"',
                vm.toString(address(vesting)),
                '","staking":"',
                vm.toString(address(staking)),
                '","user":"',
                vm.toString(DEV_USER),
                '"}'
            ),
            OUTPUT
        );
    }
}
