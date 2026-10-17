// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {ARLJobs} from "./ARLJobs.sol";

/// @dev The subset of the ERC-8004 IdentityRegistry used here (an ERC-721).
interface IERC8004Identity {
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @dev The subset of the ERC-8004 ReputationRegistry used here.
interface IERC8004Reputation {
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
/// @notice An `ARLJobs` client names this contract as the job's evaluator and, while the job is
/// Open, picks a committee of staked validators, a threshold and a bond. After the provider
/// submits, each committee member checks the work (re-executes it, or checks a TEE or proof
/// attestation, as the job's spec says) and votes, locking its bond. Once the threshold approves,
/// or approval can no longer be reached, the decision waits out a challenge window. Without a
/// dispute anyone finalizes it: the escrow goes to the provider (approved) or back to the client
/// (rejected), and the outcome is written to the provider's ERC-8004 reputation. With a dispute,
/// the arbiter rules; the bonds of the validators who voted for the overturned decision, or the
/// challenger's bond if the decision stands, are sent to an unspendable address.
///
/// Trust bounds:
/// - no owner and no upgrade; every parameter is fixed at deployment;
/// - the arbiter only rules on disputed jobs, can only pay the escrow to the client or the
///   provider, and never receives slashed bonds (they are burned), so it cannot profit from a
///   ruling;
/// - if nothing is decided before the job's deadline, `ARLJobs.claimRefund` returns the escrow to
///   the client and `release` unlocks every bond here: no state can lock funds.
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
        Released
    }

    struct Config {
        Tier tier;
        uint8 threshold;
        uint96 bond;
        uint256 providerAgentId;
        bytes32 specHash;
        address[] committee;
    }

    struct Verdict {
        Phase phase;
        uint8 approvals;
        uint8 rejections;
        uint64 challengeEnds;
        address challenger;
        bytes32 deliverable;
        bytes32 voteHash;
    }

    /// @notice Largest committee a job can name.
    uint256 public constant MAX_COMMITTEE = 7;
    /// @notice Where slashed bonds go: an address nobody controls.
    address public constant SLASH_SINK = 0x000000000000000000000000000000000000dEaD;
    /// @notice ERC-8004 feedback tag written for every finalized job.
    string public constant FEEDBACK_TAG = "arl-verified";
    /// @notice Gas forwarded to each ERC-8004 registry call.
    uint256 public constant REGISTRY_GAS = 300_000;

    ARLJobs public immutable jobs;
    IERC20 public immutable stakeToken;
    address public immutable arbiter;
    uint64 public immutable challengeWindow;
    uint96 public immutable minBond;
    IERC8004Identity public immutable identity;
    IERC8004Reputation public immutable reputation;

    mapping(address validator => uint256) public stakeOf;
    mapping(address validator => uint256) public lockedOf;

    mapping(uint256 jobId => Config) private _configs;
    mapping(uint256 jobId => Verdict) private _verdicts;
    /// 0: not on the committee, 1: on it and not voted, 2: approved, 3: rejected.
    mapping(uint256 jobId => mapping(address validator => uint8)) private _votes;

    event Staked(address indexed validator, uint256 amount);
    event Unstaked(address indexed validator, uint256 amount);
    event Configured(
        uint256 indexed jobId,
        Tier tier,
        uint8 threshold,
        uint96 bond,
        uint256 providerAgentId,
        bytes32 specHash,
        address[] committee
    );
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
    event Finalized(uint256 indexed jobId, bool approved, bytes32 voteHash);
    event Released(uint256 indexed jobId);
    event FeedbackFailed(uint256 indexed jobId, uint256 agentId);

    error ZeroAddress();
    error Unauthorized();
    error WrongPhase();
    error WrongJobStatus();
    error BadCommittee();
    error BadThreshold();
    error BondTooLow();
    error ExpiryTooSoon();
    error InsufficientStake();
    error DeliverableMismatch();
    error ConflictOfInterest();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error ZeroAmount();
    error BadWindow();

    constructor(
        ARLJobs jobs_,
        IERC20 stakeToken_,
        address arbiter_,
        uint64 challengeWindow_,
        uint96 minBond_,
        IERC8004Identity identity_,
        IERC8004Reputation reputation_
    ) {
        if (
            address(jobs_) == address(0) || address(stakeToken_) == address(0)
                || arbiter_ == address(0)
        ) revert ZeroAddress();
        if (challengeWindow_ == 0) revert BadWindow();
        if (minBond_ == 0) revert BondTooLow();
        jobs = jobs_;
        stakeToken = stakeToken_;
        arbiter = arbiter_;
        challengeWindow = challengeWindow_;
        minBond = minBond_;
        identity = identity_;
        reputation = reputation_;
    }

    // ---------------------------------------------------------------- validator stake

