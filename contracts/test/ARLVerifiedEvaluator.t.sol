// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ARLJobs} from "../src/ARLJobs.sol";
import {
    ARLVerifiedEvaluator,
    IERC8004Identity,
    IERC8004Reputation
} from "../src/ARLVerifiedEvaluator.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev Stand-in for the ERC-8004 IdentityRegistry: settable owners, or a registry that reverts or
/// returns malformed data.
/// A six-decimal dollar token standing in for USDC.
contract MockUsd is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

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
    uint64 internal constant MIN_WINDOW = 1 hours;
    uint64 internal constant WINDOW = 1 days;
    uint64 internal constant VOTE_WINDOW = 6 hours;
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
        rep = IERC8004Reputation(address(reputation));
        ev = new ARLVerifiedEvaluator(
            jobs, arbiter, MIN_WINDOW, MIN_BOND, identity, rep, IERC20(address(0))
        );
        identity.setOwner(AGENT, provider);

        address[6] memory funded = [client, challenger, provider, v1, v2, v3];
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

    function _one() internal view returns (address[] memory c) {
        c = new address[](1);
        c[0] = v1;
    }

    function _cfg(ARLVerifiedEvaluator.Tier tier, address[] memory committee, uint8 threshold)
        internal
        pure
        returns (ARLVerifiedEvaluator.Config memory)
    {
        return ARLVerifiedEvaluator.Config({
            tier: tier,
            threshold: threshold,
            voteWindow: VOTE_WINDOW,
            challengeWindow: WINDOW,
            bond: BOND,
            providerAgentId: AGENT,
            specHash: SPEC,
            committee: committee
        });
    }

    function _reexec() internal view returns (ARLVerifiedEvaluator.Config memory) {
        return _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _committee3(), 2);
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

    function _fund(uint256 id, uint256 budget) internal {
        vm.prank(provider);
        jobs.setBudget(id, budget, "");
        vm.prank(client);
        jobs.fund(id, budget, "");
    }

    function _approveCommittee(uint256 id) internal {
        vm.prank(provider);
        ev.approveCommittee(id);
    }

    function _acceptAll(uint256 id) internal {
        address[] memory c = ev.getConfig(id).committee;
        for (uint256 i; i < c.length; ++i) {
            vm.prank(c[i]);
            ev.accept(id);
        }
    }

    function _submit(uint256 id) internal {
        vm.prank(provider);
        jobs.submit(id, WORK, "");
    }

    /// Configured, approved, funded, accepted by all, submitted.
    function _ready(ARLVerifiedEvaluator.Config memory cfg) internal returns (uint256 id) {
        id = _configured(cfg);
        _approveCommittee(id);
        _fund(id, BUDGET);
        _acceptAll(id);
        _submit(id);
    }

    function _submitted() internal returns (uint256) {
        return _ready(_reexec());
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

    function _lockedTotal() internal view returns (uint256) {
        return ev.lockedOf(v1) + ev.lockedOf(v2) + ev.lockedOf(v3);
    }

    // ---------------------------------------------------------------- constructor

    function test_constructor() public view {
        assertEq(address(ev.jobs()), address(jobs));
        assertEq(address(ev.stakeToken()), address(token));
        assertEq(ev.arbiter(), arbiter);
        assertEq(ev.minChallengeWindow(), MIN_WINDOW);
        assertEq(ev.minBond(), MIN_BOND);
        assertEq(address(ev.identity()), address(identity));
        assertEq(address(ev.reputation()), address(reputation));
        assertEq(ev.SLASH_SINK(), SINK);
        assertEq(ev.MAX_COMMITTEE(), 7);
        assertEq(ev.BOND_BPS(), 1_000);
    }

    /// Stakes and bonds are in the escrow's own token, whatever it is.
    function test_stakeTokenIsTheEscrowToken() public {
        ARLJobs other = new ARLJobs(IERC20(address(investorsVesting)));
        ARLVerifiedEvaluator e = new ARLVerifiedEvaluator(
            other, arbiter, MIN_WINDOW, MIN_BOND, identity, rep, IERC20(address(0))
        );
        assertEq(address(e.stakeToken()), address(investorsVesting));
    }

    function test_RevertWhen_ConstructorInvalid() public {
        vm.expectRevert(ARLVerifiedEvaluator.ZeroAddress.selector);
        new ARLVerifiedEvaluator(
            ARLJobs(address(0)), arbiter, MIN_WINDOW, MIN_BOND, identity, rep, IERC20(address(0))
        );
        vm.expectRevert(ARLVerifiedEvaluator.ZeroAddress.selector);
        new ARLVerifiedEvaluator(
            jobs, address(0), MIN_WINDOW, MIN_BOND, identity, rep, IERC20(address(0))
        );
        vm.expectRevert(ARLVerifiedEvaluator.BadWindow.selector);
        new ARLVerifiedEvaluator(jobs, arbiter, 0, MIN_BOND, identity, rep, IERC20(address(0)));
        vm.expectRevert(ARLVerifiedEvaluator.BadWindow.selector);
        new ARLVerifiedEvaluator(
            jobs, arbiter, 30 days + 1, MIN_BOND, identity, rep, IERC20(address(0))
        );
        vm.expectRevert(ARLVerifiedEvaluator.BondTooLow.selector);
        new ARLVerifiedEvaluator(jobs, arbiter, MIN_WINDOW, 0, identity, rep, IERC20(address(0)));
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
        _submitted();
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
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Configured(
            id,
            ARLVerifiedEvaluator.Tier.Reexecution,
            2,
            VOTE_WINDOW,
            WINDOW,
            BOND,
            AGENT,
            SPEC,
            _committee3()
        );
        vm.prank(client);
        ev.configure(id, cfg);

        ARLVerifiedEvaluator.Config memory got = ev.getConfig(id);
        assertEq(got.threshold, 2);
        assertEq(got.voteWindow, VOTE_WINDOW);
        assertEq(got.challengeWindow, WINDOW);
        assertEq(got.bond, BOND);
        assertEq(got.specHash, SPEC);
        assertEq(got.committee.length, 3);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Configured));
        assertEq(ev.voteOf(id, v1), 1);
        assertEq(ev.voteOf(id, stranger), 0);
    }

    function test_configureFallback() public {
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Fallback, _one(), 1));
        assertEq(uint256(ev.getConfig(id).tier), uint256(ARLVerifiedEvaluator.Tier.Fallback));
    }

    function test_RevertWhen_ConfigureNotClient() public {
        uint256 id = _create(address(ev), 7 days);
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureOtherEvaluatorOrNotOpen() public {
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        uint256 other = _create(stranger, 7 days);
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.configure(other, cfg);

        uint256 id = _create(address(ev), 7 days);
        _fund(id, BUDGET);
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureTwice() public {
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        uint256 id = _configured(cfg);
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureBadWindows() public {
        uint256 id = _create(address(ev), 7 days);
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        vm.startPrank(client);
        cfg.voteWindow = 10 minutes - 1;
        vm.expectRevert(ARLVerifiedEvaluator.BadWindow.selector);
        ev.configure(id, cfg);
        cfg.voteWindow = 7 days + 1;
        vm.expectRevert(ARLVerifiedEvaluator.BadWindow.selector);
        ev.configure(id, cfg);
        cfg.voteWindow = VOTE_WINDOW;
        cfg.challengeWindow = MIN_WINDOW - 1;
        vm.expectRevert(ARLVerifiedEvaluator.BadWindow.selector);
        ev.configure(id, cfg);
        cfg.challengeWindow = 30 days + 1;
        vm.expectRevert(ARLVerifiedEvaluator.BadWindow.selector);
        ev.configure(id, cfg);
        vm.stopPrank();
    }

    /// Per-job windows: a high-value job can take a longer challenge window than the minimum.
    function test_configurePerJobWindows() public {
        uint256 id = _create(address(ev), 10 days);
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        cfg.challengeWindow = 72 hours;
        cfg.voteWindow = 1 days;
        vm.prank(client);
        ev.configure(id, cfg);
        assertEq(ev.getConfig(id).challengeWindow, 72 hours);
    }

    function test_RevertWhen_ConfigureExpiryTooSoon() public {
        uint256 id = _create(address(ev), VOTE_WINDOW + 2 * WINDOW - 1);
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.ExpiryTooSoon.selector);
        ev.configure(id, cfg);
    }

    function test_RevertWhen_ConfigureBondTooLow() public {
        uint256 id = _create(address(ev), 7 days);
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
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
        vm.expectRevert(ARLVerifiedEvaluator.BadThreshold.selector);
        ev.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Fallback, _one(), 2));
        // Checked tiers: threshold at least two, a strict majority, at most the committee.
        vm.expectRevert(ARLVerifiedEvaluator.BadThreshold.selector);
        ev.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Reexecution, _one(), 1));
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

    // ---------------------------------------------------------------- committee approval

    function test_approveCommittee() public {
        uint256 id = _configured(_reexec());
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.CommitteeApproved(id, provider);
        _approveCommittee(id);
        assertTrue(ev.getVerdict(id).providerApproved);
        vm.prank(provider);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.approveCommittee(id);
    }

    function test_RevertWhen_ApproveCommitteeNotProvider() public {
        uint256 id = _configured(_reexec());
        vm.prank(client);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.approveCommittee(id);
        vm.prank(provider);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.approveCommittee(99);
    }

    function test_RevertWhen_ProviderOnItsOwnCommittee() public {
        address[] memory c = _committee3();
        c[2] = provider;
        uint256 id = _configured(_cfg(ARLVerifiedEvaluator.Tier.Reexecution, c, 2));
        vm.prank(provider);
        vm.expectRevert(ARLVerifiedEvaluator.ConflictOfInterest.selector);
        ev.approveCommittee(id);
    }

    // ---------------------------------------------------------------- accept

    function test_acceptLocksTheLargerOfFloorAndTenthOfBudget() public {
        // Budget 250: a tenth is 25 < floor 50, so the bond is the floor.
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Accepted(id, v1, BOND);
        vm.prank(v1);
        ev.accept(id);
        assertEq(ev.getVerdict(id).bond, BOND);
        assertEq(ev.lockedOf(v1), BOND);
        assertEq(ev.voteOf(id, v1), 2);

        // Budget 2,000: a tenth is 200 > floor.
        uint256 big = _configured(_reexec());
        _approveCommittee(big);
        _fund(big, 2_000 ether);
        vm.prank(v2);
        ev.accept(big);
        assertEq(ev.getVerdict(big).bond, 200 ether);
        vm.prank(v3);
        ev.accept(big);
        assertEq(ev.lockedOf(v3), 200 ether);
    }

    function test_acceptAfterSubmission() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        _submit(id);
        vm.prank(v1);
        ev.accept(id);
        assertEq(ev.voteOf(id, v1), 2);
    }

    function test_RevertWhen_AcceptWithoutApprovalOrFunding() public {
        uint256 id = _configured(_reexec());
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.NotApprovedByProvider.selector);
        ev.accept(id);
        _approveCommittee(id);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.accept(id);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.accept(99);
    }

    function test_RevertWhen_AcceptByNonMemberOrTwice() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        vm.prank(stranger);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.accept(id);
        vm.prank(v1);
        ev.accept(id);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.Unauthorized.selector);
        ev.accept(id);
    }

    function test_RevertWhen_AcceptWithoutFreeStake() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        vm.prank(v1);
        ev.unstake(STAKE - BOND + 1);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.InsufficientStake.selector);
        ev.accept(id);
    }

    /// Report 2026-10-31 (F-1): starting the vote, by anyone or by a first vote, used to close
    /// acceptance and could leave the committee short of the threshold for good. Members can now
    /// accept until the vote window ends.
    function test_acceptDuringVoteWindowAfterFirstVote() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        vm.prank(v1);
        ev.accept(id);
        _submit(id);
        _vote(id, v1, true);
        vm.prank(v2);
        ev.accept(id);
        _vote(id, v2, true);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Approved));
    }

    function test_acceptAfterAStrangerStartsVoting() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        vm.prank(v1);
        ev.accept(id);
        _submit(id);
        vm.prank(stranger);
        ev.startVoting(id);
        vm.warp(block.timestamp + VOTE_WINDOW - 1);
        vm.prank(v2);
        ev.accept(id);
        _vote(id, v1, true);
        _vote(id, v2, true);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Approved));
        uint256 providerBefore = token.balanceOf(provider);
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(token.balanceOf(provider), providerBefore + BUDGET);
    }

    function test_RevertWhen_AcceptAfterVoteWindowOrDecision() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        vm.prank(v1);
        ev.accept(id);
        _submit(id);
        vm.prank(stranger);
        ev.startVoting(id);
        vm.warp(ev.getVerdict(id).voteEnds);
        vm.prank(v2);
        vm.expectRevert(ARLVerifiedEvaluator.VoteWindowClosed.selector);
        ev.accept(id);

        // After a decision the phase is no longer Configured.
        uint256 decided = _configured(_reexec());
        _approveCommittee(decided);
        _fund(decided, BUDGET);
        vm.prank(v1);
        ev.accept(decided);
        vm.prank(v2);
        ev.accept(decided);
        _submit(decided);
        _vote(decided, v1, true);
        _vote(decided, v2, true);
        vm.prank(v3);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.accept(decided);
    }

    /// A member that accepts during the vote window and then does not vote is slashed like any
    /// other absent member.
    function test_lateAcceptThenSilentIsSlashed() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        _submit(id);
        vm.prank(stranger);
        ev.startVoting(id);
        vm.prank(v1);
        ev.accept(id);
        vm.warp(ev.getVerdict(id).voteEnds);
        ev.closeUndecided(id);
        assertEq(ev.stakeOf(v1), STAKE - BOND);
        assertEq(ev.voteOf(id, v1), 5);
    }

    // ---------------------------------------------------------------- voting

    function test_startVoting() public {
        uint256 id = _submitted();
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.VotingStarted(id, uint64(block.timestamp) + VOTE_WINDOW);
        vm.prank(provider);
        ev.startVoting(id);
        assertEq(ev.getVerdict(id).voteEnds, block.timestamp + VOTE_WINDOW);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.startVoting(id);
    }

    function test_RevertWhen_StartVotingBeforeSubmission() public {
        uint256 id = _configured(_reexec());
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.startVoting(id);
    }

    function test_voteStartsWindowAndApprovesAtThreshold() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        assertEq(ev.getVerdict(id).voteEnds, block.timestamp + VOTE_WINDOW);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Configured));
        assertEq(ev.voteOf(id, v1), 3);

        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Decided(id, true, uint64(block.timestamp) + WINDOW);
        _vote(id, v2, true);

        ARLVerifiedEvaluator.Verdict memory v = ev.getVerdict(id);
        assertEq(uint256(v.phase), uint256(ARLVerifiedEvaluator.Phase.Approved));
        assertEq(v.approvals, 2);
        assertEq(v.deliverable, WORK);
        assertEq(v.challengeEnds, block.timestamp + WINDOW);

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
        assertEq(ev.voteOf(id, v3), 4);
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

    function test_RevertWhen_VoteWithoutAccepting() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        _submit(id);
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
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        vm.prank(v1);
        ev.accept(id);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.vote(id, true, WORK, EVIDENCE);
    }

    function test_RevertWhen_VoteAfterWindow() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        vm.warp(block.timestamp + VOTE_WINDOW);
        vm.prank(v2);
        vm.expectRevert(ARLVerifiedEvaluator.VoteWindowClosed.selector);
        ev.vote(id, true, WORK, EVIDENCE);
    }

    function test_RevertWhen_VoteDeliverableMismatch() public {
        uint256 id = _submitted();
        _vote(id, v1, true);
        vm.prank(v2);
        vm.expectRevert(ARLVerifiedEvaluator.DeliverableMismatch.selector);
        ev.vote(id, true, keccak256("other"), EVIDENCE);
    }

    // ---------------------------------------------------------------- non-vote penalty

    function test_closeUndecidedBurnsAbsenteesAndRefunds() public {
        uint256 id = _submitted();
        _vote(id, v1, true); // v2 and v3 accepted but never vote
        vm.expectRevert(ARLVerifiedEvaluator.VoteWindowOpen.selector);
        ev.closeUndecided(id);

        vm.warp(block.timestamp + VOTE_WINDOW);
        uint256 clientBefore = token.balanceOf(client);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Failed(id);
        ev.closeUndecided(id);

        assertEq(token.balanceOf(client), clientBefore + BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Rejected));
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Failed));
        assertEq(ev.stakeOf(v1), STAKE);
        assertEq(ev.stakeOf(v2), STAKE - BOND);
        assertEq(ev.stakeOf(v3), STAKE - BOND);
        assertEq(ev.voteOf(id, v2), 5);
        assertEq(_lockedTotal(), 0);
        assertEq(token.balanceOf(SINK), 2 * uint256(BOND));

        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.closeUndecided(id);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.release(id);
    }

    function test_closeUndecidedWithoutAbsentees() public {
        // Members that never accepted lock nothing and lose nothing.
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        _submit(id);
        ev.startVoting(id);
        vm.warp(block.timestamp + VOTE_WINDOW);
        ev.closeUndecided(id);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Rejected));
        assertEq(token.balanceOf(SINK), 0);
    }

    function test_RevertWhen_CloseUndecidedBeforeVoting() public {
        uint256 id = _submitted();
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.closeUndecided(id);
    }

    // ---------------------------------------------------------------- paid in USDC, bonded in ARL

    /// An escrow paid in a six-decimal dollar token with validator bonds in ARL: the bond is the
    /// job's floor in ARL, whatever the budget, the provider is paid in dollars and the bonds come
    /// back in ARL.
    function test_paidInUsdBondedInArl() public {
        MockUsd usd = new MockUsd();
        jobs = new ARLJobs(IERC20(address(usd)));
        ev = new ARLVerifiedEvaluator(
            jobs, arbiter, MIN_WINDOW, MIN_BOND, identity, rep, IERC20(address(token))
        );
        assertEq(address(ev.stakeToken()), address(token));
        assertFalse(ev.bondFollowsBudget());
        address[3] memory validators = [v1, v2, v3];
        for (uint256 i; i < validators.length; ++i) {
            vm.startPrank(validators[i]);
            token.approve(address(ev), type(uint256).max);
            ev.stake(STAKE);
            vm.stopPrank();
        }
        uint256 budget = 1_000_000e6;
        usd.mint(client, budget);
        vm.prank(client);
        usd.approve(address(jobs), budget);

        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, budget);
        _acceptAll(id);
        assertEq(ev.getVerdict(id).bond, BOND);
        assertEq(_lockedTotal(), 3 * uint256(BOND));

        _submit(id);
        _vote(id, v1, true);
        _vote(id, v2, true);
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(usd.balanceOf(provider), budget);
        assertEq(_lockedTotal(), 0);
        assertEq(token.balanceOf(address(ev)), 3 * STAKE);
    }

    function test_defaultStakeTokenIsTheEscrowToken() public view {
        assertEq(address(ev.stakeToken()), address(token));
        assertTrue(ev.bondFollowsBudget());
    }

    // ---------------------------------------------------------------- finalize

    function test_finalizeApprovedPaysProviderAndWritesReputation() public {
        uint256 id = _approved();
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
        // The accepted member that did not vote is unlocked without penalty: it was not needed.
        assertEq(_lockedTotal(), 0);
        assertEq(ev.stakeOf(v3), STAKE);

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
        uint256 id = _ready(_cfg(ARLVerifiedEvaluator.Tier.Fallback, _one(), 1));
        _vote(id, v1, true);
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(reputation.lastTag2(), "fallback");
    }

    function test_finalizeAttestedTag() public {
        uint256 id = _ready(_cfg(ARLVerifiedEvaluator.Tier.Attested, _committee3(), 2));
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
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        cfg.providerAgentId = 0;
        uint256 id = _ready(cfg);
        _vote(id, v1, true);
        _vote(id, v2, true);
        vm.warp(block.timestamp + WINDOW);
        ev.finalize(id);
        assertEq(reputation.count(), 0);
    }

    function _finalizeOn(ARLVerifiedEvaluator e) internal {
        vm.prank(v1);
        token.approve(address(e), type(uint256).max);
        vm.prank(v1);
        e.stake(BOND);
        uint256 id = _create(address(e), 7 days);
        vm.prank(client);
        e.configure(id, _cfg(ARLVerifiedEvaluator.Tier.Fallback, _one(), 1));
        vm.prank(provider);
        e.approveCommittee(id);
        _fund(id, BUDGET);
        vm.prank(v1);
        e.accept(id);
        _submit(id);
        vm.prank(v1);
        e.vote(id, true, WORK, EVIDENCE);
        vm.warp(block.timestamp + WINDOW);
        e.finalize(id);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
    }

    function test_feedbackSkippedWithoutRegistries() public {
        _finalizeOn(
            new ARLVerifiedEvaluator(
                jobs,
                arbiter,
                MIN_WINDOW,
                MIN_BOND,
                IERC8004Identity(address(0)),
                IERC8004Reputation(address(0)),
                IERC20(address(0))
            )
        );
        _finalizeOn(
            new ARLVerifiedEvaluator(
                jobs,
                arbiter,
                MIN_WINDOW,
                MIN_BOND,
                IERC8004Identity(address(0)),
                rep,
                IERC20(address(0))
            )
        );
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

        assertEq(token.balanceOf(client), clientBefore + BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Rejected));
        assertEq(ev.stakeOf(v1), STAKE - BOND);
        assertEq(ev.stakeOf(v2), STAKE - BOND);
        assertEq(ev.stakeOf(v3), STAKE);
        assertEq(_lockedTotal(), 0);
        assertEq(token.balanceOf(SINK), 2 * uint256(BOND));
        assertEq(token.balanceOf(challenger), challengerBefore + BOND);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Finalized));
        assertEq(reputation.lastValue(), 0);
    }

    function test_resolveOverturnsWrongRejection() public {
        uint256 id = _rejected();
        uint256 before = token.balanceOf(provider);
        vm.prank(provider);
        ev.dispute(id, EVIDENCE);
        vm.prank(arbiter);
        ev.resolve(id, true, bytes32(0));
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
        assertEq(token.balanceOf(provider), before + BUDGET);
        assertEq(ev.stakeOf(v1), STAKE - BOND);
        assertEq(ev.stakeOf(v2), STAKE - BOND);
        assertEq(ev.stakeOf(v3), STAKE);
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
        assertEq(_lockedTotal(), 0);
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

    // ---------------------------------------------------------------- deadline

    /// Time the whole evaluation needs before the deadline: the vote window and two challenge
    /// windows.
    function _needed() internal pure returns (uint256) {
        return uint256(VOTE_WINDOW) + 2 * uint256(WINDOW);
    }

    /// Late funding: the client funds when the evaluation no longer fits. Members cannot accept,
    /// so no committee can approve work that the deadline would then refund.
    function test_RevertWhen_AcceptTooLateToEvaluate() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        uint256 expiredAt = jobs.getJob(id).expiredAt;
        vm.warp(expiredAt - _needed() + 1);
        _fund(id, BUDGET);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.ExpiryTooSoon.selector);
        ev.accept(id);

        // the escrow goes back to the client at the deadline; nothing was locked
        vm.warp(expiredAt);
        uint256 clientBefore = token.balanceOf(client);
        jobs.claimRefund(id);
        assertEq(token.balanceOf(client), clientBefore + BUDGET);
        ev.release(id);
        assertEq(_lockedTotal(), 0);
    }

    /// Late submission: members accepted in time, but the provider submits when the evaluation no
    /// longer fits. Voting cannot start, so no decision can be overtaken by the deadline.
    function test_RevertWhen_VotingStartsTooLateToEvaluate() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        _acceptAll(id);
        uint256 expiredAt = jobs.getJob(id).expiredAt;
        vm.warp(expiredAt - _needed() + 1);
        _submit(id);
        vm.expectRevert(ARLVerifiedEvaluator.ExpiryTooSoon.selector);
        ev.startVoting(id);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.ExpiryTooSoon.selector);
        ev.vote(id, true, WORK, EVIDENCE);

        vm.warp(expiredAt);
        jobs.claimRefund(id);
        ev.release(id);
        assertEq(_lockedTotal(), 0);
        assertEq(ev.stakeOf(v1), STAKE);
    }

    /// Exactly enough time left: voting starts, and an approval is finalized and paid before the
    /// deadline, with at least one challenge window to spare.
    function test_evaluationThatJustFitsPaysTheProvider() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        uint256 expiredAt = jobs.getJob(id).expiredAt;
        vm.warp(expiredAt - _needed());
        _fund(id, BUDGET);
        _acceptAll(id);
        _submit(id);
        ev.startVoting(id);
        vm.warp(block.timestamp + VOTE_WINDOW - 1);
        _vote(id, v1, true);
        _vote(id, v2, true);
        ARLVerifiedEvaluator.Verdict memory v = ev.getVerdict(id);
        assertEq(uint256(v.phase), uint256(ARLVerifiedEvaluator.Phase.Approved));
        assertLe(uint256(v.challengeEnds) + WINDOW, expiredAt, "a challenge window to settle");

        // the client cannot refund while the decision waits out its challenge window
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.claimRefund(id);

        vm.warp(v.challengeEnds);
        uint256 providerBefore = token.balanceOf(provider);
        ev.finalize(id);
        assertEq(token.balanceOf(provider), providerBefore + BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
        vm.warp(expiredAt);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.claimRefund(id);
    }

    /// The reported attack (security report 2026-10-25): with the SDK defaults (1 h vote, 1 h
    /// challenge, 24 h deadline) the client funds at hour 23 and the provider submits one second
    /// later. The committee can no longer accept, so there is no approval to overtake.
    function test_lateFundingCannotVoidAnApproval() public {
        ARLVerifiedEvaluator.Config memory cfg = _reexec();
        cfg.voteWindow = 1 hours;
        cfg.challengeWindow = 1 hours;
        uint256 id = _create(address(ev), 24 hours);
        vm.prank(client);
        ev.configure(id, cfg);
        _approveCommittee(id);
        vm.warp(block.timestamp + 23 hours);
        _fund(id, BUDGET);
        vm.prank(v1);
        vm.expectRevert(ARLVerifiedEvaluator.ExpiryTooSoon.selector);
        ev.accept(id);
    }

    /// A deadline that passes before anyone closes an undecided vote: absent members are still
    /// slashed, and closing refunds the client through `claimRefund`.
    function test_closeUndecidedAfterExpiryRefundsAndSlashes() public {
        uint256 id = _submitted();
        ev.startVoting(id);
        _vote(id, v1, true);
        vm.warp(jobs.getJob(id).expiredAt);
        uint256 clientBefore = token.balanceOf(client);
        uint256 sinkBefore = token.balanceOf(SINK);
        ev.closeUndecided(id);
        assertEq(token.balanceOf(client), clientBefore + BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Expired));
        assertEq(token.balanceOf(SINK), sinkBefore + 2 * BOND, "v2 and v3 were absent");
        assertEq(ev.stakeOf(v1), STAKE);
        assertEq(_lockedTotal(), 0);
    }

    /// Someone refunds first: closing still slashes the absent members.
    function test_closeUndecidedAfterRefundStillSlashes() public {
        uint256 id = _submitted();
        ev.startVoting(id);
        vm.warp(jobs.getJob(id).expiredAt);
        jobs.claimRefund(id);
        uint256 sinkBefore = token.balanceOf(SINK);
        ev.closeUndecided(id);
        assertEq(token.balanceOf(SINK), sinkBefore + 3 * BOND);
        assertEq(_lockedTotal(), 0);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Failed));
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.release(id);
    }

    /// A dispute the arbiter does not rule on before the deadline ends in a refund: the ruling
    /// can no longer move the escrow, and `release` returns the challenger's bond.
    function test_RevertWhen_ResolveAfterExpiry() public {
        uint256 id = _approved();
        vm.prank(challenger);
        ev.dispute(id, EVIDENCE);
        vm.warp(jobs.getJob(id).expiredAt);
        vm.prank(arbiter);
        vm.expectRevert(ARLJobs.JobExpiredAlready.selector);
        ev.resolve(id, true, bytes32(0));
    }

    // ---------------------------------------------------------------- release

    function test_releaseAfterExpiryWhileDisputed() public {
        uint256 id = _approved();
        vm.prank(challenger);
        ev.dispute(id, EVIDENCE);
        uint256 challengerBefore = token.balanceOf(challenger);

        vm.expectRevert(ARLVerifiedEvaluator.WrongJobStatus.selector);
        ev.release(id);

        vm.warp(jobs.getJob(id).expiredAt);
        jobs.claimRefund(id);
        vm.expectEmit(address(ev));
        emit ARLVerifiedEvaluator.Released(id);
        ev.release(id);

        assertEq(token.balanceOf(challenger), challengerBefore + BOND);
        assertEq(_lockedTotal(), 0);
        assertEq(ev.stakeOf(v1), STAKE);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Released));

        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.release(id);
        vm.prank(arbiter);
        vm.expectRevert(ARLVerifiedEvaluator.WrongPhase.selector);
        ev.resolve(id, true, bytes32(0));
    }

    function test_releaseAfterClientCancelsOpenJob() public {
        uint256 id = _configured(_reexec());
        vm.prank(client);
        jobs.reject(id, bytes32(0), "");
        ev.release(id);
        assertEq(uint256(_phase(id)), uint256(ARLVerifiedEvaluator.Phase.Released));
    }

    function test_releaseAcceptedButNeverSubmitted() public {
        uint256 id = _configured(_reexec());
        _approveCommittee(id);
        _fund(id, BUDGET);
        _acceptAll(id);
        vm.warp(jobs.getJob(id).expiredAt);
        jobs.claimRefund(id);
        ev.release(id);
        assertEq(_lockedTotal(), 0);
        assertEq(ev.stakeOf(v2), STAKE);
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

    /// Whatever the votes, absences and ruling, the escrow goes to exactly one side, the
    /// evaluator holds exactly the validators' stake, and nothing stays locked.
    function testFuzz_escrowToExactlyOneSide(uint8 votes, uint8 path, bool ruling) public {
        uint256 id = _submitted();
        address[3] memory vs = [v1, v2, v3];
        for (uint256 i; i < 3 && _phase(id) == ARLVerifiedEvaluator.Phase.Configured; ++i) {
            // Bits 0-2: vote or stay absent; bits 3-5: approve or reject.
            if ((votes >> i) & 1 == 1) _vote(id, vs[i], (votes >> (i + 3)) & 1 == 1);
        }
        uint256 clientBefore = token.balanceOf(client);
        uint256 providerBefore = token.balanceOf(provider);
        if (_phase(id) == ARLVerifiedEvaluator.Phase.Configured) {
            if (ev.getVerdict(id).voteEnds == 0) ev.startVoting(id);
            vm.warp(block.timestamp + VOTE_WINDOW);
            ev.closeUndecided(id);
        } else if (path % 2 == 0) {
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
        assertEq(_lockedTotal(), 0);
    }
}
