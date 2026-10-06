import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { poseidon1 } from "poseidon-lite";

import { loadCircuit } from "../src/circuit.ts";
import {
  MAX_DEPTH,
  SNARK_FIELD,
  commitment,
  createGroup,
  hashToField,
  identityMessage,
  proveSignal,
  secretFromSignature,
  signalInputs,
  verifySignal,
} from "../src/index.ts";

const SECRETS = [11n, 22n, 33n];
const group = createGroup(SECRETS.map(commitment));
const circuit = loadCircuit();

describe("identities and groups", () => {
  it("commits with Poseidon and builds a LeanIMT", () => {
    assert.equal(commitment(11n), poseidon1([11n]));
    assert.equal(group.size, 3);
    assert.equal(group.depth, 2);
  });
  it("derives a stable, in-field secret from a signature", () => {
    const sig = `0x${"ab".repeat(65)}` as const;
    const s = secretFromSignature(sig);
    assert.equal(s, secretFromSignature(sig));
    assert.ok(s > 0n && s < SNARK_FIELD);
    assert.match(identityMessage("eip155:31337"), /does not send a transaction/);
  });
  it("hashes scopes and messages into the field like the contract", () => {
    // uint256(keccak256(abi.encodePacked(uint256(1)))) >> 8
    assert.equal(
      hashToField(1n),
      0xb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cn,
    );
    assert.ok(hashToField(2n ** 256n - 1n) < SNARK_FIELD);
  });
  it("refuses non-members and out-of-range secrets", () => {
    assert.throws(() => signalInputs(44n, group, 1n, 2n), /not a member/);
    assert.throws(() => commitment(0n));
    assert.throws(() => commitment(SNARK_FIELD));
  });
  it("pads the Merkle path to the circuit depth", () => {
    const inputs = signalInputs(22n, group, 1n, 2n);
    assert.equal((inputs.circuit.hash_path as string[]).length, MAX_DEPTH);
    assert.equal(inputs.depth, 2);
  });
});

describe("proofs", { timeout: 300_000 }, () => {
  it("proves membership and verifies; a changed message fails", async () => {
    const signal = await proveSignal(circuit, signalInputs(22n, group, 7n, 9n));
    assert.equal(signal.root, group.root);
    assert.equal(signal.publicInputs.length, 4);
    assert.equal(await verifySignal(circuit, signal), true);

    const forged = { ...signal, publicInputs: [...signal.publicInputs] };
    forged.publicInputs[1] = `0x${hashToField(10n).toString(16).padStart(64, "0")}`;
    assert.equal(await verifySignal(circuit, forged), false);
  });

  it("gives the same nullifier for the same member and scope, another for another scope", () => {
    const a = signalInputs(22n, group, 7n, 1n);
    const b = signalInputs(22n, group, 7n, 2n);
    const c = signalInputs(22n, group, 8n, 1n);
    const d = signalInputs(33n, group, 7n, 1n);
    assert.equal(a.nullifier, b.nullifier);
    assert.notEqual(a.nullifier, c.nullifier);
    assert.notEqual(a.nullifier, d.nullifier);
  });
});
