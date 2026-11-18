import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicClient } from "viem";

import {
  acceptProblem,
  DEFAULT_ACCEPT_POLICY,
  canonicalHash,
  decideOrFail,
  parseSpec,
  specHash,
  voteSpec,
  type ReexecSpec,
  type WatchDeps,
} from "../src/index.ts";

const spec = parseSpec({
  version: "arl-reexec/1",
  container_digest: `docker.io/library/node@sha256:${"a".repeat(64)}`,
  inputs: [],
  command: ["node", "-e", "1"],
  workdir: ".",
  env: {},
  outputs: ["result.json"],
  limits: { seconds: 60, memory_mb: 256, cpus: 1 },
  verifier_digest: `sha256:${"c".repeat(64)}`,
});
const swapped = { ...spec, command: ["node", "-e", "2"] } as ReexecSpec;
const HASH = specHash(spec);
const D = `0x${"d".repeat(64)}` as const;

/** A fetcher serving `served` at any URI, as a spec host would. */
const serving = (served: ReexecSpec) => ({
  file: () => Promise.resolve(Buffer.from(JSON.stringify(served))),
});

describe("keeper: the spec a vote runs", () => {
  it("uses the spec saved at accept time, not a swapped one served later", async () => {
    const s = await voteSpec(spec, "https://example.com/spec.json", HASH, serving(swapped));
    assert.deepEqual(s, spec);
  });

  it("fetches when nothing was saved, and only accepts a spec matching the committed hash", async () => {
    assert.deepEqual(
      await voteSpec(undefined, "https://example.com/spec.json", HASH, serving(spec)),
      spec,
    );
    assert.equal(
      await voteSpec(undefined, "https://example.com/spec.json", HASH, serving(swapped)),
      null,
    );
  });
});

describe("keeper: a vote that cannot be computed", () => {
  const deps = (now: bigint) =>
    ({
      client: { getBlock: () => Promise.resolve({ timestamp: now }) } as unknown as PublicClient,
      exec: {},
    }) as unknown as WatchDeps;

  it("retries while the vote window leaves time", async () => {
    assert.equal(await decideOrFail(deps(100n), 1_000n, null, HASH, D), null);
  });

  it("votes to reject, with the failure as evidence, near the end of the vote window", async () => {
    const d = await decideOrFail(deps(800n), 1_000n, null, HASH, D);
    assert.ok(d);
    assert.equal(d.approve, false);
    assert.match(d.reason, /re-execution failed/);
    assert.notEqual(d.evidence, `0x${"0".repeat(64)}`);
    assert.equal(
      d.evidence,
      canonicalHash({
        error: "re-execution failed",
        reason: "no spec matching the job's specHash is available",
      }),
    );
  });
});

describe("keeper: which jobs a validator accepts", () => {
  const NOW = 1_800_000_000n;
  const ARL = 10n ** 18n;
  const CLIENT = "0x1111111111111111111111111111111111111111" as const;
  const job = {
    client: CLIENT,
    budget: 250n * ARL,
    expiredAt: NOW + 7n * 86_400n,
    voteWindow: 6n * 3_600n,
    bond: 100n * ARL,
    bondFollowsBudget: true,
  };

  it("accepts an ordinary job", () => {
    assert.equal(acceptProblem(job, DEFAULT_ACCEPT_POLICY, NOW), null);
  });

  it("refuses a near-empty job, a far deadline, a short vote window and a large bond", () => {
    const refuse = (change: Partial<typeof job>) =>
      acceptProblem({ ...job, ...change }, DEFAULT_ACCEPT_POLICY, NOW);
    assert.match(refuse({ budget: 1n }) ?? "", /budget/);
    assert.match(refuse({ expiredAt: NOW + 365n * 86_400n }) ?? "", /deadline/);
    assert.match(refuse({ voteWindow: 600n }) ?? "", /vote window/);
    assert.match(refuse({ bond: 101n * ARL, budget: 1_010n * ARL }) ?? "", /bond/);
  });

  it("needs an explicit minimum budget when stakes are in another token", () => {
    const usdc = { ...job, budget: 50_000_000n, bondFollowsBudget: false };
    assert.match(acceptProblem(usdc, DEFAULT_ACCEPT_POLICY, NOW) ?? "", /no minimum budget/);
    const policy = { ...DEFAULT_ACCEPT_POLICY, minBudget: 10_000_000n };
    assert.equal(acceptProblem(usdc, policy, NOW), null);
    assert.match(acceptProblem({ ...usdc, budget: 1n }, policy, NOW) ?? "", /budget/);
  });

  it("keeps to the operator's client list when one is set", () => {
    const policy = { ...DEFAULT_ACCEPT_POLICY, clients: [CLIENT] };
    assert.equal(acceptProblem(job, policy, NOW), null);
    const other = { ...job, client: "0x2222222222222222222222222222222222222222" as const };
    assert.match(acceptProblem(other, policy, NOW) ?? "", /client/);
  });
});
