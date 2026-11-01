// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ARLJobs} from "./ARLJobs.sol";

/// @title ERC-8004 identity registry (subset)
/// @author Alazdg
/// @notice The subset of the ERC-8004 IdentityRegistry used here (an ERC-721).
/// @dev Only `ownerOf` is called, to find the address that owns a validator's agent id.
interface IERC8004Identity {
    /// @notice Owner of an agent id.
    /// @param agentId The ERC-8004 agent id.
    /// @return The address that owns the agent id.
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @title ERC-8004 reputation registry (subset)
/// @author Alazdg
/// @notice The subset of the ERC-8004 ReputationRegistry used here.
/// @dev Only `giveFeedback` is called, to record a job's outcome for its provider.
interface IERC8004Reputation {
    /// @notice Records feedback for an agent.
    /// @param agentId The ERC-8004 agent id that receives the feedback.
    /// @param value The feedback value, scaled by `valueDecimals`.
    /// @param valueDecimals Decimals of `value`.
    /// @param tag1 First tag.
    /// @param tag2 Second tag.
    /// @param endpoint Endpoint the feedback refers to.
    /// @param feedbackURI URI of the feedback details.
    /// @param feedbackHash Hash of the feedback details.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}

/// @title ARL verified evaluator: a staked validator committee as the ERC-8183 evaluator
/// @author Alazdg
/// @notice An `ARLJobs` client names this contract as the job's evaluator and, while the job is
/// Open, proposes a committee of staked validators, a threshold, a bond floor and the job's vote
/// and challenge windows. The provider approves the committee, so neither side picks it alone.
/// Once the job is funded, each member accepts, locking a bond in the stake token. When the stake
/// token is the job's payment token the bond is the larger of the floor and a tenth of the budget;
/// when it is another token (for example an escrow paid in USDC with bonds in ARL) the budget
/// cannot be compared with the bond, and the bond is the job's floor. After the provider submits, members check the
/// work (re-execute it, or check a TEE or proof attestation, as the job's spec says) and vote
/// within the vote window. Once the threshold approves, or approval can no longer be reached, the
/// decision waits out the challenge window; without a dispute anyone finalizes it: the escrow goes
/// to the provider (approved) or back to the client (rejected), and the outcome is written to the
/// provider's ERC-8004 reputation. With a dispute, the arbiter rules; the bonds of the validators
/// who voted for the overturned decision, or the challenger's bond if the decision stands, are
/// burned. If the vote window ends undecided, the bonds of members who accepted but did not vote
/// are burned and the client is refunded.
///
/// Trust bounds:
/// - no owner and no upgrade; every parameter is fixed at deployment or per job within bounds;
/// - the arbiter only rules on disputed jobs, can only pay the escrow to the client or the
///   provider, and never receives slashed bonds (they are burned), so it cannot profit from a
///   ruling;
/// - the whole evaluation fits before the job's deadline: voting can only start, and members can
///   only accept before it starts, while the vote window and two challenge windows still end
///   before it; once it has started, members can still accept until the vote window ends, so
///   starting the vote never shuts out a member who has not accepted yet. A decision
///   therefore ends its challenge window at least one challenge window before the deadline, and
///   anyone can finalize it in that time;
/// - at the deadline `ARLJobs` closes the job: the escrow of a job that was not settled goes back
///   to the client through `claimRefund`, and `release` unlocks every bond here: no state can lock
///   funds, and the outcome never depends on which transaction lands first.
/// @dev Every parameter that bounds a job is immutable; every function that moves tokens is
/// `nonReentrant`.
contract ARLVerifiedEvaluator is ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @notice Fallback: one validator (low value or low volume). Checked: a re-execution or an
    /// attestation (TEE quote, proof) checked by a majority committee of at least two.
    enum Tier {
        Fallback,
        Reexecution,
        Attested
    }

    enum Phase {
        None,
        Configured,
        Approved,
        Rejected,
        Disputed,
        Finalized,
        Released,
        Failed
    }

