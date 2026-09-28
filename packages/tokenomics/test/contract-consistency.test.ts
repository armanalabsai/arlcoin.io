import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ALLOCATIONS, MAX_SUPPLY } from "../src/index.ts";

// The Solidity allocation library and token must match this package exactly. These tests
// parse the contract sources so a change to either side without the other fails CI.

const read = (path: string) =>
  readFileSync(new URL(`../../../contracts/src/${path}`, import.meta.url), "utf8");
const allocationSource = read("ARLAllocation.sol");
const tokenSource = read("ARLToken.sol");

/** Genesis holders in canonical order: one per allocation. */
const GENESIS = ALLOCATIONS;

/** Genesis holder id → Solidity constant → `Recipients` field. */
const CONTRACT_NAMES: Record<string, readonly [constant: string, field: string]> = {
  "public-launch": ["PUBLIC_LAUNCH", "publicLaunch"],
  "community-staking": ["COMMUNITY_STAKING", "communityStaking"],
  "ecosystem-growth": ["ECOSYSTEM_GROWTH", "ecosystemGrowth"],
  "strategic-partnerships": ["STRATEGIC_PARTNERSHIPS", "strategicPartnerships"],
  liquidity: ["LIQUIDITY", "liquidity"],
  founder: ["FOUNDER", "founder"],
  investors: ["INVESTORS", "investors"],
  treasury: ["TREASURY", "treasury"],
  team: ["TEAM", "team"],
  "early-users": ["EARLY_USERS", "earlyUsers"],
  "grants-bug-bounty": ["GRANTS_BUG_BOUNTY", "grantsBugBounty"],
};

function wholeTokens(name: string): number {
  const match = new RegExp(`uint256 internal constant ${name} = ([0-9_]+) \\* UNIT;`).exec(
    allocationSource,
  );
  assert.ok(match?.[1], `constant ${name} not found in ARLAllocation.sol`);
  return Number(match[1].replaceAll("_", ""));
}

const allocationConstants = [
  ...allocationSource.matchAll(/uint256 internal constant ([A-Z_]+) = [0-9_]+ \* UNIT;/g),
]
  .map((m) => m[1])
  .filter((name) => name !== "MAX_SUPPLY");

describe("ARLAllocation.sol", () => {
  it("uses 18 decimals", () => {
    assert.match(allocationSource, /uint256 internal constant UNIT = 1e18;/);
  });

  it("MAX_SUPPLY matches", () => {
    assert.equal(wholeTokens("MAX_SUPPLY"), MAX_SUPPLY);
  });

  it("every genesis holder matches in amount and order, and there are no extra constants", () => {
    assert.deepEqual(
      Object.keys(CONTRACT_NAMES),
      GENESIS.map((a) => a.id),
    );
    assert.deepEqual(
      allocationConstants,
      GENESIS.map((a) => CONTRACT_NAMES[a.id]?.[0]),
    );
    for (const a of GENESIS) {
      const names = CONTRACT_NAMES[a.id];
      assert.ok(names);
      assert.equal(wholeTokens(names[0]), a.amount, a.id);
    }
  });

  it("FOUNDER is 2,100,000 ARL and is not split", () => {
    assert.equal(wholeTokens("FOUNDER"), 2_100_000);
    assert.doesNotMatch(allocationSource, /FOUNDER_(UNRESTRICTED|RESERVED)/);
  });

  it("the constants sum to MAX_SUPPLY", () => {
    const sum = allocationConstants.reduce((s, name) => s + wholeTokens(name ?? ""), 0);
    assert.equal(sum, wholeTokens("MAX_SUPPLY"));
  });

  it("no legacy Ecosystem Reserve constant remains", () => {
    assert.doesNotMatch(allocationSource, /ECOSYSTEM_RESERVE/);
  });
});

describe("ARLToken.sol", () => {
  const struct = /struct Recipients \{([^}]*)\}/.exec(tokenSource)?.[1] ?? "";
  const fields = [...struct.matchAll(/address (\w+);/g)].map((m) => m[1]);
  const mints = [...tokenSource.matchAll(/_mint\(r\.(\w+), ARLAllocation\.(\w+)\);/g)].map((m) => [
    m[1],
    m[2],
  ]);

  it("has exactly one recipient per genesis holder (11), in canonical order", () => {
    assert.equal(fields.length, 11);
    assert.deepEqual(
      fields,
      GENESIS.map((a) => CONTRACT_NAMES[a.id]?.[1]),
    );
  });

  it("mints each genesis holder exactly once, to its own recipient", () => {
    assert.deepEqual(
      mints,
      GENESIS.map((a) => {
        const names = CONTRACT_NAMES[a.id];
        return [names?.[1], names?.[0]];
      }),
    );
  });

  it("calls _mint only in the constructor (no mint path after deployment)", () => {
    assert.equal(GENESIS.length, 11);
    assert.equal((tokenSource.match(/_mint\(/g) ?? []).length, GENESIS.length);
    const constructorBody = /constructor\([^)]*\)[^{]*\{([\s\S]*?)\n {4}\}/.exec(tokenSource)?.[1];
    assert.ok(constructorBody);
    assert.equal((constructorBody.match(/_mint\(/g) ?? []).length, GENESIS.length);
    assert.doesNotMatch(tokenSource, /function\s+\w*mint/i);
  });
});
