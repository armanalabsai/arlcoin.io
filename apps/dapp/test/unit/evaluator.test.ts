import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PHASES, TIERS, countStats, evaluatorAbi, phaseName } from "../../lib/evaluator.ts";

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

describe("evaluator statistics", () => {
  it("counts jobs, verdicts, stake and slashing from events", () => {
    const v1 = "0x00000000000000000000000000000000000000a1";
    const v2 = "0x00000000000000000000000000000000000000a2";
    const s = countStats([
      { eventName: "Staked", args: { validator: v1, amount: 100n } },
      { eventName: "Staked", args: { validator: v2, amount: 50n } },
      { eventName: "Configured" },
      { eventName: "Configured" },
      { eventName: "Finalized", args: { approved: true } },
      { eventName: "Finalized", args: { approved: false } },
      { eventName: "Disputed" },
      { eventName: "Slashed", args: { amount: 10n } },
      { eventName: "Unstaked", args: { validator: v2, amount: 50n } },
    ]);
    assert.deepEqual(s, {
      jobs: 2,
      approved: 1,
      rejected: 1,
      disputes: 1,
      validators: 1,
      staked: 90n,
      slashed: 10n,
    });
  });
});
