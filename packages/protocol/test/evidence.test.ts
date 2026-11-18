import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EvidenceError,
  checkEvidence,
  type EvidenceResult,
  type EvidenceV2,
} from "../src/index.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/arl-evidence/v0.2.0/vectors.json", import.meta.url), "utf8"),
) as {
  valid: { name: string; evidence: EvidenceV2; result: EvidenceResult }[];
  invalid: { name: string; evidence: EvidenceV2; error: string }[];
};

describe("arl-evidence/2 vectors", () => {
  for (const v of vectors.valid) {
    it(`accepts ${v.name}`, () => {
      assert.deepEqual(checkEvidence(v.evidence), v.result);
    });
  }

  for (const v of vectors.invalid) {
    it(`refuses ${v.name}`, () => {
      assert.throws(
        () => checkEvidence(v.evidence),
        (e: unknown) => e instanceof Error && e.message.includes(v.error),
      );
    });
  }

  it("reports a pending job and a settlement overturned by a ruled dispute", () => {
    const [first] = vectors.valid;
    assert.ok(first);
    const pending = structuredClone(first.evidence);
    pending.settlement.finalized = null;
    pending.settlement.settlement = null;
    assert.equal(checkEvidence(pending).outcome, "pending");

    const overturned = structuredClone(first.evidence);
    overturned.settlement.votes = overturned.settlement.votes.map((v) => ({
      ...v,
      approve: false,
    }));
    const decided = first.evidence.settlement.decided;
    assert.ok(decided);
    overturned.settlement.decided = { ...decided, approved: false };
    const r = checkEvidence(overturned);
    assert.equal(r.outcome, "completed");
    assert.equal(r.overturned, true);
  });

  it("refuses malformed input and a rejection the votes could still have approved", () => {
    for (const bad of [{}, null, { version: "arl-evidence/2" }]) {
      assert.throws(
        () => checkEvidence(bad as never),
        (e: unknown) => e instanceof EvidenceError,
      );
    }
    const [first] = vectors.valid;
    assert.ok(first);
    const partial = structuredClone(first.evidence) as unknown as {
      settlement: Record<string, unknown>;
    };
    delete partial.settlement.config;
    assert.throws(() => checkEvidence(partial as never), /settlement record is incomplete/);

    const forged = structuredClone(first.evidence);
    const decided = forged.settlement.decided;
    const finalized = forged.settlement.finalized;
    const settlement = forged.settlement.settlement;
    assert.ok(decided && finalized && settlement);
    forged.settlement.decided = { ...decided, approved: false };
    forged.settlement.finalized = { ...finalized, approved: false };
    forged.settlement.settlement = { ...settlement, outcome: "rejected" };
    assert.throws(() => checkEvidence(forged), /still reachable/);
  });

  it("refuses a completed settlement with no decision or finalization behind it", () => {
    const [first] = vectors.valid;
    assert.ok(first);
    for (const drop of ["decided", "finalized"] as const) {
      const forged = structuredClone(first.evidence);
      forged.settlement[drop] = null;
      assert.throws(() => checkEvidence(forged), /needs a decision and a finalization/);
    }
    const bare = structuredClone(first.evidence);
    bare.settlement.decided = null;
    bare.settlement.finalized = null;
    bare.settlement.votes = [];
    assert.throws(() => checkEvidence(bare), /needs a decision and a finalization/);
  });
});
