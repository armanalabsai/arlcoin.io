// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ARLJobs} from "../../src/ARLJobs.sol";
import {ARLVerifiedEvaluator} from "../../src/ARLVerifiedEvaluator.sol";
import {DeployMainnetVerifiedJobs} from "../../script/DeployMainnetVerifiedJobs.s.sol";

contract TestToken is ERC20 {
    constructor() ERC20("Test", "TST") {}
}

contract DeployMainnetVerifiedJobsTest is Test {
    DeployMainnetVerifiedJobs internal script;
    TestToken internal token;
    address internal arbiter = makeAddr("arbiter");

    function setUp() public {
        vm.chainId(31_337);
        script = new DeployMainnetVerifiedJobs();
        token = new TestToken();
    }

    function test_localDeployWiresTheEscrowAndTheEvaluator() public {
        // Explicit inputs: other suites set ARL_* environment variables in parallel.
        (ARLJobs jobs, ARLVerifiedEvaluator evaluator) = script.deploy(
            address(token),
            address(token),
            arbiter,
            script.DEFAULT_MIN_CHALLENGE_WINDOW(),
            script.DEFAULT_MIN_BOND()
        );
        assertEq(address(jobs.paymentToken()), address(token));
        assertEq(address(evaluator.jobs()), address(jobs));
        assertEq(evaluator.arbiter(), arbiter);
        assertEq(evaluator.minChallengeWindow(), 24 hours);
        assertEq(evaluator.minBond(), 100 ether);
        assertEq(address(evaluator.identity()), address(0));
        assertTrue(evaluator.bondFollowsBudget());
    }

    function test_localDeployPaidInOneTokenBondedInAnother() public {
        TestToken stake = new TestToken();
        (ARLJobs jobs, ARLVerifiedEvaluator evaluator) =
            script.deploy(address(token), address(stake), arbiter, 24 hours, 100 ether);
        assertEq(address(jobs.paymentToken()), address(token));
        assertEq(address(evaluator.stakeToken()), address(stake));
        assertFalse(evaluator.bondFollowsBudget());
    }

    function test_mainnetBondsOnlyInArl() public {
        vm.chainId(8453);
        vm.warp(2_000_000_000);
        address usdc = script.USDC();
        vm.etch(usdc, hex"00");
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployMainnetVerifiedJobs.WrongStakeToken.selector, address(token)
            )
        );
        script.check(usdc, address(token), arbiter);
    }

    function test_evaluatorOnlyForAnEscrowOnChain() public {
        ARLJobs jobs = new ARLJobs(token);
        ARLVerifiedEvaluator evaluator = script.deployEvaluator(
            jobs,
            address(token),
            address(token),
            arbiter,
            script.DEFAULT_MIN_CHALLENGE_WINDOW(),
            script.DEFAULT_MIN_BOND()
        );
        assertEq(address(evaluator.jobs()), address(jobs));
        assertEq(evaluator.arbiter(), arbiter);
    }

    function test_evaluatorOnlyRefusesAnEscrowInAnotherToken() public {
        ARLJobs jobs = new ARLJobs(new TestToken());
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetVerifiedJobs.WrongJobsToken.selector, address(jobs))
        );
        script.deployEvaluator(jobs, address(token), address(token), arbiter, 24 hours, 100 ether);
    }

    function test_evaluatorOnlyRefusesAnAddressWithoutCode() public {
        address none = makeAddr("none");
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetVerifiedJobs.NoCode.selector, "jobs escrow", none)
        );
        script.deployEvaluator(
            ARLJobs(none), address(token), address(token), arbiter, 24 hours, 100 ether
        );
    }

    function test_defaultsAreTwentyFourHoursAndOneHundredArl() public view {
        assertEq(script.DEFAULT_MIN_CHALLENGE_WINDOW(), 24 hours);
        assertEq(script.DEFAULT_MIN_BOND(), 100 ether);
    }

    function test_refusesOtherChains() public {
        vm.chainId(84_532);
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetVerifiedJobs.ChainNotAllowed.selector, 84_532)
        );
        script.check(address(token), address(token), arbiter);
    }

    function test_mainnetRefusesAnotherToken() public {
        vm.chainId(8453);
        vm.warp(2_000_000_000);
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetVerifiedJobs.WrongToken.selector, address(token))
        );
        script.check(address(token), address(token), arbiter);
    }
}
