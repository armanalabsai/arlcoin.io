// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ComputePayment} from "../src/ComputePayment.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev A hostile ERC-20 that calls back into the recipient on every transfer (ERC-777 style), so
/// that a recipient contract can try to re-enter the payment contract mid-transfer.
contract CallbackToken is ERC20 {
    address public hooked;

    constructor() ERC20("Callback", "CB") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function setHooked(address hooked_) external {
        hooked = hooked_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to == hooked) ReentrantProvider(to).onTokenReceived();
    }
}

/// @dev A provider that re-enters `withdraw` or `stopStream` when it receives tokens.
contract ReentrantProvider {
    ComputePayment internal immutable payment;
    uint256 public streamId;
    bool public reenterStop;

    constructor(ComputePayment payment_) {
        payment = payment_;
    }

    function arm(uint256 id, bool stop) external {
        streamId = id;
        reenterStop = stop;
    }

    function onTokenReceived() external {
        if (streamId == 0) return;
        if (reenterStop) payment.stopStream(streamId);
        else payment.withdraw(streamId);
    }

    function withdraw() external {
        payment.withdraw(streamId);
    }
}

/// @dev A token that takes a 1% fee on every transfer.
contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = value / 100;
        super._update(from, address(0xdead), fee);
        super._update(from, to, value - fee);
    }
}

