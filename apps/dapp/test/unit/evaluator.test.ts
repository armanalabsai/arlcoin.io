import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PHASES, TIERS, evaluatorAbi, phaseName } from "../../lib/evaluator.ts";

describe("evaluator", () => {
  it("names every verdict phase of ARLVerifiedEvaluator in order", () => {
    assert.equal(PHASES.length, 8);
    assert.equal(phaseName(0), "Not configured");
    assert.equal(phaseName(2), "Approved");
    assert.equal(phaseName(7), "Failed");
    assert.equal(phaseName(9), "Phase 9");
  });

  it("names the three tiers", () => {
    assert.deepEqual([...TIERS], ["Fallback", "Re-execution", "Attested"]);
  });

  it("lists the functions the app calls", () => {
    const names: string[] = evaluatorAbi.map((f) => f.name);
    for (const n of [
      "stakeOf",
      "lockedOf",
      "stake",
      "unstake",
      "finalize",
      "getConfig",
      "getVerdict",
    ])
      assert.ok(names.includes(n), n);
  });
});
