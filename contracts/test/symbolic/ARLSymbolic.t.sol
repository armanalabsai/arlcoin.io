// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLMerkleDistributor} from "../../src/ARLMerkleDistributor.sol";
import {ARLTimelock} from "../../src/ARLTimelock.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {ARLVestingWallet} from "../../src/ARLVestingWallet.sol";

/// @dev Symbolic checks, run with Halmos (`halmos --match-contract ARLSymbolic`). Every `check_`
/// argument is symbolic: a passing check holds for all values, not for sampled ones. Forge does
/// not run `check_` functions. Addresses are fixed labels; none is a real wallet.
contract ARLSymbolic is Test {
    uint64 internal constant CLIFF_START = 1_798_761_600; // 2027-01-01
    uint64 internal constant CLIFF_END = 1_830_297_600; // 2028-01-01
    uint64 internal constant VESTING_END = 1_924_992_000; // 2031-01-01
    uint64 internal constant CLAIM_END = 1_830_297_600;

    address internal constant FOUNDER = address(0xF0);
    address internal constant LAUNCH = address(0xA1);
    address internal constant LIQUIDITY = address(0xA2);
    address internal constant BENEFICIARY = address(0xB1);
    address internal constant TREASURY_SAFE = address(0xC1);
    address internal constant GUARDIAN = address(0xC2);
    address internal constant CLAIMANT_A = address(0xD1);
    address internal constant CLAIMANT_B = address(0xD2);

    ARLToken internal token;
    ARLVestingWallet internal vesting;
    ARLTimelock internal timelock;
    ARLMerkleDistributor internal distributor;
    bytes32 internal leafA;
    bytes32 internal leafB;
    uint256 internal constant AMOUNT_A = 100e18;
    uint256 internal constant AMOUNT_B = 250e18;

    function setUp() public {
        vesting = new ARLVestingWallet(BENEFICIARY, CLIFF_START, CLIFF_END, VESTING_END);
        address[] memory safe = new address[](1);
        safe[0] = TREASURY_SAFE;
        timelock = new ARLTimelock(48 hours, safe, safe, GUARDIAN);
        token = new ARLToken(
            ARLToken.Recipients({
                publicLaunch: LAUNCH,
                communityStaking: address(0xA3),
                ecosystemGrowth: address(0xA4),
                strategicPartnerships: address(0xA5),
                liquidity: LIQUIDITY,
                founder: FOUNDER,
                investors: address(vesting),
                treasury: address(timelock),
                team: address(0xA6),
                earlyUsers: address(0xA7),
                grantsBugBounty: address(0xA8)
            })
        );

        leafA = _leaf(0, CLAIMANT_A, AMOUNT_A);
        leafB = _leaf(1, CLAIMANT_B, AMOUNT_B);
        distributor = new ARLMerkleDistributor(
            IERC20(address(token)), Hashes.commutativeKeccak256(leafA, leafB), CLAIM_END, LAUNCH
        );
        vm.prank(LAUNCH);
        token.transfer(address(distributor), AMOUNT_A + AMOUNT_B);
    }

    function _leaf(uint256 index, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
    }

    // ------------------------------------------------------------------ token

    /// @dev Any transfer between any two holders, of any amount, leaves the supply at
    /// 21,000,000 ARL and moves exactly `amount`.
    function check_TransferConservesSupplyAndBalances(address to, uint256 amount) public {
        vm.assume(to != FOUNDER);
        uint256 fromBefore = token.balanceOf(FOUNDER);
        uint256 toBefore = token.balanceOf(to);
        vm.prank(FOUNDER);
        (bool ok,) = address(token).call(abi.encodeCall(token.transfer, (to, amount)));
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
        if (ok) {
            assertEq(token.balanceOf(FOUNDER), fromBefore - amount);
            assertEq(token.balanceOf(to), toBefore + amount);
        } else {
            assertEq(token.balanceOf(FOUNDER), fromBefore);
            assertEq(token.balanceOf(to), toBefore);
        }
    }

    /// @dev `transferFrom` never moves more than the allowance the owner granted.
    function check_TransferFromNeverExceedsAllowance(
        address spender,
        address to,
        uint256 allowed,
        uint256 amount
    ) public {
        vm.assume(spender != address(0) && to != FOUNDER);
        vm.prank(FOUNDER);
        token.approve(spender, allowed);
        vm.prank(spender);
        (bool ok,) = address(token).call(abi.encodeCall(token.transferFrom, (FOUNDER, to, amount)));
        if (ok) assertLe(amount, allowed);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    /// @dev No call from any caller with any calldata changes the total supply.
    function check_NoCallChangesSupply(address caller, bytes calldata data) public {
        vm.prank(caller);
        (bool ok,) = address(token).call(data);
        ok; // success or failure, the supply must not move
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    // ------------------------------------------------------------------ vesting

    /// @dev Nothing vests before the cliff ends, at any earlier time.
    function check_NothingVestsBeforeCliffEnd(uint64 t) public view {
        vm.assume(t < CLIFF_END);
        assertEq(vesting.vestedAmount(address(token), t), 0);
    }

    /// @dev At any time, the vested amount never exceeds the allocation held by the wallet.
    function check_VestedNeverExceedsAllocation(uint64 t) public view {
        assertLe(vesting.vestedAmount(address(token), t), ARLAllocation.INVESTORS);
    }

    /// @dev Everything is vested from the vesting end onwards.
    function check_EverythingVestedAtEnd(uint64 t) public view {
        vm.assume(t >= VESTING_END);
        assertEq(vesting.vestedAmount(address(token), t), ARLAllocation.INVESTORS);
    }

    /// @dev The vested amount never decreases. Nonlinear (a product and a division of symbolic
    /// timestamps), so the solver may time out; the same property is covered by fuzzing and the
    /// `VestingNeverOverReleases` invariant.
    function check_VestedIsMonotonic(uint64 t1, uint64 t2) public view {
        vm.assume(t1 <= t2);
        assertLe(vesting.vestedAmount(address(token), t1), vesting.vestedAmount(address(token), t2));
    }

    /// @dev The beneficiary can never be changed, by anyone.
    function check_BeneficiaryIsImmutable(address caller, address newOwner) public {
        vm.prank(caller);
        (bool ok,) = address(vesting).call(abi.encodeCall(vesting.transferOwnership, (newOwner)));
        assertFalse(ok);
        assertEq(vesting.owner(), BENEFICIARY);
    }

    // ------------------------------------------------------------------ timelock

    /// @dev Even through the timelock itself, the delay can never go below 48 hours.
    function check_DelayFloorHolds(uint256 newDelay) public {
        vm.prank(address(timelock));
        (bool ok,) = address(timelock).call(abi.encodeCall(timelock.updateDelay, (newDelay)));
        if (ok) assertGe(newDelay, 48 hours);
        assertGe(timelock.getMinDelay(), 48 hours);
    }

    // ------------------------------------------------------------------ distributor

    /// @dev A claim with any index, account, amount and one-node proof succeeds only for a
    /// listed entry, pays exactly that amount to that account, and only once.
    function check_ClaimPaysOnlyListedEntriesOnce(
        uint256 index,
        address account,
        uint256 amount,
        bytes32 node,
        address caller
    ) public {
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = node;
        uint256 before = token.balanceOf(account);
        uint256 held = token.balanceOf(address(distributor));
        vm.prank(caller);
        (bool ok,) = address(distributor)
            .call(abi.encodeCall(distributor.claim, (index, account, amount, proof)));
        if (!ok) return;
        bool listedA = index == 0 && account == CLAIMANT_A && amount == AMOUNT_A;
        bool listedB = index == 1 && account == CLAIMANT_B && amount == AMOUNT_B;
        assertTrue(listedA || listedB);
        assertEq(token.balanceOf(account), before + amount);
        assertEq(token.balanceOf(address(distributor)), held - amount);
        vm.prank(caller);
        (bool again,) = address(distributor)
            .call(abi.encodeCall(distributor.claim, (index, account, amount, proof)));
        assertFalse(again);
    }

    /// @dev Before the claim window closes nobody can sweep; after it, the whole balance goes
    /// to the Public Launch Safe and nowhere else.
    function check_SweepOnlyToReturnAddressAfterEnd(uint64 t, address caller) public {
        vm.warp(t);
        uint256 held = token.balanceOf(address(distributor));
        uint256 launchBefore = token.balanceOf(LAUNCH);
        vm.prank(caller);
        (bool ok,) = address(distributor).call(abi.encodeCall(distributor.sweep, ()));
        if (t < CLAIM_END) {
            assertFalse(ok);
        } else {
            assertTrue(ok);
            assertEq(token.balanceOf(address(distributor)), 0);
            assertEq(token.balanceOf(LAUNCH), launchBefore + held);
        }
    }
}
