import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { Hex } from "viem";

import {
  PolicyError,
  checkTaskAgainstPolicy,
  decideVote,
  effectiveBond,
  parsePolicy,
  parseTask,
  policyHash,
  type Policy,
  type RuleOutcome,
  type Task,
} from "../src/index.ts";

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

interface PolicyVectors {
  policies: { id: string; file: string; policyHash: Hex }[];
  fits: { task: string; policy: string }[];
  misfits: { task: string; policy: string; error: string }[];
  votes: {
    name: string;
    task: string;
    policy: string;
    outcomes: RuleOutcome[];
    approve: boolean;
  }[];
}

const vectors = read("../../../spec/arl-policy/v0.1.0/vectors.json") as PolicyVectors;
const taskVectors = read("../../../spec/arl-task/v0.1.0/vectors.json") as {
  valid: { name: string; task: unknown }[];
};

const tasks = new Map<string, Task>(taskVectors.valid.map((v) => [v.name, parseTask(v.task)]));
const policies = new Map<string, Policy>(
  vectors.policies.map((p) => [
    p.id,
    parsePolicy(read(`../../../spec/arl-policy/v0.1.0/${p.file}`)),
  ]),
);
const get = <T>(m: Map<string, T>, k: string): T => {
  const v = m.get(k);
  assert.ok(v, k);
  return v;
};

describe("arl-policy/1 vectors", () => {
  for (const p of vectors.policies) {
    it(`parses and hashes ${p.id}`, () => {
      assert.equal(policyHash(get(policies, p.id)), p.policyHash);
    });
  }

  for (const f of vectors.fits) {
    it(`accepts ${f.task} under ${f.policy}`, () => {
      checkTaskAgainstPolicy(get(tasks, f.task), get(policies, f.policy));
    });
  }

  for (const m of vectors.misfits) {
    it(`refuses ${m.task} under ${m.policy}`, () => {
      assert.throws(
        () => {
          checkTaskAgainstPolicy(get(tasks, m.task), get(policies, m.policy));
        },
        (e: unknown) => e instanceof PolicyError && e.message.includes(m.error),
      );
    });
  }

  for (const v of vectors.votes) {
    it(`votes ${v.approve ? "approve" : "reject"}: ${v.name}`, () => {
      const d = decideVote(get(tasks, v.task), get(policies, v.policy), v.outcomes);
      assert.equal(d.approve, v.approve, d.reason);
    });
  }
});

describe("policy rules", () => {
  it("mirrors the evaluator's bond: max(floor, budget / 10)", () => {
    const t = get(tasks, "reexec-arl");
    assert.equal(effectiveBond(t), 100n * 10n ** 18n);
    const big = { ...t, payment: { ...t.payment, budget: (5000n * 10n ** 18n).toString() } };
    assert.equal(effectiveBond(big), 500n * 10n ** 18n);
  });

  it("refuses an ARL task whose committee bond does not cover the budget", () => {
    const t = get(tasks, "reexec-arl");
    // budget 1,000,000 ARL: bond = 100,000 ARL, 2 × 100,000 < 1,000,000.
    const big = { ...t, payment: { ...t.payment, budget: (1_000_000n * 10n ** 18n).toString() } };
    assert.throws(() => {
      checkTaskAgainstPolicy(big, get(policies, "reexec-standard"));
    }, /does not cover/);
  });

  it("never lets a model decide above the policy's budget cap", () => {
    const t = get(tasks, "model-assisted-usdc");
    const big = { ...t, payment: { ...t.payment, budget: "100000001" } };
    const d = decideVote(big, get(policies, "model-assisted-review"), [
      { id: "complete", passed: true, by: "model", weights_sha256: "f".repeat(64) },
      { id: "numbering", passed: true, by: "check" },
    ]);
    assert.equal(d.approve, false);
  });

  it("refuses a policy that lets a model decide reexec work or does not cap model budgets", () => {
    const base = read("../../../spec/arl-policy/v0.1.0/policies/reexec-standard.json") as Record<
      string,
      unknown
    >;
    assert.throws(
      () =>
        parsePolicy({
          ...base,
          model: { allowed: true, max_budget: { ARL: "1" }, models: [] },
        }),
      PolicyError,
    );
    const model = read(
      "../../../spec/arl-policy/v0.1.0/policies/model-assisted-review.json",
    ) as Record<string, unknown>;
    assert.throws(
      () => parsePolicy({ ...model, model: { allowed: true, max_budget: {}, models: [] } }),
      PolicyError,
    );
    assert.throws(() => parsePolicy({ ...base, extra: true }), PolicyError);
  });
});
