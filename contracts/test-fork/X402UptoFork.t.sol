// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {ARLTestBase} from "../test/ARLTestBase.sol";
import {IPermit2, IX402Errors, IX402UptoProxy} from "./X402Interfaces.sol";

/// @title ARL payments through the x402 `upto` scheme, on a Base Sepolia fork
/// @notice Path under test: ARL (EIP-2612) → Permit2 → x402UptoPermit2Proxy → facilitator
/// settles the metered amount. Permit2 and the proxy are the real deployed contracts; ARL is
/// deployed on the fork by the test fixture. Nothing is broadcast; every key is a Foundry test
/// key created inside the test.
///
/// Run: `FOUNDRY_PROFILE=fork forge test` with `ARL_FORK_RPC` set to a Base Sepolia RPC URL.
contract X402UptoForkTest is ARLTestBase {
    // Pinned in docs/payments.md; verified in `test_PinnedContracts`.
    uint256 internal constant FORK_BLOCK = 47_419_967;
    IPermit2 internal constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    IX402UptoProxy internal constant UPTO =
        IX402UptoProxy(0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002);
    bytes32 internal constant UPTO_CODEHASH =
        0x4662dc27323421a3698be49ac95f7b0dba141c238d31ef543248d1a11f8d8eec;
    bytes32 internal constant PERMIT2_CODEHASH_BASE_SEPOLIA =
        0xdcde65555316946c298e4c60c6213eb5c3aeab4354d1f3fac5427236bcbb9ebe;

    bytes32 internal constant TOKEN_PERMISSIONS_TYPEHASH =
        keccak256("TokenPermissions(address token,uint256 amount)");
    string internal constant WITNESS_TYPE_STRING =
        "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,address facilitator,uint256 validAfter)";
    bytes32 internal constant WITNESS_TYPEHASH =
        keccak256("Witness(address to,address facilitator,uint256 validAfter)");
    bytes32 internal constant PERMIT_WITNESS_TYPEHASH = keccak256(
        abi.encodePacked(
            "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,",
            WITNESS_TYPE_STRING
        )
    );

    uint256 internal constant MAX = 50 ether; // signed ceiling, test value
    uint256 internal constant NONCE = 0xA11CE;

    address internal payer;
    uint256 internal payerKey;
    address internal facilitator = makeAddr("facilitator");
    address internal payTo = makeAddr("serviceProvider");

    function setUp() public override {
        vm.createSelectFork(vm.envString("ARL_FORK_RPC"), FORK_BLOCK);
        super.setUp();
        (payer, payerKey) = makeAddrAndKey("payer");
        vm.prank(communitySafe);
        token.transfer(payer, 1_000 ether);
    }

    // ---------------------------------------------------------------- helpers

    function _permit(uint256 amount, uint256 nonce, uint256 deadline)
        internal
        view
        returns (IPermit2.PermitTransferFrom memory)
    {
        return IPermit2.PermitTransferFrom(
            IPermit2.TokenPermissions(address(token), amount), nonce, deadline
        );
    }

    function _witness() internal view returns (IX402UptoProxy.Witness memory) {
        return IX402UptoProxy.Witness(payTo, facilitator, 0);
    }

    function _digest(
        IPermit2.PermitTransferFrom memory p,
        IX402UptoProxy.Witness memory w,
        bytes32 domainSeparator
    ) internal pure returns (bytes32) {
        bytes32 witnessHash = keccak256(
            abi.encode(WITNESS_TYPEHASH, w.to, w.facilitator, w.validAfter)
        );
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_WITNESS_TYPEHASH,
                keccak256(
                    abi.encode(TOKEN_PERMISSIONS_TYPEHASH, p.permitted.token, p.permitted.amount)
                ),
                address(UPTO), // Permit2 hashes msg.sender, the proxy, as the spender
                p.nonce,
                p.deadline,
                witnessHash
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _sign(
        uint256 key,
        IPermit2.PermitTransferFrom memory p,
        IX402UptoProxy.Witness memory w,
        bytes32 domainSeparator
    ) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(p, w, domainSeparator));
        return abi.encodePacked(r, s, v);
    }

    function _approvePermit2(uint256 amount) internal {
        vm.prank(payer);
        token.approve(address(PERMIT2), amount);
    }

    function _nonceUsed(address owner, uint256 nonce) internal view returns (bool) {
        return (PERMIT2.nonceBitmap(owner, nonce >> 8) >> (nonce & 0xff)) & 1 == 1;
    }

    /// The default authorization: the ceiling MAX, nonce NONCE, one hour, signed by the payer.
    function _signed()
        internal
        view
        returns (IPermit2.PermitTransferFrom memory p, bytes memory sig)
    {
        p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
    }

    /// Settles `amount` of the default authorization as the facilitator. Callers expecting a
    /// revert set `vm.expectRevert` inside, right before the settle call.
    function _settle(uint256 amount) internal {
        (IPermit2.PermitTransferFrom memory p, bytes memory sig) = _signed();
        vm.prank(facilitator);
        UPTO.settle(p, amount, payer, _witness(), sig);
    }

    function _settleExpectRevert(uint256 amount, bytes memory reason) internal {
        (IPermit2.PermitTransferFrom memory p, bytes memory sig) = _signed();
        IX402UptoProxy.Witness memory w = _witness();
        vm.prank(facilitator);
        vm.expectRevert(reason);
        UPTO.settle(p, amount, payer, w, sig);
    }

    function _eip2612(uint256 value, uint256 deadline)
        internal
        view
        returns (IX402UptoProxy.EIP2612Permit memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                payer,
                address(PERMIT2),
                value,
                token.nonces(payer),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            payerKey, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash))
        );
        return IX402UptoProxy.EIP2612Permit(value, deadline, r, s, v);
    }

    // ---------------------------------------------------------------- pinned contracts

    function test_PinnedContracts() public view {
        assertEq(block.chainid, 84_532, "Base Sepolia");
        assertEq(address(UPTO).codehash, UPTO_CODEHASH, "upto proxy code");
        assertEq(address(PERMIT2).codehash, PERMIT2_CODEHASH_BASE_SEPOLIA, "Permit2 code");
        assertEq(UPTO.PERMIT2(), address(PERMIT2), "proxy points to canonical Permit2");
        // Our EIP-712 domain construction matches Permit2's.
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256("Permit2"),
                block.chainid,
                address(PERMIT2)
            )
        );
        assertEq(domain, PERMIT2.DOMAIN_SEPARATOR());
    }

    // ---------------------------------------------------------------- 1-3: valid settlements

    function test_01_ValidMaximumAuthorization() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        assertFalse(_nonceUsed(payer, NONCE));
        vm.prank(facilitator);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
        assertTrue(_nonceUsed(payer, NONCE));
    }

    function test_02_SettleBelowMaximum() public {
        _approvePermit2(type(uint256).max);
        uint256 before = token.balanceOf(payer);
        _settle(12.5 ether);
        assertEq(token.balanceOf(payTo), 12.5 ether);
        assertEq(before - token.balanceOf(payer), 12.5 ether);
    }

    function test_03_SettleExactlyAtMaximum() public {
        _approvePermit2(type(uint256).max);
        _settle(MAX);
        assertEq(token.balanceOf(payTo), MAX);
    }

    function testFuzz_SettleAnyAmountUpToMaximum(uint256 amount) public {
        amount = bound(amount, 1, MAX);
        _approvePermit2(type(uint256).max);
        _settle(amount);
        assertEq(token.balanceOf(payTo), amount);
    }

    // ---------------------------------------------------------------- 4-12: must revert

    function test_04_RevertWhen_SettleAboveMaximum() public {
        _approvePermit2(type(uint256).max);
        _settleExpectRevert(
            MAX + 1, abi.encodeWithSelector(IX402Errors.AmountExceedsPermitted.selector)
        );
    }

    function testFuzz_RevertWhen_SettleAboveMaximum(uint256 amount) public {
        amount = bound(amount, MAX + 1, type(uint256).max);
        _approvePermit2(type(uint256).max);
        _settleExpectRevert(
            amount, abi.encodeWithSelector(IX402Errors.AmountExceedsPermitted.selector)
        );
    }

    function test_05_RevertWhen_Expired() public {
        _approvePermit2(type(uint256).max);
        uint256 deadline = block.timestamp + 60;
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, deadline);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.warp(deadline + 1);
        vm.prank(facilitator);
        vm.expectRevert(abi.encodeWithSelector(IX402Errors.SignatureExpired.selector, deadline));
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
    }

    function test_06_RevertWhen_InvalidSignature() public {
        _approvePermit2(type(uint256).max);
        (, uint256 otherKey) = makeAddrAndKey("notThePayer");
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(otherKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidSigner.selector);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
    }

    function test_07_RevertWhen_NonceReused() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
        // A second authorization with the same nonce, even for a new amount, is refused.
        IPermit2.PermitTransferFrom memory p2 = _permit(MAX / 2, NONCE, block.timestamp + 1 hours);
        bytes memory sig2 = _sign(payerKey, p2, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidNonce.selector);
        UPTO.settle(p2, 1 ether, payer, _witness(), sig2);
    }

    function test_08_RevertWhen_SignedForAnotherChain() public {
        _approvePermit2(type(uint256).max);
        bytes32 otherChainDomain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                keccak256("Permit2"),
                uint256(8453), // Base Mainnet
                address(PERMIT2)
            )
        );
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), otherChainDomain);
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidSigner.selector);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
    }

    function test_09_RevertWhen_ReceiverChanged() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        IX402UptoProxy.Witness memory redirected =
            IX402UptoProxy.Witness(makeAddr("attacker"), facilitator, 0);
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidSigner.selector);
        UPTO.settle(p, 1 ether, payer, redirected, sig);
    }

    function test_10_RevertWhen_AssetChanged() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        p.permitted.token = makeAddr("otherToken");
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidSigner.selector);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
    }

    function test_11_RevertWhen_InsufficientBalance() public {
        _approvePermit2(type(uint256).max);
        uint256 balance = token.balanceOf(payer);
        vm.prank(payer);
        token.transfer(makeAddr("elsewhere"), balance - 1 ether);
        _settleExpectRevert(2 ether, bytes("TRANSFER_FROM_FAILED"));
    }

    function test_12_RevertWhen_InsufficientPermit2Allowance() public {
        _approvePermit2(1 ether);
        _settleExpectRevert(2 ether, bytes("TRANSFER_FROM_FAILED"));
    }

    // ---------------------------------------------------------------- 13: zero settlement

    /// The proxy refuses a zero settlement, so the authorization's nonce is not consumed. (The
    /// x402 SDK does not call the chain for zero; ARL's facilitator policy must then retire the
    /// authorization itself: see docs/payments.md.)
    function test_13_ZeroSettlementRevertsAndLeavesNonceUnused() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidAmount.selector);
        UPTO.settle(p, 0, payer, _witness(), sig);
        assertFalse(_nonceUsed(payer, NONCE));
        // The payer can retire the authorization on-chain.
        vm.prank(payer);
        PERMIT2.invalidateUnorderedNonces(NONCE >> 8, 1 << (NONCE & 0xff));
        assertTrue(_nonceUsed(payer, NONCE));
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidNonce.selector);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
    }

    // ---------------------------------------------------------------- 14: facilitator failures

    function test_14a_RevertWhen_CallerIsNotTheFacilitator() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(makeAddr("mempoolObserver"));
        vm.expectRevert(IX402Errors.UnauthorizedFacilitator.selector);
        UPTO.settle(p, MAX, payer, _witness(), sig);
        assertFalse(_nonceUsed(payer, NONCE));
    }

    function test_14b_RevertWhen_PayerRevokedBeforeSettlement() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(payer);
        PERMIT2.invalidateUnorderedNonces(NONCE >> 8, 1 << (NONCE & 0xff));
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidNonce.selector);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
        assertEq(token.balanceOf(payTo), 0);
    }

    function test_14c_RevertWhen_SettledBeforeValidAfter() public {
        _approvePermit2(type(uint256).max);
        IX402UptoProxy.Witness memory w =
            IX402UptoProxy.Witness(payTo, facilitator, block.timestamp + 10 minutes);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, w, PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.PaymentTooEarly.selector);
        UPTO.settle(p, 1 ether, payer, w, sig);
    }

    // ---------------------------------------------------------------- 15: replay

    function test_15_RevertWhen_ReplayedAfterSuccess() public {
        _approvePermit2(type(uint256).max);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        UPTO.settle(p, 5 ether, payer, _witness(), sig);
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidNonce.selector);
        UPTO.settle(p, 5 ether, payer, _witness(), sig);
        assertEq(token.balanceOf(payTo), 5 ether);
    }

    // ---------------------------------------------------------------- EIP-2612 → Permit2

    /// Gasless first payment: the payer never sent a transaction. ARL's EIP-2612 permit approves
    /// Permit2 for exactly the signed maximum; after a partial settlement the rest of that
    /// allowance remains with Permit2, usable only with a new valid Permit2 signature.
    function test_Eip2612ApprovesPermit2AndSettles() public {
        assertEq(token.allowance(payer, address(PERMIT2)), 0);
        IX402UptoProxy.EIP2612Permit memory ep = _eip2612(MAX, block.timestamp + 1 hours);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        UPTO.settleWithPermit(ep, p, 20 ether, payer, _witness(), sig);
        assertEq(token.balanceOf(payTo), 20 ether);
        assertEq(token.allowance(payer, address(PERMIT2)), MAX - 20 ether);
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.InvalidNonce.selector);
        UPTO.settle(p, 1 ether, payer, _witness(), sig);
    }

    function test_Eip2612FrontRunDoesNotBlockSettlement() public {
        IX402UptoProxy.EIP2612Permit memory ep = _eip2612(MAX, block.timestamp + 1 hours);
        token.permit(payer, address(PERMIT2), ep.value, ep.deadline, ep.v, ep.r, ep.s);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        UPTO.settleWithPermit(ep, p, 3 ether, payer, _witness(), sig);
        assertEq(token.balanceOf(payTo), 3 ether);
    }

    function test_RevertWhen_Eip2612ValueDiffersFromMaximum() public {
        IX402UptoProxy.EIP2612Permit memory ep = _eip2612(MAX + 1, block.timestamp + 1 hours);
        IPermit2.PermitTransferFrom memory p = _permit(MAX, NONCE, block.timestamp + 1 hours);
        bytes memory sig = _sign(payerKey, p, _witness(), PERMIT2.DOMAIN_SEPARATOR());
        vm.prank(facilitator);
        vm.expectRevert(IX402Errors.Permit2612AmountMismatch.selector);
        UPTO.settleWithPermit(ep, p, 1 ether, payer, _witness(), sig);
    }
}
