// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import {ARLAllocation} from "../src/ARLAllocation.sol";
import {ARLTestBase} from "./ARLTestBase.sol";

/// @dev EIP-2612 behavior of ARLToken. The owner is a test key created by forge-std.
contract ARLTokenPermitTest is ARLTestBase {
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    // secp256k1 group order; `n - s` is the high-s twin of a valid signature.
    uint256 internal constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    address internal holder;
    uint256 internal holderKey;
    address internal spender = makeAddr("spender");

    function setUp() public override {
        super.setUp();
        (holder, holderKey) = makeAddrAndKey("permitHolder");
        vm.prank(communitySafe);
        token.transfer(holder, 1_000e18);
    }

    // ---------------------------------------------------------------- domain

    function test_Domain() public view {
        (
            ,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,,
        ) = token.eip712Domain();
        assertEq(name, "ARL");
        assertEq(version, "1");
        assertEq(chainId, vm.getChainId());
        assertEq(verifyingContract, address(token));
        assertEq(token.DOMAIN_SEPARATOR(), _domainSeparator());
    }

    // ---------------------------------------------------------------- happy path

    function test_PermitSetsAllowanceAndIncrementsNonce() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 500e18, 0, deadline);

        token.permit(holder, spender, 500e18, deadline, v, r, s);

        assertEq(token.allowance(holder, spender), 500e18);
        assertEq(token.nonces(holder), 1);

        vm.prank(spender);
        token.transferFrom(holder, spender, 500e18);
        assertEq(token.balanceOf(spender), 500e18);
    }

    function test_PermitDoesNotChangeSupply() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) =
            _sign(holderKey, holder, spender, type(uint256).max, 0, deadline);
        token.permit(holder, spender, type(uint256).max, deadline, v, r, s);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    function test_PermitAtExactDeadline() public {
        uint256 deadline = block.timestamp;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 1, 0, deadline);
        token.permit(holder, spender, 1, deadline, v, r, s);
        assertEq(token.allowance(holder, spender), 1);
    }

    // ---------------------------------------------------------------- failures

    function test_RevertWhen_Replayed() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 500e18, 0, deadline);
        token.permit(holder, spender, 500e18, deadline, v, r, s);

        // The same signature now recovers against nonce 1 and yields a different signer.
        vm.expectRevert();
        token.permit(holder, spender, 500e18, deadline, v, r, s);
        assertEq(token.nonces(holder), 1);
    }

    function test_RevertWhen_Expired() public {
        uint256 deadline = block.timestamp - 1;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 1, 0, deadline);
        vm.expectRevert(
            abi.encodeWithSelector(ERC20Permit.ERC2612ExpiredSignature.selector, deadline)
        );
        token.permit(holder, spender, 1, deadline, v, r, s);
    }

    function test_RevertWhen_SignedByAnotherKey() public {
        (address other, uint256 otherKey) = makeAddrAndKey("other");
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(otherKey, holder, spender, 1, 0, deadline);
        vm.expectRevert(
            abi.encodeWithSelector(ERC20Permit.ERC2612InvalidSigner.selector, other, holder)
        );
        token.permit(holder, spender, 1, deadline, v, r, s);
    }

    function test_RevertWhen_ParametersDifferFromSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 1, 0, deadline);
        vm.expectRevert();
        token.permit(holder, spender, 2, deadline, v, r, s); // value changed
        vm.expectRevert();
        token.permit(holder, address(0xBAD), 1, deadline, v, r, s); // spender changed
        assertEq(token.allowance(holder, spender), 0);
    }

    /// @dev A signature made for one chain is invalid on another.
    function test_RevertWhen_UsedOnAnotherChain() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 1, 0, deadline);
        uint256 original = vm.getChainId();
        vm.chainId(original + 1);
        assertTrue(token.DOMAIN_SEPARATOR() != _domainSeparatorFor(original));
        vm.expectRevert();
        token.permit(holder, spender, 1, deadline, v, r, s);
    }

    function test_RevertWhen_MalleableHighS() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 1, 0, deadline);
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, highS));
        token.permit(holder, spender, 1, deadline, flippedV, r, highS);
    }

    function test_RevertWhen_ZeroSignature() public {
        vm.expectRevert(ECDSA.ECDSAInvalidSignature.selector);
        token.permit(holder, spender, 1, block.timestamp, 27, bytes32(0), bytes32(0));
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_Permit(uint256 key, uint256 value, uint256 deadlineOffset) public {
        key = bound(key, 1, SECP256K1_N - 1);
        deadlineOffset = bound(deadlineOffset, 0, 3650 days);
        address owner = vm.addr(key);
        uint256 deadline = block.timestamp + deadlineOffset;
        uint256 nonce = token.nonces(owner);

        (uint8 v, bytes32 r, bytes32 s) = _sign(key, owner, spender, value, nonce, deadline);
        token.permit(owner, spender, value, deadline, v, r, s);

        assertEq(token.allowance(owner, spender), value);
        assertEq(token.nonces(owner), nonce + 1);
        assertEq(token.totalSupply(), ARLAllocation.MAX_SUPPLY);
    }

    function testFuzz_RevertWhen_Expired(uint256 age) public {
        age = bound(age, 1, 3650 days);
        uint256 deadline = block.timestamp - age;
        (uint8 v, bytes32 r, bytes32 s) = _sign(holderKey, holder, spender, 1, 0, deadline);
        vm.expectRevert(
            abi.encodeWithSelector(ERC20Permit.ERC2612ExpiredSignature.selector, deadline)
        );
        token.permit(holder, spender, 1, deadline, v, r, s);
    }

    // ---------------------------------------------------------------- helpers

    function _sign(
        uint256 key,
        address owner,
        address spender_,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, owner, spender_, value, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (v, r, s) = vm.sign(key, digest);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return _domainSeparatorFor(vm.getChainId());
    }

    function _domainSeparatorFor(uint256 chainId) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("ARL"),
                keccak256("1"),
                chainId,
                address(token)
            )
        );
    }
}
