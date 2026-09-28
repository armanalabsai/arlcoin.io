import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { actions, deliverableHash, rolesOf, statusName, validateJob } from "../../lib/jobs.ts";
import type { Job } from "../../lib/jobs.ts";

const CLIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const PROVIDER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const OTHER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

const job = (over: Partial<Job> = {}): Job => ({
  id: 1n,
  client: CLIENT,
  provider: PROVIDER,
  evaluator: CLIENT,
  description: "x",
  budget: 10n,
  expiredAt: 1_000n,
  status: "Open",
  ...over,
});

describe("jobs", () => {
  it("names statuses in contract order", () => {
    assert.equal(statusName(0), "Open");
    assert.equal(statusName(5), "Expired");
    assert.throws(() => statusName(6));
  });

  it("finds every role an account holds, whatever the address case", () => {
    assert.deepEqual(rolesOf(job(), CLIENT.toLowerCase() as `0x${string}`), [
      "client",
      "evaluator",
    ]);
    assert.deepEqual(rolesOf(job(), PROVIDER), ["provider"]);
    assert.deepEqual(rolesOf(job(), OTHER), []);
    assert.deepEqual(rolesOf(job(), undefined), []);
  });

  it("offers only the actions the contract allows", () => {
    assert.deepEqual(actions(job(), "client", 0n), ["fund", "setBudget", "reject"]);
    assert.deepEqual(actions(job({ budget: 0n }), "client", 0n), ["setBudget", "reject"]);
    assert.deepEqual(actions(job(), "client", 1_000n), ["setBudget", "reject"]);
    assert.deepEqual(actions(job(), "provider", 0n), ["setBudget"]);
    assert.deepEqual(actions(job({ status: "Funded" }), "provider", 0n), ["submit"]);
    assert.deepEqual(actions(job({ status: "Funded" }), "evaluator", 0n), ["reject"]);
    assert.deepEqual(actions(job({ status: "Funded" }), "client", 0n), []);
    assert.deepEqual(actions(job({ status: "Funded" }), "provider", 1_000n), ["claimRefund"]);
    assert.deepEqual(actions(job({ status: "Submitted" }), "evaluator", 0n), [
      "complete",
      "reject",
    ]);
    assert.deepEqual(actions(job({ status: "Submitted" }), "client", 1_000n), ["claimRefund"]);
    for (const status of ["Completed", "Rejected", "Expired"] as const)
      assert.deepEqual(actions(job({ status }), "evaluator", 0n), []);
  });

  it("hashes a result", () => {
    assert.equal(
      deliverableHash(""),
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("validates a new job", () => {
    const ok = validateJob({ description: " Summarise ", budget: "2.5", hours: "24" });
    assert.deepEqual(ok, {
      ok: true,
      value: { description: "Summarise", budget: 2_500_000_000_000_000_000n, seconds: 86_400n },
    });
    const bad = (input: { description: string; budget: string; hours: string }) =>
      assert.equal(validateJob(input).ok, false);
    bad({ description: "", budget: "1", hours: "1" });
    bad({ description: "é".repeat(513), budget: "1", hours: "1" });
    bad({ description: "a\u0007b", budget: "1", hours: "1" });
    bad({ description: "a", budget: "0", hours: "1" });
    bad({ description: "a", budget: "1", hours: "0" });
    bad({ description: "a", budget: "1", hours: "1.5" });
    bad({ description: "a", budget: "1", hours: "2161" });
    assert.equal(validateJob({ description: "a\nb", budget: "1", hours: "2160" }).ok, true);
  });
});
