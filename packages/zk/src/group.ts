// The membership group and the field, without the prover: the light part of @arl/zk that a server
// (for example the testnet operator on Cloudflare) can load without the proving backend.
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";

/** BN254 scalar field order. */
export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function createGroup(commitments: readonly bigint[] = []): LeanIMT {
  const group = new LeanIMT<bigint>((a, b) => poseidon2([a, b]));
  if (commitments.length) group.insertMany([...commitments]);
  return group;
}
