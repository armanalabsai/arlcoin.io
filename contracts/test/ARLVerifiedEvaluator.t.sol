// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../src/ARLJobs.sol";
import {
    ARLVerifiedEvaluator,
    IERC8004Identity,
    IERC8004Reputation
} from "../src/ARLVerifiedEvaluator.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev Stand-in for the ERC-8004 IdentityRegistry: settable owners, or a registry that reverts or
/// returns malformed data.
contract MockIdentity is IERC8004Identity {
    mapping(uint256 => address) public owners;
    uint8 public mode; // 0: normal, 1: revert, 2: short return data

    function setOwner(uint256 id, address owner) external {
        owners[id] = owner;
    }

    function setMode(uint8 m) external {
        mode = m;
    }

    function ownerOf(uint256 id) external view returns (address) {
        if (mode == 1) revert("no agent");
        if (mode == 2) {
            assembly {
                mstore(0, 1)
                return(0, 1)
            }
        }
        return owners[id];
    }
}

/// @dev Stand-in for the ERC-8004 ReputationRegistry: records the last feedback, or reverts, or
/// burns all its gas. `giveFeedback` is decoded by hand from the fallback: its eight parameters
/// are too many for the unoptimized build that `forge coverage` uses.
contract MockReputation {
    uint8 public mode; // 0: record, 1: revert, 2: burn gas
    uint256 public count;
    uint256 public lastAgent;
    int128 public lastValue;
    string public lastTag1;
    string public lastTag2;
    bytes32 public lastHash;
    address public lastSender;

    function setMode(uint8 m) external {
        mode = m;
    }

    fallback() external {
        require(msg.sig == IERC8004Reputation.giveFeedback.selector, "unknown");
        if (mode == 1) revert("refused");
        if (mode == 2) {
            while (true) {}
        }
        (lastAgent, lastValue,, lastTag1, lastTag2) =
            abi.decode(msg.data[4:], (uint256, int128, uint8, string, string));
        lastHash = bytes32(msg.data[4 + 7 * 32:4 + 8 * 32]);
        lastSender = msg.sender;
        ++count;
    }
}

