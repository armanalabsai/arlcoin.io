// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Vm} from "forge-std/Vm.sol";

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
        uint256 sum = ARLAllocation.PUBLIC_LAUNCH + ARLAllocation.COMMUNITY_STAKING
            + ARLAllocation.ECOSYSTEM_GROWTH + ARLAllocation.STRATEGIC_PARTNERSHIPS
            + ARLAllocation.LIQUIDITY + ARLAllocation.FOUNDER + ARLAllocation.INVESTORS
            + ARLAllocation.TREASURY + ARLAllocation.TEAM + ARLAllocation.EARLY_USERS
            + ARLAllocation.GRANTS_BUG_BOUNTY;
        assertEq(sum, ARLAllocation.MAX_SUPPLY);
        assertEq(sum, 21_000_000e18);
    }

    function test_AllocationAmounts() public pure {
        assertEq(ARLAllocation.PUBLIC_LAUNCH, 5_000_000e18);
        assertEq(ARLAllocation.COMMUNITY_STAKING, 3_000_000e18);
        assertEq(ARLAllocation.ECOSYSTEM_GROWTH, 2_000_000e18);
        assertEq(ARLAllocation.STRATEGIC_PARTNERSHIPS, 2_000_000e18);
        assertEq(ARLAllocation.LIQUIDITY, 2_000_000e18);
        assertEq(ARLAllocation.FOUNDER, 2_100_000e18);
        assertEq(ARLAllocation.INVESTORS, 1_500_000e18);
        assertEq(ARLAllocation.TREASURY, 1_000_000e18);
        assertEq(ARLAllocation.TEAM, 900_000e18);
        assertEq(ARLAllocation.EARLY_USERS, 1_100_000e18);
        assertEq(ARLAllocation.GRANTS_BUG_BOUNTY, 400_000e18);
    }

    function test_EachHolderReceivesItsAllocation() public view {
        assertEq(token.balanceOf(launchSafe), ARLAllocation.PUBLIC_LAUNCH);
        assertEq(token.balanceOf(communitySafe), ARLAllocation.COMMUNITY_STAKING);
        assertEq(token.balanceOf(growthSafe), ARLAllocation.ECOSYSTEM_GROWTH);
        assertEq(
            token.balanceOf(address(partnershipsVesting)), ARLAllocation.STRATEGIC_PARTNERSHIPS
        );
        assertEq(token.balanceOf(liquiditySafe), ARLAllocation.LIQUIDITY);
        assertEq(token.balanceOf(founderSafe), ARLAllocation.FOUNDER);
        assertEq(token.balanceOf(address(investorsVesting)), ARLAllocation.INVESTORS);
        assertEq(token.balanceOf(address(treasury)), ARLAllocation.TREASURY);
        assertEq(token.balanceOf(teamPoolSafe), ARLAllocation.TEAM);
        assertEq(token.balanceOf(earlyUsersSafe), ARLAllocation.EARLY_USERS);
        assertEq(token.balanceOf(grantsSafe), ARLAllocation.GRANTS_BUG_BOUNTY);
    }

    // ---------------------------------------------------------------- founder

    /// @dev The whole Founder allocation is minted to the Founder Safe, unlocked at genesis.
    function test_FounderGenesisBalance() public view {
        assertEq(ARLAllocation.FOUNDER, 2_100_000e18);
        assertEq(token.balanceOf(founderSafe), 2_100_000e18);
        assertEq(token.totalSupply(), 21_000_000e18);
    }

    /// @dev Genesis is exactly eleven mints (Transfer from address(0)), all emitted by the
    /// constructor, to eleven distinct holders, adding up to the maximum supply.
    function test_ExactlyElevenGenesisMintsInConstructor() public {
        vm.recordLogs();
        ARLToken t = new ARLToken(_recipients());
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferTopic = keccak256("Transfer(address,address,uint256)");
        address[] memory to = new address[](logs.length);
        uint256 mints;
        uint256 minted;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(t) || logs[i].topics[0] != transferTopic) continue;
            assertEq(address(uint160(uint256(logs[i].topics[1]))), address(0));
            address recipient = address(uint160(uint256(logs[i].topics[2])));
            for (uint256 j = 0; j < mints; j++) {
                assertTrue(to[j] != recipient);
            }
            to[mints++] = recipient;
            minted += abi.decode(logs[i].data, (uint256));
        }
        assertEq(mints, 11);
        assertEq(minted, ARLAllocation.MAX_SUPPLY);
        assertEq(t.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    /// @dev The Founder Safe is an ordinary holder: it can move the whole 2,100,000 ARL at
    /// genesis, with no cliff, vesting, timelock or restriction.
    function test_FounderTransfersEntireAllocationAtGenesis() public {
        ARLToken t = new ARLToken(_recipients());
        vm.prank(founderSafe);
        assertTrue(t.transfer(address(0xBEEF), ARLAllocation.FOUNDER));
        assertEq(t.balanceOf(address(0xBEEF)), ARLAllocation.FOUNDER);
        assertEq(t.balanceOf(founderSafe), 0);
        assertEq(t.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    /// @dev transferFrom follows normal ERC-20 allowance rules for the Founder, as for anyone.
    function test_FounderTransferFromFollowsAllowance() public {
        address spender = makeAddr("exchange");
        vm.prank(spender);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 1)
        );
        token.transferFrom(founderSafe, spender, 1);

        vm.prank(founderSafe);
        token.approve(spender, 500_000e18);
        vm.prank(spender);
        assertTrue(token.transferFrom(founderSafe, spender, 500_000e18));
        assertEq(token.balanceOf(spender), 500_000e18);
        assertEq(token.allowance(founderSafe, spender), 0);
        assertEq(token.balanceOf(founderSafe), 1_600_000e18);
    }

    /// @dev No Founder-specific behavior: a Founder transfer behaves exactly like the same
    /// transfer from any other holder with enough balance.
    function testFuzz_FounderTransfersBehaveLikeAnyHolder(address to, uint256 amount) public {
        vm.assume(to != address(0) && to != founderSafe && to != communitySafe);
        amount = bound(amount, 0, ARLAllocation.FOUNDER);
        uint256 toBefore = token.balanceOf(to);

        vm.prank(founderSafe);
        assertTrue(token.transfer(to, amount));
        assertEq(token.balanceOf(to), toBefore + amount);

        vm.prank(communitySafe);
        assertTrue(token.transfer(to, amount));
        assertEq(token.balanceOf(to), toBefore + 2 * amount);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    // ---------------------------------------------------------------- recipients

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
        for (uint256 i = 0; i < 11; i++) {
            ARLToken.Recipients memory r = _recipients();
            _zeroField(r, i);
            vm.expectRevert(
                abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0))
            );
            new ARLToken(r);
        }
    }

    // ---------------------------------------------------------------- no admin surface

    /// @dev The token exposes exactly ERC-20, ERC20Burnable, EIP-2612 permit and MAX_SUPPLY.
    /// Any selector that could be an admin or mint function must not exist.
    function test_NoAdminOrMintFunctions() public {
        address me = address(this);
        bytes[] memory calls = new bytes[](9);
        calls[0] = abi.encodeWithSignature("owner()");
        calls[1] = abi.encodeWithSignature("mint(address,uint256)", me, 1e18);
        calls[2] = abi.encodeWithSignature("mint(uint256)", 1e18);
        calls[3] = abi.encodeWithSignature("pause()");
        calls[4] = abi.encodeWithSignature("transferOwnership(address)", me);
        calls[5] = abi.encodeWithSignature("grantRole(bytes32,address)", bytes32(0), me);
        calls[6] = abi.encodeWithSignature("initialize()");
        calls[7] = abi.encodeWithSignature("upgradeToAndCall(address,bytes)", me, "");
        calls[8] = abi.encodeWithSignature("issue(address,uint256)", me, 1e18);
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok,) = address(token).call(calls[i]);
            assertFalse(ok);
        }
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    // ---------------------------------------------------------------- burn

    function test_BurnReducesSupply() public {
        vm.prank(communitySafe);
        token.burn(1_000e18);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY - 1_000e18);
        assertEq(token.balanceOf(communitySafe), ARLAllocation.COMMUNITY_STAKING - 1_000e18);
    }

    function test_BurnFromSpendsAllowance() public {
        vm.prank(communitySafe);
        token.approve(address(this), 5e18);
        token.burnFrom(communitySafe, 2e18);
        assertEq(token.allowance(communitySafe, address(this)), 3e18);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY - 2e18);
    }

    function test_RevertWhen_BurnFromWithoutAllowance() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(0xBAD), 0, 1
            )
        );
        token.burnFrom(communitySafe, 1);
    }

    function test_RevertWhen_BurnExceedsBalance() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, address(0xBEEF), 0, 1
            )
        );
        token.burn(1);
    }

    /// @dev Burning never increases supply and always removes exactly the amount burned.
    function testFuzz_BurnOnlyDecreasesSupply(uint256 amount) public {
        amount = bound(amount, 0, ARLAllocation.COMMUNITY_STAKING);
        vm.prank(communitySafe);
        token.burn(amount);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY - amount);
        assertLe(token.totalSupply(), token.MAX_SUPPLY());
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
        if (i == 0) r.publicLaunch = address(0);
        else if (i == 1) r.communityStaking = address(0);
        else if (i == 2) r.ecosystemGrowth = address(0);
        else if (i == 3) r.strategicPartnerships = address(0);
        else if (i == 4) r.liquidity = address(0);
        else if (i == 5) r.founder = address(0);
        else if (i == 6) r.investors = address(0);
        else if (i == 7) r.treasury = address(0);
        else if (i == 8) r.team = address(0);
        else if (i == 9) r.earlyUsers = address(0);
        else r.grantsBugBounty = address(0);
    }
}
