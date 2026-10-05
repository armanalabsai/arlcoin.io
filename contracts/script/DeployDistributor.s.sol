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
    /// @dev The launch parameters are approved (owner decision, 2026-10-05; economic
    /// specification section 7 and `PUBLIC_LAUNCH` in `packages/tokenomics`): 1,000,000 ARL at TGE,
    /// at most 10,000 ARL per address (the `maxPerAddress` of the real claim list), a 60-day claim
    /// window, remainder to the Public Launch Safe. This opens no network: that is decided by
    /// `ARLDeployPlan.networkGate` (local Anvil and Base Sepolia; Base Mainnet only from the
    /// TGE).
    bool public constant LAUNCH_PARAMETERS_APPROVED = true;

    /// @notice Largest list total: the approved TGE tranche.
    uint256 public constant TGE_TRANCHE = 1_000_000 * ARLAllocation.UNIT;
    /// @notice Longest claim window from deployment.
    uint256 public constant MAX_CLAIM_WINDOW = 60 days;

    string internal constant DISTRIBUTION_SCHEMA = "arl-distribution/1";

    error DistributorSchemaMismatch(string schema);
    error DistributorWrongAllocation(string allocation);
    error DistributorTotalExceedsAllocation(uint256 total, uint256 allocation);
    error DistributorChainMismatch(uint256 deploymentChainId, uint256 chainId);
    error DistributorTokenHasNoCode(address token);
    error DistributorNotBroadcasting();
    error DistributorTotalExceedsTranche(uint256 total, uint256 tranche);
    error DistributorClaimWindowTooLong(uint64 claimEnd, uint256 latest);

    function run() external returns (ARLMerkleDistributor distributor) {
        networkGate(block.chainid);
        Plan memory plan = ARLDeployPlan.load(vm.readFile(vm.envString("ARL_PLAN")));
        string memory deployment = vm.readFile(vm.envString("ARL_DEPLOYMENT"));
        string memory list = vm.readFile(vm.envString("ARL_DISTRIBUTION"));
        uint64 claimEnd = uint64(vm.envUint("ARL_CLAIM_END"));

        uint256 deploymentChainId = vm.parseJsonUint(deployment, ".chainId");
        if (deploymentChainId != block.chainid || plan.chainId != block.chainid) {
            revert DistributorChainMismatch(deploymentChainId, block.chainid);
        }
        (bytes32 root, uint256 total) = checkList(list);
        checkLaunchParameters(total, claimEnd, block.timestamp);
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

    /// @notice The shared network gate (`ARLDeployPlan.networkGate`), exposed for tests.
    function networkGate(uint256 chainId) public view {
        ARLDeployPlan.networkGate(chainId);
    }

    /// @notice Checks a claim list's schema, allocation and total; returns its root and total.
    /// The root itself is recomputed from the claims by `distribution-cli.ts`.
    /// @notice The approved launch parameters: the list total fits the TGE tranche and the claim
    /// window ends at most 60 days after `nowTs`. (`ARLMerkleDistributor` itself refuses a
    /// claim end in the past.)
    function checkLaunchParameters(uint256 total, uint64 claimEnd, uint256 nowTs) public pure {
        if (total > TGE_TRANCHE) revert DistributorTotalExceedsTranche(total, TGE_TRANCHE);
        // A deployment-time bound on an operator input, not an on-chain time comparison.
        // slither-disable-next-line timestamp
        if (claimEnd > nowTs + MAX_CLAIM_WINDOW) {
            revert DistributorClaimWindowTooLong(claimEnd, nowTs + MAX_CLAIM_WINDOW);
        }
    }

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
