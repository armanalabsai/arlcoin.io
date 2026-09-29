// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../../src/ARLJobs.sol";
import {ARLToken} from "../../src/ARLToken.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev Random job creation, budgets, funding, submissions, completions, rejections, refunds
/// and time moves, by a fixed set of accounts that play every role, including callers that are
/// not allowed to act.
contract ARLJobsHandler is Test {
    ARLJobs internal immutable jobs;
    ARLToken internal immutable token;
    address[] internal actors;

    uint256 public ghostFunded;
    uint256 public ghostPaid;
    uint256 public ghostRefunded;

    constructor(ARLJobs jobs_, ARLToken token_, address[] memory actors_) {
        jobs = jobs_;
        token = token_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    /// Mostly the account allowed to act (so that jobs move through their states), sometimes
    /// any account (so that refusals are exercised too).
    function _caller(uint256 seed, address allowed) internal view returns (address) {
        return seed % 4 == 0 ? _actor(seed / 4) : allowed;
    }

    function _jobId(uint256 seed) internal view returns (uint256) {
        uint256 n = jobs.jobCounter();
        // Half of the calls act on the newest job, so that jobs progress through their states.
        return n == 0 ? 0 : seed % 2 == 0 ? n : 1 + (seed / 2 % n);
    }

    function create(uint256 c, uint256 p, uint256 e, uint256 duration) external {
        duration = bound(duration, 5 minutes, 30 days);
        vm.prank(_actor(c));
        jobs.createJob(_actor(p), _actor(e), block.timestamp + duration, "job", address(0));
    }

    function setBudget(uint256 j, uint256 who, uint256 amount) external {
        uint256 id = _jobId(j);
        if (id == 0) return;
        amount = bound(amount, 1, 1_000 ether);
        ARLJobs.Job memory job = jobs.getJob(id);
        vm.prank(_caller(who, who % 2 == 0 ? job.client : job.provider));
        try jobs.setBudget(id, amount, "") {} catch {}
    }

    function fund(uint256 j, uint256 who) external {
        uint256 id = _jobId(j);
        if (id == 0) return;
        ARLJobs.Job memory job = jobs.getJob(id);
        uint256 budget = job.budget;
        vm.prank(_caller(who, job.client));
        try jobs.fund(id, budget, "") {
            ghostFunded += budget;
        } catch {}
    }

    function submit(uint256 j, uint256 who) external {
        uint256 id = _jobId(j);
        if (id == 0) return;
        vm.prank(_caller(who, jobs.getJob(id).provider));
        try jobs.submit(id, bytes32(j), "") {} catch {}
    }

    function complete(uint256 j, uint256 who) external {
        uint256 id = _jobId(j);
        if (id == 0) return;
        ARLJobs.Job memory job = jobs.getJob(id);
        uint256 budget = job.budget;
        vm.prank(_caller(who, job.evaluator));
        try jobs.complete(id, bytes32(0), "") {
            ghostPaid += budget;
        } catch {}
    }

    function reject(uint256 j, uint256 who) external {
        uint256 id = _jobId(j);
        if (id == 0) return;
        ARLJobs.Job memory job = jobs.getJob(id);
        vm.prank(_caller(who, job.status == ARLJobs.JobStatus.Open ? job.client : job.evaluator));
        try jobs.reject(id, bytes32(0), "") {
            if (job.status != ARLJobs.JobStatus.Open) ghostRefunded += job.budget;
        } catch {}
    }

    function claimRefund(uint256 j, uint256 who) external {
        uint256 id = _jobId(j);
        if (id == 0) return;
        uint256 budget = jobs.getJob(id).budget;
        vm.prank(_actor(who));
        try jobs.claimRefund(id) {
            ghostRefunded += budget;
        } catch {}
    }

    function warp(uint256 by) external {
        vm.warp(block.timestamp + bound(by, 1, 12 hours));
    }
}

contract ARLJobsInvariantTest is ARLTestBase {
    ARLJobs internal jobs;
    ARLJobsHandler internal handler;
    address[] internal actors;

    function setUp() public override {
        super.setUp();
        jobs = new ARLJobs(IERC20(address(token)));
        for (uint256 i; i < 4; ++i) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            vm.prank(launchSafe);
            token.transfer(a, 100_000 ether);
            vm.prank(a);
            token.approve(address(jobs), type(uint256).max);
        }
        handler = new ARLJobsHandler(jobs, token, actors);
        targetContract(address(handler));
    }

    /// The contract holds exactly the budgets of the jobs that are Funded or Submitted.
    function invariant_balanceIsTheOpenEscrow() public view {
        uint256 escrow;
        uint256 n = jobs.jobCounter();
        for (uint256 id = 1; id <= n; ++id) {
            ARLJobs.Job memory job = jobs.getJob(id);
            if (job.status == ARLJobs.JobStatus.Funded || job.status == ARLJobs.JobStatus.Submitted)
            {
                escrow += job.budget;
            }
        }
        assertEq(token.balanceOf(address(jobs)), escrow);
    }

    /// Every token funded is still escrowed, paid to a provider or refunded to a client.
    function invariant_everyTokenIsAccountedFor() public view {
        assertEq(
            handler.ghostFunded(),
            token.balanceOf(address(jobs)) + handler.ghostPaid() + handler.ghostRefunded()
        );
    }

    /// Tokens only move between the accounts and the escrow.
    function invariant_supplyIsConserved() public view {
        uint256 total = token.balanceOf(address(jobs));
        for (uint256 i; i < actors.length; ++i) {
            total += token.balanceOf(actors[i]);
        }
        assertEq(total, actors.length * 100_000 ether);
    }
}
