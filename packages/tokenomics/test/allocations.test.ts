import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as tokenomics from "../src/index.ts";
import {
  ALLOCATIONS,
  MAX_SUPPLY,
  PUBLIC_LAUNCH,
  TGE_DATE,
  formatBasisPoints,
  shareOfSupply,
  validateAllocations,
  type Allocation,
} from "../src/index.ts";

// The approved 11-allocation table (2026-09-27), restated independently so a
// silent edit to the source data fails this test.
const APPROVED: readonly (readonly [id: string, name: string, amount: number, share: string])[] = [
  ["public-launch", "Public Launch", 5_000_000, "23.81%"],
  ["community-staking", "Community & Staking", 3_000_000, "14.29%"],
  ["ecosystem-growth", "Ecosystem & Growth", 2_000_000, "9.52%"],
  ["strategic-partnerships", "Strategic Partnerships", 2_000_000, "9.52%"],
  ["liquidity", "Liquidity", 2_000_000, "9.52%"],
  ["founder", "Founder", 2_100_000, "10.00%"],
  ["investors", "Investors / Strategic Capital", 1_500_000, "7.14%"],
  ["treasury", "Treasury", 1_000_000, "4.76%"],
  ["team", "Team", 900_000, "4.29%"],
  ["early-users", "Early Users", 1_100_000, "5.24%"],
  ["grants-bug-bounty", "Grants / Bug Bounty", 400_000, "1.90%"],
];

const byId = (id: string): Allocation => {
  const a = ALLOCATIONS.find((x) => x.id === id);
  assert.ok(a, `missing allocation ${id}`);
  return a;
};

const amountOf = (id: string) => byId(id).amount;

describe("supply and allocation invariants", () => {
  it("TEST-01 allocations sum to exactly 21,000,000 ARL", () => {
    assert.equal(
      ALLOCATIONS.reduce((sum, a) => sum + a.amount, 0),
      21_000_000,
    );
  });

  it("TEST-02 the canonical total supply is 21,000,000 ARL", () => {
    assert.equal(MAX_SUPPLY, 21_000_000);
  });

  it("TEST-03 exactly 11 canonical allocations exist", () => {
    assert.equal(ALLOCATIONS.length, 11);
  });

  it("TEST-04 allocation ids and names are unique", () => {
    assert.equal(new Set(ALLOCATIONS.map((a) => a.id)).size, ALLOCATIONS.length);
    assert.equal(new Set(ALLOCATIONS.map((a) => a.name)).size, ALLOCATIONS.length);
  });

  it("TEST-05 no allocation has a negative or zero amount", () => {
    for (const a of ALLOCATIONS) assert.ok(a.amount > 0, a.id);
  });

  it("TEST-06 every amount is an integer-safe whole number of ARL", () => {
    for (const a of ALLOCATIONS) assert.ok(Number.isSafeInteger(a.amount), a.id);
  });

  it("TEST-07 percentages are derived from the amounts", () => {
    const shares = shareOfSupply(ALLOCATIONS, MAX_SUPPLY);
    for (const [id, , , share] of APPROVED) {
      const s = shares.find((x) => x.id === id);
      assert.ok(s, id);
      assert.equal(formatBasisPoints(s.basisPoints), share, id);
      const exact = (amountOf(id) * 10_000) / MAX_SUPPLY;
      assert.ok(Math.abs(s.basisPoints - exact) <= 0.5, `${id}: ${s.basisPoints} vs ${exact}`);
    }
    assert.deepEqual(shareOfSupply(ALLOCATIONS, MAX_SUPPLY), shares, "deterministic");
  });

  it("TEST-08 the model has no hidden or unlisted allocation", () => {
    assert.deepEqual(
      ALLOCATIONS.map((a) => [a.id, a.name, a.amount]),
      APPROVED.map(([id, name, amount]) => [id, name, amount]),
    );
    assert.equal(
      ALLOCATIONS.find((a) => /reserve/i.test(a.id) || /ecosystem reserve/i.test(a.name)),
      undefined,
      "the legacy Ecosystem Reserve must not exist",
    );
  });

  it("the table passes validation", () => {
    assert.deepEqual(validateAllocations(ALLOCATIONS, MAX_SUPPLY), []);
  });
});

describe("canonical amounts", () => {
  const cases: [string, string, number][] = [
    ["TEST-09", "public-launch", 5_000_000],
    ["TEST-10", "community-staking", 3_000_000],
    ["TEST-11", "ecosystem-growth", 2_000_000],
    ["TEST-12", "strategic-partnerships", 2_000_000],
    ["TEST-13", "liquidity", 2_000_000],
    ["TEST-14", "founder", 2_100_000],
    ["TEST-15", "investors", 1_500_000],
    ["TEST-16", "treasury", 1_000_000],
    ["TEST-17", "team", 900_000],
    ["TEST-18", "early-users", 1_100_000],
    ["TEST-19", "grants-bug-bounty", 400_000],
  ];
  for (const [label, id, amount] of cases) {
    it(`${label} ${id} = ${amount.toLocaleString("en-US")} ARL`, () => {
      assert.equal(amountOf(id), amount);
    });
  }
});

