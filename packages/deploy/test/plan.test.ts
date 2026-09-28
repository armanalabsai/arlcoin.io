import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ALLOCATIONS, MAX_SUPPLY } from "@arl/tokenomics";

import {
  PLAN_SCHEMA,
  PlanError,
  addCalendarMonths,
  buildPlan,
  canonicalSafeSingletons,
  type DeployConfig,
} from "../src/plan.ts";

const LOCAL = JSON.parse(
  readFileSync(new URL("../../../contracts/deploy/config/local.json", import.meta.url), "utf8"),
) as DeployConfig;

const config = (change: (c: DeployConfig) => void = () => undefined): DeployConfig => {
  const c = structuredClone(LOCAL);
  change(c);
  return c;
};

const rejects = (c: DeployConfig, pattern: RegExp) => {
  assert.throws(
    () => buildPlan(c),
    (e: unknown) => e instanceof PlanError && pattern.test(e.message),
  );
};

const zero = "0x0000000000000000000000000000000000000000";

describe("buildPlan: valid local config", () => {
  const plan = buildPlan(config());

  it("allocations come from tokenomics: 11 entries totalling exactly 21,000,000 ARL", () => {
    const total = Object.values(plan.allocations).reduce((s, v) => s + BigInt(v), 0n);
    assert.equal(total, 21_000_000n * 10n ** 18n);
    assert.equal(plan.maxSupply, (BigInt(MAX_SUPPLY) * 10n ** 18n).toString());
    assert.equal(Object.keys(plan.allocations).length, ALLOCATIONS.length);
    assert.equal(Object.keys(plan.allocations).length, 11);
    assert.equal(plan.allocations.publicLaunch, (5_000_000n * 10n ** 18n).toString());
    assert.equal(plan.allocations.investors, (1_500_000n * 10n ** 18n).toString());
    assert.equal("ecosystemReserve" in plan.allocations, false);
  });

  it("uses schema arl-deploy-plan/5", () => {
    assert.equal(PLAN_SCHEMA, "arl-deploy-plan/5");
    assert.equal(plan.schema, "arl-deploy-plan/5");
  });

  it("lists no Safe singletons for the local placeholder plan", () => {
    assert.deepEqual(plan.safe, { singletons: [] });
  });

  it("mints the whole 2,100,000 ARL founder allocation to one Founder Safe, unsplit", () => {
    assert.equal(plan.allocations.founder, (2_100_000n * 10n ** 18n).toString());
    assert.equal(plan.recipients.founder, LOCAL.recipients.founder);
    assert.equal("founderTranches" in plan, false);
  });

  it("has no founder vesting plan", () => {
    assert.equal("founder" in plan.vesting, false);
    assert.equal("founder" in plan.source, false);
  });

  it("vesting schedules are computed in calendar months from the configured start", () => {
    const investors = plan.vesting.investors;
    assert.equal(plan.source.investors.start, "2027-01-01T00:00:00Z");
    assert.equal(plan.source.investors.cliffEnd, "2028-01-01T00:00:00Z");
    assert.equal(plan.source.investors.vestingEnd, "2031-01-01T00:00:00Z");
    assert.equal(investors.cliffStart, Date.UTC(2027, 0, 1) / 1000);
    assert.equal(investors.cliffEnd, Date.UTC(2028, 0, 1) / 1000);
    assert.equal(investors.vestingEnd, Date.UTC(2031, 0, 1) / 1000);
    assert.deepEqual(Object.keys(plan.vesting), ["investors", "strategicPartnerships"]);
  });

  it("treasury delay is 48 hours in seconds; guardian carried and distinct", () => {
    assert.equal(plan.treasury.minDelay, 172_800);
    assert.equal(plan.treasury.guardian, LOCAL.treasury.guardian);
    assert.notEqual(plan.treasury.guardian.toLowerCase(), plan.treasury.safe.toLowerCase());
  });

  it("names the eight direct recipients, including the Founder Safe", () => {
    assert.deepEqual(Object.keys(plan.recipients), [
      "publicLaunch",
      "communityStaking",
      "ecosystemGrowth",
      "liquidity",
      "founder",
      "team",
      "earlyUsers",
      "grantsBugBounty",
    ]);
  });

  it("is deterministic", () => {
    assert.deepEqual(buildPlan(config()), plan);
  });
});