contract ComputePaymentTest is ARLTestBase {
    ComputePayment internal payment;

    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal stranger = makeAddr("stranger");

    uint128 internal constant RATE = 0.01 ether; // ARL per second
    uint40 internal constant DURATION = 1 hours;
    uint256 internal constant DEPOSIT = uint256(RATE) * DURATION; // 36 ARL
    uint256 internal constant FUNDS = 10_000 ether;

    function setUp() public override {
        super.setUp();
        payment = new ComputePayment(IERC20(address(token)));
        vm.prank(launchSafe);
        token.transfer(client, FUNDS);
        vm.prank(client);
        token.approve(address(payment), type(uint256).max);
    }

    function _open() internal returns (uint256 id) {
        vm.prank(client);
        id = payment.streamCompute(provider, RATE, DURATION);
    }

    // ---------------------------------------------------------------- required scenarios

    /// Normal flow: open, accrue for 10 minutes, stop; the provider is paid exactly the elapsed
    /// time and the client gets the rest back.
    function testStreamStartsAndStops() public {
        uint256 start = block.timestamp;
        vm.expectEmit(address(payment));
        emit ComputePayment.StreamStarted(
            1, client, provider, RATE, start, start + DURATION, DEPOSIT
        );
        uint256 id = _open();
        assertEq(id, 1);
        assertEq(token.balanceOf(address(payment)), DEPOSIT);
        assertEq(token.balanceOf(client), FUNDS - DEPOSIT);
        assertEq(payment.depositOf(id), DEPOSIT);

        skip(10 minutes);
        uint256 earned = uint256(RATE) * 10 minutes;
        assertEq(payment.streamedAmountOf(id), earned);
        assertEq(payment.withdrawableAmountOf(id), earned);
        assertEq(payment.refundableAmountOf(id), DEPOSIT - earned);

        vm.expectEmit(address(payment));
        emit ComputePayment.StreamStopped(id, client, start + 10 minutes);
        vm.expectEmit(address(payment));
        emit ComputePayment.PaymentSettled(id, provider, earned, client, DEPOSIT - earned);
        vm.prank(client);
        (uint256 paid, uint256 refund) = payment.stopStream(id);

        assertEq(paid, earned);
        assertEq(refund, DEPOSIT - earned);
        assertEq(token.balanceOf(provider), earned);
        assertEq(token.balanceOf(client), FUNDS - earned);
        assertEq(token.balanceOf(address(payment)), 0);

        ComputePayment.Stream memory s = payment.getStream(id);
        assertTrue(s.settled);
        assertEq(s.stopTime, start + 10 minutes);
        assertEq(payment.streamedAmountOf(id), earned);
        assertEq(payment.withdrawableAmountOf(id), 0);
        assertEq(payment.refundableAmountOf(id), 0);

        // A settled stream cannot be touched again.
        vm.prank(client);
        vm.expectRevert(ComputePayment.AlreadySettled.selector);
        payment.stopStream(id);
        vm.prank(provider);
        vm.expectRevert(ComputePayment.AlreadySettled.selector);
        payment.withdraw(id);
    }

    /// A hostile token calls back into the provider, which tries to re-enter withdraw and
    /// stopStream; the guard refuses both and the whole transaction reverts.
    function testReentrancyAttack() public {
        CallbackToken evil = new CallbackToken();
        ComputePayment evilPayment = new ComputePayment(IERC20(address(evil)));
        ReentrantProvider attacker = new ReentrantProvider(evilPayment);
        evil.setHooked(address(attacker));
        evil.transfer(client, 1_000 ether);
        vm.startPrank(client);
        evil.approve(address(evilPayment), type(uint256).max);
        uint256 id = evilPayment.streamCompute(address(attacker), RATE, DURATION);
        vm.stopPrank();
        skip(10 minutes);

        // Re-entering withdraw from inside withdraw.
        attacker.arm(id, false);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        attacker.withdraw();

        // Re-entering stopStream from inside stopStream (provider receives during settlement).
        attacker.arm(id, true);
        vm.prank(client);
        vm.expectRevert(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector);
        evilPayment.stopStream(id);

        // Nothing moved: the escrow is intact and the stream is still live.
        assertEq(evil.balanceOf(address(evilPayment)), DEPOSIT);
        assertFalse(evilPayment.getStream(id).settled);
        assertEq(evilPayment.getStream(id).withdrawn, 0);
    }

    /// Opening a stream whose deposit exceeds the client's balance or allowance reverts and
    /// creates nothing.
    function testInsufficientBalance() public {
        address poor = makeAddr("poor");
        vm.prank(launchSafe);
        token.transfer(poor, DEPOSIT - 1);
        vm.startPrank(poor);
        token.approve(address(payment), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, poor, DEPOSIT - 1, DEPOSIT
            )
        );
        payment.streamCompute(provider, RATE, DURATION);
        vm.stopPrank();

        // Enough balance, too little allowance.
        vm.startPrank(client);
        token.approve(address(payment), DEPOSIT - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector,
                address(payment),
                DEPOSIT - 1,
                DEPOSIT
            )
        );
        payment.streamCompute(provider, RATE, DURATION);
        vm.stopPrank();

        assertEq(payment.streamCounter(), 0);
        assertEq(token.balanceOf(address(payment)), 0);
    }

    /// Accrual stops by itself at the end time; afterwards anyone can settle, and the provider
    /// receives exactly the full deposit however late the settlement happens.
    function testMaxDurationTimeout() public {
        uint256 id = _open();
        uint256 end = block.timestamp + DURATION;

        // Before the end, a stranger cannot settle.
        skip(DURATION - 1);
        vm.prank(stranger);
        vm.expectRevert(ComputePayment.Unauthorized.selector);
        payment.stopStream(id);

        skip(30 days);
        assertEq(payment.streamedAmountOf(id), DEPOSIT);
        assertEq(payment.withdrawableAmountOf(id), DEPOSIT);
        assertEq(payment.refundableAmountOf(id), 0);

        vm.expectEmit(address(payment));
        emit ComputePayment.StreamStopped(id, stranger, end);
        vm.prank(stranger);
        (uint256 paid, uint256 refund) = payment.stopStream(id);

        assertEq(paid, DEPOSIT);
        assertEq(refund, 0);
        assertEq(token.balanceOf(provider), DEPOSIT);
        assertEq(token.balanceOf(stranger), 0);
        assertEq(payment.getStream(id).stopTime, end);
        assertEq(token.balanceOf(address(payment)), 0);
    }

    /// The provider withdraws mid-stream, then stops early; the client gets back everything that
    /// was not earned and the provider never receives more than the elapsed time.
    function testRefundOnEarlyStop() public {
        uint256 id = _open();

        skip(5 minutes);
        vm.prank(provider);
        uint256 first = payment.withdraw(id);
        assertEq(first, uint256(RATE) * 5 minutes);

        skip(2 minutes);
        vm.prank(provider);
        (uint256 paid, uint256 refund) = payment.stopStream(id);

        uint256 earned = uint256(RATE) * 7 minutes;
        assertEq(paid, earned - first);
        assertEq(refund, DEPOSIT - earned);
        assertEq(token.balanceOf(provider), earned);
        assertEq(token.balanceOf(client), FUNDS - earned);
        assertEq(token.balanceOf(address(payment)), 0);

        // Stopping in the same second the stream opened refunds everything.
        uint256 id2 = _open();
        vm.prank(client);
        (paid, refund) = payment.stopStream(id2);
        assertEq(paid, 0);
        assertEq(refund, DEPOSIT);
    }

    // ---------------------------------------------------------------- input validation

    function testConstructorRejectsZeroToken() public {
        vm.expectRevert(ComputePayment.ZeroAddress.selector);
        new ComputePayment(IERC20(address(0)));
    }

    function testStreamComputeValidation() public {
        vm.startPrank(client);
        vm.expectRevert(ComputePayment.ZeroAddress.selector);
        payment.streamCompute(address(0), RATE, DURATION);
        vm.expectRevert(ComputePayment.InvalidProvider.selector);
        payment.streamCompute(client, RATE, DURATION);
        vm.expectRevert(ComputePayment.InvalidProvider.selector);
        payment.streamCompute(address(payment), RATE, DURATION);
        vm.expectRevert(ComputePayment.ZeroRate.selector);
        payment.streamCompute(provider, 0, DURATION);
        vm.expectRevert(ComputePayment.InvalidDuration.selector);
        payment.streamCompute(provider, RATE, 0);
        uint40 tooLong = payment.MAX_DURATION() + 1;
        vm.expectRevert(ComputePayment.InvalidDuration.selector);
        payment.streamCompute(provider, RATE, tooLong);
        vm.expectRevert(ComputePayment.DepositTooLarge.selector);
        payment.streamCompute(provider, type(uint128).max, 2);
        vm.stopPrank();
    }

    function testUnknownStreamReverts() public {
        vm.expectRevert(ComputePayment.InvalidStream.selector);
        payment.stopStream(1);
        vm.expectRevert(ComputePayment.InvalidStream.selector);
        payment.withdraw(1);
        vm.expectRevert(ComputePayment.InvalidStream.selector);
        payment.streamedAmountOf(1);
    }

    function testOnlyProviderWithdraws() public {
        uint256 id = _open();
        skip(1 minutes);
        vm.prank(client);
        vm.expectRevert(ComputePayment.Unauthorized.selector);
        payment.withdraw(id);
        vm.prank(stranger);
        vm.expectRevert(ComputePayment.Unauthorized.selector);
        payment.withdraw(id);
    }

    function testWithdrawNothingReverts() public {
        uint256 id = _open();
        vm.prank(provider);
        vm.expectRevert(ComputePayment.NothingToWithdraw.selector);
        payment.withdraw(id);
    }

    function testFeeOnTransferTokenRefused() public {
        FeeToken fee = new FeeToken();
        ComputePayment feePayment = new ComputePayment(IERC20(address(fee)));
        fee.approve(address(feePayment), type(uint256).max);
        vm.expectRevert(ComputePayment.UnexpectedDeposit.selector);
        feePayment.streamCompute(provider, RATE, DURATION);
    }

    // ---------------------------------------------------------------- fuzz

    /// Whatever the rate, duration, withdrawal and stop times, the provider receives exactly the
    /// elapsed time (capped at the duration) times the rate, the client receives the rest, and
    /// the contract ends empty.
    function testFuzz_settlementIsExact(
        uint128 rate,
        uint40 duration,
        uint256 withdrawAt,
        uint256 stopAt,
        bool providerStops
    ) public {
        duration = uint40(bound(duration, 1, payment.MAX_DURATION()));
        rate = uint128(bound(rate, 1, FUNDS / duration));
        uint256 deposit = uint256(rate) * duration;
        withdrawAt = bound(withdrawAt, 1, uint256(duration) * 2);
        stopAt = bound(stopAt, withdrawAt, uint256(duration) * 3);

        vm.prank(client);
        uint256 id = payment.streamCompute(provider, rate, duration);
        uint256 start = block.timestamp;

        vm.warp(start + withdrawAt);
        vm.prank(provider);
        uint256 withdrawn = payment.withdraw(id);
        assertEq(withdrawn, uint256(rate) * _min(withdrawAt, duration));

        vm.warp(start + stopAt);
        vm.prank(providerStops ? provider : client);
        payment.stopStream(id);

        uint256 earned = uint256(rate) * _min(stopAt, duration);
        assertEq(token.balanceOf(provider), earned);
        assertEq(token.balanceOf(client), FUNDS - earned);
        assertEq(token.balanceOf(address(payment)), 0);
        assertLe(earned, deposit);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
