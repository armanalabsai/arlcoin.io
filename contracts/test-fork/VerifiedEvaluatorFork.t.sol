// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../src/ARLJobs.sol";
import {ARLVerifiedEvaluator} from "../src/ARLVerifiedEvaluator.sol";
import {DeploySepoliaEvaluator} from "../script/DeploySepoliaEvaluator.s.sol";

interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
}

/// @title The verified evaluator against the deployed Base Sepolia contracts, on a fork
/// @notice The ARL token, the `ARLJobs` escrow and the canonical ERC-8004 registries are the real
/// Base Sepolia contracts (`contracts/deploy/base-sepolia.json`); only the evaluator is deployed
/// on the fork, through its deployment script. Nothing is broadcast.
///
/// Run: `FOUNDRY_PROFILE=fork forge test --match-contract VerifiedEvaluatorFork` with
/// `ARL_FORK_RPC` set to a Base Sepolia RPC URL.
contract VerifiedEvaluatorForkTest is Test {
    uint256 internal constant FORK_BLOCK = 48_248_000;
    IERC20 internal constant ARL = IERC20(0x244312b619127B6458154F3467eFD7c87CD28500);
    ARLJobs internal constant JOBS = ARLJobs(0xec79a897105aEd6daFBbB2a904E5bcFF71455644);
    bytes32 internal constant NEW_FEEDBACK = keccak256(
        "NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)"
    );

    ARLVerifiedEvaluator internal ev;
    IIdentityRegistry internal identity;
    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal arbiter = makeAddr("arbiter");
    address internal v1 = makeAddr("v1");
    address internal v2 = makeAddr("v2");
    address internal v3 = makeAddr("v3");

    function setUp() public {
        vm.createSelectFork(vm.envString("ARL_FORK_RPC"), FORK_BLOCK);
        DeploySepoliaEvaluator script = new DeploySepoliaEvaluator();
        ev = script.deploy(address(JOBS), address(ARL), arbiter, 1 hours, 10 ether);
        identity = IIdentityRegistry(script.IDENTITY_REGISTRY());

        address[4] memory accounts = [client, v1, v2, v3];
        for (uint256 i; i < accounts.length; ++i) {
            deal(address(ARL), accounts[i], 1_000 ether);
            vm.startPrank(accounts[i]);
            ARL.approve(address(JOBS), type(uint256).max);
            ARL.approve(address(ev), type(uint256).max);
            vm.stopPrank();
        }
        address[3] memory validators = [v1, v2, v3];
        for (uint256 i; i < validators.length; ++i) {
            vm.prank(validators[i]);
            ev.stake(100 ether);
        }
    }

    function _job(uint256 agentId) internal returns (uint256 id) {
        address[] memory committee = new address[](3);
        committee[0] = v1;
        committee[1] = v2;
        committee[2] = v3;
        vm.startPrank(client);
        id = JOBS.createJob(provider, address(ev), block.timestamp + 1 days, "fork", address(0));
        ev.configure(
            id,
            ARLVerifiedEvaluator.Config({
                tier: ARLVerifiedEvaluator.Tier.Reexecution,
                threshold: 2,
                bond: 20 ether,
                providerAgentId: agentId,
                specHash: keccak256("spec"),
                committee: committee
            })
        );
        vm.stopPrank();
        vm.prank(provider);
        JOBS.setBudget(id, 50 ether, "");
        vm.prank(client);
        JOBS.fund(id, 50 ether, "");
        vm.prank(provider);
        JOBS.submit(id, keccak256("work"), "");
    }

    function test_deployedContracts() public view {
        assertGt(address(JOBS).code.length, 0);
        assertEq(address(JOBS.paymentToken()), address(ARL));
        assertGt(address(ev.reputation()).code.length, 0);
        assertGt(address(ev.identity()).code.length, 0);
    }

    /// Approved by 2 of 3, finalized after the window: the provider is paid by the real escrow
    /// and the real ReputationRegistry records feedback from the evaluator.
    function test_approvedJobPaysAndWritesErc8004Feedback() public {
        vm.prank(provider);
        uint256 agentId = identity.register("data:application/json;base64,e30=");
        assertEq(identity.ownerOf(agentId), provider);

        uint256 id = _job(agentId);
        vm.prank(v1);
        ev.vote(id, true, keccak256("work"), bytes32(0));
        vm.prank(v2);
        ev.vote(id, true, keccak256("work"), bytes32(0));
        vm.warp(block.timestamp + 1 hours);

        uint256 before = ARL.balanceOf(provider);
        vm.recordLogs();
        ev.finalize(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(ARL.balanceOf(provider), before + 50 ether);
        assertEq(uint256(JOBS.getJob(id).status), uint256(ARLJobs.JobStatus.Completed));
        bool feedback;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(ev.reputation()) && logs[i].topics[0] == NEW_FEEDBACK) {
                assertEq(uint256(logs[i].topics[1]), agentId);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), address(ev));
                feedback = true;
            }
            assertTrue(logs[i].topics[0] != ARLVerifiedEvaluator.FeedbackFailed.selector);
        }
        assertTrue(feedback);
    }

    /// A wrong approval overturned by the arbiter: the client is refunded by the real escrow and
    /// the approvers' bonds are burned.
    function test_overturnedApprovalRefundsAndSlashes() public {
        uint256 id = _job(0);
        vm.prank(v1);
        ev.vote(id, true, keccak256("work"), bytes32(0));
        vm.prank(v2);
        ev.vote(id, true, keccak256("work"), bytes32(0));
        deal(address(ARL), client, ARL.balanceOf(client) + 20 ether);
        vm.prank(client);
        ev.dispute(id, keccak256("output differs"));
        uint256 before = ARL.balanceOf(client);
        vm.prank(arbiter);
        ev.resolve(id, false, bytes32(0));
        assertEq(ARL.balanceOf(client), before + 50 ether + 20 ether);
        assertEq(ev.stakeOf(v1), 80 ether);
        assertEq(ev.stakeOf(v2), 80 ether);
        assertEq(uint256(JOBS.getJob(id).status), uint256(ARLJobs.JobStatus.Rejected));
    }
}
