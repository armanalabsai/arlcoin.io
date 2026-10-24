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
        vm.setEnv("ARL_ARBITER", vm.toString(arbiter));
        vm.setEnv("ARL_TOKEN", vm.toString(address(token)));
    }

    function test_localDeployWiresTheEscrowAndTheEvaluator() public {
        (ARLJobs jobs, ARLVerifiedEvaluator evaluator) = script.run();
        assertEq(address(jobs.paymentToken()), address(token));
        assertEq(address(evaluator.jobs()), address(jobs));
        assertEq(evaluator.arbiter(), arbiter);
        assertEq(evaluator.minChallengeWindow(), 24 hours);
        assertEq(evaluator.minBond(), 100 ether);
        assertEq(address(evaluator.identity()), address(0));
    }

    function test_refusesOtherChains() public {
        vm.chainId(84_532);
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetVerifiedJobs.ChainNotAllowed.selector, 84_532)
        );
        script.check(address(token), arbiter);
    }

    function test_mainnetRefusesAnotherToken() public {
        vm.chainId(8453);
        vm.warp(2_000_000_000);
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnetVerifiedJobs.WrongToken.selector, address(token))
        );
        script.check(address(token), arbiter);
    }
}
