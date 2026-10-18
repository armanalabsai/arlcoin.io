// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";

import {ARLDeployPlan} from "./ARLDeployPlan.sol";
import {CreateSafes, ISafe, ISafeProxyFactory} from "./CreateSafes.s.sol";

/// @title Create the arbiter Safe of the verified evaluator
/// @notice Creates one Safe v1.5.0 proxy that rules on disputed jobs of `ARLVerifiedEvaluator`
/// (docs/arbiter-safe.md). It uses the same canonical Safe contracts, code-hash checks and owner
/// checks as `CreateSafes`, and runs only where `ARLDeployPlan.networkGate` allows. The arbiter
/// must have at least three signers and a majority threshold of at least two (2-of-3, 3-of-5…),
/// so no single key can rule. Owners can be rotated later from the Safe itself; the evaluator
/// keeps the Safe's address.
///
/// Inputs (environment):
/// - `ARL_ARBITER_OWNERS`: comma-separated signer addresses (separate hardware wallets).
/// - `ARL_ARBITER_THRESHOLD`: signatures required.
/// - `ARL_SALT` (optional, default `arl`): salt prefix, so a second run creates a new Safe.
/// - Local Anvil only: `ARL_SAFE_FACTORY`, `ARL_SAFE_SINGLETON`, `ARL_SAFE_FALLBACK` (optional).
///   forge script script/CreateArbiterSafe.s.sol:CreateArbiterSafe \
///     --rpc-url https://sepolia.base.org --broadcast --account <keystore> --slow
contract CreateArbiterSafe is Script {
    uint256 public constant MIN_OWNERS = 3;
    uint256 public constant MIN_THRESHOLD = 2;

    error ArbiterSignersInvalid(string reason);
    error ArbiterSetupMismatch(address safe);

    function run() external returns (address safe) {
        ARLDeployPlan.networkGate(block.chainid);
        address[] memory owners = vm.envAddress("ARL_ARBITER_OWNERS", ",");
        uint256 threshold = vm.envUint("ARL_ARBITER_THRESHOLD");
        CreateSafes helper = new CreateSafes();
        checkSigners(helper, owners, threshold);
        CreateSafes.SafeContracts memory c =
            helper.safeContracts(block.chainid == ARLDeployPlan.LOCAL_CHAIN_ID);
        uint256 salt =
            uint256(keccak256(abi.encodePacked(vm.envOr("ARL_SALT", string("arl")), ".arbiter")));

        bytes memory setup = abi.encodeCall(
            ISafe.setup,
            (
                owners,
                threshold,
                address(0),
                "",
                c.fallbackHandler,
                address(0),
                0,
                payable(address(0))
            )
        );
        vm.startBroadcast();
        safe = ISafeProxyFactory(c.factory).createProxyWithNonce(c.singleton, setup, salt);
        vm.stopBroadcast();
        checkSetup(safe, owners, threshold);
    }

    /// @notice Owners valid for any Safe (`CreateSafes.checkOwners`), at least three of them, and a
    /// majority threshold of at least two.
    function checkSigners(CreateSafes helper, address[] memory owners, uint256 threshold)
        public
        pure
    {
        helper.checkOwners(owners, threshold);
        if (owners.length < MIN_OWNERS) revert ArbiterSignersInvalid("fewer than three owners");
        if (threshold < MIN_THRESHOLD) revert ArbiterSignersInvalid("threshold below two");
        if (2 * threshold <= owners.length) {
            revert ArbiterSignersInvalid("threshold not a majority");
        }
    }

    /// @notice Reverts unless the Safe has exactly these owners and this threshold.
    function checkSetup(address safe, address[] memory owners, uint256 threshold) public view {
        if (ISafe(safe).getThreshold() != threshold) revert ArbiterSetupMismatch(safe);
        address[] memory actual = ISafe(safe).getOwners();
        if (actual.length != owners.length) revert ArbiterSetupMismatch(safe);
        for (uint256 i = 0; i < owners.length; i++) {
            bool found = false;
            for (uint256 j = 0; j < actual.length; j++) {
                if (actual[j] == owners[i]) found = true;
            }
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (!found) revert ArbiterSetupMismatch(safe);
        }
    }
}
