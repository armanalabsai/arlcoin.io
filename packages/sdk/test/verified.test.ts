import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BASE_SEPOLIA_VERIFIED, VERDICT_PHASES, checkOpenParams } from "../src/index.ts";

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

  it("names the eight verdict phases and the Base Sepolia deployment", () => {
    assert.equal(VERDICT_PHASES.length, 8);
    assert.equal(VERDICT_PHASES[5], "Finalized");
    assert.equal(BASE_SEPOLIA_VERIFIED.chainId, 84_532);
  });
});
