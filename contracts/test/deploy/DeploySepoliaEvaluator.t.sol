// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../../src/ARLJobs.sol";
import {ARLVerifiedEvaluator} from "../../src/ARLVerifiedEvaluator.sol";
import {DeploySepoliaEvaluator} from "../../script/DeploySepoliaEvaluator.s.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev The evaluator deployment: allowed chains only, inputs with code, registries per chain.
contract DeploySepoliaEvaluatorTest is ARLTestBase {
    DeploySepoliaEvaluator internal script;
    ARLJobs internal jobs;
    address internal arbiter = makeAddr("arbiter");

    function setUp() public override {
        super.setUp();
        script = new DeploySepoliaEvaluator();
        jobs = new ARLJobs(IERC20(address(token)));
    }

    function test_refusesBaseMainnetAndOtherChains() public {
        uint256[4] memory chains = [uint256(8453), 1, 10, 11_155_111];
        for (uint256 i; i < chains.length; ++i) {
            vm.chainId(chains[i]);
            vm.expectRevert(
                abi.encodeWithSelector(DeploySepoliaEvaluator.ChainNotAllowed.selector, chains[i])
            );
            script.deploy(address(jobs), address(token), arbiter, 1 hours, 10 ether);
        }
    }

    function test_refusesInputsWithoutCode() public {
        vm.chainId(31_337);
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(DeploySepoliaEvaluator.NoCode.selector, "jobs", eoa));
        script.deploy(eoa, address(token), arbiter, 1 hours, 10 ether);
        vm.expectRevert(
            abi.encodeWithSelector(DeploySepoliaEvaluator.NoCode.selector, "token", eoa)
        );
        script.deploy(address(jobs), eoa, arbiter, 1 hours, 10 ether);
    }

    function test_refusesBaseSepoliaWithoutRegistries() public {
        vm.chainId(84_532);
        address identity = script.IDENTITY_REGISTRY();
        vm.expectRevert(
            abi.encodeWithSelector(
                DeploySepoliaEvaluator.NoCode.selector, "identity registry", identity
            )
        );
        script.deploy(address(jobs), address(token), arbiter, 1 hours, 10 ether);

        vm.etch(identity, hex"00");
        address reputation = script.REPUTATION_REGISTRY();
        vm.expectRevert(
            abi.encodeWithSelector(
                DeploySepoliaEvaluator.NoCode.selector, "reputation registry", reputation
            )
        );
        script.deploy(address(jobs), address(token), arbiter, 1 hours, 10 ether);
    }

    function test_deploysLocalWithoutRegistries() public {
        vm.chainId(31_337);
        ARLVerifiedEvaluator ev =
            script.deploy(address(jobs), address(token), arbiter, 1 hours, 10 ether);
        assertEq(address(ev.jobs()), address(jobs));
        assertEq(address(ev.stakeToken()), address(token));
        assertEq(ev.arbiter(), arbiter);
        assertEq(ev.challengeWindow(), 1 hours);
        assertEq(ev.minBond(), 10 ether);
        assertEq(address(ev.identity()), address(0));
        assertEq(address(ev.reputation()), address(0));
    }

    function test_deploysBaseSepoliaWithCanonicalRegistries() public {
        vm.chainId(84_532);
        vm.etch(script.IDENTITY_REGISTRY(), hex"00");
        vm.etch(script.REPUTATION_REGISTRY(), hex"00");
        ARLVerifiedEvaluator ev =
            script.deploy(address(jobs), address(token), arbiter, 1 hours, 10 ether);
        assertEq(address(ev.identity()), script.IDENTITY_REGISTRY());
        assertEq(address(ev.reputation()), script.REPUTATION_REGISTRY());
    }

    function test_run() public {
        vm.chainId(31_337);
        vm.setEnv("ARL_JOBS", vm.toString(address(jobs)));
        vm.setEnv("ARL_TOKEN", vm.toString(address(token)));
        vm.setEnv("ARL_ARBITER", vm.toString(arbiter));
        vm.setEnv("ARL_CHALLENGE_WINDOW", "7200");
        vm.setEnv("ARL_MIN_BOND", "5000000000000000000");
        ARLVerifiedEvaluator ev = script.run();
        assertEq(ev.challengeWindow(), 2 hours);
        assertEq(ev.minBond(), 5 ether);
    }
}
