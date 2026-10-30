// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../src/ARLJobs.sol";
import {ARLVerifiedEvaluator} from "../src/ARLVerifiedEvaluator.sol";
import {CreateArbiterSafe} from "../script/CreateArbiterSafe.s.sol";
import {CreateSafes, ISafe, ISafeProxyFactory} from "../script/CreateSafes.s.sol";
import {DeploySepoliaEvaluator} from "../script/DeploySepoliaEvaluator.s.sol";

interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
}

interface IReputationSummary {
    function getSummary(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);
}

interface ISafeExec {
    function nonce() external view returns (uint256);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 nonce
    ) external view returns (bytes32);
    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes calldata signatures
    ) external payable returns (bool);
}

/// @title The verified evaluator against the deployed Base Sepolia contracts, on a fork
/// @notice The ARL token, the `ARLJobs` escrow, the canonical ERC-8004 registries and the
/// canonical Safe v1.5.0 contracts are the real Base Sepolia contracts; the arbiter Safe and the
/// evaluator are created on the fork by their scripts. Nothing is broadcast to Base Sepolia.
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

    DeploySepoliaEvaluator internal deployer;
    ARLVerifiedEvaluator internal ev;
    IIdentityRegistry internal identity;
    address internal arbiterSafe;
    uint256[3] internal signerKeys;
    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal v1 = makeAddr("v1");
    address internal v2 = makeAddr("v2");
    address internal v3 = makeAddr("v3");

    function setUp() public {
        vm.createSelectFork(vm.envString("ARL_FORK_RPC"), FORK_BLOCK);

        // Arbiter: a 2-of-3 Safe from CreateArbiterSafe, owners sorted so signatures can be too.
        address[] memory owners = new address[](3);
        for (uint256 i; i < 3; ++i) {
            (owners[i], signerKeys[i]) = makeAddrAndKey(string.concat("signer", vm.toString(i)));
        }
        _sort(owners);
        vm.setEnv(
            "ARL_ARBITER_OWNERS",
            string.concat(
                vm.toString(owners[0]), ",", vm.toString(owners[1]), ",", vm.toString(owners[2])
            )
        );
        vm.setEnv("ARL_ARBITER_THRESHOLD", "2");
        vm.setEnv("ARL_SALT", "fork-test");
        arbiterSafe = new CreateArbiterSafe().run();

        deployer = new DeploySepoliaEvaluator();
        ev = deployer.deploy(address(JOBS), arbiterSafe, 1 hours, 1 ether);
        identity = IIdentityRegistry(deployer.IDENTITY_REGISTRY());

        address[5] memory accounts = [client, provider, v1, v2, v3];
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

    function _sort(address[] memory a) internal pure {
        for (uint256 i; i < a.length; ++i) {
            for (uint256 j = i + 1; j < a.length; ++j) {
                if (a[j] < a[i]) (a[i], a[j]) = (a[j], a[i]);
            }
        }
    }

    /// Signs and executes `data` on the evaluator from the arbiter Safe with two of its signers.
    function _safeCall(bytes memory data) internal {
        ISafeExec safe = ISafeExec(arbiterSafe);
        bytes32 h = safe.getTransactionHash(
            address(ev), 0, data, 0, 0, 0, 0, address(0), address(0), safe.nonce()
        );
        uint256[2] memory keys = [signerKeys[0], signerKeys[1]];
        if (vm.addr(keys[1]) < vm.addr(keys[0])) (keys[0], keys[1]) = (keys[1], keys[0]);
        bytes memory sigs;
        for (uint256 i; i < 2; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[i], h);
            sigs = abi.encodePacked(sigs, r, s, v);
        }
        assertTrue(
            safe.execTransaction(
                address(ev), 0, data, 0, 0, 0, 0, address(0), payable(address(0)), sigs
            )
        );
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
                voteWindow: 1 hours,
                challengeWindow: 1 hours,
                bond: 5 ether,
                providerAgentId: agentId,
                specHash: keccak256("spec"),
                committee: committee
            })
        );
        vm.stopPrank();
        vm.startPrank(provider);
        ev.approveCommittee(id);
        JOBS.setBudget(id, 50 ether, "");
        vm.stopPrank();
        vm.prank(client);
        JOBS.fund(id, 50 ether, "");
        address[3] memory validators = [v1, v2, v3];
        for (uint256 i; i < 3; ++i) {
            vm.prank(validators[i]);
            ev.accept(id);
        }
        vm.startPrank(provider);
        JOBS.submit(id, keccak256("work"), "");
        ev.startVoting(id);
        vm.stopPrank();
    }

    function test_deployedContracts() public view {
        assertEq(address(JOBS.paymentToken()), address(ARL));
        assertEq(address(ev.stakeToken()), address(ARL));
        assertEq(ev.arbiter(), arbiterSafe);
        assertEq(ISafe(arbiterSafe).getThreshold(), 2);
        assertEq(ISafe(arbiterSafe).getOwners().length, 3);
        assertGt(address(ev.reputation()).code.length, 0);
        assertGt(address(ev.identity()).code.length, 0);
    }

    /// A real Safe with a single signature is refused as arbiter.
    function test_RevertWhen_ArbiterSafeOfOneSignature() public {
        CreateSafes.SafeContracts memory c = new CreateSafes().safeContracts(false);
        address[] memory owners = new address[](1);
        owners[0] = makeAddr("solo");
        address weak = ISafeProxyFactory(c.factory)
            .createProxyWithNonce(
                c.singleton,
                abi.encodeCall(
                    ISafe.setup,
                    (owners, 1, address(0), "", c.fallbackHandler, address(0), 0, payable(address(0)))
                ),
                1
            );
        vm.expectRevert(
            abi.encodeWithSelector(DeploySepoliaEvaluator.ArbiterThresholdTooLow.selector, 1)
        );
        deployer.checkArbiter(weak);
    }

    /// Approved by 2 of 3, finalized after the window: the provider is paid by the real escrow,
    /// the real ReputationRegistry records feedback from the evaluator, and a read that allowlists
    /// the evaluator as the only client sees exactly that verified job.
    function test_approvedJobPaysAndWritesAllowlistedFeedback() public {
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

        // Someone else writes a fake 100 for the same agent: the allowlisted read ignores it.
        vm.prank(makeAddr("sybil"));
        (bool ok,) = address(ev.reputation())
            .call(
                abi.encodeWithSignature(
                    "giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)",
                    agentId,
                    int128(100),
                    uint8(0),
                    "arl-verified",
                    "reexecution",
                    "",
                    "",
                    bytes32(0)
                )
            );
        assertTrue(ok);
        address[] memory allow = new address[](1);
        allow[0] = address(ev);
        (uint64 count, int128 value,) = IReputationSummary(address(ev.reputation()))
            .getSummary(agentId, allow, "arl-verified", "");
        assertEq(count, 1);
        assertEq(value, 100);
    }

    /// A wrong approval disputed by the client and overturned by the arbiter Safe (2 of 3
    /// signatures): the client is refunded by the real escrow and the approvers' bonds are burned.
    function test_safeOverturnsApprovalRefundsAndSlashes() public {
        uint256 id = _job(0);
        vm.prank(v1);
        ev.vote(id, true, keccak256("work"), bytes32(0));
        vm.prank(v2);
        ev.vote(id, true, keccak256("work"), bytes32(0));
        uint256 bond = ev.getVerdict(id).bond;
        assertEq(bond, 5 ether); // a tenth of 50 ARL equals the floor
        vm.prank(client);
        ev.dispute(id, keccak256("output differs"));
        uint256 before = ARL.balanceOf(client);

        _safeCall(abi.encodeCall(ARLVerifiedEvaluator.resolve, (id, false, keccak256("re-ran"))));

        assertEq(ARL.balanceOf(client), before + 50 ether + bond);
        assertEq(ev.stakeOf(v1), 100 ether - bond);
        assertEq(ev.stakeOf(v2), 100 ether - bond);
        assertEq(ev.stakeOf(v3), 100 ether);
        assertEq(uint256(JOBS.getJob(id).status), uint256(ARLJobs.JobStatus.Rejected));
    }

    /// Two members accept and never vote: after the vote window their bonds are burned and the
    /// client is refunded by the real escrow.
    function test_absentValidatorsSlashedAndClientRefunded() public {
        uint256 id = _job(0);
        vm.prank(v1);
        ev.vote(id, true, keccak256("work"), bytes32(0));
        vm.warp(block.timestamp + 1 hours);
        uint256 before = ARL.balanceOf(client);
        ev.closeUndecided(id);
        assertEq(ARL.balanceOf(client), before + 50 ether);
        assertEq(ev.stakeOf(v2), 95 ether);
        assertEq(ev.stakeOf(v3), 95 ether);
        assertEq(ev.stakeOf(v1), 100 ether);
    }
}
