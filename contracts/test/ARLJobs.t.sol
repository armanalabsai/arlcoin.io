// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../src/ARLJobs.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

contract ARLJobsTest is ARLTestBase {
    ARLJobs internal jobs;

    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal evaluator = makeAddr("evaluator");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant BUDGET = 250 ether;
    bytes32 internal constant WORK = keccak256("result");
    bytes32 internal constant REASON = keccak256("checked");

    function setUp() public override {
        super.setUp();
        jobs = new ARLJobs(IERC20(address(token)));
        vm.prank(launchSafe);
        token.transfer(client, 10_000 ether);
        vm.prank(client);
        token.approve(address(jobs), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    function _create(address p) internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(
            p, evaluator, block.timestamp + 1 days, "Summarise 10 documents", address(0)
        );
    }

    function _funded() internal returns (uint256 id) {
        id = _create(provider);
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
    }

    function _submitted() internal returns (uint256 id) {
        id = _funded();
        vm.prank(provider);
        jobs.submit(id, WORK, "");
    }

    function _status(uint256 id) internal view returns (ARLJobs.JobStatus) {
        return jobs.getJob(id).status;
    }

    // ---------------------------------------------------------------- creation

    function test_constructorRejectsZeroToken() public {
        vm.expectRevert(ARLJobs.ZeroAddress.selector);
        new ARLJobs(IERC20(address(0)));
    }

    function test_createJob() public {
        vm.expectEmit(address(jobs));
        emit ARLJobs.JobCreated(
            1, client, provider, evaluator, block.timestamp + 1 days, address(0)
        );
        uint256 id = _create(provider);
        assertEq(id, 1);
        ARLJobs.Job memory job = jobs.getJob(id);
        assertEq(job.id, 1);
        assertEq(job.client, client);
        assertEq(job.provider, provider);
        assertEq(job.evaluator, evaluator);
        assertEq(job.description, "Summarise 10 documents");
        assertEq(job.budget, 0);
        assertEq(uint256(job.status), uint256(ARLJobs.JobStatus.Open));
        assertEq(job.hook, address(0));
        assertEq(jobs.jobCounter(), 1);
    }

    function test_createJobChecks() public {
        vm.startPrank(client);
        vm.expectRevert(ARLJobs.ZeroAddress.selector);
        jobs.createJob(provider, address(0), block.timestamp + 1 days, "", address(0));
        vm.expectRevert(ARLJobs.ExpiryTooShort.selector);
        jobs.createJob(provider, evaluator, block.timestamp + 5 minutes - 1, "", address(0));
        vm.expectRevert(ARLJobs.HooksUnsupported.selector);
        jobs.createJob(provider, evaluator, block.timestamp + 1 days, "", address(1));
        vm.expectRevert(ARLJobs.DescriptionTooLong.selector);
        jobs.createJob(
            provider, evaluator, block.timestamp + 1 days, string(new bytes(1025)), address(0)
        );
        // The limits themselves are accepted.
        jobs.createJob(
            provider, evaluator, block.timestamp + 5 minutes, string(new bytes(1024)), address(0)
        );
        vm.stopPrank();
    }

    function test_unknownJob() public {
        vm.expectRevert(ARLJobs.InvalidJob.selector);
        jobs.submit(7, WORK, "");
        vm.expectRevert(ARLJobs.InvalidJob.selector);
        jobs.claimRefund(0);
    }

    // ---------------------------------------------------------------- provider and budget

    function test_setProviderLater() public {
        uint256 id = _create(address(0));
        vm.prank(stranger);
        vm.expectRevert(ARLJobs.Unauthorized.selector);
        jobs.setProvider(id, provider, "");
        vm.prank(client);
        vm.expectRevert(ARLJobs.ZeroAddress.selector);
        jobs.setProvider(id, address(0), "");

        vm.prank(client);
        vm.expectEmit(address(jobs));
        emit ARLJobs.ProviderSet(id, provider);
        jobs.setProvider(id, provider, "");
        assertEq(jobs.getJob(id).provider, provider);

        vm.prank(client);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.setProvider(id, stranger, "");
    }

    function test_fundNeedsProvider() public {
        uint256 id = _create(address(0));
        vm.startPrank(client);
        jobs.setBudget(id, BUDGET, "");
        vm.expectRevert(ARLJobs.ProviderNotSet.selector);
        jobs.fund(id, BUDGET, "");
        vm.stopPrank();
    }

    function test_setBudgetByClientOrProviderOnly() public {
        uint256 id = _create(provider);
        vm.prank(client);
        jobs.setBudget(id, 1 ether, "");
        vm.prank(provider);
        jobs.setBudget(id, 2 ether, "");
        assertEq(jobs.getJob(id).budget, 2 ether);
        vm.prank(evaluator);
        vm.expectRevert(ARLJobs.Unauthorized.selector);
        jobs.setBudget(id, 3 ether, "");
    }

    // ---------------------------------------------------------------- funding

    function test_fund() public {
        uint256 id = _create(provider);
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        uint256 before = token.balanceOf(client);
        vm.prank(client);
        vm.expectEmit(address(jobs));
        emit ARLJobs.JobFunded(id, client, BUDGET);
        jobs.fund(id, BUDGET, "");
        assertEq(token.balanceOf(client), before - BUDGET);
        assertEq(token.balanceOf(address(jobs)), BUDGET);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Funded));
        // Nothing about the price can change once funded.
        vm.prank(provider);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.setBudget(id, 1, "");
    }

    function test_fundChecks() public {
        uint256 id = _create(provider);
        vm.prank(client);
        vm.expectRevert(ARLJobs.ZeroBudget.selector);
        jobs.fund(id, 0, "");

        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(provider);
        vm.expectRevert(ARLJobs.Unauthorized.selector);
        jobs.fund(id, BUDGET, "");

        vm.warp(block.timestamp + 1 days);
        vm.prank(client);
        vm.expectRevert(ARLJobs.JobExpiredAlready.selector);
        jobs.fund(id, BUDGET, "");
    }

    /// The provider raises the price after the client has decided to fund: the client's
    /// transaction fails instead of paying the new price.
    function test_fundRefusesAChangedBudget() public {
        uint256 id = _create(provider);
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(provider);
        jobs.setBudget(id, BUDGET * 10, "");
        vm.prank(client);
        vm.expectRevert(ARLJobs.BudgetMismatch.selector);
        jobs.fund(id, BUDGET, "");
    }

    // ---------------------------------------------------------------- submit, complete

    function test_submitAndComplete() public {
        uint256 id = _funded();
        vm.prank(provider);
        vm.expectEmit(address(jobs));
        emit ARLJobs.JobSubmitted(id, provider, WORK);
        jobs.submit(id, WORK, "");
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Submitted));

        vm.prank(evaluator);
        vm.expectEmit(address(jobs));
        emit ARLJobs.JobCompleted(id, evaluator, REASON);
        vm.expectEmit(address(jobs));
        emit ARLJobs.PaymentReleased(id, provider, BUDGET);
        jobs.complete(id, REASON, "");
        assertEq(token.balanceOf(provider), BUDGET);
        assertEq(token.balanceOf(address(jobs)), 0);
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Completed));
    }

    function test_submitChecks() public {
        uint256 open = _create(provider);
        vm.prank(provider);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.submit(open, WORK, "");

        uint256 id = _funded();
        vm.prank(client);
        vm.expectRevert(ARLJobs.Unauthorized.selector);
        jobs.submit(id, WORK, "");

        vm.warp(block.timestamp + 1 days);
        vm.prank(provider);
        vm.expectRevert(ARLJobs.JobExpiredAlready.selector);
        jobs.submit(id, WORK, "");
    }

    function test_onlyTheEvaluatorCompletes() public {
        uint256 id = _submitted();
        address[3] memory others = [client, provider, stranger];
        for (uint256 i; i < others.length; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(ARLJobs.Unauthorized.selector);
            jobs.complete(id, REASON, "");
        }
        uint256 funded = _funded();
        vm.prank(evaluator);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.complete(funded, REASON, "");
    }

    function test_evaluatorCanBeTheClient() public {
        vm.prank(client);
        uint256 id = jobs.createJob(provider, client, block.timestamp + 1 days, "", address(0));
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        vm.prank(provider);
        jobs.submit(id, WORK, "");
        vm.prank(client);
        jobs.complete(id, bytes32(0), "");
        assertEq(token.balanceOf(provider), BUDGET);
    }

    // ---------------------------------------------------------------- reject

    function test_clientRejectsWhileOpen() public {
        uint256 id = _create(provider);
        vm.prank(evaluator);
        vm.expectRevert(ARLJobs.Unauthorized.selector);
        jobs.reject(id, REASON, "");
        vm.prank(client);
        vm.expectEmit(address(jobs));
        emit ARLJobs.JobRejected(id, client, REASON);
        jobs.reject(id, REASON, "");
        assertEq(uint256(_status(id)), uint256(ARLJobs.JobStatus.Rejected));
    }

    function test_evaluatorRejectsFundedOrSubmitted() public {
        uint256 before = token.balanceOf(client);
        uint256 funded = _funded();
        uint256 submitted = _submitted();
        assertEq(token.balanceOf(client), before - 2 * BUDGET);

        // Once funded, the client cannot take the money back alone.
        vm.prank(client);
        vm.expectRevert(ARLJobs.Unauthorized.selector);
        jobs.reject(funded, REASON, "");

        vm.prank(evaluator);
        vm.expectEmit(address(jobs));
        emit ARLJobs.Refunded(funded, client, BUDGET);
        jobs.reject(funded, REASON, "");
        vm.prank(evaluator);
        jobs.reject(submitted, REASON, "");
        assertEq(token.balanceOf(client), before);
        assertEq(token.balanceOf(address(jobs)), 0);
    }

    function test_terminalStatesAreFinal() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.complete(id, REASON, "");
        vm.prank(evaluator);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.reject(id, REASON, "");
        vm.prank(evaluator);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.complete(id, REASON, "");
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.claimRefund(id);
    }

    // ---------------------------------------------------------------- expiry

    function test_claimRefundAfterExpiry() public {
        uint256 funded = _funded();
        uint256 submitted = _submitted();
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.claimRefund(funded);

        vm.warp(block.timestamp + 1 days);
        uint256 before = token.balanceOf(client);
        vm.prank(stranger);
        vm.expectEmit(address(jobs));
        emit ARLJobs.JobExpired(funded);
        jobs.claimRefund(funded);
        vm.prank(stranger);
        jobs.claimRefund(submitted);
        assertEq(token.balanceOf(client), before + 2 * BUDGET);
        assertEq(uint256(_status(submitted)), uint256(ARLJobs.JobStatus.Expired));
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.claimRefund(funded);
    }

    function test_openJobCannotBeRefunded() public {
        uint256 id = _create(provider);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(ARLJobs.WrongStatus.selector);
        jobs.claimRefund(id);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_escrowGoesToExactlyOneSide(uint96 budget, uint8 outcome) public {
        budget = uint96(bound(budget, 1, 10_000 ether));
        uint256 id = _create(provider);
        vm.prank(provider);
        jobs.setBudget(id, budget, "");
        vm.prank(client);
        jobs.fund(id, budget, "");
        uint256 clientBefore = token.balanceOf(client);

        outcome %= 3;
        if (outcome == 0) {
            vm.prank(provider);
            jobs.submit(id, WORK, "");
            vm.prank(evaluator);
            jobs.complete(id, REASON, "");
            assertEq(token.balanceOf(provider), budget);
            assertEq(token.balanceOf(client), clientBefore);
        } else if (outcome == 1) {
            vm.prank(evaluator);
            jobs.reject(id, REASON, "");
            assertEq(token.balanceOf(provider), 0);
            assertEq(token.balanceOf(client), clientBefore + budget);
        } else {
            vm.warp(block.timestamp + 1 days);
            jobs.claimRefund(id);
            assertEq(token.balanceOf(provider), 0);
            assertEq(token.balanceOf(client), clientBefore + budget);
        }
        assertEq(token.balanceOf(address(jobs)), 0);
    }
}
