// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title ARL compute payment: per-second streaming of ARL to a compute provider
/// @notice A client (the sender) opens a stream to a compute provider at a fixed rate per second
/// for at most `maxDuration` seconds, and escrows `ratePerSecond * maxDuration` here. The provider
/// earns the rate every second until the stream is stopped or reaches its end time, whichever
/// comes first; accrual stops by itself at the end time (the timeout). The provider can withdraw
/// what it has earned at any time. When the stream is stopped, the provider receives what it has
/// earned and not yet withdrawn, and the sender receives everything else back.
///
/// A simplified, gas-lean form of the linear stream of Sablier V2 (`SablierV2LockupLinear`,
/// sablier-labs/v2-core): no cliff, no NFT, no broker fee, no renounce, cancelable by either party.
/// ARL choices:
/// - one payment token, fixed at deployment (ARL, a plain ERC-20 with no transfer fee or hook);
/// - no owner, no upgrade, no pause, no fees: the contract has no privileged role at all;
/// - either party can stop a stream at any time; after its end time anyone can settle it, so the
///   escrow can never be locked. Settlement only ever pays the two parties of the stream.
contract ComputePayment is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @dev Three storage slots per stream.
    struct Stream {
        address sender;
        uint40 startTime;
        uint40 endTime;
        address provider;
        uint40 stopTime;
        bool settled;
        uint128 ratePerSecond;
        uint128 withdrawn;
    }

    /// @notice Upper bound on a stream's duration (keeps timestamps and amounts well inside their
    /// types).
    uint40 public constant MAX_DURATION = 365 days;

    IERC20 public immutable paymentToken;

    uint256 public streamCounter;
    mapping(uint256 streamId => Stream) private _streams;

    event StreamStarted(
        uint256 indexed streamId,
        address indexed sender,
        address indexed provider,
        uint256 ratePerSecond,
        uint256 startTime,
        uint256 endTime,
        uint256 deposit
    );
    event Withdrawn(uint256 indexed streamId, address indexed provider, uint256 amount);
    event StreamStopped(uint256 indexed streamId, address indexed stoppedBy, uint256 stopTime);
    event PaymentSettled(
        uint256 indexed streamId,
        address indexed provider,
        uint256 providerAmount,
        address indexed sender,
        uint256 refundAmount
    );

    error ZeroAddress();
    error InvalidProvider();
    error ZeroRate();
    error InvalidDuration();
    error InvalidStream();
    error AlreadySettled();
    error Unauthorized();
    error NothingToWithdraw();
    error UnexpectedDeposit();
    error DepositTooLarge();

    constructor(IERC20 paymentToken_) {
        if (address(paymentToken_) == address(0)) revert ZeroAddress();
        paymentToken = paymentToken_;
    }

    // ---------------------------------------------------------------- lifecycle

    /// @notice Opens a stream from the caller to `provider` and escrows
    /// `ratePerSecond * maxDuration` ARL (the caller must have approved at least that amount).
    /// Accrual starts now and stops by itself `maxDuration` seconds later.
    /// @return streamId The new stream's identifier (starts at 1).
    function streamCompute(address provider, uint128 ratePerSecond, uint40 maxDuration)
        external
        nonReentrant
        returns (uint256 streamId)
    {
        if (provider == address(0)) revert ZeroAddress();
        if (provider == msg.sender || provider == address(this)) revert InvalidProvider();
        if (ratePerSecond == 0) revert ZeroRate();
        if (maxDuration == 0 || maxDuration > MAX_DURATION) revert InvalidDuration();

        // Every amount of the stream (earned, withdrawn) is at most the deposit, so a deposit that
        // fits in uint128 makes the uint128 bookkeeping below exact.
        uint256 deposit = uint256(ratePerSecond) * maxDuration;
        if (deposit > type(uint128).max) revert DepositTooLarge();
        uint40 start = uint40(block.timestamp);
        uint40 end = start + maxDuration;

        streamId = ++streamCounter;
        Stream storage s = _streams[streamId];
        s.sender = msg.sender;
        s.startTime = start;
        s.endTime = end;
        s.provider = provider;
        s.ratePerSecond = ratePerSecond;
        emit StreamStarted(streamId, msg.sender, provider, ratePerSecond, start, end, deposit);

        // The escrow must hold exactly the deposit; a token that delivers less is refused.
        uint256 before = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), deposit);
        if (paymentToken.balanceOf(address(this)) - before != deposit) revert UnexpectedDeposit();
    }

    /// @notice Provider only: withdraws what the stream has earned so far and not yet withdrawn.
    /// @return amount The amount paid to the provider.
    function withdraw(uint256 streamId) external nonReentrant returns (uint256 amount) {
        Stream storage s = _live(streamId);
        if (msg.sender != s.provider) revert Unauthorized();
        amount = _earned(s, _accrualTime(s)) - s.withdrawn;
        // Computed from the rate and time only (never from a balance), so no transfer can make it
        // zero or non-zero.
        // slither-disable-next-line incorrect-equality,timestamp
        if (amount == 0) revert NothingToWithdraw();
        // At most the deposit, which fits in uint128 (checked when the stream was opened).
        s.withdrawn += uint128(amount);
        emit Withdrawn(streamId, msg.sender, amount);
        paymentToken.safeTransfer(msg.sender, amount);
    }

    /// @notice Stops the stream and settles it: the provider receives what it has earned and not
    /// yet withdrawn, the sender receives the rest of the deposit back. The sender or the
    /// provider can stop it at any time; once the end time has passed (the timeout) anyone can.
    /// @return providerAmount Paid to the provider by this call.
    /// @return refundAmount Returned to the sender by this call.
    function stopStream(uint256 streamId)
        external
        nonReentrant
        returns (uint256 providerAmount, uint256 refundAmount)
    {
        Stream storage s = _live(streamId);
        address sender = s.sender;
        address provider = s.provider;
        // slither-disable-next-line timestamp
        if (msg.sender != sender && msg.sender != provider && block.timestamp < s.endTime) {
            revert Unauthorized();
        }

        uint40 stop = _accrualTime(s);
        uint256 earned = _earned(s, stop);
        providerAmount = earned - s.withdrawn;
        refundAmount = _deposit(s) - earned;

        s.stopTime = stop;
        s.settled = true;
        s.withdrawn = uint128(earned);
        emit StreamStopped(streamId, msg.sender, stop);
        emit PaymentSettled(streamId, provider, providerAmount, sender, refundAmount);

        if (providerAmount != 0) paymentToken.safeTransfer(provider, providerAmount);
        if (refundAmount != 0) paymentToken.safeTransfer(sender, refundAmount);
    }

    // ---------------------------------------------------------------- views

    function getStream(uint256 streamId) external view returns (Stream memory) {
        return _streams[streamId];
    }

    /// @notice The full escrow of the stream.
    function depositOf(uint256 streamId) external view returns (uint256) {
        return _deposit(_stream(streamId));
    }

    /// @notice What the stream has earned so far (including what has been withdrawn).
    function streamedAmountOf(uint256 streamId) external view returns (uint256) {
        Stream storage s = _stream(streamId);
        return s.settled ? s.withdrawn : _earned(s, _accrualTime(s));
    }

    /// @notice What the provider can withdraw now.
    function withdrawableAmountOf(uint256 streamId) external view returns (uint256) {
        Stream storage s = _stream(streamId);
        return s.settled ? 0 : _earned(s, _accrualTime(s)) - s.withdrawn;
    }

    /// @notice What the sender would get back if the stream were stopped now.
    function refundableAmountOf(uint256 streamId) external view returns (uint256) {
        Stream storage s = _stream(streamId);
        return s.settled ? 0 : _deposit(s) - _earned(s, _accrualTime(s));
    }

    // ---------------------------------------------------------------- internal

    function _stream(uint256 streamId) private view returns (Stream storage s) {
        s = _streams[streamId];
        if (s.sender == address(0)) revert InvalidStream();
    }

    function _live(uint256 streamId) private view returns (Stream storage s) {
        s = _stream(streamId);
        if (s.settled) revert AlreadySettled();
    }

    /// @dev The time up to which the stream has accrued: now, capped at the end time.
    function _accrualTime(Stream storage s) private view returns (uint40) {
        uint40 end = s.endTime;
        // slither-disable-next-line timestamp
        return block.timestamp < end ? uint40(block.timestamp) : end;
    }

    function _earned(Stream storage s, uint40 at) private view returns (uint256) {
        return uint256(s.ratePerSecond) * (at - s.startTime);
    }

    function _deposit(Stream storage s) private view returns (uint256) {
        return uint256(s.ratePerSecond) * (s.endTime - s.startTime);
    }
}
