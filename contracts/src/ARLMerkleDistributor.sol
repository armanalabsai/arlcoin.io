// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {BitMaps} from "@openzeppelin/contracts/utils/structs/BitMaps.sol";

/// @title ARL Merkle claim distributor
/// @notice Distributes a fixed, published list of ARL amounts. Each entry `(index, account,
/// amount)` is a leaf of a Merkle tree whose root is fixed at deployment; an entry can be claimed
/// once, before `claimEnd`, and the tokens always go to `account`. After `claimEnd` anyone can
/// return the unclaimed balance to `returnTo`, the Safe of the allocation that funded the
/// distribution. Nothing is burned and no new ARL is created.
///
/// @dev Leaves use the `StandardMerkleTree` encoding of the OpenZeppelin merkle-tree library
/// (leaf types `uint256, address, uint256`):
/// `keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))))`. Double hashing keeps a leaf from being confused with an inner node.
///
/// The contract has no owner, no admin, no pause and no upgrade path: after deployment the list,
/// the deadline and the return address cannot change. Funding is a separate transfer from the
/// allocation Safe; a claim that the balance cannot cover reverts and can be retried once the
/// distributor is funded.
contract ARLMerkleDistributor {
    using BitMaps for BitMaps.BitMap;
    using SafeERC20 for IERC20;

    /// @notice The distributed token (ARL).
    IERC20 public immutable token;
    /// @notice Root of the published claim list.
    bytes32 public immutable merkleRoot;
    /// @notice Claims are accepted while `block.timestamp < claimEnd`.
    uint64 public immutable claimEnd;
    /// @notice Receives the unclaimed balance after `claimEnd`: the funding allocation's Safe.
    address public immutable returnTo;

    BitMaps.BitMap private _claimed;

    event Claimed(uint256 indexed index, address indexed account, uint256 amount);
    event Swept(address indexed to, uint256 amount);

    error DistributorZeroAddress();
    error DistributorZeroRoot();
    error DistributorClaimEndInPast(uint64 claimEnd);
    error DistributorClaimWindowClosed();
    error DistributorClaimWindowOpen();
    error DistributorAlreadyClaimed(uint256 index);
    error DistributorInvalidProof();
    error DistributorZeroAmount();

    /// @param token_ The ARL token. Must be non-zero.
    /// @param merkleRoot_ Root of the claim list. Must be non-zero.
    /// @param claimEnd_ End of the claim window. Must be in the future.
    /// @param returnTo_ The funding allocation's Safe. Must be non-zero.
    constructor(IERC20 token_, bytes32 merkleRoot_, uint64 claimEnd_, address returnTo_) {
        if (address(token_) == address(0) || returnTo_ == address(0)) {
            revert DistributorZeroAddress();
        }
        if (merkleRoot_ == bytes32(0)) revert DistributorZeroRoot();
        // The claim window is days long; block-timestamp drift of seconds is irrelevant.
        // slither-disable-next-line timestamp
        if (claimEnd_ <= block.timestamp) revert DistributorClaimEndInPast(claimEnd_);
        token = token_;
        merkleRoot = merkleRoot_;
        claimEnd = claimEnd_;
        returnTo = returnTo_;
    }

    /// @notice Whether the entry at `index` has been claimed.
    function isClaimed(uint256 index) external view returns (bool) {
        return _claimed.get(index);
    }

    /// @notice Claims entry `index` for `account`. Anyone may submit the claim; the tokens are
    /// always sent to `account`.
    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata proof)
        external
    {
        // slither-disable-next-line timestamp
        if (block.timestamp >= claimEnd) revert DistributorClaimWindowClosed();
        if (_claimed.get(index)) revert DistributorAlreadyClaimed(index);
        if (amount == 0) revert DistributorZeroAmount();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) revert DistributorInvalidProof();

        _claimed.set(index);
        emit Claimed(index, account, amount);
        token.safeTransfer(account, amount);
    }

    /// @notice After `claimEnd`, returns the whole remaining balance to `returnTo`. Anyone may
    /// call it; the destination is fixed.
    function sweep() external {
        // slither-disable-next-line timestamp
        if (block.timestamp < claimEnd) revert DistributorClaimWindowOpen();
        uint256 amount = token.balanceOf(address(this));
        emit Swept(returnTo, amount);
        token.safeTransfer(returnTo, amount);
    }
}
