// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ARLDeployPlan} from "./ARLDeployPlan.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}

/// @title Create the dedicated Safe of every ARL role
/// @notice Creates one Safe v1.5.0 proxy per Safe role (12) and writes their addresses to
/// `ARL_SAFES_OUT` (under `contracts/deploy/deployments/`). It runs only where
/// `ARLDeployPlan.networkGate` allows: local Anvil, Base Sepolia, and Base Mainnet from the TGE.
///
/// On Base Sepolia it uses only the canonical Safe v1.5.0 contracts from safe-deployments
/// 1.37.63 (`SafeProxyFactory`, `SafeL2`, `CompatibilityFallbackHandler`) and checks their code
/// hashes before creating anything. On local Anvil the rehearsal passes the Safe contracts it
/// deployed itself.
///
/// Inputs (environment):
/// - `ARL_SAFE_OWNERS`: comma-separated owners of every Safe except the guardian.
/// - `ARL_SAFE_THRESHOLD`: signatures required.
/// - `ARL_GUARDIAN_OWNERS`, `ARL_GUARDIAN_THRESHOLD` (optional): the guardian Safe's own
///   signers, which must not overlap `ARL_SAFE_OWNERS` (M-1). Without them the guardian uses
///   `ARL_SAFE_OWNERS`, which is acceptable only for a testnet rehearsal.
/// - `ARL_SALT` (optional, default `arl`): salt prefix, so a second run creates new Safes.
/// - `ARL_SAFES_OUT`: output file.
/// - Local Anvil only: `ARL_SAFE_FACTORY`, `ARL_SAFE_SINGLETON`, `ARL_SAFE_FALLBACK` (optional).
///
/// Signer addresses are operational configuration and are never committed to the repository.
contract CreateSafes is Script {
    address internal constant FACTORY_V150 = 0x14F2982D601c9458F93bd70B218933A6f8165e7b;
    bytes32 internal constant FACTORY_V150_CODEHASH =
        0x967dae4cda22b0c9ef7f31b010bdc1ceb0af9904b0c3dc060b5302e4c18a4529;
    address internal constant FALLBACK_V150 = 0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4;
    bytes32 internal constant FALLBACK_V150_CODEHASH =
        0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc;

    /// @dev The Safe roles, in the order the output lists them. The guardian is index 4.
    function roles() public pure returns (string[12] memory) {
        return [
            "founder",
            "investors",
            "strategicPartnerships",
            "treasury",
            "guardian",
            "publicLaunch",
            "communityStaking",
            "ecosystemGrowth",
            "liquidity",
            "team",
            "earlyUsers",
            "grantsBugBounty"
        ];
    }

    uint256 internal constant GUARDIAN = 4;
    uint256 internal constant ROLE_COUNT = 12;

    error SafesOverrideOffLocal();
    error SafesNotCanonical(string what, address account);
    error SafesInvalidOwners(string reason);
    error SafesNotBroadcasting();
    error SafesSetupMismatch(string role);

    struct SafeContracts {
        address factory;
        address singleton;
        address fallbackHandler;
    }

    struct Signers {
        address[] owners;
        uint256 threshold;
        address[] guardianOwners;
        uint256 guardianThreshold;
    }

    function run() external {
        // Refuse Base Mainnet before the TGE and unsupported chains before reading any input.
        ARLDeployPlan.networkGate(block.chainid);
        SafeContracts memory c = safeContracts(block.chainid == ARLDeployPlan.LOCAL_CHAIN_ID);
        Signers memory s = _signers();
        string memory salt = vm.envOr("ARL_SALT", string("arl"));

        string[12] memory role = roles();
        address[] memory safe = new address[](ROLE_COUNT);
        vm.startBroadcast();
        (VmSafe.CallerMode mode, address sender, address origin) = vm.readCallers();
        if (mode != VmSafe.CallerMode.RecurrentBroadcast || sender != origin) {
            revert SafesNotBroadcasting();
        }
        for (uint256 i = 0; i < ROLE_COUNT; i++) {
            safe[i] = _create(
                c,
                i == GUARDIAN ? s.guardianOwners : s.owners,
                i == GUARDIAN ? s.guardianThreshold : s.threshold,
                uint256(keccak256(abi.encodePacked(salt, ".", role[i])))
            );
        }
        vm.stopBroadcast();

        for (uint256 i = 0; i < ROLE_COUNT; i++) {
            _checkSetup(
                role[i],
                safe[i],
                i == GUARDIAN ? s.guardianOwners : s.owners,
                i == GUARDIAN ? s.guardianThreshold : s.threshold
            );
        }
        vm.writeFile(vm.envString("ARL_SAFES_OUT"), _record(safe, c.singleton));
    }

    /// @notice Owners must be non-zero and distinct, and the threshold between 1 and the number
    /// of owners.
    function checkOwners(address[] memory owners, uint256 threshold) public pure {
        if (owners.length == 0) revert SafesInvalidOwners("no owners");
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == address(0)) revert SafesInvalidOwners("zero owner");
            for (uint256 j = i + 1; j < owners.length; j++) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (owners[i] == owners[j]) revert SafesInvalidOwners("duplicate owner");
            }
        }
        if (threshold == 0 || threshold > owners.length) {
            revert SafesInvalidOwners("threshold out of range");
        }
    }

    /// @notice A separately configured guardian must not share a signer with the other Safes
    /// (M-1).
    function checkDisjoint(address[] memory a, address[] memory b) public pure {
        for (uint256 i = 0; i < a.length; i++) {
            for (uint256 j = 0; j < b.length; j++) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                if (a[i] == b[j]) revert SafesInvalidOwners("guardian signers overlap");
            }
        }
    }

    /// @notice The Safe contracts to use. Off local Anvil: the canonical v1.5.0 deployments,
    /// checked by code hash, and no override is accepted.
    function safeContracts(bool local) public view returns (SafeContracts memory c) {
        if (local) {
            return SafeContracts(
                vm.envAddress("ARL_SAFE_FACTORY"),
                vm.envAddress("ARL_SAFE_SINGLETON"),
                vm.envOr("ARL_SAFE_FALLBACK", address(0))
            );
        }
        if (
            vm.envExists("ARL_SAFE_FACTORY") || vm.envExists("ARL_SAFE_SINGLETON")
                || vm.envExists("ARL_SAFE_FALLBACK")
        ) revert SafesOverrideOffLocal();
        c = SafeContracts(FACTORY_V150, ARLDeployPlan.SAFE_L2_SINGLETON_V150, FALLBACK_V150);
        if (c.factory.codehash != FACTORY_V150_CODEHASH) {
            revert SafesNotCanonical("SafeProxyFactory", c.factory);
        }
        if (c.singleton.codehash != ARLDeployPlan.SAFE_L2_SINGLETON_V150_CODEHASH) {
            revert SafesNotCanonical("SafeL2", c.singleton);
        }
        if (c.fallbackHandler.codehash != FALLBACK_V150_CODEHASH) {
            revert SafesNotCanonical("CompatibilityFallbackHandler", c.fallbackHandler);
        }
    }

    function _signers() private view returns (Signers memory s) {
        s.owners = vm.envAddress("ARL_SAFE_OWNERS", ",");
        s.threshold = vm.envUint("ARL_SAFE_THRESHOLD");
        checkOwners(s.owners, s.threshold);
        if (vm.envExists("ARL_GUARDIAN_OWNERS")) {
            s.guardianOwners = vm.envAddress("ARL_GUARDIAN_OWNERS", ",");
            s.guardianThreshold = vm.envUint("ARL_GUARDIAN_THRESHOLD");
            checkOwners(s.guardianOwners, s.guardianThreshold);
            checkDisjoint(s.owners, s.guardianOwners);
        } else {
            s.guardianOwners = s.owners;
            s.guardianThreshold = s.threshold;
        }
    }

    function _create(
        SafeContracts memory c,
        address[] memory owners,
        uint256 threshold,
        uint256 salt
    ) private returns (address) {
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
        // One Safe per role; called 12 times by `run`.
        // slither-disable-next-line calls-loop
        return ISafeProxyFactory(c.factory).createProxyWithNonce(c.singleton, setup, salt);
    }

    function _checkSetup(string memory role, address safe, address[] memory owners, uint256 t)
        private
        view
    {
        // slither-disable-next-line calls-loop
        if (ISafe(safe).getThreshold() != t) revert SafesSetupMismatch(role);
        // slither-disable-next-line calls-loop
        address[] memory actual = ISafe(safe).getOwners();
        if (actual.length != owners.length) revert SafesSetupMismatch(role);
        for (uint256 i = 0; i < owners.length; i++) {
            bool found = false;
            for (uint256 j = 0; j < actual.length; j++) {
                if (actual[j] == owners[i]) found = true;
            }
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (!found) revert SafesSetupMismatch(role);
        }
    }

    function _record(address[] memory safe, address singleton)
        private
        view
        returns (string memory json)
    {
        json = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"singleton":"',
            vm.toString(singleton),
            '","safes":{'
        );
        string[12] memory role = roles();
        for (uint256 i = 0; i < ROLE_COUNT; i++) {
            // slither-disable-next-line calls-loop
            json = string.concat(
                json, i == 0 ? "" : ",", '"', role[i], '":"', vm.toString(safe[i]), '"'
            );
        }
        json = string.concat(json, "}}");
    }
}
