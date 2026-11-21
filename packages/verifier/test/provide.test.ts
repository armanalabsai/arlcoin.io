import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PROVIDE_POLICY,
  parseProvideState,
  provideProblem,
  serializeProvideState,
  type ProvidePolicy,
} from "../src/index.ts";

const CLIENT = "0x00000000000000000000000000000000000000A1";
const V1 = "0x00000000000000000000000000000000000000b1";
const V2 = "0x00000000000000000000000000000000000000B2";
const IMAGE = "docker.io/library/node@sha256:" + "ab".repeat(32);
const NOW = 1_800_000_000n;

const policy: ProvidePolicy = { ...DEFAULT_PROVIDE_POLICY, minBudget: 10n };
const job = { client: CLIENT, budget: 10n, expiredAt: NOW + 86_400n, committee: [V1, V2] } as const;
const spec = { container_digest: IMAGE, limits: { seconds: 120, memory_mb: 256, cpus: 1 } };

describe("what a provider takes", () => {
  it("takes a job inside its limits", () => {
    assert.equal(provideProblem(job, spec, policy, NOW), null);
  });

  it("refuses work below its price, too close to the deadline or too heavy", () => {
    assert.equal(
      provideProblem({ ...job, budget: 9n }, spec, policy, NOW),
      "budget is below this provider's price",
    );
    assert.equal(
      provideProblem({ ...job, expiredAt: NOW + 3_600n }, spec, policy, NOW),
      "deadline is too close to run, vote and settle",
    );
    assert.equal(
      provideProblem(job, { ...spec, limits: { ...spec.limits, seconds: 601 } }, policy, NOW),
      "spec asks for a longer run than allowed",
    );
    assert.equal(
      provideProblem(job, { ...spec, limits: { ...spec.limits, memory_mb: 2048 } }, policy, NOW),
      "spec asks for more memory than allowed",
    );
  });

  it("keeps to its lists of clients, validators and images when it has them", () => {
    assert.equal(
      provideProblem(job, spec, { ...policy, clients: [V1] }, NOW),
      "client is not on this provider's list",
    );
    assert.equal(
      provideProblem(
        job,
        spec,
        { ...policy, clients: [CLIENT.toLowerCase() as `0x${string}`] },
        NOW,
      ),
      null,
    );
    assert.equal(
      provideProblem(job, spec, { ...policy, validators: [V1] }, NOW),
      "committee names a validator this provider does not accept",
    );
    assert.equal(provideProblem(job, spec, { ...policy, validators: [V2, V1] }, NOW), null);
    assert.equal(
      provideProblem(
        job,
        spec,
        { ...policy, images: ["docker.io/library/busybox@sha256:00"] },
        NOW,
      ),
      "container image is not on this provider's list",
    );
    assert.equal(provideProblem(job, spec, { ...policy, images: [IMAGE] }, NOW), null);
  });
});

describe("the provider's saved state", () => {
  it("survives a round trip", () => {
    const state = {
      fromBlock: 60_000_000n,
      jobs: ["7", "9"],
      deliverables: { "7": `0x${"d1".repeat(32)}` as const },
    };
    assert.deepEqual(parseProvideState(serializeProvideState(state)), state);
  });

  it("refuses a malformed file instead of guessing", () => {
    assert.throws(() => parseProvideState('{"fromBlock":1,"jobs":[]}'));
    assert.throws(() => parseProvideState('{"fromBlock":"1","jobs":[7]}'));
    assert.throws(() =>
      parseProvideState('{"fromBlock":"1","jobs":[],"deliverables":{"7":"0x12"}}'),
    );
  });
});
