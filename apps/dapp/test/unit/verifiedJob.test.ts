import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keccak256, stringToBytes } from "viem";

import {
  OPERATOR_VALIDATORS,
  canonicalize,
  checkOpen,
  deliverableOf,
  parseCommittee,
  specHashOf,
} from "../../lib/verifiedJob.ts";
import type { OpenInput } from "../../lib/verifiedJob.ts";

const CLIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const PROVIDER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const ARBITER = "0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f";
const ARL = 10n ** 18n;
const HOUR = 3_600n;

// The spec of packages/verifier/test/verifier.test.ts and its pinned hash.
const SPEC = {
  version: "arl-reexec/1",
  container_digest: `docker.io/library/node@sha256:${"a".repeat(64)}`,
  inputs: [
    {
      kind: "git",
      path: "repo",
      url: "https://github.com/example/repo.git",
      commit: "b".repeat(40),
    },
    {
      kind: "file",
      path: "data/in.txt",
      url: "https://example.com/in.txt",
      sha256: "b61c5467763338dbe28dc8f06c77a495fc47d671a857124be6df50e9d3464962",
    },
  ],
  command: ["npm", "test", "--", "--reporter=json"],
  workdir: "repo",
  env: { CI: "1", TZ: "UTC" },
  outputs: ["result.json", "coverage/lcov.info"],
  limits: { seconds: 600, memory_mb: 2048, cpus: 2 },
  verifier_digest: `sha256:${"c".repeat(64)}`,
};
const SPEC_VECTOR = "0xbe6be4554f5411cd3ae6069caf03c96e2764a21e2b08a851fc6b83279a1f7690";

const input = (over: Partial<OpenInput> = {}): OpenInput => ({
  client: CLIENT,
  arbiter: ARBITER,
  specUrl: "https://arlcoin.io/jobs/spec.json",
  provider: PROVIDER,
  committee: OPERATOR_VALIDATORS.join("\n"),
  threshold: 2,
  budget: 100n * ARL,
  bond: 100n * ARL,
  minBond: 100n * ARL,
  voteWindow: 2n * HOUR,
  challengeWindow: HOUR,
  minChallengeWindow: HOUR,
  deadlineSeconds: 72n * HOUR,
  ...over,
});

const error = (over: Partial<OpenInput>) => {
  const r = checkOpen(input(over));
  return r.ok ? null : r.error;
};

describe("verified job hashes", () => {
  it("canonicalizes like the reference verifier", () => {
    assert.equal(canonicalize({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
  });

  it("matches the verifier's pinned spec hash, whatever the key order or whitespace", () => {
    assert.equal(specHashOf(JSON.stringify(SPEC)), SPEC_VECTOR);
    const reversed = Object.fromEntries(Object.entries(SPEC).reverse());
    assert.equal(specHashOf(JSON.stringify(reversed, null, 2)), SPEC_VECTOR);
  });

  it("refuses a document that is not a spec or a result", () => {
    assert.throws(() => specHashOf('{"version":"arl-task/1"}'));
    assert.throws(() => deliverableOf(JSON.stringify(SPEC)));
  });

  it("hashes a result's canonical form as the deliverable", () => {
    const result = {
      version: "arl-reexec-result/1",
      spec_hash: SPEC_VECTOR,
      exit_code: 0,
      timed_out: false,
      outputs: [{ path: "result.json", sha256: "d".repeat(64) }],
    };
    const canonical = canonicalize(result);
    assert.equal(
      deliverableOf(JSON.stringify(result, null, 2)),
      keccak256(stringToBytes(canonical)),
    );
  });
});

describe("opening a verified job", () => {
  it("accepts the operator committee with a 2-of-3 majority", () => {
    const r = checkOpen(input());
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.plan.committee, [...OPERATOR_VALIDATORS]);
      assert.equal(r.plan.provider, PROVIDER);
    }
  });

  it("parses committees separated by lines, commas or spaces", () => {
    assert.equal(parseCommittee("a, b\nc  d").length, 4);
  });

  it("refuses links, parties and committees the evaluator would revert on", () => {
    assert.match(error({ specUrl: "http://x" }) ?? "", /https/);
    assert.match(error({ provider: "0x1" }) ?? "", /provider/);
    assert.match(error({ provider: CLIENT }) ?? "", /another wallet/);
    assert.match(error({ provider: ARBITER }) ?? "", /arbiter/);
    assert.match(error({ committee: OPERATOR_VALIDATORS[0] }) ?? "", /2 to 7/);
    assert.match(
      error({ committee: `${OPERATOR_VALIDATORS[0]}\n${PROVIDER}` }) ?? "",
      /cannot sit/,
    );
    assert.match(
      error({ committee: `${OPERATOR_VALIDATORS[0]},${OPERATOR_VALIDATORS[0]}` }) ?? "",
      /twice/,
    );
    assert.match(error({ threshold: 1 }) ?? "", /majority/);
    assert.match(error({ threshold: 4 }) ?? "", /majority/);
    assert.match(
      error({ committee: OPERATOR_VALIDATORS.slice(0, 2).join(","), threshold: 1 }) ?? "",
      /majority/,
    );
  });

  it("refuses amounts and windows the evaluator or the validators would refuse", () => {
    assert.match(error({ bond: 99n * ARL }) ?? "", /minimum/);
    assert.match(error({ budget: 0n }) ?? "", /budget/);
    assert.match(error({ budget: 50n * ARL }) ?? "", /at least the bond/);
    assert.match(error({ voteWindow: 60n }) ?? "", /10 minutes/);
    assert.match(error({ voteWindow: 30n * 60n }) ?? "", /1 hour/);
    assert.match(error({ challengeWindow: 60n }) ?? "", /challenge window/);
    assert.match(error({ deadlineSeconds: 3n * HOUR }) ?? "", /room/);
    assert.match(error({ deadlineSeconds: 31n * 24n * HOUR }) ?? "", /30 days/);
  });
});