    struct Config {
        Tier tier;
        uint8 threshold;
        uint64 voteWindow;
        uint64 challengeWindow;
        uint96 bond;
        uint256 providerAgentId;
        bytes32 specHash;
        address[] committee;
    }

    struct Verdict {
        Phase phase;
        bool providerApproved;
        uint8 approvals;
        uint8 rejections;
        uint64 voteEnds;
        uint64 challengeEnds;
        address challenger;
        uint256 bond;
        bytes32 deliverable;
        bytes32 voteHash;
    }

    /// @notice Largest committee a job can name.
    uint256 public constant MAX_COMMITTEE = 7;
    /// @notice The bond is at least this share of the job's budget, in basis points (10%).
    uint256 public constant BOND_BPS = 1_000;
    /// @notice Bounds of the per-job vote window.
    uint64 public constant MIN_VOTE_WINDOW = 10 minutes;
    uint64 public constant MAX_VOTE_WINDOW = 7 days;
    /// @notice Upper bound of the per-job challenge window.
    uint64 public constant MAX_CHALLENGE_WINDOW = 30 days;
    /// @notice Where slashed bonds go: an address nobody controls.
    address public constant SLASH_SINK = 0x000000000000000000000000000000000000dEaD;
    /// @notice ERC-8004 feedback tag written for every finalized job.
    string public constant FEEDBACK_TAG = "arl-verified";
    /// @notice Gas forwarded to each ERC-8004 registry call.
    uint256 public constant REGISTRY_GAS = 300_000;

    /// Committee member states in `_votes`.
    uint8 private constant MEMBER = 1;
    uint8 private constant ACCEPTED = 2;
    uint8 private constant APPROVED = 3;
    uint8 private constant REJECTED = 4;
    uint8 private constant ABSENT = 5;

    ARLJobs public immutable jobs;
    /// @notice Token of validator stakes and bonds: the escrow's payment token unless the
    /// deployment names another one.
    IERC20 public immutable stakeToken;
    /// @notice True when stakes are in the escrow's payment token, so a bond can follow the budget.
    bool public immutable bondFollowsBudget;
    address public immutable arbiter;
    /// @notice Shortest challenge window a job may set (for example 1 hour on Base Sepolia,
    /// 24 hours on Base Mainnet).
    uint64 public immutable minChallengeWindow;
    /// @notice Smallest bond floor a job may set. A technical gate against zero-cost votes; the
    /// economic bond is the larger of the floor and a tenth of the budget when `bondFollowsBudget`,
    /// else the job's floor.
    uint96 public immutable minBond;
    IERC8004Identity public immutable identity;
    IERC8004Reputation public immutable reputation;

    mapping(address validator => uint256) public stakeOf;
    mapping(address validator => uint256) public lockedOf;

    mapping(uint256 jobId => Config) private _configs;
    mapping(uint256 jobId => Verdict) private _verdicts;
    mapping(uint256 jobId => mapping(address validator => uint8)) private _votes;

    event Staked(address indexed validator, uint256 amount);
    event Unstaked(address indexed validator, uint256 amount);
    event Configured(
        uint256 indexed jobId,
        Tier tier,
        uint8 threshold,
        uint64 voteWindow,
        uint64 challengeWindow,
        uint96 bond,
        uint256 providerAgentId,
        bytes32 specHash,
        address[] committee
    );
    event CommitteeApproved(uint256 indexed jobId, address indexed provider);
    event Accepted(uint256 indexed jobId, address indexed validator, uint256 bond);
    event VotingStarted(uint256 indexed jobId, uint64 voteEnds);
    event Voted(
        uint256 indexed jobId,
        address indexed validator,
        bool approve,
        bytes32 deliverable,
        bytes32 evidence
    );
    event Decided(uint256 indexed jobId, bool approved, uint64 challengeEnds);
    event Disputed(uint256 indexed jobId, address indexed challenger, bytes32 evidence);
    event Resolved(uint256 indexed jobId, bool approved, bool overturned, bytes32 reason);
    event Slashed(uint256 indexed jobId, address indexed account, uint256 amount);
    event Failed(uint256 indexed jobId);
    event Finalized(uint256 indexed jobId, bool approved, bytes32 voteHash);
    event Released(uint256 indexed jobId);
    event FeedbackFailed(uint256 indexed jobId, uint256 agentId);