    /// @notice Adds stake. Any account can be a validator; a client picks who checks its job.
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        stakeOf[msg.sender] += amount;
        emit Staked(msg.sender, amount);
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraws stake that no vote has locked.
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
    /// threshold of at least two. The job's deadline must leave room for two challenge windows
    /// (votes and the challenge itself, then a ruling).
    function configure(uint256 jobId, Config calldata cfg) external {
        ARLJobs.Job memory job = jobs.getJob(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (job.status != ARLJobs.JobStatus.Open || job.evaluator != address(this)) {
            revert WrongJobStatus();
        }
        if (_verdicts[jobId].phase != Phase.None) revert WrongPhase();
        // slither-disable-next-line timestamp
        if (job.expiredAt < block.timestamp + 2 * uint256(challengeWindow)) revert ExpiryTooSoon();
        if (cfg.bond < minBond) revert BondTooLow();

        _checkThreshold(cfg.tier, cfg.threshold, cfg.committee.length);
        for (uint256 i; i < cfg.committee.length; ++i) {
            address v = cfg.committee[i];
            if (v == address(0) || v == job.client || _votes[jobId][v] != 0) revert BadCommittee();
            _votes[jobId][v] = 1;
        }

        _configs[jobId] = cfg;
        _verdicts[jobId].phase = Phase.Configured;
        emit Configured(
            jobId,
            cfg.tier,
            cfg.threshold,
            cfg.bond,
            cfg.providerAgentId,
            cfg.specHash,
            cfg.committee
        );
    }

    /// @notice Committee member only, once the job is Submitted and before a decision: votes and
    /// locks the job's bond from the caller's stake. Every approval must name the same
    /// deliverable (the hash the provider submitted, which the voter checked).
    function vote(uint256 jobId, bool approve, bytes32 deliverable, bytes32 evidence)
        external
        nonReentrant
    {
        Verdict storage v = _verdicts[jobId];
        if (v.phase != Phase.Configured) revert WrongPhase();
        if (_votes[jobId][msg.sender] != 1) revert Unauthorized();
        ARLJobs.Job memory job = jobs.getJob(jobId);
        if (job.status != ARLJobs.JobStatus.Submitted) revert WrongJobStatus();
        if (msg.sender == job.provider) revert ConflictOfInterest();

        Config storage cfg = _configs[jobId];
        uint256 bond = cfg.bond;
        if (stakeOf[msg.sender] - lockedOf[msg.sender] < bond) revert InsufficientStake();
        lockedOf[msg.sender] += bond;

        if (approve) {
            if (v.approvals == 0) v.deliverable = deliverable;
            else if (v.deliverable != deliverable) revert DeliverableMismatch();
            ++v.approvals;
            _votes[jobId][msg.sender] = 2;
        } else {
            ++v.rejections;
            _votes[jobId][msg.sender] = 3;
        }
        v.voteHash = keccak256(abi.encode(v.voteHash, msg.sender, approve, deliverable, evidence));
        emit Voted(jobId, msg.sender, approve, deliverable, evidence);

        uint256 threshold = cfg.threshold;
        if (v.approvals == threshold) {
            _decide(jobId, v, Phase.Approved);
        } else if (v.rejections > cfg.committee.length - threshold) {
            _decide(jobId, v, Phase.Rejected);
        }
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
        stakeToken.safeTransferFrom(msg.sender, address(this), _configs[jobId].bond);
    }

    /// @notice Anyone, once the challenge window has passed without a dispute: pays the escrow to
    /// the provider (approved) or back to the client (rejected) and unlocks every bond.
    function finalize(uint256 jobId) external nonReentrant {
        Verdict storage v = _verdicts[jobId];
        Phase phase = v.phase;
        if (phase != Phase.Approved && phase != Phase.Rejected) revert WrongPhase();
        // slither-disable-next-line timestamp
        if (block.timestamp < v.challengeEnds) revert ChallengeWindowOpen();
        _unlockVoters(jobId, false, false);
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

        uint256 bond = _configs[jobId].bond;
        address challenger = v.challenger;
        uint256 burned = _unlockVoters(jobId, overturned, decidedApproved);
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
        if (phase == Phase.None || phase == Phase.Finalized || phase == Phase.Released) {
            revert WrongPhase();
        }
        ARLJobs.JobStatus status = jobs.getJob(jobId).status;
        if (status != ARLJobs.JobStatus.Expired && status != ARLJobs.JobStatus.Rejected) {
            revert WrongJobStatus();
        }
        v.phase = Phase.Released;
        emit Released(jobId);
        _unlockVoters(jobId, false, false);
        if (phase == Phase.Disputed) stakeToken.safeTransfer(v.challenger, _configs[jobId].bond);
    }

    // ---------------------------------------------------------------- views

    function getConfig(uint256 jobId) external view returns (Config memory) {
        return _configs[jobId];
    }

    function getVerdict(uint256 jobId) external view returns (Verdict memory) {
        return _verdicts[jobId];
    }

    /// @notice 0: not on the committee, 1: not voted, 2: approved, 3: rejected.
    function voteOf(uint256 jobId, address validator) external view returns (uint8) {
        return _votes[jobId][validator];
    }

    // ---------------------------------------------------------------- internal

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

    function _decide(uint256 jobId, Verdict storage v, Phase phase) private {
        v.phase = phase;
        // slither-disable-next-line timestamp
        uint64 ends = uint64(block.timestamp) + challengeWindow;
        v.challengeEnds = ends;
        emit Decided(jobId, phase == Phase.Approved, ends);
    }

    /// Unlocks the bond of every committee member that voted. With `slash`, the bonds of those
    /// who voted for the overturned decision (`slashApprovers`: the approvers, else the
    /// rejecters) are taken from their stake; the caller burns the returned total.
    function _unlockVoters(uint256 jobId, bool slash, bool slashApprovers)
        private
        returns (uint256 burned)
    {
        Config storage cfg = _configs[jobId];
        uint256 bond = cfg.bond;
        uint8 losing = slashApprovers ? 2 : 3;
        uint256 n = cfg.committee.length;
        for (uint256 i; i < n; ++i) {
            address member = cfg.committee[i];
            uint8 cast = _votes[jobId][member];
            if (cast < 2) continue;
            lockedOf[member] -= bond;
            if (slash && cast == losing) {
                stakeOf[member] -= bond;
                burned += bond;
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
