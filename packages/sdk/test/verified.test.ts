import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BASE_MAINNET_TASK_DEPLOYMENTS,
  BASE_MAINNET_VERIFIED,
  VERDICT_PHASES,
  VerifiedJobError,
  checkOpenParams,
  defaultWindows,
  getOutcomes,
} from "../src/index.ts";

const ok = {
  provider: "0x00000000000000000000000000000000000000aa",
  specUri: "https://example.com/spec.json",
  specHash: `0x${"1".repeat(64)}`,
  committee: [
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
    "0x0000000000000000000000000000000000000003",
  ],
  threshold: 2,
} as const;

describe("verified jobs", () => {
  it("accepts a 2-of-3 committee", () => {
    assert.doesNotThrow(() => {
      checkOpenParams({ ...ok, committee: [...ok.committee] });
    });
  });

  it("refuses what the evaluator would reject", () => {
    const bad = [
      { ...ok, committee: ok.committee.slice(0, 2) },
      { ...ok, committee: [ok.committee[0], ok.committee[0], ok.committee[1]] },
      { ...ok, threshold: 1 },
      { ...ok, threshold: 4 },
      { ...ok, specUri: "http://example.com/spec.json" },
      { ...ok, specHash: "0x1234" },
    ];
    for (const p of bad)
      assert.throws(() => {
        checkOpenParams(p as never);
      });
  });

  it("names the eight verdict phases and the Base Mainnet deployment", () => {
    assert.equal(VERDICT_PHASES.length, 8);
    assert.equal(VERDICT_PHASES[5], "Finalized");
    assert.equal(BASE_MAINNET_VERIFIED.chainId, 8453);
  });
});

describe("defaultWindows", () => {
  it("uses the evaluator's minimum challenge window and leaves room for _checkFits", () => {
    const w = defaultWindows(86_400n, {});
    assert.equal(w.voteWindow, 3_600n);
    assert.equal(w.challengeWindow, 86_400n);
    // configure and voting start need expiredAt >= now + vote + 2 * challenge.
    assert.ok(w.expiresIn >= w.voteWindow + 2n * w.challengeWindow + 86_400n);
  });

  it("keeps the old one-hour windows where the evaluator allows them", () => {
    const w = defaultWindows(600n, {});
    assert.equal(w.challengeWindow, 3_600n);
    assert.equal(w.expiresIn, 3_600n + 7_200n + 86_400n);
  });

  it("keeps values the caller gives", () => {
    const w = defaultWindows(86_400n, {
      voteWindow: 600n,
      challengeWindow: 172_800n,
      expiresIn: 1n,
    });
    assert.deepEqual(w, { voteWindow: 600n, challengeWindow: 172_800n, expiresIn: 1n });
  });
});

describe("getOutcomes", () => {
  it("reads approved and rejected counts from outcomesOf on the evaluator", async () => {
    const calls: { address: string; functionName: string; args: readonly unknown[] }[] = [];
    const client = {
      getChainId: () => Promise.resolve(8453),
      readContract(p: { address: string; functionName: string; args: readonly unknown[] }) {
        calls.push({ address: p.address, functionName: p.functionName, args: p.args });
        return Promise.resolve([12n, 3n] as const);
      },
    } as never;

    const usdcEval = BASE_MAINNET_TASK_DEPLOYMENTS.USDC.evaluator;
    const out = await getOutcomes(client, usdcEval, 42n);
    assert.deepEqual(out, { approved: 12n, rejected: 3n });
    assert.deepEqual(calls[0], {
      address: usdcEval,
      functionName: "outcomesOf",
      args: [42n],
    });

    const defOut = await getOutcomes(client, 99n);
    assert.deepEqual(defOut, { approved: 12n, rejected: 3n });
    assert.equal(calls[1]?.address, BASE_MAINNET_VERIFIED.evaluator);
  });

  it("rejects negative agent ids and missing local evaluator addresses", async () => {
    const baseClient = { getChainId: () => Promise.resolve(8453) } as never;
    await assert.rejects(
      () => getOutcomes(baseClient, BASE_MAINNET_VERIFIED.evaluator, -1n),
      VerifiedJobError,
    );

    const localClient = { getChainId: () => Promise.resolve(31_337) } as never;
    await assert.rejects(() => getOutcomes(localClient, 1n), VerifiedJobError);
  });
});