describe("Safe singletons", () => {
  const SAFE = "0xFf51A5898e281Db6DfC7855790607438dF2ca44b";
  const SAFE_L2 = "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e";

  it("uses the canonical Safe v1.5.0 singletons off local Anvil", () => {
    assert.deepEqual(canonicalSafeSingletons(1), [SAFE, SAFE_L2]);
    assert.deepEqual(canonicalSafeSingletons(11155111), [SAFE, SAFE_L2]);
  });

  it("refuses a chain without a canonical Safe v1.5.0 deployment", () => {
    assert.throws(
      () => canonicalSafeSingletons(31337),
      (e: unknown) =>
        e instanceof PlanError && /no canonical Safe 1\.5\.0 singleton/.test(e.message),
    );
  });

  it("accepts rehearsal singletons on local Anvil only", () => {
    const local = buildPlan(config((c) => (c.safe = { singletons: [SAFE] })));
    assert.deepEqual(local.safe.singletons, [SAFE]);
    rejects(
      config((c) => {
        c.chainId = 11155111;
        c.requireRecipientCode = true;
        c.safe = { singletons: [SAFE] };
      }),
      /safe: may be set only on local chain/,
    );
  });

  it("rejects a malformed local singleton list", () => {
    rejects(
      config((c) => (c.safe = { singletons: ["0x1234"] })),
      /safe\.singletons\[0\]: not an address/,
    );
    rejects(
      config((c) => {
        (c as unknown as { safe: unknown }).safe = { singletons: [], extra: true };
      }),
      /safe\.extra: unexpected key/,
    );
  });
});

describe("addCalendarMonths", () => {
  const d = { year: 2027, month: 11, day: 15, hour: 12, minute: 0, second: 0 };
  it("crosses year boundaries", () => {
    assert.deepEqual(addCalendarMonths(d, 2), { ...d, year: 2028, month: 1 });
    assert.deepEqual(addCalendarMonths(d, 24), { ...d, year: 2029 });
    assert.deepEqual(addCalendarMonths(d, 38), { ...d, year: 2031, month: 1 });
  });
});

