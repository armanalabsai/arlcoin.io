// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";

import {ARLMerkleDistributor} from "../src/ARLMerkleDistributor.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev The fixture list and its proofs are produced by `packages/deploy` with
/// the OpenZeppelin merkle-tree library (`distribution-cli.ts`); a test there fails if the committed
/// output drifts from the input. Using it here proves the contract accepts exactly the proofs
/// the tooling publishes. Every account in the fixture is a placeholder nobody holds keys for.
contract ARLMerkleDistributorTest is ARLTestBase {
    uint64 internal constant CLAIM_END = LAUNCH + 90 days;

    string internal input;
    string internal output;
    address[] internal accounts;
    bytes32 internal root;
    uint256 internal total;
    ARLMerkleDistributor internal distributor;

    function setUp() public override {
        super.setUp();
        input = vm.readFile("test/fixtures/distribution-input.json");
        output = vm.readFile("test/fixtures/distribution.json");
        uint256 count = vm.parseJsonUint(output, ".count");
        for (uint256 i = 0; i < count; i++) {
            accounts.push(
                vm.parseJsonAddress(input, string.concat(".claims[", vm.toString(i), "].account"))
            );
        }
        root = vm.parseJsonBytes32(output, ".merkleRoot");
        total = vm.parseJsonUint(output, ".total");
        distributor = new ARLMerkleDistributor(IERC20(address(token)), root, CLAIM_END, launchSafe);
        vm.prank(launchSafe);
        token.transfer(address(distributor), total);
    }

    function _entry(address account)
        internal
        view
        returns (uint256 index, uint256 amount, bytes32[] memory proof)
    {
        string memory key = string.concat(".claims.", vm.toString(account));
        index = vm.parseJsonUint(output, string.concat(key, ".index"));
        amount = vm.parseJsonUint(output, string.concat(key, ".amount"));
        proof = vm.parseJsonBytes32Array(output, string.concat(key, ".proof"));
    }

    // ------------------------------------------------------------------ claims

    function test_EveryPublishedEntryClaimsExactlyOnce() public {
        uint256 paid = 0;
        for (uint256 i = 0; i < accounts.length; i++) {
            (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[i]);
            assertFalse(distributor.isClaimed(index));
            vm.expectEmit(address(distributor));
            emit ARLMerkleDistributor.Claimed(index, accounts[i], amount);
            distributor.claim(index, accounts[i], amount, proof);
            assertTrue(distributor.isClaimed(index));
            assertEq(token.balanceOf(accounts[i]), amount);
            paid += amount;

            vm.expectRevert(
                abi.encodeWithSelector(
                    ARLMerkleDistributor.DistributorAlreadyClaimed.selector, index
                )
            );
            distributor.claim(index, accounts[i], amount, proof);
        }
        assertEq(paid, total);
        assertEq(token.balanceOf(address(distributor)), 0);
    }

    /// @dev Anyone may submit a claim, but the tokens always go to the listed account.
    function test_ThirdPartySubmissionPaysTheListedAccount() public {
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[1]);
        address relayer = makeAddr("relayer");
        vm.prank(relayer);
        distributor.claim(index, accounts[1], amount, proof);
        assertEq(token.balanceOf(accounts[1]), amount);
        assertEq(token.balanceOf(relayer), 0);
    }

    function test_RevertWhen_AmountChanged() public {
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[0]);
        vm.expectRevert(ARLMerkleDistributor.DistributorInvalidProof.selector);
        distributor.claim(index, accounts[0], amount + 1, proof);
    }

    function test_RevertWhen_AccountChanged() public {
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[0]);
        vm.expectRevert(ARLMerkleDistributor.DistributorInvalidProof.selector);
        distributor.claim(index, makeAddr("thief"), amount, proof);
    }

    function test_RevertWhen_IndexChanged() public {
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[0]);
        vm.expectRevert(ARLMerkleDistributor.DistributorInvalidProof.selector);
        distributor.claim(index + 1, accounts[0], amount, proof);
    }

    function test_RevertWhen_ProofOfAnotherEntry() public {
        (uint256 index, uint256 amount,) = _entry(accounts[0]);
        (,, bytes32[] memory other) = _entry(accounts[1]);
        vm.expectRevert(ARLMerkleDistributor.DistributorInvalidProof.selector);
        distributor.claim(index, accounts[0], amount, other);
    }

    /// @dev An entry that is not on the list is rejected; a zero amount is rejected before the
    /// proof is checked.
    function test_RevertWhen_UnlistedEntry() public {
        (,, bytes32[] memory proof) = _entry(accounts[0]);
        vm.expectRevert(ARLMerkleDistributor.DistributorInvalidProof.selector);
        distributor.claim(0, makeAddr("unlisted"), 1, proof);
        vm.expectRevert(ARLMerkleDistributor.DistributorZeroAmount.selector);
        distributor.claim(0, accounts[0], 0, proof);
    }

    function test_RevertWhen_ClaimWindowClosed() public {
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[0]);
        vm.warp(CLAIM_END);
        vm.expectRevert(ARLMerkleDistributor.DistributorClaimWindowClosed.selector);
        distributor.claim(index, accounts[0], amount, proof);
    }

    function test_ClaimJustBeforeEnd() public {
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[0]);
        vm.warp(CLAIM_END - 1);
        distributor.claim(index, accounts[0], amount, proof);
        assertEq(token.balanceOf(accounts[0]), amount);
    }

    /// @dev An underfunded distributor reverts the claim and leaves it claimable once funded.
    function test_UnderfundedClaimRevertsAndCanBeRetried() public {
        ARLMerkleDistributor empty =
            new ARLMerkleDistributor(IERC20(address(token)), root, CLAIM_END, launchSafe);
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[4]);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, address(empty), 0, amount
            )
        );
        empty.claim(index, accounts[4], amount, proof);
        assertFalse(empty.isClaimed(index));

        vm.prank(launchSafe);
        token.transfer(address(empty), amount);
        empty.claim(index, accounts[4], amount, proof);
        assertEq(token.balanceOf(accounts[4]), amount);
    }

    // ------------------------------------------------------------------ sweep

    function test_SweepReturnsTheRemainderToTheAllocationSafe() public {
        (uint256 index, uint256 amount, bytes32[] memory proof) = _entry(accounts[2]);
        distributor.claim(index, accounts[2], amount, proof);
        uint256 before = token.balanceOf(launchSafe);

        vm.expectRevert(ARLMerkleDistributor.DistributorClaimWindowOpen.selector);
        distributor.sweep();

        vm.warp(CLAIM_END);
        vm.expectEmit(address(distributor));
        emit ARLMerkleDistributor.Swept(launchSafe, total - amount);
        vm.prank(makeAddr("anyone"));
        distributor.sweep();
        assertEq(token.balanceOf(launchSafe), before + total - amount);
        assertEq(token.balanceOf(address(distributor)), 0);
    }

    function test_SweepTwiceIsHarmless() public {
        vm.warp(CLAIM_END);
        distributor.sweep();
        distributor.sweep();
        assertEq(token.balanceOf(address(distributor)), 0);
    }

    // ------------------------------------------------------------------ construction

    function test_ImmutableParameters() public view {
        assertEq(address(distributor.token()), address(token));
        assertEq(distributor.merkleRoot(), root);
        assertEq(distributor.claimEnd(), CLAIM_END);
        assertEq(distributor.returnTo(), launchSafe);
    }

    function test_RevertWhen_InvalidConstruction() public {
        IERC20 t = IERC20(address(token));
        vm.expectRevert(ARLMerkleDistributor.DistributorZeroAddress.selector);
        new ARLMerkleDistributor(IERC20(address(0)), root, CLAIM_END, launchSafe);
        vm.expectRevert(ARLMerkleDistributor.DistributorZeroAddress.selector);
        new ARLMerkleDistributor(t, root, CLAIM_END, address(0));
        vm.expectRevert(ARLMerkleDistributor.DistributorZeroRoot.selector);
        new ARLMerkleDistributor(t, bytes32(0), CLAIM_END, launchSafe);
        vm.expectRevert(
            abi.encodeWithSelector(
                ARLMerkleDistributor.DistributorClaimEndInPast.selector, uint64(block.timestamp)
            )
        );
        new ARLMerkleDistributor(t, root, uint64(block.timestamp), launchSafe);
    }

    /// @dev The contract has no owner and no function beyond claim and sweep.
    function test_NoAdministrativeFunctions() public view {
        bytes4[4] memory absent = [
            bytes4(keccak256("owner()")),
            bytes4(keccak256("pause()")),
            bytes4(keccak256("withdraw(uint256)")),
            bytes4(keccak256("setMerkleRoot(bytes32)"))
        ];
        for (uint256 i = 0; i < absent.length; i++) {
            (bool ok,) = address(distributor).staticcall(abi.encodeWithSelector(absent[i]));
            assertFalse(ok);
        }
    }

    // ------------------------------------------------------------------ fuzz

    function _leaf(uint256 index, address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
    }

    /// @dev Two-entry tree built here with the same encoding: both entries claim, a changed
    /// amount does not, and the totals reconcile.
    function testFuzz_TwoEntryTree(
        address a,
        address b,
        uint96 amountA,
        uint96 amountB,
        uint256 wrongAmount
    ) public {
        vm.assume(a != address(0) && b != address(0) && a != b);
        amountA = uint96(bound(amountA, 1, 1_000_000e18));
        amountB = uint96(bound(amountB, 1, 1_000_000e18));
        wrongAmount = bound(wrongAmount, 1, type(uint256).max);
        vm.assume(wrongAmount != amountA);
        bytes32 leafA = _leaf(0, a, amountA);
        bytes32 leafB = _leaf(1, b, amountB);

        ARLMerkleDistributor d = new ARLMerkleDistributor(
            IERC20(address(token)), Hashes.commutativeKeccak256(leafA, leafB), CLAIM_END, launchSafe
        );
        vm.prank(launchSafe);
        token.transfer(address(d), uint256(amountA) + amountB);

        vm.expectRevert(ARLMerkleDistributor.DistributorInvalidProof.selector);
        d.claim(0, a, wrongAmount, _single(leafB));

        _claimAndCheck(d, 0, a, amountA, _single(leafB));
        _claimAndCheck(d, 1, b, amountB, _single(leafA));
        assertEq(token.balanceOf(address(d)), 0);
    }

    function _single(bytes32 node) internal pure returns (bytes32[] memory proof) {
        proof = new bytes32[](1);
        proof[0] = node;
    }

    function _claimAndCheck(
        ARLMerkleDistributor d,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] memory proof
    ) internal {
        uint256 before = token.balanceOf(account);
        d.claim(index, account, amount, proof);
        assertEq(token.balanceOf(account) - before, amount);
    }
}
