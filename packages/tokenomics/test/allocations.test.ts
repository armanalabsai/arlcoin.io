import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALLOCATIONS,
  MAX_SUPPLY,
  formatBasisPoints,
  shareOfSupply,
  validateAllocations,
  type Allocation,
} from "../src/index.ts";

// The approved table, restated independently so a silent edit to the source
// data fails this test.
const APPROVED: Record<string, number> = {
  founder: 2_100_000,
  "ecosystem-reserve": 7_000_000,
  treasury: 3_000_000,
  "community-staking": 3_000_000,
  liquidity: 2_000_000,
  "strategic-partnerships": 1_500_000,
  "public-launch": 1_000_000,
  "grants-bug-bounty": 400_000,
  team: 500_000,
  "early-user-rewards": 500_000,
};

const byId = (id: string): Allocation => {
  const a = ALLOCATIONS.find((x) => x.id === id);
  assert.ok(a, `missing allocation ${id}`);
  return a;
};

describe("supply", () => {
  it("max supply is 21,000,000 ARL", () => {
    assert.equal(MAX_SUPPLY, 21_000_000);
  });

  it("allocations sum to exactly the max supply", () => {
    const total = ALLOCATIONS.reduce((sum, a) => sum + a.amount, 0);
    assert.equal(total, 21_000_000);
  });

  it("the table passes validation", () => {
    assert.deepEqual(validateAllocations(ALLOCATIONS, MAX_SUPPLY), []);
  });

  it("matches the approved allocation table exactly", () => {
    assert.deepEqual(
      Object.fromEntries(ALLOCATIONS.map((a) => [a.id, a.amount])),
      APPROVED,
    );
  });

  it("every amount is a positive safe integer", () => {
    for (const a of ALLOCATIONS) {
      assert.ok(Number.isSafeInteger(a.amount) && a.amount > 0, a.id);
    }
  });
});

describe("shares", () => {
  const shares = shareOfSupply(ALLOCATIONS, MAX_SUPPLY);

  it("basis points add up to exactly 100.00%", () => {
    assert.equal(
      shares.reduce((sum, s) => sum + s.basisPoints, 0),
      10_000,
    );
  });

  it("each share is within one basis point of the exact value", () => {
    for (const s of shares) {
      const exact = (byId(s.id).amount / MAX_SUPPLY) * 10_000;
      assert.ok(Math.abs(s.basisPoints - exact) < 1, `${s.id}: ${s.basisPoints} vs ${exact}`);
    }
  });

  it("founder is exactly 10.00%", () => {
    const founder = shares.find((s) => s.id === "founder");
    assert.equal(founder && formatBasisPoints(founder.basisPoints), "10.00%");
  });

  it("is deterministic", () => {
    assert.deepEqual(shareOfSupply(ALLOCATIONS, MAX_SUPPLY), shares);
  });
});

describe("release rules", () => {
  it("founder: 24-month cliff, then 36-month linear vesting (approved)", () => {
    assert.deepEqual(byId("founder").release, {
      kind: "cliff-linear",
      cliffMonths: 24,
      vestingMonths: 36,
      status: "approved",
    });
  });

  it("ecosystem reserve: at most 1,400,000 per year for 5 years", () => {
    const r = byId("ecosystem-reserve").release;
    assert.equal(r.kind, "annual-cap");
    if (r.kind !== "annual-cap") return;
    assert.equal(r.maxPerYear, 1_400_000);
    assert.equal(r.years, 5);
    assert.equal(r.maxPerYear * r.years, 7_000_000);
  });

  it("team is separate from founder and its vesting is only a proposal", () => {
    const team = byId("team");
    assert.notEqual(team.id, byId("founder").id);
    assert.equal(team.amount, 500_000);
    assert.equal(team.release.kind, "cliff-linear");
    assert.equal(team.release.status, "proposal");
  });

  it("early user rewards: initial program up to 100,000 over 6 months", () => {
    const r = byId("early-user-rewards").release;
    assert.equal(r.kind, "program");
    if (r.kind !== "program") return;
    assert.equal(r.initialProgram?.maxAmount, 100_000);
    assert.equal(r.initialProgram?.durationMonths, 6);
  });
});

describe("immutability", () => {
  it("the table cannot be modified at runtime", () => {
    assert.throws(() => {
      (ALLOCATIONS as Allocation[]).push(byId("founder"));
    }, TypeError);
    assert.throws(() => {
      (byId("founder") as { amount: number }).amount = 21_000_000;
    }, TypeError);
  });
});

describe("validator rejects invalid tables", () => {
  const clone = (): Allocation[] => structuredClone(ALLOCATIONS) as Allocation[];
  const patch = (table: Allocation[], index: number, change: Partial<Allocation>) => {
    const current = table[index];
    assert.ok(current);
    table[index] = { ...current, ...change };
    return table;
  };

  it("rejects a total below the cap (the former 20M table)", () => {
    const table = clone().filter((a) => a.id !== "team" && a.id !== "early-user-rewards");
    assert.match(validateAllocations(table, MAX_SUPPLY).join("\n"), /total 20000000/);
  });

  it("rejects a total above the cap", () => {
    const table = patch(clone(), 0, { amount: 2_100_001 });
    assert.match(validateAllocations(table, MAX_SUPPLY).join("\n"), /total 21000001/);
  });

  it("rejects duplicate ids", () => {
    const table = patch(clone(), 1, { id: "founder" });
    assert.match(validateAllocations(table, MAX_SUPPLY).join("\n"), /duplicate/);
  });

  it("rejects non-integer and non-positive amounts", () => {
    for (const amount of [0, -1, 1.5, Number.NaN]) {
      const table = patch(clone(), 0, { amount });
      assert.ok(validateAllocations(table, MAX_SUPPLY).length > 0, String(amount));
    }
  });

  it("rejects an annual cap that does not cover the allocation", () => {
    const table = clone().map((a) =>
      a.release.kind === "annual-cap"
        ? { ...a, release: { ...a.release, maxPerYear: 1_500_000 } }
        : a,
    );
    assert.match(validateAllocations(table, MAX_SUPPLY).join("\n"), /expected 7000000/);
  });

  it("rejects an initial program larger than its allocation", () => {
    const table = clone().map((a) =>
      a.release.kind === "program" && a.release.initialProgram
        ? {
            ...a,
            release: {
              ...a.release,
              initialProgram: { ...a.release.initialProgram, maxAmount: 600_000 },
            },
          }
        : a,
    );
    assert.match(validateAllocations(table, MAX_SUPPLY).join("\n"), /exceeds allocation/);
  });
});