describe("buildPlan: fails closed", () => {
  it("rejects a zero recipient, beneficiary, treasury Safe or guardian", () => {
    rejects(
      config((c) => (c.recipients.liquidity = zero)),
      /recipients\.liquidity: zero address/,
    );
    rejects(
      config((c) => (c.vesting.investors.beneficiary = zero)),
      /vesting\.investors\.beneficiary: zero/,
    );
    rejects(
      config((c) => (c.recipients.founder = zero)),
      /recipients\.founder: zero address/,
    );
    rejects(
      config((c) => (c.treasury.safe = zero)),
      /treasury\.safe: zero/,
    );
    rejects(
      config((c) => (c.treasury.guardian = zero)),
      /treasury\.guardian: zero address/,
    );
  });

  it("rejects a guardian equal to the treasury Safe", () => {
    rejects(
      config((c) => (c.treasury.guardian = c.treasury.safe.toLowerCase())),
      /treasury\.guardian: must differ from treasury\.safe/,
    );
  });

  it("rejects an address reused for two roles (every Safe is dedicated)", () => {
    rejects(
      config((c) => (c.recipients.earlyUsers = c.recipients.communityStaking)),
      /recipients\.earlyUsers: same address as recipients\.communityStaking/,
    );
    rejects(
      config((c) => (c.recipients.founder = c.vesting.investors.beneficiary)),
      /recipients\.founder: same address as vesting\.investors\.beneficiary/,
    );
    rejects(
      config((c) => (c.recipients.founder = c.treasury.safe)),
      /recipients\.founder: same address as treasury\.safe/,
    );
  });

  it("rejects a config that still splits the founder allocation", () => {
    rejects(
      config((c) => {
        const r = c.recipients as unknown as Record<string, unknown>;
        r.founderUnrestricted = c.recipients.founder;
        delete r.founder;
      }),
      /recipients/,
    );
  });

  it("rejects an old config that still has vesting.founder", () => {
    rejects(
      config((c) => {
        (c.vesting as Record<string, unknown>).founder = {
          beneficiary: "0x1F67caa874DDec60E290e27cce758f01Bd53c380",
          start: "2027-01-01T00:00:00Z",
          cliffMonths: 12,
          vestingMonths: 24,
        };
      }),
      /vesting\.founder: the Founder allocation does not vest/,
    );
  });

  it("rejects legacy and unknown keys, and missing sections", () => {
    rejects(
      config((c) => {
        (c as unknown as Record<string, unknown>).ecosystemReserveBeneficiary = LOCAL.treasury.safe;
      }),
      /config\.ecosystemReserveBeneficiary: unexpected key/,
    );
    rejects(
      config((c) => {
        (c.recipients as Record<string, string>).earlyUserRewards = LOCAL.treasury.safe;
      }),
      /recipients\.earlyUserRewards: unexpected key/,
    );
    rejects(
      config((c) => {
        delete (c.recipients as Partial<DeployConfig["recipients"]>).earlyUsers;
      }),
      /recipients\.earlyUsers: missing/,
    );
    rejects(
      config((c) => {
        delete (c.vesting as Partial<DeployConfig["vesting"]>).investors;
      }),
      /vesting\.investors: missing/,
    );
  });

  it("rejects a malformed address", () => {
    rejects(
      config((c) => (c.recipients.team = "0x1234")),
      /recipients\.team: not an address/,
    );
  });

  it("rejects a timelock delay below 48 hours", () => {
    rejects(
      config((c) => (c.treasury.minDelayHours = 47)),
      /below the 48-hour minimum/,
    );
    rejects(
      config((c) => (c.treasury.minDelayHours = 48.5)),
      /below the 48-hour minimum/,
    );
  });

  it("rejects missing or invalid chain configuration", () => {
    rejects(
      config((c) => (c.chainId = 0)),
      /chainId/,
    );
    rejects(
      config((c) => (c.network = "")),
      /network/,
    );
  });

  it("requires recipient code checks on every non-local chain", () => {
    rejects(
      config((c) => (c.chainId = 11155111)),
      /requireRecipientCode/,
    );
  });

  it("refuses any non-local chain while the vesting start is TBD", () => {
    rejects(
      config((c) => {
        c.chainId = 11155111;
        c.requireRecipientCode = true;
      }),
      /vesting\.investors: the vesting start is not confirmed \(TBD\)/,
    );
  });

  it("rejects durations other than the approved 12-month cliff and 36 months linear", () => {
    rejects(
      config((c) => (c.vesting.investors.cliffMonths = 6)),
      /vesting\.investors\.cliffMonths: must be 12 \(approved schedule\)/,
    );
    rejects(
      config((c) => (c.vesting.strategicPartnerships.vestingMonths = 24)),
      /vesting\.strategicPartnerships\.vestingMonths: must be 36 \(approved schedule\)/,
    );
  });

  it("rejects invalid schedule parameters and dates", () => {
    rejects(
      config((c) => (c.vesting.investors.vestingMonths = 0)),
      /vestingMonths: must be a positive integer/,
    );
    rejects(
      config((c) => (c.vesting.investors.cliffMonths = -1)),
      /cliffMonths: must be a non-negative integer/,
    );
    rejects(
      config((c) => (c.vesting.investors.start = "2027-01-01")),
      /YYYY-MM-DDTHH:MM:SSZ/,
    );
    rejects(
      config((c) => (c.vesting.investors.start = "2027-02-30T00:00:00Z")),
      /not a real calendar date/,
    );
    rejects(
      config((c) => (c.vesting.strategicPartnerships.start = "2027-01-31T00:00:00Z")),
      /day of month must be 1-28/,
    );
  });
});