describe("supply concepts", () => {
  it("TEST-20 and TEST-21: no circulating supply is defined or hard-coded", () => {
    // Circulating supply is computed from on-chain state after deployment. The
    // model must not carry a value: not the total supply, not 7,000,000
    // (Public Launch + Liquidity), not anything.
    assert.equal("CIRCULATING_SUPPLY" in tokenomics, false);
    assert.equal("circulatingSupply" in tokenomics, false);
    assert.doesNotMatch(JSON.stringify(ALLOCATIONS), /circulat/i);
    assert.equal(amountOf("public-launch") + amountOf("liquidity"), 7_000_000);
  });

  it("TEST-22 no allocation describes new issuance", () => {
    for (const a of ALLOCATIONS) {
      const text = JSON.stringify(a);
      assert.doesNotMatch(text, /\bmint(ed|ing)? new\b|inflation|emission schedule is/i, a.id);
    }
    assert.match(byId("community-staking").release.kind, /program/);
    assert.match(JSON.stringify(byId("community-staking")), /never issues new ARL/);
  });
});

describe("custody and vesting readiness", () => {
  const vestingWallet = { holder: "vesting-wallet", beneficiary: "dedicated-safe" };

  it("investors and strategic partnerships vest 12 + 36 months to dedicated Safes from the TGE", () => {
    for (const id of ["investors", "strategic-partnerships"]) {
      const a = byId(id);
      assert.deepEqual(a.custody, vestingWallet, id);
      assert.ok(a.release.kind === "vesting", id);
      assert.deepEqual(
        a.release.schedule,
        { cliffMonths: 12, linearMonths: 36, start: "approved" },
        id,
      );
      assert.equal(a.release.status, "approved", id);
    }
    assert.match(JSON.stringify(byId("strategic-partnerships")), /milestone/);
  });

  it("only investors and strategic partnerships vest; the Founder allocation does not", () => {
    const vesting = ALLOCATIONS.filter(
      (a) => a.release.kind === "vesting" || a.custody.holder === "vesting-wallet",
    ).map((a) => a.id);
    assert.deepEqual(vesting, ["strategic-partnerships", "investors"]);
  });

  it("the whole 2,100,000 ARL founder allocation is unlocked at TGE in a dedicated Safe", () => {
    const founder = byId("founder");
    assert.equal(founder.amount, 2_100_000);
    assert.equal(founder.release.kind, "unrestricted");
    assert.equal(founder.release.status, "approved");
    assert.deepEqual(founder.custody, { holder: "safe" });
    assert.doesNotMatch(JSON.stringify(founder), /tranche|reserved|month|schedule/i);
  });

  it("team grants follow the approved 12 + 36 month schedule per grant", () => {
    const r = byId("team").release;
    assert.ok(r.kind === "program");
    assert.match(r.description, /12-month cliff, then 36 months linear/);
  });

  it("rejects a vesting schedule that is not a whole number of months", () => {
    const release: Allocation["release"] = {
      kind: "vesting",
      schedule: { cliffMonths: 1.5, linearMonths: 0, start: "tbd" },
      status: "approved",
    };
    const table = (structuredClone(ALLOCATIONS) as Allocation[]).map((a) =>
      a.id === "investors" ? { ...a, release } : a,
    );
    const errors = validateAllocations(table, MAX_SUPPLY).join("\n");
    assert.match(errors, /investors: vesting cliff must be a whole number of months/);
    assert.match(errors, /investors: linear vesting must be a positive whole number of months/);
  });

  it("team is a dedicated pool Safe funding per-member grants", () => {
    assert.deepEqual(byId("team").custody, {
      holder: "grant-pool",
      grantBeneficiary: "recipient-safe",
    });
    assert.equal(byId("team").release.status, "undecided");
  });

  it("treasury is a timelock under a Safe 3-of-5 with at least 48 hours", () => {
    const r = byId("treasury").release;
    assert.deepEqual(byId("treasury").custody, { holder: "timelock" });
    assert.ok(r.kind === "custody");
    assert.deepEqual(r.controls, { wallet: "Safe", threshold: 2, signers: 3, minDelayHours: 48 });
  });

  it("the other allocations sit in dedicated Safes", () => {
    for (const id of [
      "public-launch",
      "community-staking",
      "ecosystem-growth",
      "liquidity",
      "early-users",
      "grants-bug-bounty",
    ]) {
      assert.deepEqual(byId(id).custody, { holder: "safe" }, id);
    }
  });

  it("no signer or Safe address is stored", () => {
    assert.doesNotMatch(JSON.stringify(ALLOCATIONS), /0x[0-9a-fA-F]{40}/);
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
    assert.throws(() => {
      (byId("founder").custody as { holder: string }).holder = "tbd";
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
  const errorsOf = (table: Allocation[]) => validateAllocations(table, MAX_SUPPLY).join("\n");

  it("rejects a missing allocation", () => {
    assert.match(errorsOf(clone().filter((a) => a.id !== "grants-bug-bounty")), /total 20600000/);
  });

  it("rejects a total above the cap", () => {
    assert.match(errorsOf(patch(clone(), 0, { amount: 5_000_001 })), /total 21000001/);
  });

  it("rejects duplicate ids and names", () => {
    assert.match(errorsOf(patch(clone(), 1, { id: "public-launch" })), /duplicate allocation id/);
    assert.match(
      errorsOf(patch(clone(), 1, { name: "Public Launch" })),
      /duplicate allocation name/,
    );
  });

  it("rejects non-integer and non-positive amounts", () => {
    for (const amount of [0, -1, 1.5, Number.NaN]) {
      assert.ok(errorsOf(patch(clone(), 0, { amount })).length > 0, String(amount));
    }
  });

  it("rejects the legacy 7,000,000 Ecosystem Reserve as an extra allocation", () => {
    const legacy = { ...structuredClone(byId("liquidity")), id: "ecosystem-reserve" };
    assert.match(
      errorsOf([...clone(), { ...legacy, name: "Ecosystem Reserve", amount: 7_000_000 }]),
      /total 28000000/,
    );
  });

  it("rejects a weak treasury multisig or a short timelock", () => {
    const weaken = (controls: object) =>
      clone().map((a) =>
        a.release.kind === "custody" && a.release.controls
          ? { ...a, release: { ...a.release, controls: { ...a.release.controls, ...controls } } }
          : a,
      );
    assert.match(errorsOf(weaken({ threshold: 1 })), /not a valid/);
    assert.match(errorsOf(weaken({ threshold: 6 })), /not a valid/);
    assert.match(errorsOf(weaken({ minDelayHours: 24 })), /below/);
  });

  it("rejects an allocation without custody", () => {
    const table = clone().map((a) =>
      a.id === "liquidity" ? ({ ...a, custody: undefined } as unknown as Allocation) : a,
    );
    assert.match(errorsOf(table), /liquidity: custody is not defined/);
  });

  it("rejects custody that contradicts the release rule", () => {
    const inSafe = clone().map((a) =>
      a.id === "investors" ? { ...a, custody: { holder: "safe" as const } } : a,
    );
    assert.match(errorsOf(inSafe), /needs a vesting wallet/);
    const noVesting = clone().map((a) =>
      a.id === "liquidity"
        ? {
            ...a,
            custody: { holder: "vesting-wallet" as const, beneficiary: "dedicated-safe" as const },
          }
        : a,
    );
    assert.match(errorsOf(noVesting), /needs a vesting release/);
  });

  describe("founder", () => {
    const withFounder = (change: Partial<Allocation>) =>
      clone().map((a) => (a.id === "founder" ? { ...a, ...change } : a));

    it("rejects vesting for the Founder allocation", () => {
      const table = withFounder({
        release: {
          kind: "vesting",
          schedule: { cliffMonths: 12, linearMonths: 36, start: "tbd" },
          status: "approved",
        },
        custody: { holder: "vesting-wallet", beneficiary: "dedicated-safe" },
      });
      assert.match(errorsOf(table), /founder: the Founder allocation does not vest/);
    });

    it("rejects an unrestricted release that is not in a dedicated Safe", () => {
      const table = withFounder({
        custody: { holder: "grant-pool", grantBeneficiary: "recipient-safe" },
      });
      assert.match(errorsOf(table), /founder: an unrestricted release needs a dedicated Safe/);
    });
  });
});

describe("approved launch parameters (owner decision 2026-10-05)", () => {
  it("fixes the TGE date and the Public Launch tranche, cap and window", () => {
    assert.equal(TGE_DATE, "2026-11-01T00:00:00Z");
    assert.deepEqual(PUBLIC_LAUNCH, {
      tgeTranche: 500_000,
      maxPerAddress: 10_000,
      claimWindowDays: 60,
    });
    assert.ok(PUBLIC_LAUNCH.tgeTranche <= byId("public-launch").amount);
    assert.equal(byId("public-launch").release.status, "approved");
  });
});
