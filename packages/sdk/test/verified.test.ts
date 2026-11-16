import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BASE_MAINNET_VERIFIED,
  VERDICT_PHASES,
  checkOpenParams,
  defaultWindows,
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