    error ZeroAddress();
    error Unauthorized();
    error WrongPhase();
    error WrongJobStatus();
    error BadCommittee();
    error BadThreshold();
    error BadWindow();
    error BondTooLow();
    error ExpiryTooSoon();
    error InsufficientStake();
    error DeliverableMismatch();
    error ConflictOfInterest();
    error NotApprovedByProvider();
    error VoteWindowOpen();
    error VoteWindowClosed();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error ZeroAmount();

    constructor(
        ARLJobs jobs_,
        address arbiter_,
        uint64 minChallengeWindow_,
        uint96 minBond_,
        IERC8004Identity identity_,
        IERC8004Reputation reputation_,
        IERC20 stakeToken_
    ) {
        if (address(jobs_) == address(0) || arbiter_ == address(0)) {
            revert ZeroAddress();
        }
        if (minChallengeWindow_ == 0 || minChallengeWindow_ > MAX_CHALLENGE_WINDOW) {
            revert BadWindow();
        }
        if (minBond_ == 0) revert BondTooLow();
        jobs = jobs_;
        IERC20 payment = jobs_.paymentToken();
        stakeToken = address(stakeToken_) == address(0) ? payment : stakeToken_;
        bondFollowsBudget = stakeToken == payment;
        arbiter = arbiter_;
        minChallengeWindow = minChallengeWindow_;
        minBond = minBond_;
        identity = identity_;
        reputation = reputation_;
    }

    // ---------------------------------------------------------------- validator stake

    /// @notice Adds stake. Any account can be a validator; the client proposes and the provider
    /// approves who checks a job.
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        stakeOf[msg.sender] += amount;
        emit Staked(msg.sender, amount);
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraws stake that no accepted job has locked.
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > stakeOf[msg.sender] - lockedOf[msg.sender]) revert InsufficientStake();
        stakeOf[msg.sender] -= amount;
        emit Unstaked(msg.sender, amount);
        stakeToken.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------- job lifecycle

    /// @notice Job client only, while the job is Open and names this contract as evaluator.
    /// Fallback takes exactly one validator; Reexecution and Attested take a strict majority
    /// threshold of at least two. The windows must be within bounds and the job's deadline must
    /// leave room for the vote window and two challenge windows (the challenge, then a ruling).
    function configure(uint256 jobId, Config calldata cfg) external {
        ARLJobs.Job memory job = jobs.getJob(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (job.status != ARLJobs.JobStatus.Open || job.evaluator != address(this)) {
            revert WrongJobStatus();
        }
        if (_verdicts[jobId].phase != Phase.None) revert WrongPhase();
        _checkWindows(cfg.voteWindow, cfg.challengeWindow, job.expiredAt);
        if (cfg.bond < minBond) revert BondTooLow();
        _checkThreshold(cfg.tier, cfg.threshold, cfg.committee.length);
        for (uint256 i; i < cfg.committee.length; ++i) {
            address v = cfg.committee[i];
            if (v == address(0) || v == job.client || _votes[jobId][v] != 0) revert BadCommittee();
            _votes[jobId][v] = MEMBER;
        }

        _configs[jobId] = cfg;
        _verdicts[jobId].phase = Phase.Configured;
        emit Configured(
            jobId,
            cfg.tier,
            cfg.threshold,
            cfg.voteWindow,
            cfg.challengeWindow,
            cfg.bond,
            cfg.providerAgentId,
            cfg.specHash,
            cfg.committee
        );
    }

    /// @notice Job provider only, while configured: approves the committee and the terms. No
    /// member can accept before this, so the client cannot fill the committee alone. A provider
    /// cannot sit on the committee of its own job.
    function approveCommittee(uint256 jobId) external {
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Configured || v.providerApproved) revert WrongPhase();
        if (msg.sender != jobs.getJob(jobId).provider) revert Unauthorized();
        if (_votes[jobId][msg.sender] != 0) revert ConflictOfInterest();
        v.providerApproved = true;
        emit CommitteeApproved(jobId, msg.sender);
    }

