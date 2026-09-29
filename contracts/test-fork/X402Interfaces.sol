// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

// ABI-level declarations for calling the deployed x402 upto proxy and Permit2 from tests.
// Struct layouts, function signatures and error selectors follow the deployed contracts:
// x402-foundation/x402 contracts/evm/src/x402UptoPermit2Proxy.sol and x402BasePermit2Proxy.sol
// at 71eb9a55e081e7b81ba3046d0bd17c3eb9c7bf81 (MIT), and Uniswap/permit2 at
// cc56ad0f3439c502c246fc5cfcc3db92bb8b7219 (MIT). No implementation code is copied.

interface IPermit2 {
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function nonceBitmap(address owner, uint256 wordPos) external view returns (uint256);
    function invalidateUnorderedNonces(uint256 wordPos, uint256 mask) external;
}

interface IX402UptoProxy {
    struct Witness {
        address to;
        address facilitator;
        uint256 validAfter;
    }

    struct EIP2612Permit {
        uint256 value;
        uint256 deadline;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    function PERMIT2() external view returns (address);

    function settle(
        IPermit2.PermitTransferFrom calldata permit,
        uint256 amount,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) external;

    function settleWithPermit(
        EIP2612Permit calldata permit2612,
        IPermit2.PermitTransferFrom calldata permit,
        uint256 amount,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) external;
}

/// @dev Error selectors of the deployed contracts, for `vm.expectRevert`.
interface IX402Errors {
    error AmountExceedsPermitted();
    error UnauthorizedFacilitator();
    error InvalidAmount();
    error PaymentTooEarly();
    error Permit2612AmountMismatch();
    // Permit2
    error SignatureExpired(uint256 signatureDeadline);
    error InvalidNonce();
    error InvalidSigner();
}
