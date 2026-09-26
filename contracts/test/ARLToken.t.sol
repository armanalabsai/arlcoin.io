// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLToken} from "../src/ARLToken.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

contract ARLTokenTest is ARLTestBase {
    // ---------------------------------------------------------------- metadata and supply

    function test_Metadata() public view {
        assertEq(token.name(), "ARL");
        assertEq(token.symbol(), "ARL");
        assertEq(token.decimals(), 18);
    }

    function test_MaxSupplyIs21Million() public view {
        assertEq(token.MAX_SUPPLY(), 21_000_000e18);
        assertEq(token.totalSupply(), 21_000_000e18);
    }

    function test_AllocationConstantsSumToMaxSupply() public pure {
        uint256 sum = ARLAllocation.FOUNDER + ARLAllocation.ECOSYSTEM_RESERVE
            + ARLAllocation.TREASURY + ARLAllocation.COMMUNITY_STAKING + ARLAllocation.LIQUIDITY
            + ARLAllocation.STRATEGIC_PARTNERSHIPS + ARLAllocation.PUBLIC_LAUNCH
            + ARLAllocation.GRANTS_BUG_BOUNTY + ARLAllocation.TEAM
            + ARLAllocation.EARLY_USER_REWARDS;
        assertEq(sum, ARLAllocation.MAX_SUPPLY);
    }

    function test_AllocationAmounts() public pure {
        assertEq(ARLAllocation.FOUNDER, 2_100_000e18);
        assertEq(ARLAllocation.ECOSYSTEM_RESERVE, 7_000_000e18);
        assertEq(ARLAllocation.TREASURY, 3_000_000e18);
        assertEq(ARLAllocation.COMMUNITY_STAKING, 3_000_000e18);
        assertEq(ARLAllocation.LIQUIDITY, 2_000_000e18);
        assertEq(ARLAllocation.STRATEGIC_PARTNERSHIPS, 1_500_000e18);
        assertEq(ARLAllocation.PUBLIC_LAUNCH, 1_000_000e18);
        assertEq(ARLAllocation.GRANTS_BUG_BOUNTY, 400_000e18);
        assertEq(ARLAllocation.TEAM, 500_000e18);
        assertEq(ARLAllocation.EARLY_USER_REWARDS, 500_000e18);
    }

    function test_EachHolderReceivesItsAllocation() public view {
        assertEq(token.balanceOf(address(founderVesting)), ARLAllocation.FOUNDER);
        assertEq(token.balanceOf(address(reserveVesting)), ARLAllocation.ECOSYSTEM_RESERVE);
        assertEq(token.balanceOf(address(treasury)), ARLAllocation.TREASURY);
        assertEq(token.balanceOf(communitySafe), ARLAllocation.COMMUNITY_STAKING);
        assertEq(token.balanceOf(liquiditySafe), ARLAllocation.LIQUIDITY);
        assertEq(token.balanceOf(partnershipsSafe), ARLAllocation.STRATEGIC_PARTNERSHIPS);
        assertEq(token.balanceOf(launchSafe), ARLAllocation.PUBLIC_LAUNCH);
        assertEq(token.balanceOf(grantsSafe), ARLAllocation.GRANTS_BUG_BOUNTY);
        assertEq(token.balanceOf(teamPoolSafe), ARLAllocation.TEAM);
        assertEq(token.balanceOf(rewardsSafe), ARLAllocation.EARLY_USER_REWARDS);
    }

    function test_OneAddressMayHoldSeveralAllocations() public {
        ARLToken.Recipients memory r = _recipients();
        r.liquidity = communitySafe;
        ARLToken t = new ARLToken(r);
        assertEq(
            t.balanceOf(communitySafe), ARLAllocation.COMMUNITY_STAKING + ARLAllocation.LIQUIDITY
        );
        assertEq(t.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    function test_RevertWhen_AnyRecipientIsZero() public {
        for (uint256 i = 0; i < 10; i++) {
            ARLToken.Recipients memory r = _recipients();
            _zeroField(r, i);
            vm.expectRevert(
                abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0))
            );
            new ARLToken(r);
        }
    }

    // ---------------------------------------------------------------- no admin surface

    /// @dev The token exposes exactly the ERC-20 interface plus MAX_SUPPLY. Any selector that
    /// could be an admin or mint function must not exist.
    function test_NoAdminOrMintFunctions() public {
        address me = address(this);
        bytes[] memory calls = new bytes[](12);
        calls[0] = abi.encodeWithSignature("owner()");
        calls[1] = abi.encodeWithSignature("mint(address,uint256)", me, 1e18);
        calls[2] = abi.encodeWithSignature("mint(uint256)", 1e18);
        calls[3] = abi.encodeWithSignature("burn(uint256)", 0);
        calls[4] = abi.encodeWithSignature("burnFrom(address,uint256)", communitySafe, 0);
        calls[5] = abi.encodeWithSignature("pause()");
        calls[6] = abi.encodeWithSignature("transferOwnership(address)", me);
        calls[7] = abi.encodeWithSignature("grantRole(bytes32,address)", bytes32(0), me);
        calls[8] = abi.encodeWithSignature("initialize()");
        calls[9] = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", me, "");
        calls[10] = abi.encodeWithSignature("issue(address,uint256)", me, 1e18);
        calls[11] = abi.encodeWithSignature(
            "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
            me,
            me,
            1,
            type(uint256).max,
            uint8(27),
            bytes32(0),
            bytes32(0)
        );
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok,) = address(token).call(calls[i]);
            assertFalse(ok);
        }
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    function test_RejectsEther() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(token).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ---------------------------------------------------------------- ERC-20 behavior

    function test_Transfer() public {
        vm.prank(communitySafe);
        assertTrue(token.transfer(address(0xBEEF), 1e18));
        assertEq(token.balanceOf(address(0xBEEF)), 1e18);
        assertEq(token.balanceOf(communitySafe), ARLAllocation.COMMUNITY_STAKING - 1e18);
    }

    function test_RevertWhen_TransferExceedsBalance() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, address(0xBEEF), 0, 1
            )
        );
        token.transfer(communitySafe, 1);
    }

    function test_RevertWhen_TransferToZero() public {
        vm.prank(communitySafe);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0))
        );
        token.transfer(address(0), 1);
    }

    function test_RevertWhen_TransferFromWithoutAllowance() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(0xBAD), 0, 1
            )
        );
        token.transferFrom(communitySafe, address(0xBAD), 1);
    }

    function test_TransferFromWithAllowance() public {
        vm.prank(communitySafe);
        token.approve(address(this), 5e18);
        assertTrue(token.transferFrom(communitySafe, address(0xBEEF), 2e18));
        assertEq(token.allowance(communitySafe, address(this)), 3e18);
    }

    function test_UnlimitedAllowanceIsNotDecreased() public {
        vm.prank(communitySafe);
        token.approve(address(this), type(uint256).max);
        token.transferFrom(communitySafe, address(0xBEEF), 2e18);
        assertEq(token.allowance(communitySafe, address(this)), type(uint256).max);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_TransferConservesSupply(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 0, ARLAllocation.COMMUNITY_STAKING);
        uint256 before = token.balanceOf(communitySafe) + token.balanceOf(to);
        if (to == communitySafe) before = token.balanceOf(communitySafe);

        vm.prank(communitySafe);
        token.transfer(to, amount);

        uint256 afterSum = token.balanceOf(communitySafe) + token.balanceOf(to);
        if (to == communitySafe) afterSum = token.balanceOf(communitySafe);
        assertEq(afterSum, before);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    function testFuzz_RevertWhen_TransferMoreThanBalance(uint256 extra) public {
        extra = bound(extra, 1, type(uint256).max - ARLAllocation.COMMUNITY_STAKING);
        vm.prank(communitySafe);
        vm.expectRevert();
        token.transfer(address(0xBEEF), ARLAllocation.COMMUNITY_STAKING + extra);
    }

    function testFuzz_ApproveAndTransferFrom(uint256 allowance, uint256 spend) public {
        allowance = bound(allowance, 0, ARLAllocation.LIQUIDITY);
        spend = bound(spend, 0, allowance);
        vm.prank(liquiditySafe);
        token.approve(address(this), allowance);
        token.transferFrom(liquiditySafe, address(0xBEEF), spend);
        assertEq(token.allowance(liquiditySafe, address(this)), allowance - spend);
        assertEq(token.balanceOf(address(0xBEEF)), spend);
    }

    // ---------------------------------------------------------------- helpers

    function _zeroField(ARLToken.Recipients memory r, uint256 i) private pure {
        if (i == 0) r.founder = address(0);
        else if (i == 1) r.ecosystemReserve = address(0);
        else if (i == 2) r.treasury = address(0);
        else if (i == 3) r.communityStaking = address(0);
        else if (i == 4) r.liquidity = address(0);
        else if (i == 5) r.strategicPartnerships = address(0);
        else if (i == 6) r.publicLaunch = address(0);
        else if (i == 7) r.grantsBugBounty = address(0);
        else if (i == 8) r.team = address(0);
        else r.earlyUserRewards = address(0);
    }
}
