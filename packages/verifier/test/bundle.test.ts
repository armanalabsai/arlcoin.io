import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BUNDLE_VERSION, checkBundle, type EvidenceBundle } from "../src/bundle.ts";

const A = "0x00000000000000000000000000000000000000a1" as const;
const B = "0x00000000000000000000000000000000000000b2" as const;
const C = "0x00000000000000000000000000000000000000c3" as const;
const D = `0x${"d".repeat(64)}` as const;
const X = `0x${"e".repeat(64)}` as const;
const r = { block: "1", tx: `0x${"1".repeat(64)}` as const };

const voteB = { ...r, validator: B, approve: true, deliverable: D, evidence: D };

function good(): EvidenceBundle {
  return {
    version: BUNDLE_VERSION,
    chainId: 84_532,
    jobs: A,
    evaluator: B,
    jobId: "1",
    job: { client: A, provider: B, budget: "10", status: 3, description: "https://x/spec.json" },
    config: { tier: 1, threshold: 2, specHash: X, committee: [A, B, C] },
    submitted: { ...r, deliverable: D },
    votes: [{ ...r, validator: A, approve: true, deliverable: D, evidence: D }, voteB],
    decided: { ...r, approved: true },
    finalized: { ...r, approved: true, voteHash: X },
    settlement: { ...r, outcome: "completed" },
  };
}

describe("evidence bundle consistency", () => {
  it("accepts a consistent approved bundle", () => {
    assert.deepEqual(checkBundle(good()), []);
  });

  it("rejects too few approvals, a different deliverable and an outsider's vote", () => {
    const few = good();
    few.votes = few.votes.slice(0, 1);
    assert.ok(checkBundle(few).some((p) => p.includes("threshold")));

    const other = good();
    other.votes[1] = { ...voteB, deliverable: X };
    assert.ok(checkBundle(other).some((p) => p.includes("different deliverable")));

    const outsider = good();
    outsider.votes[1] = { ...voteB, validator: `0x${"f".repeat(40)}` as const };
    assert.ok(checkBundle(outsider).some((p) => p.includes("not in the committee")));
  });

  it("rejects a double vote, an approval without submission and a settlement mismatch", () => {
    const twice = good();
    twice.votes[1] = { ...voteB, validator: A };
    assert.ok(checkBundle(twice).some((p) => p.includes("voted twice")));

    const unsubmitted = good();
    unsubmitted.submitted = null;
    assert.ok(checkBundle(unsubmitted).some((p) => p.includes("without a submitted")));

    const wrongEscrow = good();
    wrongEscrow.settlement = { ...r, outcome: "rejected" };
    assert.ok(checkBundle(wrongEscrow).some((p) => p.includes("expected completed")));

    const flipped = good();
    flipped.finalized = { ...r, approved: false, voteHash: X };
    assert.ok(checkBundle(flipped).some((p) => p.includes("differs from the decision")));
  });

  it("rejects an unknown version", () => {
    assert.ok(checkBundle({ ...good(), version: "x" as never }).length > 0);
  });
});
