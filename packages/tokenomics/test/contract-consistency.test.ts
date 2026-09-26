import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ALLOCATIONS, MAX_SUPPLY } from "../src/index.ts";

// The Solidity allocation library must match this package exactly. This test parses the
// contract source so a change to either side without the other fails CI.

const source = readFileSync(
  new URL("../../../contracts/src/ARLAllocation.sol", import.meta.url),
  "utf8",
);

const CONSTANT_FOR_ID: Record<string, string> = {
  founder: "FOUNDER",
  "ecosystem-reserve": "ECOSYSTEM_RESERVE",
  treasury: "TREASURY",
  "community-staking": "COMMUNITY_STAKING",
  liquidity: "LIQUIDITY",
  "strategic-partnerships": "STRATEGIC_PARTNERSHIPS",
  "public-launch": "PUBLIC_LAUNCH",
  "grants-bug-bounty": "GRANTS_BUG_BOUNTY",
  team: "TEAM",
  "early-user-rewards": "EARLY_USER_REWARDS",
};

function wholeTokens(name: string): number {
  const match = new RegExp(`uint256 internal constant ${name} = ([0-9_]+) \\* UNIT;`).exec(source);
  assert.ok(match?.[1], `constant ${name} not found in ARLAllocation.sol`);
  return Number(match[1].replaceAll("_", ""));
}

describe("ARLAllocation.sol", () => {
  it("uses 18 decimals", () => {
    assert.match(source, /uint256 internal constant UNIT = 1e18;/);
  });

  it("MAX_SUPPLY matches", () => {
    assert.equal(wholeTokens("MAX_SUPPLY"), MAX_SUPPLY);
  });

  it("every allocation matches, and there are no extra allocations", () => {
    assert.deepEqual(Object.keys(CONSTANT_FOR_ID).sort(), ALLOCATIONS.map((a) => a.id).sort());
    for (const a of ALLOCATIONS) {
      const name = CONSTANT_FOR_ID[a.id];
      assert.ok(name);
      assert.equal(wholeTokens(name), a.amount, a.id);
    }
  });

  it("ecosystem reserve annual cap matches", () => {
    const reserve = ALLOCATIONS.find((a) => a.id === "ecosystem-reserve");
    assert.ok(reserve?.release.kind === "annual-cap");
    assert.equal(wholeTokens("ECOSYSTEM_RESERVE_ANNUAL_CAP"), reserve.release.maxPerYear);
  });
});
