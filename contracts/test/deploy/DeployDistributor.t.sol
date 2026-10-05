// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLAllocation} from "../../src/ARLAllocation.sol";
import {ARLDeployPlan} from "../../script/ARLDeployPlan.sol";
import {DeployDistributor} from "../../script/DeployDistributor.s.sol";

contract DeployDistributorTest is Test {
    DeployDistributor internal script;
    string internal list;

    function setUp() public {
        script = new DeployDistributor();
        list = vm.readFile("test/fixtures/distribution.json");
    }

    /// @dev Approved 2026-10-05; the flag records that and opens no network.
    function test_LaunchParametersAreApproved() public view {
        assertTrue(script.LAUNCH_PARAMETERS_APPROVED());
        assertEq(script.TGE_TRANCHE(), 500_000 * ARLAllocation.UNIT);
        assertEq(script.MAX_CLAIM_WINDOW(), 60 days);
    }

    function test_LaunchParametersAcceptTheApprovedBounds() public view {
        script.checkLaunchParameters(500_000 * ARLAllocation.UNIT, uint64(1000 + 60 days), 1000);
        script.checkLaunchParameters(1, uint64(1001), 1000);
    }

    function test_RevertWhen_TotalExceedsTheTranche() public {
        uint256 tranche = 500_000 * ARLAllocation.UNIT;
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorTotalExceedsTranche.selector, tranche + 1, tranche
            )
        );
        script.checkLaunchParameters(tranche + 1, uint64(2000), 1000);
    }

    function test_RevertWhen_ClaimWindowIsLongerThan60Days() public {
        uint64 claimEnd = uint64(1000 + 60 days + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorClaimWindowTooLong.selector, claimEnd, 1000 + 60 days
            )
        );
        script.checkLaunchParameters(1, claimEnd, 1000);
    }

    function testFuzz_LaunchParameters(uint256 total, uint64 claimEnd, uint32 nowTs) public view {
        bool ok = total <= script.TGE_TRANCHE() && claimEnd <= uint256(nowTs) + 60 days;
        if (ok) {
            script.checkLaunchParameters(total, claimEnd, nowTs);
        } else {
            (bool success,) = address(script)
                .staticcall(
                    abi.encodeCall(
                        DeployDistributor.checkLaunchParameters, (total, claimEnd, nowTs)
                    )
                );
            assertFalse(success);
        }
    }

    /// @dev The distributor uses the shared network gate: local Anvil and Base Sepolia pass,
    /// Base Mainnet and every other chain revert.
    function test_NetworkGate() public {
        script.networkGate(31337);
        script.networkGate(84532);
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanProductionLocked.selector, 8453));
        script.networkGate(8453);
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanChainNotSupported.selector, 1));
        script.networkGate(1);
    }

    /// @dev `run` checks the network before reading any input, so no environment variable or
    /// file can reach a Base Mainnet deployment.
    function test_RevertWhen_RunOnBaseMainnet() public {
        vm.chainId(8453);
        vm.setEnv("ARL_PLAN", "test/fixtures/distribution.json");
        vm.setEnv("ARL_DEPLOYMENT", "test/fixtures/distribution.json");
        vm.setEnv("ARL_DISTRIBUTION", "test/fixtures/distribution.json");
        vm.setEnv("ARL_CLAIM_END", "4102444800");
        vm.setEnv("ARL_DISTRIBUTOR", "deploy/deployments/never.json");
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanProductionLocked.selector, 8453));
        script.run();
    }

    function test_CheckListAcceptsToolingOutput() public view {
        (bytes32 root, uint256 total) = script.checkList(list);
        assertEq(root, vm.parseJsonBytes32(list, ".merkleRoot"));
        assertEq(total, vm.parseJsonUint(list, ".total"));
    }

    function test_RevertWhen_ListHasOtherSchema() public {
        string memory other = vm.replace(list, '"arl-distribution/1"', '"arl-distribution/0"');
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorSchemaMismatch.selector, "arl-distribution/0"
            )
        );
        script.checkList(other);
    }

    function test_RevertWhen_ListFundedByAnotherAllocation() public {
        string memory other = vm.replace(list, '"publicLaunch"', '"liquidity"');
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorWrongAllocation.selector, "liquidity"
            )
        );
        script.checkList(other);
    }

    function test_RevertWhen_TotalExceedsPublicLaunch() public {
        string memory total = vm.toString(vm.parseJsonUint(list, ".total"));
        string memory other = vm.replace(
            list,
            string.concat('"total": "', total, '"'),
            string.concat('"total": "', vm.toString(ARLAllocation.PUBLIC_LAUNCH + 1), '"')
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployDistributor.DistributorTotalExceedsAllocation.selector,
                ARLAllocation.PUBLIC_LAUNCH + 1,
                ARLAllocation.PUBLIC_LAUNCH
            )
        );
        script.checkList(other);
    }
}
