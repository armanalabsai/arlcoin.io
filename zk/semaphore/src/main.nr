// ARL anonymous signal circuit.
//
// Adapted from Semaphore-Noir (github.com/hashcloak/semaphore-noir, packages/circuits-noir,
// commit 6e24a48b2cb22c05a0c13361b5228d5e1c99bd0d, MIT, Copyright (c) 2024 Ethereum Foundation).
// Changes: the identity commitment is Poseidon(secret) (as in Semaphore v3) instead of a
// Baby Jubjub public key, so the circuit needs no elliptic-curve library; Noir 1.0 syntax;
// Poseidon from noir-lang/poseidon (Apache-2.0); a fixed maximum depth of 16 (65,536 members).
//
// Proves, without revealing which member: "I know the secret of one identity commitment in the
// group whose Merkle root is `root`", and outputs a nullifier Poseidon(scope, secret) that is
// the same every time this identity signals in this scope, so each member signals once per scope.
//
// Public inputs, in order: hashed_scope, hashed_message, then the returned root and nullifier.
// The message is bound to the proof because it is a public input.

use binary_merkle_root::binary_merkle_root;
use poseidon::poseidon::bn254::{hash_1, hash_2};

pub global MAX_DEPTH: u32 = 16;

fn main(
    secret: Field,
    index_bits: [bool; MAX_DEPTH],
    hash_path: [Field; MAX_DEPTH],
    merkle_proof_length: u32,
    hashed_scope: pub Field,
    hashed_message: pub Field,
) -> pub (Field, Field) {
    assert(secret != 0, "secret must not be zero");
    assert(merkle_proof_length <= MAX_DEPTH, "Merkle proof is too long");

    let identity_commitment = hash_1([secret]);
    let root = binary_merkle_root(
        hash_2,
        identity_commitment,
        merkle_proof_length,
        index_bits,
        hash_path,
    );
    let nullifier = hash_2([hashed_scope, secret]);

    // hashed_message is only bound as a public input; this keeps it from being optimised away.
    let _ = hashed_message * hashed_message;

    (root, nullifier)
}

#[test]
fn single_member_group() {
    let secret = 42;
    let (root, nullifier) = main(secret, [false; MAX_DEPTH], [0; MAX_DEPTH], 0, 7, 9);
    // A group of one: the root is the member's commitment.
    assert(root == hash_1([secret]));
    assert(nullifier == hash_2([7, secret]));
}

#[test]
fn two_members_right_leaf() {
    let secret = 42;
    let other = hash_1([5]);
    let mut bits = [false; MAX_DEPTH];
    bits[0] = true;
    let mut path = [0; MAX_DEPTH];
    path[0] = other;
    let (root, _) = main(secret, bits, path, 1, 7, 9);
    assert(root == hash_2([other, hash_1([secret])]));
}

#[test]
fn nullifier_depends_on_scope_only() {
    let (_, a) = main(42, [false; MAX_DEPTH], [0; MAX_DEPTH], 0, 7, 1);
    let (_, b) = main(42, [false; MAX_DEPTH], [0; MAX_DEPTH], 0, 7, 2);
    let (_, c) = main(42, [false; MAX_DEPTH], [0; MAX_DEPTH], 0, 8, 1);
    assert(a == b);
    assert(a != c);
}

#[test(should_fail_with = "secret must not be zero")]
fn zero_secret_fails() {
    let _ = main(0, [false; MAX_DEPTH], [0; MAX_DEPTH], 0, 7, 9);
}

#[test(should_fail_with = "Merkle proof is too long")]
fn overlong_proof_fails() {
    let _ = main(42, [false; MAX_DEPTH], [0; MAX_DEPTH], MAX_DEPTH + 1, 7, 9);
}
