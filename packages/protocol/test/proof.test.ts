import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { Hex } from "viem";

import {
  ProofError,
  canonicalHash,
  checkProofAgainstTask,
  parseProof,
  parseTask,
  proofHash,
  submittedDeliverable,
} from "../src/index.ts";

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

interface TaskVectors {
  valid: { name: string; task: unknown }[];
}
interface ProofVectors {
  valid: {
    name: string;
    task: string;
    proof: unknown;
    proofHash: Hex;
    submittedDeliverable: Hex;
  }[];
  invalid: { name: string; proof: unknown; error: string }[];
  mismatch: { name: string; task: string; proof: unknown; error: string }[];
}

const tasks = read("../../../spec/arl-task/v0.1.0/vectors.json") as TaskVectors;
const vectors = read("../../../spec/arl-proof/v0.1.0/vectors.json") as ProofVectors;

function task(name: string) {
  const t = tasks.valid.find((v) => v.name === name);
  assert.ok(t, `task vector ${name}`);
  return parseTask(t.task);
}

describe("arl-proof/1 vectors", () => {
  for (const v of vectors.valid) {
    it(`accepts, hashes and binds ${v.name}`, () => {
      const proof = parseProof(v.proof);
      assert.equal(proofHash(proof), v.proofHash);
      assert.equal(canonicalHash(v.proof), v.proofHash);
      assert.equal(submittedDeliverable(proof), v.submittedDeliverable);
      checkProofAgainstTask(task(v.task), proof);
    });
  }

  for (const v of vectors.invalid) {
    it(`refuses ${v.name}`, () => {
      assert.throws(
        () => parseProof(v.proof),
        (e: unknown) => e instanceof ProofError && e.message.includes(v.error),
      );
    });
  }

  for (const v of vectors.mismatch) {
    it(`refuses a proof that does not fit its task: ${v.name}`, () => {
      assert.throws(
        () => {
          checkProofAgainstTask(task(v.task), parseProof(v.proof));
        },
        (e: unknown) => e instanceof ProofError && e.message.includes(v.error),
      );
    });
  }

  it("keeps the reexec deliverable equal to the result manifest hash", () => {
    const reexec = vectors.valid.find((v) => v.name === "reexec");
    assert.ok(reexec);
    const proof = parseProof(reexec.proof);
    assert.ok(proof.result_manifest);
    assert.equal(reexec.submittedDeliverable, canonicalHash(proof.result_manifest));
    assert.notEqual(reexec.submittedDeliverable, reexec.proofHash);
  });
});
