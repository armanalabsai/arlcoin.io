// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ComputePayment} from "../../src/ComputePayment.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev Random streams, withdrawals, stops and time moves, by a fixed set of accounts that play
/// both roles, including callers that are not allowed to act.
contract ComputePaymentHandler is Test {
    ComputePayment internal immutable payment;
    ARLToken internal immutable token;
    address[] internal actors;

    uint256 public ghostDeposited;
    uint256 public ghostPaid;
    uint256 public ghostRefunded;

    constructor(ComputePayment payment_, ARLToken token_, address[] memory actors_) {
        payment = payment_;
        token = token_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _streamId(uint256 seed) internal view returns (uint256) {
        uint256 n = payment.streamCounter();
        return n == 0 ? 0 : 1 + seed % n;
    }

    function open(uint256 s, uint256 p, uint128 rate, uint40 duration) external {
        address sender = _actor(s);
        address provider = _actor(p);
        if (sender == provider) return;
        duration = uint40(bound(duration, 1, 30 days));
        rate = uint128(bound(rate, 1, 1 ether));
        uint256 deposit = uint256(rate) * duration;
        if (token.balanceOf(sender) < deposit) return;
        vm.prank(sender);
        payment.streamCompute(provider, rate, duration);
        ghostDeposited += deposit;
    }

    function withdraw(uint256 j, uint256 who) external {
        uint256 id = _streamId(j);
        if (id == 0) return;
        ComputePayment.Stream memory s = payment.getStream(id);
        vm.prank(who % 4 == 0 ? _actor(who / 4) : s.provider);
        try payment.withdraw(id) returns (uint256 amount) {
            ghostPaid += amount;
        } catch {}
    }

    function stop(uint256 j, uint256 who) external {
        uint256 id = _streamId(j);
        if (id == 0) return;
        ComputePayment.Stream memory s = payment.getStream(id);
        address caller = who % 3 == 0 ? _actor(who / 3) : who % 3 == 1 ? s.sender : s.provider;
        vm.prank(caller);
        try payment.stopStream(id) returns (uint256 paid, uint256 refund) {
            ghostPaid += paid;
            ghostRefunded += refund;
        } catch {}
    }

    function wait(uint256 secondsAhead) external {
        skip(bound(secondsAhead, 1, 7 days));
    }
}

contract ComputePaymentInvariantTest is ARLTestBase {
    ComputePayment internal payment;
    ComputePaymentHandler internal handler;
    address[] internal actors;

    function setUp() public override {
        super.setUp();
        payment = new ComputePayment(IERC20(address(token)));
        for (uint256 i; i < 4; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            vm.prank(launchSafe);
            token.transfer(a, 100_000 ether);
            vm.prank(a);
            token.approve(address(payment), type(uint256).max);
        }
        handler = new ComputePaymentHandler(payment, token, actors);
        targetContract(address(handler));
    }

    /// The contract holds exactly the unpaid part of the deposits of the live streams.
    function invariant_balanceIsTheLiveEscrow() public view {
        uint256 escrow;
        uint256 n = payment.streamCounter();
        for (uint256 id = 1; id <= n; ++id) {
            ComputePayment.Stream memory s = payment.getStream(id);
            if (!s.settled) escrow += payment.depositOf(id) - s.withdrawn;
        }
        assertEq(token.balanceOf(address(payment)), escrow);
    }

    /// No stream ever pays out more than its deposit.
    function invariant_neverPaysMoreThanDeposit() public view {
        uint256 n = payment.streamCounter();
        for (uint256 id = 1; id <= n; ++id) {
            assertLe(payment.getStream(id).withdrawn, payment.depositOf(id));
            assertLe(payment.streamedAmountOf(id), payment.depositOf(id));
        }
    }

    /// Every token deposited is still escrowed, paid to a provider or refunded to a sender.
    function invariant_everyTokenIsAccountedFor() public view {
        assertEq(
            handler.ghostDeposited(),
            token.balanceOf(address(payment)) + handler.ghostPaid() + handler.ghostRefunded()
        );
    }

    /// Tokens only move between the accounts and the escrow.
    function invariant_supplyIsConserved() public view {
        uint256 total = token.balanceOf(address(payment));
        for (uint256 i; i < actors.length; ++i) {
            total += token.balanceOf(actors[i]);
        }
        assertEq(total, actors.length * 100_000 ether);
    }
}