contract ARLVerifiedEvaluatorTest is ARLTestBase {
    ARLJobs internal jobs;
    ARLVerifiedEvaluator internal ev;
    MockIdentity internal identity;
    MockReputation internal reputation;
    IERC8004Reputation internal rep;

    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal arbiter = makeAddr("arbiter");
    address internal challenger = makeAddr("challenger");
    address internal stranger = makeAddr("stranger");
    address internal v1 = makeAddr("v1");
    address internal v2 = makeAddr("v2");
    address internal v3 = makeAddr("v3");

    address internal constant SINK = 0x000000000000000000000000000000000000dEaD;
    uint64 internal constant WINDOW = 1 days;
    uint96 internal constant MIN_BOND = 10 ether;
    uint96 internal constant BOND = 50 ether;
    uint256 internal constant STAKE = 1_000 ether;
    uint256 internal constant BUDGET = 250 ether;
    uint256 internal constant AGENT = 42;
    bytes32 internal constant WORK = keccak256("result");
    bytes32 internal constant SPEC = keccak256("spec");
    bytes32 internal constant EVIDENCE = keccak256("evidence");

    function setUp() public override {
        super.setUp();
        jobs = new ARLJobs(IERC20(address(token)));
        identity = new MockIdentity();
        reputation = new MockReputation();
        ev = new ARLVerifiedEvaluator(
            jobs,
            IERC20(address(token)),
            arbiter,
            WINDOW,
            MIN_BOND,
            identity,
            IERC8004Reputation(address(reputation))
        );
        rep = IERC8004Reputation(address(reputation));
        identity.setOwner(AGENT, provider);

        address[5] memory funded = [client, challenger, v1, v2, v3];
        for (uint256 i; i < funded.length; ++i) {
            vm.prank(launchSafe);
            token.transfer(funded[i], 10_000 ether);
            vm.startPrank(funded[i]);
            token.approve(address(jobs), type(uint256).max);
            token.approve(address(ev), type(uint256).max);
            vm.stopPrank();
        }
        address[3] memory validators = [v1, v2, v3];
        for (uint256 i; i < validators.length; ++i) {
            vm.prank(validators[i]);
            ev.stake(STAKE);
        }
    }

    // ---------------------------------------------------------------- helpers

    function _committee3() internal view returns (address[] memory c) {
        c = new address[](3);
        c[0] = v1;
        c[1] = v2;
        c[2] = v3;
    }

    function _cfg(ARLVerifiedEvaluator.Tier tier, address[] memory committee, uint8 threshold)
        internal
        pure
        returns (ARLVerifiedEvaluator.Config memory)
    {
        return ARLVerifiedEvaluator.Config({
            tier: tier,
            threshold: threshold,
            bond: BOND,
            providerAgentId: AGENT,
            specHash: SPEC,
            committee: committee
        });
    }

    function _create(address evaluator, uint256 duration) internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(provider, evaluator, block.timestamp + duration, "job", address(0));
    }

    function _configured(ARLVerifiedEvaluator.Config memory cfg) internal returns (uint256 id) {
        id = _create(address(ev), 7 days);
        vm.prank(client);
        ev.configure(id, cfg);
    }

    function _submit(uint256 id) internal {
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        vm.prank(provider);
        jobs.submit(id, WORK, "");
    }

    /// A 2-of-3 Reexecution job, submitted.
    function _submitted() internal returns (uint256 id) {
        id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2));
        _submit(id);
    }

    function _vote(uint256 id, address v, bool approve) internal {
        vm.prank(v);
        ev.vote(id, approve, WORK, EVIDENCE);
    }

    function _approved() internal returns (uint256 id) {
        id = _submitted();
        _vote(id, v1, true);
        _vote(id, v2, true);
    }

    function _rejected() internal returns (uint256 id) {
        id = _submitted();
        _vote(id, v1, false);
        _vote(id, v2, false);
    }

    function _phase(uint256 id) internal view returns (ARLVerifiedEvaluator.Phase) {
        return ev.getVerdict(id).phase;
    }

    function _status(uint256 id) internal view returns (ARLJobs.JobStatus) {
        return jobs.getJob(id).status;
    }

    function _free(address v) internal view returns (uint256) {
        return ev.stakeOf(v) - ev.lockedOf(v);
    }

    // ---------------------------------------------------------------- constructor

    function test_constructor() public view {
        assertEq(address(ev.jobs()), address(jobs));
        assertEq(address(ev.stakeToken()), address(token));
        assertEq(ev.arbiter(), arbiter);
        assertEq(ev.challengeWindow(), WINDOW);
        assertEq(ev.minBond(), MIN_BOND);
        assertEq(address(ev.identity()), address(identity));
        assertEq(address(ev.reputation()), address(reputation));
        assertEq(ev.SLASH_SINK(), SINK);
        assertEq(ev.MAX_COMMITTEE(), 7);
    }

    function test_RevertWhen_ConstructorZeroAddress() public {
        IERC20 t = IERC20(address(token));
        vm.expectRevert(ARLVerifiedEvaluator.ZeroAddress.selector);
        new ARLVerifiedEvaluator(ARLJobs(address(0)), t, arbiter, WINDOW, MIN_BOND, identity, rep);
        vm.expectRevert(ARLVerifiedEvaluator.ZeroAddress.selector);
        new ARLVerifiedEvaluator(jobs, IERC20(address(0)), arbiter, WINDOW, MIN_BOND, identity, rep);
        vm.expectRevert(ARLVerifiedEvaluator.ZeroAddress.selector);
        new ARLVerifiedEvaluator(jobs, t, address(0), WINDOW, MIN_BOND, identity, rep);
        vm.expectRevert(ARLVerifiedEvaluator.BadWindow.selector);
        new ARLVerifiedEvaluator(jobs, t, arbiter, 0, MIN_BOND, identity, rep);
        vm.expectRevert(ARLVerifiedEvaluator.BondTooLow.selector);
        new ARLVerifiedEvaluator(jobs, t, arbiter, WINDOW, 0, identity, rep);
    }

    // ---------------------------------------------------------------- stake

    function test_stakeAndUnstake() public {
        assertEq(ev.stakeOf(v1), STAKE);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Unstaked(v1, 100 ether);
        vm.prank(v1);
        ev.unstake(100 ether);
        assertEq(ev.stakeOf(v1), STAKE - 100 ether);
        assertEq(token.balanceOf(v1), 10_000 ether - STAKE + 100 ether);
    }

    function test_RevertWhen_StakeZero() public {
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.ZeroAmount.selector);
        ev.stake(0);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.ZeroAmount.selector);
        ev.unstake(0);
    }

    function test_RevertWhen_UnstakeLocked() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        assertEq(ev.lockedOf(v1), BOND);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.InsufficientStake.selector);
        ev.unstake(STAKE - BOND + 1);
        vm.prank(v1);
        ev.unstake(STAKE - BOND);
        assertEq(ev.stakeOf(v1), BOND);
    }

    // ---------------------------------------------------------------- configure

    function test_configure() public {
        uint256 id = _create(address(ev), 7 days);
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Configured(
            id, ARLVerifiedEvaluator.Tier.Reexecution, 2, BOND, AGENT, SPEC, _committee3()
        );
        vm.prank(client);
        ev.configure(id, cfg);

        ARLVerifiedEvaluator.Config memory got = ev.getConfig(id);
        assertEq(got.threshold, 2);
        assertEq(got.bond, BOND);
        assertEq(got.specHash, SPEC);
        assertEq(got.committee.length, 3);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Configured));
        assertEq(ev.voteOf(id, v1), 1);
        assertEq(ev.voteOf(id, stranger), 0);
    }

    function test_configureFallback() public {
        address[] memory one = new address[](1);
        one[0] = v1;
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Fallback, one, 1));
        assertEq(uint256(ev.getConfig(id).tier), uint256(ARLVerifiedEvaluator.Tier.Fallback));
    }

    function test_RevertWhen_ConfigureNotClient() public {
        uint256 id = _create(address(ev), 7 days);
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureOtherEvaluatorOrNotOpen() public {
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
        uint256 other = _create(stranger, 7 days);
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.configure(other, cfg);

        uint256 id = _create(address(ev), 7 days);
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureTwice() public {
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
        uint256 id = _configured(cfg);
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureExpiryTooSoon() public {
        uint256 id = _create(address(ev), 2 * WINDOW - 1);
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.ExpiryTooSoon.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureBondTooLow() public {
        uint256 id = _create(address(ev), 7 days);
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
        cfg.bond = MIN_BOND - 1;
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.BondTooLow.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureBadCommittee() public {
        uint256 id = _create(address(ev), 7 days);
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, new address[](0), 1);
        vm.startPrank(client);
        vm.expectRevert(ARLVerifiedEvaluator.BadCommittee.selector);
        ev.configure(id, cfg);

        cfg.committee = new address[](8);
        vm.expectRevert(ARLVerifiedEvaluator.BadCommittee.selector);
        ev.configure(id, cfg);

        address[] memory c = _committee3();
        c[2] = v1; // duplicate
        cfg.committee = c;
        cfg.threshold = 2;
        vm.expectRevert(ARLVerifiedEvaluator.BadCommittee.selector);
        ev.configure(id, cfg);

        c[2] = address(0);
        vm.expectRevert(ARLVerifiedEvaluator.BadCommittee.selector);
        ev.configure(id, cfg);

        c[2] = client;
        vm.expectRevert(ARLVerifiedEvaluator.BadCommittee.selector);
        ev.configure(id, cfg);
        vm.stopPrank();
    }

    function test_RevertWhen_ConfigureBadThreshold() public {
        uint256 id = _create(address(ev), 7 days);
        vm.startPrank(client);
        // Fallback: exactly one validator, threshold one.
        vm.expectRevert(ARLVerifiedEvaluator.BadThreshold.selector);
        ev.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Fallback, _committee3(), 1));
        address[] memory one = new address[](1);
        one[0] = v1;
        vm.expectRevert(ARLVerifiedEvaluator.BadThreshold.selector);
        ev.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Fallback, one, 2));
        // Checked tiers: threshold at least two and a strict majority.
        vm.expectRevert(ARLVerifiedEvaluator.BadThreshold.selector);
        ev.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Reexecution, one, 1));
        address[] memory four = new address[](4);
        four[0] = v1;
        four[1] = v2;
        four[2] = v3;
        four[3] = stranger;
        vm.expectRevert(ARLVerifiedEvaluator.BadThreshold.selector);
        ev.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Attested, four, 2));
        vm.expectRevert(ARLVerifiedEvaluator.BadThreshold.selector);
        ev.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Attested, _committee3(), 4));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- vote

    function test_voteApprovesAtThreshold() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Configured));
        assertEq(ev.voteOf(id, v1), 2);

        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Decided(id, true, uint64(block.timestamp) + WINDOW);
        _vote(id, v2, true);

        ARLVerifiedEvaluator.Verdict memory v = ev.getVerdict(id);
        assertEq(uint256(v.phase), uint256(ARLVerifiedEvaluator.Phase.Approved));
        assertEq(v.approvals, 2);
        assertEq(v.deliverable, WORK);
        assertEq(v.challengeEnds, block.timestamp + WINDOW);
        assertEq(ev.lockedOf(v1), BOND);
        assertEq(ev.lockedOf(v2), BOND);
        assertEq(ev.lockedOf(v3), 0);

        // A late vote is refused once decided.
        vm.prank(v3);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.vote(id, false, WORK, EVIDENCE);
    }

    function test_voteRejectsWhenApprovalUnreachable() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        _vote(id, v2, false);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Configured));
        _vote(id, v3, false);
        ARLVerifiedEvaluator.Verdict memory v = ev.getVerdict(id);
        assertEq(uint256(v.phase), uint256(ARLVerifiedEvaluator.Phase.Rejected));
        assertEq(v.rejections, 2);
        assertEq(ev.voteOf(id, v3), 3);
    }

    function test_RevertWhen_VoteBadCaller() public {
        uint256 id = _submitted();
        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.vote(id, true, WORK, EVIDENCE);
        _vote(id, v1, true);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.vote(id, true, WORK, EVIDENCE);
    }

    function test_RevertWhen_VoteUnconfigured() public {
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.vote(99, true, WORK, EVIDENCE);
    }

    function test_RevertWhen_VoteBeforeSubmission() public {
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2));
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.vote(id, true, WORK, EVIDENCE);
    }

    function test_RevertWhen_VoteByProvider() public {
        address[] memory c = _committee3();
        c[2] = provider;
        vm.prank(provider);
        token.approve(address(ev), type(uint256).max);
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Reexecution, c, 2));
        _submit(id);
        vm.prank(provider);
        vm.expectRevert(ARLVerifiedEvaluator.ConflictOfInterest.selector);
        ev.vote(id, true, WORK, EVIDENCE);
    }

    function test_RevertWhen_VoteWithoutFreeStake() public {
        uint256 id = _submitted();
        vm.prank(v1);
        ev.unstake(STAKE - BOND + 1);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.InsufficientStake.selector);
        ev.vote(id, true, WORK, EVIDENCE);
    }

    function test_RevertWhen_VoteDeliverableMismatch() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        vm.prank(v2);
        vm.expectRevert(ARLVerifiedEvaluator.DeliverableMismatch.selector);
        ev.vote(id, true, keccak256("other"), EVIDENCE);
    }

    // ---------------------------------------------------------------- finalize

    function test_finalizeApprovedPaysProviderAndWritesReputation() public {
        uint256 id = _approved();
        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.ChallengeWindowOpen.selector);
        ev.finalize(id);

        vm.warp(block.timestamp + WINDOW);
        bytes32 voteHash = ev.getVerdict(id).voteHash;
        uint256 before = token.balanceOf(provider);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Finalized(id, true, voteHash);
        vm.prank(stranger);
        ev.finalize(id);

        assertEq(token.balanceOf(provider), before + BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Finalized));
        assertEq(ev.lockedOf(v1), 0);
        assertEq(ev.lockedOf(v2), 0);
        assertEq(ev.stakeOf(v1), STAKE);

        assertEq(reputation.count(), 1);
        assertEq(reputation.lastAgent(), AGENT);
        assertEq(reputation.lastValue(), 100);
        assertEq(reputation.lastTag1(), "arl-verified");
        assertEq(reputation.lastTag2(), "reexecution");
        assertEq(reputation.lastHash(), voteHash);
        assertEq(reputation.lastSender(), address(ev));

        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.finalize(id);
    }

    function test_finalizeRejectedRefundsClient() public {
        uint256 id = _rejected();
        vm.warp(block.timestamp + WINDOW);
        uint256 before = token.balanceOf(client);
        ev.finalize(id);
        assertEq(token.balanceOf(client), before + BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Rejected));
        assertEq(reputation.lastValue(), 0);
    }

    function test_finalizeFallbackTag() public {
        address[] memory one = new address[](1);
        one[0] = v1;
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Fallback, one, 1));
        _submit(id);
        _vote(id, v1, true);
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(reputation.lastTag2(), "fallback");
    }

    function test_finalizeAttestedTag() public {
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Attested, _committee3(), 2));
        _submit(id);
        _vote(id, v1, true);
        _vote(id, v2, true);
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(reputation.lastTag2(), "attested");
    }

    function test_RevertWhen_FinalizeUndecided() public {
        uint256 id = _submitted();
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.finalize(id);
    }

    // ---------------------------------------------------------------- reputation edge cases

    function test_feedbackSkippedWhenAgentNotProviders() public {
        identity.setOwner(AGENT, stranger);
        uint256 id = _approved();
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(reputation.count(), 0);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
    }

    function test_feedbackSkippedWithoutAgentId() public {
        ARLVerifiedEvaluator.Config memory cfg =
            _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
        cfg.providerAgentId = 0;
        uint256 id = _configured(cfg);
        _submit(id);
        _vote(id, v1, true);
        _vote(id, v2, true);
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(reputation.count(), 0);
    }

    function test_feedbackSkippedWithoutRegistries() public {
        ARLVerifiedEvaluator bare = new ARLVerifiedEvaluator(
            jobs,
            IERC20(address(token)),
            arbiter,
            WINDOW,
            MIN_BOND,
            IERC8004Identity(address(0)),
            IERC8004Reputation(address(0))
        );
        vm.prank(v1);
        token.approve(address(bare), type(uint256).max);
        vm.prank(v1);
        bare.stake(BOND);
        address[] memory one = new address[](1);
        one[0] = v1;
        uint256 id = _create(address(bare), 7 days);
        vm.prank(client);
        bare.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Fallback, one, 1));
        _submit(id);
        vm.prank(v1);
        bare.vote(id, true, WORK, EVIDENCE);
        vm.warp(block.timestamp + WINDOW);
        bare.finalize(id);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
        assertEq(reputation.count(), 0);

        ARLVerifiedEvaluator noIdentity = new ARLVerifiedEvaluator(
            jobs,
            IERC20(address(token)),
            arbiter,
            WINDOW,
            MIN_BOND,
            IERC8004Identity(address(0)),
            rep
        );
        vm.prank(v1);
        token.approve(address(noIdentity), type(uint256).max);
        vm.prank(v1);
        noIdentity.stake(BOND);
        id = _create(address(noIdentity), 7 days);
        vm.prank(client);
        noIdentity.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Fallback, one, 1));
        _submit(id);
        vm.prank(v1);
        noIdentity.vote(id, true, WORK, EVIDENCE);
        vm.warp(block.timestamp + WINDOW);
        noIdentity.finalize(id);
        assertEq(reputation.count(), 0);
    }

    function test_feedbackFailureNeverBlocksSettlement() public {
        uint8[3] memory identityModes = [1, 2, 0];
        uint8[3] memory reputationModes = [0, 0, 1];
        for (uint256 i; i < 3; ++i) {
            identity.setMode(identityModes[i]);
            reputation.setMode(reputationModes[i]);
            uint256 id = _approved();
            vm.warp(block.timestamp + WINDOW);
            vm.expectEmit(address(ev));
            emit ARLVerifiedEvaluator.FeedbackFailed(id, AGENT);
            ev.finalize(id);
            assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
        }
        // A registry that burns all its gas is cut off at the cap.
        reputation.setMode(2);
        identity.setMode(0);
        uint256 last = _approved();
        vm.warp(block.timestamp + WINDOW);
        ev.finalize{gas: 1_000_000}(last);
        assertEq(uint256(_status(last)), uint256(ARLJobs.JobStatus.Completed));
        assertEq(reputation.count(), 0);
    }

    // ---------------------------------------------------------------- dispute and resolve

    function test_disputeEscrowsBond() public {
        uint256 id = _approved();
        uint256 before = token.balanceOf(challenger);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Disputed(id, challenger, EVIDENCE);
        vm.prank(challenger);
        ev.dispute(id, EVIDENCE);
        assertEq(token.balanceOf(challenger), before - BOND);
        ARLVerifiedEvaluator.Verdict memory v = ev.getVerdict(id);
        assertEq(uint256(v.phase), uint256(ARLVerifiedEvaluator.Phase.Disputed));
        assertEq(v.challenger, challenger);

        // A disputed job cannot be finalized or disputed again.
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.finalize(id);
        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.dispute(id, EVIDENCE);
    }

    function test_RevertWhen_DisputeOutsideWindow() public {
        uint256 id = _submitted();
        vm.prank(challenger);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.dispute(id, EVIDENCE);
        _vote(id, v1, true);
        _vote(id, v2, true);
        vm.warp(block.timestamp + WINDOW);
        vm.prank(challenger);
        vm.expectRevert(ARLVerifiedEvaluator.ChallengeWindowClosed.selector);
        ev.dispute(id, EVIDENCE);
    }

    function test_resolveOverturnsWrongApproval() public {
        uint256 id = _submitted();
        _vote(id, v3, false);
        _vote(id, v1, true);
        _vote(id, v2, true);
        vm.prank(challenger);
        ev.dispute(id, EVIDENCE);

        uint256 clientBefore = token.balanceOf(client);
        uint256 challengerBefore = token.balanceOf(challenger);
        vm.prank(arbiter);
        ev.resolve(id, false, keccak256("re-ran: output differs"));

        // Escrow back to the client; approvers slashed; the dissenting validator is untouched.
        assertEq(token.balanceOf(client), clientBefore + BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Rejected));
        assertEq(ev.stakeOf(v1), STAKE - BOND);
        assertEq(ev.stakeOf(v2), STAKE - BOND);
        assertEq(ev.stakeOf(v3), STAKE);
        assertEq(ev.lockedOf(v1) + ev.lockedOf(v2) + ev.lockedOf(v3), 0);
        assertEq(token.balanceOf(SINK), 2 * uint256(BOND));
        assertEq(token.balanceOf(challenger), challengerBefore + BOND);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Finalized));
        assertEq(reputation.lastValue(), 0);
    }

    function test_resolveOverturnsWrongRejection() public {
        uint256 id = _rejected();
        vm.prank(provider);
        token.approve(address(ev), type(uint256).max);
        vm.prank(launchSafe);
        token.transfer(provider, BOND);
        vm.prank(provider);
        ev.dispute(id, EVIDENCE);

        vm.prank(arbiter);
        ev.resolve(id, true, bytes32(0));
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
        assertEq(token.balanceOf(provider), BUDGET + BOND);
        assertEq(ev.stakeOf(v1), STAKE - BOND);
        assertEq(ev.stakeOf(v2), STAKE - BOND);
        assertEq(token.balanceOf(SINK), 2 * uint256(BOND));
    }

    function test_resolveUpholdsBurnsChallengerBond() public {
        uint256 id = _approved();
        vm.prank(challenger);
        ev.dispute(id, EVIDENCE);
        uint256 providerBefore = token.balanceOf(provider);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Slashed(id, challenger, BOND);
        vm.prank(arbiter);
        ev.resolve(id, true, bytes32(0));
        assertEq(token.balanceOf(provider), providerBefore + BUDGET);
        assertEq(token.balanceOf(SINK), BOND);
        assertEq(ev.stakeOf(v1), STAKE);
        assertEq(ev.lockedOf(v1), 0);
    }

    function test_RevertWhen_ResolveNotArbiterOrNotDisputed() public {
        uint256 id = _approved();
        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.resolve(id, true, bytes32(0));
        vm.prank(arbiter);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.resolve(id, true, bytes32(0));
    }

    // ---------------------------------------------------------------- release

    function test_releaseAfterExpiryWhileDisputed() public {
        uint256 id = _approved();
        vm.prank(challenger);
        ev.dispute(id, EVIDENCE);
        uint256 challengerBefore = token.balanceOf(challenger);

        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.release(id);

        // The arbiter never rules; the deadline passes and anyone refunds the client.
        vm.warp(jobs.getJob(id).expiredAt);
        jobs.claimRefund(id);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Released(id);
        ev.release(id);

        assertEq(token.balanceOf(challenger), challengerBefore + BOND);
        assertEq(ev.lockedOf(v1) + ev.lockedOf(v2), 0);
        assertEq(ev.stakeOf(v1), STAKE);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Released));

        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.release(id);
        vm.prank(arbiter);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.resolve(id, true, bytes32(0));
    }

    function test_releaseAfterClientCancelsOpenJob() public {
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2));
        vm.prank(client);
        jobs.reject(id, bytes32(0), "");
        ev.release(id);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Released));
    }

    function test_releaseUndecidedAfterExpiry() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        vm.warp(jobs.getJob(id).expiredAt);
        jobs.claimRefund(id);
        ev.release(id);
        assertEq(ev.lockedOf(v1), 0);
    }

    function test_RevertWhen_ReleaseUnknownOrFinalized() public {
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.release(99);
        uint256 id = _approved();
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.release(id);
    }

    // ---------------------------------------------------------------- fuzz

    /// Whatever the votes and ruling, the escrow goes to exactly one side, and the evaluator
    /// holds exactly the validators' stake.
    function testFuzz_escrowToExactlyOneSide(uint8 votes, bool doDispute, bool ruling) public {
        uint256 id = _submitted();
        address[3] memory vs = [v1, v2, v3];
        for (uint256 i; i < 3 && _phase(id) == ARLVerifiedEvaluator.Phase.Configured; ++i) {
            _vote(id, vs[i], (votes >> i) & 1 == 1);
        }
        uint256 clientBefore = token.balanceOf(client);
        uint256 providerBefore = token.balanceOf(provider);
        if (doDispute) {
            vm.prank(challenger);
            ev.dispute(id, EVIDENCE);
            vm.prank(arbiter);
            ev.resolve(id, ruling, bytes32(0));
        } else {
            vm.warp(block.timestamp + WINDOW);
            ev.finalize(id);
        }
        uint256 paid = token.balanceOf(provider) - providerBefore;
        uint256 refunded = token.balanceOf(client) - clientBefore;
        assertEq(paid + refunded, BUDGET);
        assertTrue(paid == 0 || refunded == 0);
        assertEq(token.balanceOf(address(ev)), ev.stakeOf(v1) + ev.stakeOf(v2) + ev.stakeOf(v3));
        assertEq(ev.lockedOf(v1) + ev.lockedOf(v2) + ev.lockedOf(v3), 0);
    }
}
