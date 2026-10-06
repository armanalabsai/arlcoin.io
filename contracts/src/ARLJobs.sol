// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title ARL jobs: escrowed work paid in ARL (ERC-8183 Agentic Commerce)
/// @notice A client posts a job, agrees a budget with a provider and escrows it here. The provider
/// submits the work (a reference such as a hash), and the job's evaluator, chosen by the client at
/// creation, either completes it (the escrow goes to the provider) or rejects it (the escrow goes
/// back to the client). If the job expires before it is evaluated, anyone can return the escrow to
/// the client. The evaluator can be the client itself, another account or a contract.
///
/// Implements ERC-8183 (ethereum/ERCs, ERCS/erc-8183.md, Draft, CC0-1.0). The state machine,
/// roles, events and function signatures follow the specification and its reference
/// `AgenticCommerce` contract. ARL choices:
/// - one payment token, fixed at deployment (ARL);
/// - no owner, no upgrade, no fees: the contract has no privileged role at all;
/// - no hooks: `hook` must be address(0) (a non-hooked kernel is compliant); `optParams` are
///   accepted for interface compatibility and ignored;
/// - `fund` takes the expected budget (front-running protection, as the specification requires);
/// - a provider can only submit before the job expires.
contract ARLJobs is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum JobStatus {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        JobStatus status;
        address hook;
    }

    /// @notice A job must stay open to funding and work for at least this long.
    uint256 public constant MIN_DURATION = 5 minutes;
    /// @notice Upper bound on a job description, in bytes (a brief or a reference to one).
    uint256 public constant MAX_DESCRIPTION = 1024;

    IERC20 public immutable paymentToken;

    uint256 public jobCounter;
    mapping(uint256 jobId => Job) private _jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint256 expiredAt,
        address hook
    );
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

    error InvalidJob();
    error WrongStatus();
    error Unauthorized();
    error ZeroAddress();
    error ExpiryTooShort();
    error ZeroBudget();
    error ProviderNotSet();
    error BudgetMismatch();
    error JobExpiredAlready();
    error HooksUnsupported();
    error DescriptionTooLong();

    constructor(IERC20 paymentToken_) {
        if (address(paymentToken_) == address(0)) revert ZeroAddress();
        paymentToken = paymentToken_;
    }

    // ---------------------------------------------------------------- lifecycle

    /// @notice Creates an Open job with the caller as client. `provider` may be address(0) and
    /// set later with setProvider.
    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256 jobId) {
        if (evaluator == address(0)) revert ZeroAddress();
        // slither-disable-next-line timestamp
        if (expiredAt < block.timestamp + MIN_DURATION) revert ExpiryTooShort();
        if (hook != address(0)) revert HooksUnsupported();
        if (bytes(description).length > MAX_DESCRIPTION) revert DescriptionTooLong();

        jobId = ++jobCounter;
        Job storage job = _jobs[jobId];
        job.id = jobId;
        job.client = msg.sender;
        job.provider = provider;
        job.evaluator = evaluator;
        job.description = description;
        job.expiredAt = expiredAt;
        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, address(0));
    }

    /// @notice Client only, while Open, when the job was created without a provider.
    function setProvider(uint256 jobId, address provider, bytes calldata) external {
        Job storage job = _open(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (job.provider != address(0)) revert WrongStatus();
        if (provider == address(0)) revert ZeroAddress();
        job.provider = provider;
        emit ProviderSet(jobId, provider);
    }

    /// @notice Client or provider, while Open: proposes the price. The client accepts it by
    /// funding exactly this amount.
    function setBudget(uint256 jobId, uint256 amount, bytes calldata) external {
        Job storage job = _open(jobId);
        if (msg.sender != job.client && msg.sender != job.provider) revert Unauthorized();
        job.budget = amount;
        emit BudgetSet(jobId, amount);
    }

    /// @notice Client only: escrows the budget. Reverts unless it equals `expectedBudget`, so a
    /// budget changed in the meantime is never funded.
    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata) external nonReentrant {
        Job storage job = _open(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (job.provider == address(0)) revert ProviderNotSet();
        uint256 budget = job.budget;
        if (budget == 0) revert ZeroBudget();
        if (budget != expectedBudget) revert BudgetMismatch();
        // slither-disable-next-line timestamp
        if (block.timestamp >= job.expiredAt) revert JobExpiredAlready();

        job.status = JobStatus.Funded;
        emit JobFunded(jobId, msg.sender, budget);
        paymentToken.safeTransferFrom(msg.sender, address(this), budget);
    }

    /// @notice Provider only, while Funded and before expiry: hands the work in for evaluation.
    /// @param deliverable A reference to the work (for example a hash or a content identifier).
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata) external {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded) revert WrongStatus();
        if (msg.sender != job.provider) revert Unauthorized();
        // slither-disable-next-line timestamp
        if (block.timestamp >= job.expiredAt) revert JobExpiredAlready();
        job.status = JobStatus.Submitted;
        emit JobSubmitted(jobId, msg.sender, deliverable);
    }

    /// @notice Evaluator only, once Submitted: pays the escrow to the provider.
    /// @param reason Optional attestation (for example a hash of the evaluation).
    function complete(uint256 jobId, bytes32 reason, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert WrongStatus();
        if (msg.sender != job.evaluator) revert Unauthorized();

        job.status = JobStatus.Completed;
        uint256 amount = job.budget;
        address provider = job.provider;
        emit JobCompleted(jobId, msg.sender, reason);
        emit PaymentReleased(jobId, provider, amount);
        paymentToken.safeTransfer(provider, amount);
    }

    /// @notice The client while Open; the evaluator while Funded or Submitted (the escrow goes
    /// back to the client).
    function reject(uint256 jobId, bytes32 reason, bytes calldata) external nonReentrant {
        Job storage job = _job(jobId);
        JobStatus status = job.status;
        if (status == JobStatus.Open) {
            if (msg.sender != job.client) revert Unauthorized();
        } else if (status == JobStatus.Funded || status == JobStatus.Submitted) {
            if (msg.sender != job.evaluator) revert Unauthorized();
        } else {
            revert WrongStatus();
        }

        job.status = JobStatus.Rejected;
        emit JobRejected(jobId, msg.sender, reason);
        if (status != JobStatus.Open) _refund(jobId, job);
    }

    /// @notice Anyone, once a Funded or Submitted job has expired: returns the escrow to the
    /// client. Nothing can block it.
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted) {
            revert WrongStatus();
        }
        // slither-disable-next-line timestamp
        if (block.timestamp < job.expiredAt) revert WrongStatus();
        job.status = JobStatus.Expired;
        emit JobExpired(jobId);
        _refund(jobId, job);
    }

    // ---------------------------------------------------------------- views

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    // ---------------------------------------------------------------- internal

    function _job(uint256 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.id == 0) revert InvalidJob();
    }

    function _open(uint256 jobId) private view returns (Job storage job) {
        job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
    }

    function _refund(uint256 jobId, Job storage job) private {
        uint256 amount = job.budget;
        address client = job.client;
        emit Refunded(jobId, client, amount);
        paymentToken.safeTransfer(client, amount);
    }
}
