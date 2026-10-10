// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";

import {ARLDeployPlan} from "../../script/ARLDeployPlan.sol";
import {CreateSafes} from "../../script/CreateSafes.s.sol";

/// @dev Full Safe creation runs in the local rehearsal (real Safe v1.5.0 contracts on Anvil) and
/// against a Base Sepolia fork; these tests cover the checks that run before anything is created.
contract CreateSafesTest is Test {
    CreateSafes internal script;

    function setUp() public {
        script = new CreateSafes();
    }

    function _owners(uint256 n) internal pure returns (address[] memory owners) {
        owners = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            owners[i] = address(uint160(0x1000 + i));
        }
    }

    function test_AcceptsValidOwners() public view {
        script.checkOwners(_owners(1), 1);
        script.checkOwners(_owners(3), 2);
        script.checkOwners(_owners(5), 5);
    }

    function test_RevertWhen_OwnersInvalid() public {
        vm.expectRevert(
            abi.encodeWithSelector(CreateSafes.SafesInvalidOwners.selector, "no owners")
        );
        script.checkOwners(new address[](0), 1);

        address[] memory zero = _owners(2);
        zero[1] = address(0);
        vm.expectRevert(
            abi.encodeWithSelector(CreateSafes.SafesInvalidOwners.selector, "zero owner")
        );
        script.checkOwners(zero, 1);

        address[] memory duplicate = _owners(2);
        duplicate[1] = duplicate[0];
        vm.expectRevert(
            abi.encodeWithSelector(CreateSafes.SafesInvalidOwners.selector, "duplicate owner")
        );
        script.checkOwners(duplicate, 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                CreateSafes.SafesInvalidOwners.selector, "threshold out of range"
            )
        );
        script.checkOwners(_owners(2), 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateSafes.SafesInvalidOwners.selector, "threshold out of range"
            )
        );
        script.checkOwners(_owners(2), 3);
    }

    /// @dev A separately configured guardian may not share a signer with the other Safes (M-1).
    function test_RevertWhen_GuardianSignersOverlap() public {
        address[] memory guardian = new address[](1);
        guardian[0] = address(0xbeef);
        script.checkDisjoint(_owners(3), guardian);
        guardian[0] = _owners(3)[2];
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateSafes.SafesInvalidOwners.selector, "guardian signers overlap"
            )
        );
        script.checkDisjoint(_owners(3), guardian);
    }

    /// @dev Off local Anvil the canonical Safe contracts must be present with their canonical
    /// code, and none may be substituted through the environment. (Environment variables are
    /// process-wide, so both checks share one test to keep their order fixed.)
    function test_OffLocalSafeContractsAreCanonicalOnly() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateSafes.SafesNotCanonical.selector,
                "SafeProxyFactory",
                0x14F2982D601c9458F93bd70B218933A6f8165e7b
            )
        );
        script.safeContracts(false);

        vm.setEnv("ARL_SAFE_FACTORY", vm.toString(address(0xdead)));
        vm.expectRevert(CreateSafes.SafesOverrideOffLocal.selector);
        script.safeContracts(false);
    }

    /// @dev The network gate runs before any input is read: Base Mainnet and unsupported chains
    /// are refused whatever the environment holds.
    function test_RevertWhen_RunOnBaseMainnetOrUnsupportedChain() public {
        vm.setEnv("ARL_SAFE_OWNERS", vm.toString(address(0x1000)));
        vm.setEnv("ARL_SAFE_THRESHOLD", "1");
        vm.chainId(8453);
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanProductionLocked.selector, 8453));
        script.run();
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(ARLDeployPlan.PlanChainNotSupported.selector, 1));
        script.run();
    }
}
