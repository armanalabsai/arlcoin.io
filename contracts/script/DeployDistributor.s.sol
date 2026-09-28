// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLMerkleDistributor} from "../src/ARLMerkleDistributor.sol";
import {ARLDeployPlan, Plan} from "./ARLDeployPlan.sol";

/// @title Deploy a Public Launch Merkle claim distributor
/// @notice Inputs (environment):
/// - `ARL_PLAN`: the deployment plan (its Public Launch Safe receives the unclaimed remainder).
/// - `ARL_DEPLOYMENT`: the deployed ARL system (its token is distributed).
/// - `ARL_DISTRIBUTION`: the claim list built by `packages/deploy` (`distribution-cli.ts`).
/// - `ARL_CLAIM_END`: end of the claim window, Unix seconds.
/// - `ARL_DISTRIBUTOR`: where to write the distributor address (under
///   `contracts/deploy/deployments/`).
///
/// The distributor is deployed unfunded. The Public Launch Safe funds it with the list total in
/// a separate Safe transaction.
contract DeployDistributor is Script {
    /// @dev The mechanism (Merkle claim) is approved, but the launch parameters are not: the
    /// amount distributed at TGE, per-address limits, the claim window and the remainder policy
    /// (economic specification section 7). Until they are, only local Anvil is allowed.
    bool public constant LAUNCH_PARAMETERS_APPROVED = false;

    string internal constant DISTRIBUTION_SCHEMA = "arl-distribution/1";

    error DistributorLaunchParametersNotApproved(uint256 chainId);
    error DistributorSchemaMismatch(string schema);
    error DistributorWrongAllocation(string allocation);
    error DistributorTotalExceedsAllocation(uint256 total, uint256 allocation);
    error DistributorChainMismatch(uint256 deploymentChainId, uint256 chainId);
    error DistributorTokenHasNoCode(address token);
    error DistributorNotBroadcasting();

    function run() external returns (ARLMerkleDistributor distributor) {
        Plan memory plan = ARLDeployPlan.load(vm.readFile(vm.envString("ARL_PLAN")));
        string memory deployment = vm.readFile(vm.envString("ARL_DEPLOYMENT"));
        string memory list = vm.readFile(vm.envString("ARL_DISTRIBUTION"));
        uint64 claimEnd = uint64(vm.envUint("ARL_CLAIM_END"));

        launchGate(block.chainid, LAUNCH_PARAMETERS_APPROVED);
        uint256 deploymentChainId = vm.parseJsonUint(deployment, ".chainId");
        if (deploymentChainId != block.chainid || plan.chainId != block.chainid) {
            revert DistributorChainMismatch(deploymentChainId, block.chainid);
        }
        (bytes32 root, uint256 total) = checkList(list);
        address token = vm.parseJsonAddress(deployment, ".token");
        if (token.code.length == 0) revert DistributorTokenHasNoCode(token);

        vm.startBroadcast();
        (VmSafe.CallerMode mode, address deployer, address origin) = vm.readCallers();
        if (mode != VmSafe.CallerMode.RecurrentBroadcast) revert DistributorNotBroadcasting();
        if (origin != deployer) revert DistributorNotBroadcasting();
        distributor =
            new ARLMerkleDistributor(IERC20(token), root, claimEnd, plan.recipients.publicLaunch);
        vm.stopBroadcast();

        vm.writeFile(vm.envString("ARL_DISTRIBUTOR"), _record(distributor, total));
    }

    function _record(ARLMerkleDistributor d, uint256 total) private view returns (string memory) {
        return string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"distributor":"',
            vm.toString(address(d)),
            '","merkleRoot":"',
            vm.toString(d.merkleRoot()),
            '","total":"',
            vm.toString(total),
            '","claimEnd":',
            vm.toString(uint256(d.claimEnd())),
            ',"returnTo":"',
            vm.toString(d.returnTo()),
            '"}'
        );
    }

    /// @notice Off local Anvil, the launch parameters must be approved. The flag is a parameter
    /// only so tests can exercise both branches; `run` always passes the constant above.
    function launchGate(uint256 chainId, bool approved) public pure {
        if (chainId == ARLDeployPlan.LOCAL_CHAIN_ID) return;
        if (!approved) revert DistributorLaunchParametersNotApproved(chainId);
    }

    /// @notice Checks a claim list's schema, allocation and total; returns its root and total.
    /// The root itself is recomputed from the claims by `distribution-cli.ts`.
    function checkList(string memory list) public pure returns (bytes32 root, uint256 total) {
        string memory schema = vm.parseJsonString(list, ".schema");
        if (keccak256(bytes(schema)) != keccak256(bytes(DISTRIBUTION_SCHEMA))) {
            revert DistributorSchemaMismatch(schema);
        }
        string memory allocation = vm.parseJsonString(list, ".allocation");
        if (keccak256(bytes(allocation)) != keccak256("publicLaunch")) {
            revert DistributorWrongAllocation(allocation);
        }
        total = vm.parseJsonUint(list, ".total");
        if (total > ARLAllocation.PUBLIC_LAUNCH) {
            revert DistributorTotalExceedsAllocation(total, ARLAllocation.PUBLIC_LAUNCH);
        }
        root = vm.parseJsonBytes32(list, ".merkleRoot");
    }
}
