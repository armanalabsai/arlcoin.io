// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLToken} from "../../src/ARLToken.sol";
import {ARLVestingWallet} from "../../src/ARLVestingWallet.sol";
import {ARLStakingRewards} from "../../src/ARLStakingRewards.sol";
import {ARLJobs} from "../../src/ARLJobs.sol";
import {DevDapp} from "../../script/DevDapp.s.sol";

/// @dev The web app's local fixture: local Anvil only, and the state the app expects.
contract DevDappTest is Test {
    address internal constant OPERATOR = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address internal constant USER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function test_refusesEveryChainButLocalAnvil() public {
        DevDapp script = new DevDapp();
        uint256[4] memory chains = [uint256(1), 8453, 84_532, 11_155_111];
        for (uint256 i; i < chains.length; ++i) {
            vm.chainId(chains[i]);
            vm.expectRevert(abi.encodeWithSelector(DevDapp.DevDappLocalOnly.selector, chains[i]));
            script.run();
        }
    }

    function test_deploysTheAppFixture() public {
        vm.chainId(31_337);
        vm.warp(1_800_000_000);
        (ARLToken token, ARLVestingWallet vesting, ARLStakingRewards staking, ARLJobs jobs) =
            new DevDapp().run();

        assertEq(token.totalSupply(), 21_000_000 ether);
        assertEq(token.balanceOf(USER), 5_000_000 ether, "public launch to the demo user");
        assertEq(token.balanceOf(address(vesting)), 1_500_000 ether, "investors to vesting");
        assertEq(vesting.owner(), USER);
        assertEq(vesting.cliffEnd(), 1_800_000_000 + 5 minutes);
        assertEq(vesting.vestingEnd(), 1_800_000_000 + 30 days);
        assertEq(vesting.releasable(address(token)), 0);

        assertEq(address(staking.stakingToken()), address(token));
        assertEq(address(staking.rewardsToken()), address(token));
        assertEq(staking.rewardsDistribution(), OPERATOR);
        assertEq(staking.rewardsFunded(), 30_000 ether);
        assertEq(token.balanceOf(address(staking)), 30_000 ether);
        assertEq(staking.periodFinish(), 1_800_000_000 + 30 days);
        assertGt(staking.rewardRate(), 0);

        assertEq(address(jobs.paymentToken()), address(token));
        assertEq(jobs.jobCounter(), 0);
    }
}
