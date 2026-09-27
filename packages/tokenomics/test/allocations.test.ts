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
    assert.deepEqual(Object.fromEntries(ALLOCATIONS.map((a) => [a.id, a.amount])), APPROVED);
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
    assert.equal(r.maxPerYear, 1_400_000);
    assert.equal(r.years, 5);
    assert.equal(r.maxPerYear * r.years, 7_000_000);
  });

  it("team: separate from founder, 12-month cliff then 36-month linear (approved)", () => {
    const team = byId("team");
    assert.notEqual(team.id, byId("founder").id);
    assert.equal(team.amount, 500_000);
    assert.deepEqual(team.release, {
      kind: "cliff-linear",
      cliffMonths: 12,
      vestingMonths: 36,
      status: "approved",
    });
  });

  it("treasury: Safe 3-of-5 with at least a 48-hour delay, no signer addresses", () => {
    const r = byId("treasury").release;
    assert.equal(r.kind, "custody");
    assert.deepEqual(r.controls, { wallet: "Safe", threshold: 3, signers: 5, minDelayHours: 48 });
    assert.doesNotMatch(JSON.stringify(ALLOCATIONS), /0x[0-9a-fA-F]{40}/);
  });

  it("early user rewards: initial program up to 100,000 over 6 months", () => {
    const r = byId("early-user-rewards").release;
    assert.equal(r.kind, "program");
    const initial = r.initialProgram;
    assert.ok(initial);
    assert.equal(initial.maxAmount, 100_000);
    assert.equal(initial.durationMonths, 6);
  });
});

describe("custody (M-2, decided 2026-09-27)", () => {
  const vestingWallet = { holder: "vesting-wallet", beneficiary: "dedicated-safe" };

  it("every allocation or part has a defined custody", () => {
    for (const a of ALLOCATIONS) {
      assert.ok(a.custody || a.parts, `${a.id} has no custody`);
      for (const part of a.parts ?? []) assert.ok(part.custody, `${a.id}/${part.id}`);
    }
  });

  it("community / staking: 60 months linear from deployment, no cliff, dedicated Safe", () => {
    const a = byId("community-staking");
    assert.equal(a.amount, 3_000_000);
    assert.deepEqual(a.custody, vestingWallet);
    const r = a.release;
    assert.equal(r.kind, "linear");
    assert.equal(r.vestingMonths, 60);
    assert.equal(r.start, "deployment");
    assert.equal(r.status, "approved");
  });

  it("strategic partnerships: 36 months linear from deployment, no cliff, dedicated Safe", () => {
    const a = byId("strategic-partnerships");
    assert.equal(a.amount, 1_500_000);
    assert.deepEqual(a.custody, vestingWallet);
    const r = a.release;
    assert.equal(r.kind, "linear");
    assert.equal(r.vestingMonths, 36);
    assert.equal(r.start, "deployment");
    assert.equal(r.status, "approved");
    assert.match(r.note ?? "", /limited to the amount that has vested/);
  });

  it("liquidity, public launch and grants: held in a Safe with no vesting", () => {
    for (const id of ["liquidity", "public-launch", "grants-bug-bounty"]) {
      const a = byId(id);
      assert.deepEqual(a.custody, { holder: "safe" }, id);
      assert.ok(a.release.kind === "custody" || a.release.kind === "program", id);
    }
    // Launch terms remain a separate, open decision.
    assert.equal(byId("public-launch").release.status, "undecided");
  });

  it("team: a dedicated pool Safe funds per-member grants; no pool-level schedule", () => {
    const a = byId("team");
    assert.deepEqual(a.custody, { holder: "grant-pool", grantBeneficiary: "recipient-safe" });
    assert.equal(a.release.kind, "cliff-linear");
    assert.doesNotMatch(a.purpose, /locked/);
  });

  it("early user rewards: 100,000 in a Safe, 400,000 vesting 36 months after the program", () => {
    const a = byId("early-user-rewards");
    assert.equal(a.custody, undefined);
    const parts = a.parts ?? [];
    assert.deepEqual(
      parts.map((p) => [p.id, p.amount]),
      [
        ["initial-program", 100_000],
        ["vesting", 400_000],
      ],
    );
    const [initial, vesting] = parts;
    assert.ok(initial && vesting);
    assert.deepEqual(initial.custody, { holder: "safe" });
    assert.deepEqual(vesting.custody, vestingWallet);
    assert.deepEqual(vesting.release, {
      kind: "linear",
      vestingMonths: 36,
      start: "initial-program-end",
      status: "approved",
    });
    const r = a.release;
    assert.ok(r.kind === "program" && r.initialProgram);
    assert.equal(r.initialProgram.maxAmount, initial.amount);
  });

  it("founder and ecosystem reserve vest to dedicated Safes; treasury sits in the timelock", () => {
    assert.deepEqual(byId("founder").custody, vestingWallet);
    assert.deepEqual(byId("ecosystem-reserve").custody, vestingWallet);
    assert.deepEqual(byId("treasury").custody, { holder: "timelock" });
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

  it("rejects a weak treasury multisig or a short timelock", () => {
    const weaken = (controls: object) =>
      clone().map((a) =>
        a.release.kind === "custody" && a.release.controls
          ? { ...a, release: { ...a.release, controls: { ...a.release.controls, ...controls } } }
          : a,
      );
    assert.match(
      validateAllocations(weaken({ threshold: 1 }), MAX_SUPPLY).join("\n"),
      /not a valid/,
    );
    assert.match(
      validateAllocations(weaken({ threshold: 6 }), MAX_SUPPLY).join("\n"),
      /not a valid/,
    );
    assert.match(
      validateAllocations(weaken({ minDelayHours: 24 }), MAX_SUPPLY).join("\n"),
      /below/,
    );
  });

  it("rejects parts that do not add up to the allocation", () => {
    const table = clone().map((a) =>
      a.parts
        ? { ...a, parts: a.parts.map((p) => (p.id === "vesting" ? { ...p, amount: 399_999 } : p)) }
        : a,
    );
    assert.match(validateAllocations(table, MAX_SUPPLY).join("\n"), /parts total 499999/);
  });

  it("rejects an allocation without custody", () => {
    const table = clone().map((a) => {
      if (a.id !== "liquidity") return a;
      const rest: Allocation = { ...a };
      delete (rest as { custody?: unknown }).custody;
      return rest;
    });
    assert.match(validateAllocations(table, MAX_SUPPLY).join("\n"), /liquidity: custody/);
  });

  it("rejects custody that contradicts the release rule", () => {
    const inSafe = clone().map((a) =>
      a.id === "community-staking" ? { ...a, custody: { holder: "safe" as const } } : a,
    );
    assert.match(validateAllocations(inSafe, MAX_SUPPLY).join("\n"), /needs a vesting wallet/);
    const noSchedule = clone().map((a) =>
      a.id === "liquidity"
        ? {
            ...a,
            custody: { holder: "vesting-wallet" as const, beneficiary: "dedicated-safe" as const },
          }
        : a,
    );
    assert.match(
      validateAllocations(noSchedule, MAX_SUPPLY).join("\n"),
      /needs a vesting schedule/,
    );
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
