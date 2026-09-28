// ARL anonymous signals.
//
// A member of a group proves "I am one of the identities in this group" and publishes a signal
// (a message) in a scope (for example a poll), without revealing which member they are. The same
// identity always produces the same nullifier in a scope, so the contract accepts one signal per
// member per scope. The protocol follows Semaphore; the circuit is zk/semaphore (Noir).
//
// Identity: a secret field element; its public commitment is Poseidon(secret).
// Group: a LeanIMT (zk-kit) of commitments with Poseidon(left, right).
// Proof: UltraHonk with the EVM (keccak, zero-knowledge) target, checked by ARLSemaphoreVerifier.

import { UltraHonkBackend, Barretenberg } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import type { CompiledCircuit } from "@noir-lang/noir_js";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon1, poseidon2 } from "poseidon-lite";
import { encodePacked, keccak256, toHex } from "viem";
import type { Hex } from "viem";

/** Maximum group depth supported by the circuit (65,536 members). */
export const MAX_DEPTH = 16;
/** BN254 scalar field order. */
export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** An identity secret derived from a wallet signature over a fixed message. The secret is never
 *  stored: signing the same message with the same wallet gives the same identity again. */
export function secretFromSignature(signature: Hex): bigint {
  const secret = BigInt(keccak256(signature)) % SNARK_FIELD;
  if (secret === 0n) throw new Error("degenerate identity secret");
  return secret;
}

/** The message a wallet signs to derive its ARL identity for `context` (for example a chain). */
export function identityMessage(context: string): string {
  return `ARL anonymous identity\n\nSigning this derives your private group identity for ${context}. It does not send a transaction or cost anything. Only sign it on the ARL app.`;
}

export function commitment(secret: bigint): bigint {
  if (secret <= 0n || secret >= SNARK_FIELD) throw new Error("secret out of range");
  return poseidon1([secret]);
}

/** Maps any uint256 (a scope or a message) into the field, as the contract does:
 *  uint256(keccak256(abi.encodePacked(value))) >> 8. */
export function hashToField(value: bigint): bigint {
  return BigInt(keccak256(encodePacked(["uint256"], [value]))) >> 8n;
}

export function createGroup(commitments: readonly bigint[] = []): LeanIMT {
  const group = new LeanIMT<bigint>((a, b) => poseidon2([a, b]));
  if (commitments.length) group.insertMany([...commitments]);
  return group;
}

export interface SignalInputs {
  /** Witness inputs for the Noir circuit (all decimal strings). */
  circuit: Record<string, string | string[] | boolean[]>;
  root: bigint;
  nullifier: bigint;
  scope: bigint;
  message: bigint;
  depth: number;
}

/** Builds the circuit inputs for `secret` signalling `message` in `scope` as a member of `group`. */
export function signalInputs(
  secret: bigint,
  group: LeanIMT,
  scope: bigint,
  message: bigint,
): SignalInputs {
  const leaf = commitment(secret);
  const index = group.indexOf(leaf);
  if (index < 0) throw new Error("identity is not a member of the group");
  const proof = group.generateProof(index);
  if (proof.siblings.length > MAX_DEPTH)
    throw new Error(`group is deeper than ${String(MAX_DEPTH)}`);
  const siblings = proof.siblings.map((s) => s.toString());
  const bits: boolean[] = [];
  for (let i = 0; i < MAX_DEPTH; i++)
    bits.push(i < proof.siblings.length && ((proof.index >> i) & 1) === 1);
  const hashedScope = hashToField(scope);
  return {
    circuit: {
      secret: secret.toString(),
      index_bits: bits,
      hash_path: [...siblings, ...Array<string>(MAX_DEPTH - siblings.length).fill("0")],
      merkle_proof_length: String(proof.siblings.length),
      hashed_scope: hashedScope.toString(),
      hashed_message: hashToField(message).toString(),
    },
    root: proof.root,
    nullifier: poseidon2([hashedScope, secret]),
    scope,
    message,
    depth: proof.siblings.length,
  };
}

export interface SignalProof {
  proof: Hex;
  /** [hashed scope, hashed message, root, nullifier], as the verifier takes them. */
  publicInputs: Hex[];
  root: bigint;
  nullifier: bigint;
  scope: bigint;
  message: bigint;
}

/** Proves a signal with noir_js (witness) and bb.js (UltraHonk, EVM target). */
export async function proveSignal(
  circuit: CompiledCircuit,
  inputs: SignalInputs,
): Promise<SignalProof> {
  const noir = new Noir(circuit);
  const { witness, returnValue } = await noir.execute(inputs.circuit);
  const [root, nullifier] = (returnValue as [string, string]).map((v) => BigInt(v));
  if (root !== inputs.root || nullifier !== inputs.nullifier)
    throw new Error("circuit output does not match the group");
  const api = await Barretenberg.new({ threads: 1 });
  try {
    const backend = new UltraHonkBackend(circuit.bytecode, api);
    const { proof, publicInputs } = await backend.generateProof(witness, { verifierTarget: "evm" });
    return {
      proof: toHex(proof),
      publicInputs: publicInputs.map((p) => toHex(BigInt(p), { size: 32 })),
      root,
      nullifier,
      scope: inputs.scope,
      message: inputs.message,
    };
  } finally {
    await api.destroy();
  }
}

/** Verifies a proof off-chain with bb.js (the contract verifies the same proof on-chain). */
export async function verifySignal(
  circuit: CompiledCircuit,
  signal: SignalProof,
): Promise<boolean> {
  const api = await Barretenberg.new({ threads: 1 });
  try {
    const backend = new UltraHonkBackend(circuit.bytecode, api);
    const bytes = Uint8Array.from(Buffer.from(signal.proof.slice(2), "hex"));
    return await backend.verifyProof(
      { proof: bytes, publicInputs: signal.publicInputs },
      { verifierTarget: "evm" },
    );
  } finally {
    await api.destroy();
  }
}
