import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";

import {
  TaskError,
  canonicalHash,
  committedSpecHash,
  jobDescription,
  onchainTerms,
  parseTask,
  taskHash,
} from "../src/index.ts";

interface Vectors {
  reexecSpecHash: Hex;
  valid: { name: string; task: unknown; taskHash: Hex; committedSpecHash: Hex }[];
  invalid: { name: string; task: unknown; error: string }[];
}

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/arl-task/v0.1.0/vectors.json", import.meta.url), "utf8"),
) as Vectors;

const CLIENT: Address = "0x1111111111111111111111111111111111111111";
const PROVIDER: Address = "0x2222222222222222222222222222222222222222";
const EVALUATOR: Address = "0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF";
const COMMITTEE: Address[] = [
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
  "0x5555555555555555555555555555555555555555",
];

describe("arl-task/1 vectors", () => {
  for (const v of vectors.valid) {
    it(`accepts and hashes ${v.name}`, () => {
      const task = parseTask(v.task);
      assert.equal(taskHash(task), v.taskHash);
      // Parsing keeps every field: the hash of the raw document is the same.
      assert.equal(canonicalHash(v.task), v.taskHash);
      assert.equal(committedSpecHash(task), v.committedSpecHash);
    });
  }

  for (const v of vectors.invalid) {
    it(`refuses ${v.name}`, () => {
      assert.throws(
        () => parseTask(v.task),
        (e: unknown) => e instanceof TaskError && e.message.includes(v.error),
      );
    });
  }

  it("commits the arl-reexec/1 spec hash for a reexec task, the task hash otherwise", () => {
    const [reexec, model] = vectors.valid;
    assert.ok(reexec && model);
    assert.equal(reexec.committedSpecHash, vectors.reexecSpecHash);
    assert.equal(model.committedSpecHash, model.taskHash);
  });
});

describe("onchainTerms", () => {
  const first = vectors.valid[0];
  assert.ok(first);
  const task = parseTask(first.task);
  const base = {
    client: CLIENT,
    provider: PROVIDER,
    evaluator: EVALUATOR,
    committee: COMMITTEE,
    taskUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    now: 1_800_000_000n,
  };

  it("maps a task to createJob and configure within the contract bounds", () => {
    const t = onchainTerms(task, base);
    assert.equal(t.createJob.expiredAt, 1_800_000_000n + 72n * 3600n);
    assert.equal(t.createJob.evaluator, EVALUATOR);
    assert.equal(t.createJob.hook, "0x0000000000000000000000000000000000000000");
    assert.ok(t.createJob.description.startsWith(`arl-task:${first.taskHash} ipfs://`));
    assert.equal(t.configure.tier, 1);
    assert.equal(t.configure.threshold, 2);
    assert.equal(t.configure.specHash, vectors.reexecSpecHash);
    assert.equal(t.budget, 10n * 10n ** 18n);
    // ARLVerifiedEvaluator._checkWindows at configuration time.
    assert.ok(
      t.createJob.expiredAt >= base.now + t.configure.voteWindow + 2n * t.configure.challengeWindow,
    );
  });

  it("refuses a committee with the client, the provider, a repeat or the wrong size", () => {
    const [a, b] = COMMITTEE as [Address, Address];
    for (const committee of [
      [CLIENT, a, b],
      [PROVIDER, a, b],
      [a, a, b],
      [a, b],
    ]) {
      assert.throws(() => onchainTerms(task, { ...base, committee }), TaskError);
    }
  });

  it("keeps the on-chain description within ARLJobs.MAX_DESCRIPTION", () => {
    assert.throws(() => jobDescription(task, `https://example.com/${"a".repeat(1100)}`), TaskError);
    assert.throws(() => jobDescription(task, "http://example.com/task.json"), TaskError);
  });
});
