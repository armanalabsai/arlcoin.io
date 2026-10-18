// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../../src/ARLJobs.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {
    ARLVerifiedEvaluator,
    IERC8004Identity,
    IERC8004Reputation
} from "../../src/ARLVerifiedEvaluator.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev Random job setups, votes (honest or not), disputes, rulings, finalizations, releases,
/// stake moves and time moves, by fixed clients, providers, validators and a challenger. Calls
/// that the contract refuses are part of the run.
contract ARLVerifiedEvaluatorHandler is Test {
    ARLJobs internal immutable jobs;
    ARLVerifiedEvaluator internal immutable ev;
    ARLToken internal immutable token;
    address internal immutable arbiter;
    address internal immutable client;
    address internal immutable provider;
    address internal immutable challenger;
    address[] internal validators;
    uint256[] public ids;

    uint256 public ghostFunded;
    uint256 public ghostSettled;
    uint256 public ghostOpenChallengeBonds;

    constructor(
        ARLJobs jobs_,
        ARLVerifiedEvaluator ev_,
        ARLToken token_,
        address arbiter_,
        address client_,
        address provider_,
        address challenger_,
        address[] memory validators_
    ) {
        jobs = jobs_;
        ev = ev_;
        token = token_;
        arbiter = arbiter_;
        client = client_;
        provider = provider_;
        challenger = challenger_;
        validators = validators_;
    }

    function validatorCount() external view returns (uint256) {
        return validators.length;
    }

    function validatorAt(uint256 i) external view returns (address) {
        return validators[i];
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function _id(uint256 seed) internal view returns (uint256) {
        uint256 n = ids.length;
        return n == 0 ? 0 : ids[seed % n];
    }

    /// At most a few jobs per run, so that each moves through its phases.
    function open(uint256 seed, uint256 budget) external {
        if (ids.length >= 4) return;
        budget = bound(budget, 1, 500 ether);
        uint256 n = 1 + seed % validators.length;
        address[] memory committee = new address[](n);
        for (uint256 i; i < n; ++i) {
            committee[i] = validators[(seed / 7 + i) % validators.length];
        }
        ARLVerifiedEvaluator.Tier tier;
        uint8 threshold;
        if (n == 1) {
            tier = ARLVerifiedEvaluator.Tier.Fallback;
            threshold = 1;
        } else if (n == 2) {
            return; // no strict majority of at least two exists below three
        } else {
            tier = seed % 3 == 0
                ? ARLVerifiedEvaluator.Tier.Attested
                : ARLVerifiedEvaluator.Tier.Reexecution;
            threshold = uint8(n / 2 + 1);
        }
        vm.startPrank(client);
        uint256 id =
            jobs.createJob(provider, address(ev), block.timestamp + 6 days, "j", address(0));
        ev.configure(
            id,
            ARLVerifiedEvaluator.Config({
                tier: tier,
                threshold: threshold,
                voteWindow: 6 hours,
                challengeWindow: 1 days,
                bond: uint96(bound(seed, 10 ether, 200 ether)),
                providerAgentId: 0,
                specHash: bytes32(seed),
                committee: committee
            })
        );
        vm.stopPrank();
        vm.prank(provider);
        ev.approveCommittee(id);
        vm.prank(provider);
        jobs.setBudget(id, budget, "");
        vm.prank(client);
        jobs.fund(id, budget, "");
        ghostFunded += budget;
        ids.push(id);
    }

    function submit(uint256 j) external {
        uint256 id = _id(j);
        if (id == 0) return;
        vm.prank(provider);
        try jobs.submit(id, keccak256("work"), "") {} catch {}
    }

    /// Mostly a member of the job's committee naming the submitted work, sometimes any validator
    /// or another deliverable.
    function vote(uint256 j, uint256 who, bool approve) external {
        uint256 id = _id(j);
        if (id == 0) return;
        address[] memory committee = ev.getConfig(id).committee;
        address v = who % 4 == 0
            ? validators[who / 4 % validators.length]
            : committee[who % committee.length];
        bytes32 deliverable = who % 8 == 1 ? bytes32(who) : keccak256("work");
        vm.prank(v);
        try ev.vote(id, approve, deliverable, bytes32(0)) {} catch {}
    }

    function accept(uint256 j, uint256 who) external {
        uint256 id = _id(j);
        if (id == 0) return;
        address[] memory committee = ev.getConfig(id).committee;
        vm.prank(committee[who % committee.length]);
        try ev.accept(id) {} catch {}
    }

    function closeUndecided(uint256 j) external {
        uint256 id = _id(j);
        if (id == 0) return;
        uint256 budget = jobs.getJob(id).budget;
        try ev.closeUndecided(id) {
            ghostSettled += budget;
        } catch {}
    }

    function dispute(uint256 j) external {
        uint256 id = _id(j);
        if (id == 0) return;
        uint256 bond = ev.getVerdict(id).bond;
        vm.prank(challenger);
        try ev.dispute(id, bytes32(0)) {
            ghostOpenChallengeBonds += bond;
        } catch {}
    }

    function resolve(uint256 j, bool approve) external {
        uint256 id = _id(j);
        if (id == 0) return;
        uint256 bond = ev.getVerdict(id).bond;
        uint256 budget = jobs.getJob(id).budget;
        vm.prank(arbiter);
        try ev.resolve(id, approve, bytes32(0)) {
            ghostOpenChallengeBonds -= bond;
            ghostSettled += budget;
        } catch {}
    }

    function finalize(uint256 j) external {
        uint256 id = _id(j);
        if (id == 0) return;
        uint256 budget = jobs.getJob(id).budget;
        try ev.finalize(id) {
            ghostSettled += budget;
        } catch {}
    }

    function refund(uint256 j) external {
        uint256 id = _id(j);
        if (id == 0) return;
        uint256 budget = jobs.getJob(id).budget;
        try jobs.claimRefund(id) {
            ghostSettled += budget;
        } catch {}
    }

    function release(uint256 j) external {
        uint256 id = _id(j);
        if (id == 0) return;
        bool disputed = ev.getVerdict(id).phase == ARLVerifiedEvaluator.Phase.Disputed;
        uint256 bond = ev.getVerdict(id).bond;
        try ev.release(id) {
            if (disputed) ghostOpenChallengeBonds -= bond;
        } catch {}
    }

    /// Moves one job to its next phase with the expected caller: submit, a committee vote, a
    /// dispute or the end of the window, a ruling, or settlement.
    function step(uint256 j, uint256 choice) external {
        uint256 id = _id(j);
        if (id == 0) return;
        ARLJobs.JobStatus status = jobs.getJob(id).status;
        ARLVerifiedEvaluator.Phase phase = ev.getVerdict(id).phase;
        if (status == ARLJobs.JobStatus.Funded) {
            if (choice % 3 == 0) this.submit(j);
            else this.accept(j, choice);
        } else if (phase == ARLVerifiedEvaluator.Phase.Configured) {
            if (choice % 5 == 0) {
                this.warp(6 hours);
                this.closeUndecided(j);
            } else {
                this.vote(j, (choice % 1024) * 4 + 1, choice % 3 != 0);
            }
        } else if (
            phase == ARLVerifiedEvaluator.Phase.Approved
                || phase == ARLVerifiedEvaluator.Phase.Rejected
        ) {
            if (choice % 2 == 0) this.dispute(j);
            else this.warp(1 days);
            this.finalize(j);
        } else if (phase == ARLVerifiedEvaluator.Phase.Disputed) {
            this.resolve(j, choice % 2 == 0);
        } else {
            this.release(j);
        }
    }

    function unstake(uint256 who, uint256 amount) external {
        address v = validators[who % validators.length];
        amount = bound(amount, 1, 2_000 ether);
        vm.prank(v);
        try ev.unstake(amount) {} catch {}
    }

    function stake(uint256 who, uint256 amount) external {
        address v = validators[who % validators.length];
        amount = bound(amount, 1, 500 ether);
        vm.prank(v);
        ev.stake(amount);
    }

    function warp(uint256 by) external {
        vm.warp(block.timestamp + bound(by, 1 hours, 3 days));
    }
}

contract ARLVerifiedEvaluatorInvariant is ARLTestBase {
    ARLJobs internal jobs;
    ARLVerifiedEvaluator internal ev;
    ARLVerifiedEvaluatorHandler internal handler;

    function setUp() public override {
        super.setUp();
        address arbiter = makeAddr("arbiter");
        address client = makeAddr("client");
        address provider = makeAddr("provider");
        address challenger = makeAddr("challenger");
        jobs = new ARLJobs(IERC20(address(token)));
        ev = new ARLVerifiedEvaluator(
            jobs,
            arbiter,
            1 hours,
            10 ether,
            IERC8004Identity(address(0)),
            IERC8004Reputation(address(0))
        );

        address[] memory vs = new address[](5);
        for (uint256 i; i < vs.length; ++i) {
            vs[i] = makeAddr(string.concat("validator", vm.toString(i)));
        }
        handler = new ARLVerifiedEvaluatorHandler(
            jobs, ev, token, arbiter, client, provider, challenger, vs
        );

        vm.startPrank(launchSafe);
        token.transfer(client, 1_000_000 ether);
        token.transfer(challenger, 1_000_000 ether);
        for (uint256 i; i < vs.length; ++i) {
            token.transfer(vs[i], 100_000 ether);
        }
        vm.stopPrank();
        vm.prank(client);
        token.approve(address(jobs), type(uint256).max);
        vm.prank(challenger);
        token.approve(address(ev), type(uint256).max);
        for (uint256 i; i < vs.length; ++i) {
            vm.startPrank(vs[i]);
            token.approve(address(ev), type(uint256).max);
            ev.stake(2_000 ether);
            vm.stopPrank();
        }
        targetContract(address(handler));
    }

    /// The evaluator holds exactly the validators' stake plus the open challenger bonds.
    function invariant_evaluatorSolvent() public view {
        uint256 staked;
        for (uint256 i; i < handler.validatorCount(); ++i) {
            staked += ev.stakeOf(handler.validatorAt(i));
        }
        assertEq(token.balanceOf(address(ev)), staked + handler.ghostOpenChallengeBonds());
    }

    /// No validator has more locked than staked.
    function invariant_lockedWithinStake() public view {
        for (uint256 i; i < handler.validatorCount(); ++i) {
            address v = handler.validatorAt(i);
            assertLe(ev.lockedOf(v), ev.stakeOf(v));
        }
    }

    /// The jobs contract holds exactly the escrow not yet paid or refunded.
    function invariant_escrowConserved() public view {
        assertEq(token.balanceOf(address(jobs)), handler.ghostFunded() - handler.ghostSettled());
    }

    /// A job this contract settled, released or closed never keeps a bond locked: summing the
    /// bonds of the members that accepted every live job gives the total locked stake.
    function invariant_locksMatchLiveVotes() public view {
        uint256 expected;
        for (uint256 k; k < handler.idCount(); ++k) {
            uint256 id = handler.ids(k);
            ARLVerifiedEvaluator.Phase phase = ev.getVerdict(id).phase;
            if (
                phase == ARLVerifiedEvaluator.Phase.Finalized
                    || phase == ARLVerifiedEvaluator.Phase.Released
                    || phase == ARLVerifiedEvaluator.Phase.Failed
            ) continue;
            address[] memory committee = ev.getConfig(id).committee;
            for (uint256 i; i < committee.length; ++i) {
                uint8 state = ev.voteOf(id, committee[i]);
                if (state >= 2 && state <= 4) expected += ev.getVerdict(id).bond;
            }
        }
        uint256 locked;
        for (uint256 i; i < handler.validatorCount(); ++i) {
            locked += ev.lockedOf(handler.validatorAt(i));
        }
        assertEq(locked, expected);
    }
}
