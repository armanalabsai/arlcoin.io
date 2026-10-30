// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLJobs} from "../../src/ARLJobs.sol";
import {ARLVerifiedEvaluator} from "../../src/ARLVerifiedEvaluator.sol";
import {CreateArbiterSafe} from "../../script/CreateArbiterSafe.s.sol";
import {CreateSafes} from "../../script/CreateSafes.s.sol";
import {DeploySepoliaEvaluator} from "../../script/DeploySepoliaEvaluator.s.sol";
import {ARLTestBase} from "../ARLTestBase.sol";

/// @dev The evaluator deployment (allowed chains only, inputs with code, registries and a Safe
/// arbiter on Base Sepolia) and the arbiter Safe's signer rules. The arbiter Safe is created on
/// a real Safe v1.5.0 in `test-fork/VerifiedEvaluatorFork.t.sol`.
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
            script.deploy(address(jobs), arbiter, 1 hours, 1 ether);
        }
    }

    function test_refusesInputsWithoutCode() public {
        vm.chainId(31_337);
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(DeploySepoliaEvaluator.NoCode.selector, "jobs", eoa));
        script.deploy(eoa, arbiter, 1 hours, 1 ether);
        ARLJobs tokenless = new ARLJobs(IERC20(eoa));
        vm.expectRevert(
            abi.encodeWithSelector(DeploySepoliaEvaluator.NoCode.selector, "token", eoa)
        );
        script.deploy(address(tokenless), arbiter, 1 hours, 1 ether);
    }

    function test_refusesBaseSepoliaWithoutRegistries() public {
        vm.chainId(84_532);
        address identity = script.IDENTITY_REGISTRY();
        vm.expectRevert(
            abi.encodeWithSelector(
                DeploySepoliaEvaluator.NoCode.selector, "identity registry", identity
            )
        );
        script.deploy(address(jobs), arbiter, 1 hours, 1 ether);

        vm.etch(identity, hex"00");
        address reputation = script.REPUTATION_REGISTRY();
        vm.expectRevert(
            abi.encodeWithSelector(
                DeploySepoliaEvaluator.NoCode.selector, "reputation registry", reputation
            )
        );
        script.deploy(address(jobs), arbiter, 1 hours, 1 ether);
    }

    function _registries() internal {
        vm.etch(script.IDENTITY_REGISTRY(), hex"00");
        vm.etch(script.REPUTATION_REGISTRY(), hex"00");
    }

    function test_refusesBaseSepoliaArbiterThatIsNotASafe() public {
        vm.chainId(84_532);
        _registries();
        vm.expectRevert(
            abi.encodeWithSelector(DeploySepoliaEvaluator.ArbiterNotASafe.selector, arbiter)
        );
        script.deploy(address(jobs), arbiter, 1 hours, 1 ether);
    }

    function test_deploysLocalWithoutRegistries() public {
        vm.chainId(31_337);
        ARLVerifiedEvaluator ev = script.deploy(address(jobs), arbiter, 2 hours, 5 ether);
        assertEq(address(ev.jobs()), address(jobs));
        assertEq(address(ev.stakeToken()), address(token));
        assertEq(ev.arbiter(), arbiter);
        assertEq(ev.minChallengeWindow(), 2 hours);
        assertEq(ev.minBond(), 5 ether);
        assertEq(address(ev.identity()), address(0));
        assertEq(address(ev.reputation()), address(0));
    }

    function test_run() public {
        vm.chainId(31_337);
        vm.setEnv("ARL_JOBS", vm.toString(address(jobs)));
        vm.setEnv("ARL_ARBITER", vm.toString(arbiter));
        vm.setEnv("ARL_MIN_CHALLENGE_WINDOW", "7200");
        vm.setEnv("ARL_MIN_BOND", "5000000000000000000");
        ARLVerifiedEvaluator ev = script.run();
        assertEq(ev.minChallengeWindow(), 2 hours);
        assertEq(ev.minBond(), 5 ether);
    }

    // ---------------------------------------------------------------- arbiter Safe signers

    function _owners(uint256 n) internal pure returns (address[] memory owners) {
        owners = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            owners[i] = address(uint160(0x1000 + i));
        }
    }

    function test_arbiterSignersAcceptsMajorities() public {
        CreateArbiterSafe create = new CreateArbiterSafe();
        CreateSafes helper = new CreateSafes();
        create.checkSigners(helper, _owners(3), 2);
        create.checkSigners(helper, _owners(3), 3);
        create.checkSigners(helper, _owners(5), 3);
    }

    function test_RevertWhen_ArbiterSignersWeak() public {
        CreateArbiterSafe create = new CreateArbiterSafe();
        CreateSafes helper = new CreateSafes();
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateArbiterSafe.ArbiterSignersInvalid.selector, "fewer than three owners"
            )
        );
        create.checkSigners(helper, _owners(2), 2);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateArbiterSafe.ArbiterSignersInvalid.selector, "threshold below two"
            )
        );
        create.checkSigners(helper, _owners(3), 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateArbiterSafe.ArbiterSignersInvalid.selector, "threshold not a majority"
            )
        );
        create.checkSigners(helper, _owners(5), 2);
        // Generic owner checks still apply (duplicates, zero, threshold above owners).
        address[] memory dup = _owners(3);
        dup[2] = dup[0];
        vm.expectRevert(
            abi.encodeWithSelector(CreateSafes.SafesInvalidOwners.selector, "duplicate owner")
        );
        create.checkSigners(helper, dup, 2);
    }
}
