// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLMerkleDistributor} from "../../src/ARLMerkleDistributor.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev Drives claims of the published fixture entries (valid, repeated and tampered), time
/// moves and sweeps, in random order.
contract ARLDistributorHandler is Test {
    ARLMerkleDistributor internal immutable distributor;
    address[] internal accounts;
    uint256[] internal indexes;
    uint256[] internal amounts;
    bytes32[][] internal proofs;

    uint256 public ghostClaimed;
    uint256 public ghostSwept;

    constructor(
        ARLMerkleDistributor distributor_,
        address[] memory accounts_,
        uint256[] memory indexes_,
        uint256[] memory amounts_,
        bytes32[][] memory proofs_
    ) {
        distributor = distributor_;
        accounts = accounts_;
        indexes = indexes_;
        amounts = amounts_;
        for (uint256 i = 0; i < proofs_.length; i++) {
            proofs.push(proofs_[i]);
        }
    }

    function claim(uint256 seed, address caller) external {
        uint256 i = seed % accounts.length;
        if (distributor.isClaimed(indexes[i]) || block.timestamp >= distributor.claimEnd()) {
            vm.expectRevert();
            distributor.claim(indexes[i], accounts[i], amounts[i], proofs[i]);
            return;
        }
        vm.prank(caller);
        distributor.claim(indexes[i], accounts[i], amounts[i], proofs[i]);
        ghostClaimed += amounts[i];
    }

    function claimTampered(uint256 seed, uint256 amount, address account) external {
        uint256 i = seed % accounts.length;
        if (amount == amounts[i] && account == accounts[i]) return;
        vm.expectRevert();
        distributor.claim(indexes[i], account, amount, proofs[i]);
    }

    function warp(uint256 by) external {
        vm.warp(block.timestamp + bound(by, 0, 30 days));
    }

    function sweep() external {
        if (block.timestamp < distributor.claimEnd()) {
            vm.expectRevert(ARLMerkleDistributor.DistributorClaimWindowOpen.selector);
            distributor.sweep();
            return;
        }
        ghostSwept += distributor.token().balanceOf(address(distributor));
        distributor.sweep();
    }
}

contract ARLDistributorInvariantTest is ARLTestBase {
    ARLMerkleDistributor internal distributor;
    ARLDistributorHandler internal handler;
    address[] internal accounts;
    uint256[] internal amounts;
    uint256 internal total;
    uint256 internal launchSafeBefore;

    function setUp() public override {
        super.setUp();
        string memory input = vm.readFile("test/fixtures/distribution-input.json");
        string memory output = vm.readFile("test/fixtures/distribution.json");
        uint256 count = vm.parseJsonUint(output, ".count");
        uint256[] memory indexes = new uint256[](count);
        bytes32[][] memory proofs = new bytes32[][](count);
        for (uint256 i = 0; i < count; i++) {
            address account =
                vm.parseJsonAddress(input, string.concat(".claims[", vm.toString(i), "].account"));
            string memory key = string.concat(".claims.", vm.toString(account));
            accounts.push(account);
            amounts.push(vm.parseJsonUint(output, string.concat(key, ".amount")));
            indexes[i] = vm.parseJsonUint(output, string.concat(key, ".index"));
            proofs[i] = vm.parseJsonBytes32Array(output, string.concat(key, ".proof"));
        }
        total = vm.parseJsonUint(output, ".total");
        distributor = new ARLMerkleDistributor(
            IERC20(address(token)),
            vm.parseJsonBytes32(output, ".merkleRoot"),
            LAUNCH + 60 days,
            launchSafe
        );
        vm.prank(launchSafe);
        token.transfer(address(distributor), total);
        launchSafeBefore = token.balanceOf(launchSafe);

        handler = new ARLDistributorHandler(distributor, accounts, indexes, amounts, proofs);
        targetContract(address(handler));
    }

    /// @dev Every funded token is either still held, paid to a listed account, or returned.
    function invariant_FundsReconcile() public view {
        assertEq(
            token.balanceOf(address(distributor)) + handler.ghostClaimed() + handler.ghostSwept(),
            total
        );
        assertEq(token.balanceOf(launchSafe), launchSafeBefore + handler.ghostSwept());
    }

    /// @dev A listed account holds exactly its amount once claimed, and nothing before.
    function invariant_EachEntryPaysExactlyOnce() public view {
        uint256 paid = 0;
        for (uint256 i = 0; i < accounts.length; i++) {
            uint256 balance = token.balanceOf(accounts[i]);
            assertTrue(balance == 0 || balance == amounts[i]);
            paid += balance;
        }
        assertEq(paid, handler.ghostClaimed());
    }
}