    /// @notice Committee member only, once the committee is approved and the job is funded, until
    /// the vote window ends and before a decision: commits to vote and locks the job's bond from
    /// the caller's stake. Starting the vote (which anyone can do) does not close acceptance, so
    /// it cannot leave the committee short of the threshold.
    /// The bond is fixed by the first acceptance (the budget cannot change once funded). With
    /// stakes in another token than the escrow's, the bond is the job's floor.
    function accept(uint256 jobId) external {
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Configured) revert WrongPhase();
        if (!v.providerApproved) revert NotApprovedByProvider();
        if (_votes[jobId][msg.sender] != MEMBER) revert Unauthorized();
        ARLJobs.Job memory job = jobs.getJob(jobId);
        if (job.status != ARLJobs.JobStatus.Funded && job.status != ARLJobs.JobStatus.Submitted) {
            revert WrongJobStatus();
        }
        if (v.voteEnds == 0) {
            _checkFits(jobId, job.expiredAt);
            // slither-disable-next-line timestamp
        } else if (block.timestamp >= v.voteEnds) {
            // The vote started within the deadline's bounds; it is open until it ends.
            revert VoteWindowClosed();
        }
        uint256 bond = v.bond;
        if (bond == 0) {
            bond = bondFollowsBudget ? job.budget * BOND_BPS / 10_000 : 0;
            uint256 floor = _configs[jobId].bond;
            if (bond < floor) bond = floor;
            v.bond = bond;
        }
        if (stakeOf[msg.sender] - lockedOf[msg.sender] < bond) revert InsufficientStake();
        lockedOf[msg.sender] += bond;
        _votes[jobId][msg.sender] = ACCEPTED;
        emit Accepted(jobId, msg.sender, bond);
    }

    /// @notice Anyone, once the job is Submitted: starts the vote window (the first vote also
    /// starts it). Members that have not accepted yet can still accept until the window ends.
    function startVoting(uint256 jobId) external {
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Configured || v.voteEnds != 0) revert WrongPhase();
        ARLJobs.Job memory job = jobs.getJob(jobId);
        if (job.status != ARLJobs.JobStatus.Submitted) revert WrongJobStatus();
        _startVoting(jobId, v, job.expiredAt);
    }

    /// @notice Member that accepted only, once the job is Submitted, within the vote window and
    /// before a decision. Every approval must name the same deliverable (the hash the provider
    /// submitted, which the voter checked).
    function vote(uint256 jobId, bool approve, bytes32 deliverable, bytes32 evidence)
        external
        nonReentrant
    {
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Configured) revert WrongPhase();
        if (_votes[jobId][msg.sender] != ACCEPTED) revert Unauthorized();
        ARLJobs.Job memory job = jobs.getJob(jobId);
        if (job.status != ARLJobs.JobStatus.Submitted) revert WrongJobStatus();
        if (v.voteEnds == 0) {
            _startVoting(jobId, v, job.expiredAt);
            // slither-disable-next-line timestamp
        } else if (block.timestamp >= v.voteEnds) {
            revert VoteWindowClosed();
        }

        if (approve) {
            if (v.approvals == 0) v.deliverable = deliverable;
            else if (v.deliverable != deliverable) revert DeliverableMismatch();
            ++v.approvals;
            _votes[jobId][msg.sender] = APPROVED;
        } else {
            ++v.rejections;
            _votes[jobId][msg.sender] = REJECTED;
        }
        v.voteHash = keccak256(abi.encode(v.voteHash, msg.sender, approve, deliverable, evidence));
        emit Voted(jobId, msg.sender, approve, deliverable, evidence);

        Config storage cfg = _configs[jobId];
        uint256 threshold = cfg.threshold;
        if (v.approvals == threshold) {
            _decide(jobId, v, Phase.Approved, cfg.challengeWindow);
        } else if (v.rejections > cfg.committee.length - threshold) {
            _decide(jobId, v, Phase.Rejected, cfg.challengeWindow);
        }
    }

    /// @notice Anyone, once the vote window has ended without a decision: burns the bonds of the
    /// members who accepted but did not vote, unlocks those who voted, and refunds the client
    /// (also after the job's deadline).
    function closeUndecided(uint256 jobId) external nonReentrant {
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Configured || v.voteEnds == 0) revert WrongPhase();
        // slither-disable-next-line timestamp
        if (block.timestamp < v.voteEnds) revert VoteWindowOpen();
        v.phase = Phase.Failed;
        emit Failed(jobId);
        uint256 burned = _unlock(jobId, ABSENT, true);
        // The client is refunded either way: by rejecting before the deadline, through
        // `claimRefund` after it (unless someone already called it). Absent members are slashed
        // in every case.
        ARLJobs.Job memory job = jobs.getJob(jobId);
        if (job.status == ARLJobs.JobStatus.Submitted) {
            // slither-disable-next-line timestamp
            if (block.timestamp < job.expiredAt) jobs.reject(jobId, v.voteHash, "");
            else jobs.claimRefund(jobId);
        }
        if (burned != 0) stakeToken.safeTransfer(SLASH_SINK, burned);
    }

    /// @notice Anyone, within the challenge window: disputes the decision, escrowing a bond equal
    /// to the job's validator bond. The arbiter then rules.
    function dispute(uint256 jobId, bytes32 evidence) external nonReentrant {
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Approved && v.phase != Phase.Rejected) revert WrongPhase();
        // slither-disable-next-line timestamp
        if (block.timestamp >= v.challengeEnds) revert ChallengeWindowClosed();
        v.challenger = msg.sender;
        // The phase before the dispute stays readable from `approvals` versus the threshold.
        v.phase = Phase.Disputed;
        emit Disputed(jobId, msg.sender, evidence);
        stakeToken.safeTransferFrom(msg.sender, address(this), v.bond);
    }

    /// @notice Anyone, once the challenge window has passed without a dispute: pays the escrow to
    /// the provider (approved) or back to the client (rejected) and unlocks every bond.
    function finalize(uint256 jobId) external nonReentrant {
        Verdict storage v = _verdicts[jobId];
        Phase phase = v.phase;
        if (phase != Phase.Approved && phase != Phase.Rejected) revert WrongPhase();
        // slither-disable-next-line timestamp
        if (block.timestamp < v.challengeEnds) revert ChallengeWindowOpen();
        _unlock(jobId, 0, false);
        _settle(jobId, v, phase == Phase.Approved);
    }

    /// @notice Arbiter only, on a disputed job that is still Submitted. If the ruling overturns the
    /// decision, the bonds of the validators who voted for it are burned and the challenger gets
    /// its bond back; if it stands, the challenger's bond is burned.
    function resolve(uint256 jobId, bool approve, bytes32 reason) external nonReentrant {
        if (msg.sender != arbiter) revert Unauthorized();
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Disputed) revert WrongPhase();

        bool decidedApproved = v.approvals == _configs[jobId].threshold;
        bool overturned = approve != decidedApproved;
        emit Resolved(jobId, approve, overturned, reason);

        uint256 bond = v.bond;
        address challenger = v.challenger;
        uint256 burned = _unlock(jobId, decidedApproved ? APPROVED : REJECTED, overturned);
        if (!overturned) {
            emit Slashed(jobId, challenger, bond);
            burned += bond;
        }
        _settle(jobId, v, approve);
        if (burned != 0) stakeToken.safeTransfer(SLASH_SINK, burned);
        if (overturned) stakeToken.safeTransfer(challenger, bond);
    }

    /// @notice Anyone, once the job has left `ARLJobs` without this contract settling it (expired
    /// and refunded, or rejected by its client while Open): unlocks every bond and returns a
    /// challenger's bond. Nothing is slashed.
    function release(uint256 jobId) external nonReentrant {
        Verdict storage v = _verdicts[jobId];
        Phase phase = v.phase;
        if (
            phase == Phase.None || phase == Phase.Finalized || phase == Phase.Released
                || phase == Phase.Failed
        ) revert WrongPhase();
        ARLJobs.JobStatus status = jobs.getJob(jobId).status;
        if (status != ARLJobs.JobStatus.Expired && status != ARLJobs.JobStatus.Rejected) {
            revert WrongJobStatus();
        }
        v.phase = Phase.Released;
        emit Released(jobId);
        _unlock(jobId, 0, false);
        if (phase == Phase.Disputed) stakeToken.safeTransfer(v.challenger, v.bond);
    }

    // ---------------------------------------------------------------- views

    function getConfig(uint256 jobId) external view returns (Config memory) {
        return _configs[jobId];
    }

    function getVerdict(uint256 jobId) external view returns (Verdict memory) {
        return _verdicts[jobId];
    }

    /// @notice 0: not on the committee, 1: not accepted, 2: accepted, 3: approved, 4: rejected,
    /// 5: accepted but did not vote (bond burned).
    function voteOf(uint256 jobId, address validator) external view returns (uint8) {
        return _votes[jobId][validator];
    }

    // ---------------------------------------------------------------- internal

    function _checkWindows(uint64 voteWindow, uint64 challengeWindow, uint256 expiredAt)
        private
        view
    {
        if (voteWindow < MIN_VOTE_WINDOW || voteWindow > MAX_VOTE_WINDOW) {
            revert BadWindow();
        }
        if (challengeWindow < minChallengeWindow || challengeWindow > MAX_CHALLENGE_WINDOW) {
            revert BadWindow();
        }
        // slither-disable-next-line timestamp
        if (expiredAt < block.timestamp + voteWindow + 2 * uint256(challengeWindow)) {
            revert ExpiryTooSoon();
        }
    }

    /// Fallback: one validator, threshold one. Reexecution and Attested: a strict majority of at
    /// least two, at most the committee.
    function _checkThreshold(Tier tier, uint8 threshold, uint256 n) private pure {
        if (n == 0 || n > MAX_COMMITTEE) revert BadCommittee();
        if (tier == Tier.Fallback) {
            if (n != 1 || threshold != 1) revert BadThreshold();
        } else if (threshold < 2 || threshold > n || 2 * uint256(threshold) <= n) {
            revert BadThreshold();
        }
    }

    /// The vote window and both challenge windows must end before the job's deadline, so a
    /// decision can always be settled (or disputed and ruled on) while the escrow is still here.
    /// `configure` checks this against the time of configuration; the client may fund and the
    /// provider submit later, so it is checked again when members accept and when voting starts.
    function _checkFits(uint256 jobId, uint256 expiredAt) private view {
        Config storage cfg = _configs[jobId];
        // slither-disable-next-line timestamp
        if (expiredAt < block.timestamp + cfg.voteWindow + 2 * uint256(cfg.challengeWindow)) {
            revert ExpiryTooSoon();
        }
    }

    function _startVoting(uint256 jobId, Verdict storage v, uint256 expiredAt) private {
        _checkFits(jobId, expiredAt);
        // slither-disable-next-line timestamp
        uint64 ends = uint64(block.timestamp) + _configs[jobId].voteWindow;
        v.voteEnds = ends;
        emit VotingStarted(jobId, ends);
    }

    function _decide(uint256 jobId, Verdict storage v, Phase phase, uint64 window) private {
        v.phase = phase;
        // slither-disable-next-line timestamp
        uint64 ends = uint64(block.timestamp) + window;
        v.challengeEnds = ends;
        emit Decided(jobId, phase == Phase.Approved, ends);
    }

    /// Unlocks the bond of every member that accepted. With `slash`, the bonds of members whose
    /// state is `slashState` are also taken from their stake (an ABSENT slash applies to members
    /// that accepted and did not vote); the caller burns the returned total.
    function _unlock(uint256 jobId, uint8 slashState, bool slash) private returns (uint256 burned) {
        Config storage cfg = _configs[jobId];
        uint256 bond = _verdicts[jobId].bond;
        uint256 n = cfg.committee.length;
        for (uint256 i; i < n; ++i) {
            address member = cfg.committee[i];
            uint8 state = _votes[jobId][member];
            if (state < ACCEPTED || state == ABSENT) continue;
            lockedOf[member] -= bond;
            bool absent = state == ACCEPTED && slashState == ABSENT;
            if (slash && (state == slashState || absent)) {
                stakeOf[member] -= bond;
                burned += bond;
                if (absent) _votes[jobId][member] = ABSENT;
                emit Slashed(jobId, member, bond);
            }
        }
    }

    function _settle(uint256 jobId, Verdict storage v, bool approved) private {
        v.phase = Phase.Finalized;
        bytes32 voteHash = v.voteHash;
        emit Finalized(jobId, approved, voteHash);
        if (approved) jobs.complete(jobId, voteHash, "");
        else jobs.reject(jobId, voteHash, "");
        _feedback(jobId, approved);
    }

    /// Writes the outcome to the provider's ERC-8004 reputation: 100 for an approved job, 0 for a
    /// rejected one; the feedback hash is the job's vote hash (also in `Finalized`). Skipped
    /// without a registry, without an agent id, or when the agent is not owned by the job's
    /// provider. A failing registry never blocks settlement.
    function _feedback(uint256 jobId, bool approved) private {
        uint256 agentId = _configs[jobId].providerAgentId;
        if (agentId == 0 || address(reputation) == address(0) || address(identity) == address(0)) {
            return;
        }
        (bool ok, bool owned) = _ownedBy(agentId, jobs.getJob(jobId).provider);
        if (!ok) emit FeedbackFailed(jobId, agentId);
        if (!owned) return;
        try reputation.giveFeedback{gas: REGISTRY_GAS}(
            agentId,
            approved ? int128(100) : int128(0),
            0,
            FEEDBACK_TAG,
            _tierName(_configs[jobId].tier),
            "",
            "",
            _verdicts[jobId].voteHash
        ) {}
        catch {
            emit FeedbackFailed(jobId, agentId);
        }
    }

    /// `identity.ownerOf(agentId) == account`, with a gas cap and at most one word of return data
    /// copied, so that a broken registry cannot block settlement. `ok` is false when the call
    /// reverts or returns less than a word.
    function _ownedBy(uint256 agentId, address account) private view returns (bool ok, bool owned) {
        address registry = address(identity);
        bytes4 selector = IERC8004Identity.ownerOf.selector;
        uint256 size;
        uint256 word;
        // slither-disable-next-line assembly
        assembly ("memory-safe") {
            mstore(0x00, selector)
            mstore(0x04, agentId)
            ok := staticcall(REGISTRY_GAS, registry, 0x00, 0x24, 0x00, 0x20)
            size := returndatasize()
            word := mload(0x00)
        }
        ok = ok && size >= 32;
        owned = ok && word == uint256(uint160(account));
    }

    function _tierName(Tier tier) private pure returns (string memory) {
        if (tier == Tier.Fallback) return "fallback";
        if (tier == Tier.Reexecution) return "reexecution";
        return "attested";
    }
}
