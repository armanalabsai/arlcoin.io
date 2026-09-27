import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ALLOCATIONS, MAX_SUPPLY } from "@arl/tokenomics";

import {
  PLAN_SCHEMA,
  PlanError,
  addCalendarMonths,
  buildPlan,
  founderReserveGate,
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

  it("uses schema arl-deploy-plan/3", () => {
    assert.equal(PLAN_SCHEMA, "arl-deploy-plan/3");
    assert.equal(plan.schema, "arl-deploy-plan/3");
  });

  it("splits the founder allocation into 2,000,000 unrestricted and 100,000 reserved", () => {
    const unit = 10n ** 18n;
    assert.equal(plan.allocations.founder, (2_100_000n * unit).toString());
    assert.deepEqual(plan.founderTranches, {
      unrestricted: (2_000_000n * unit).toString(),
      reserved: (100_000n * unit).toString(),
    });
    assert.equal(
      BigInt(plan.founderTranches.unrestricted) + BigInt(plan.founderTranches.reserved),
      BigInt(plan.allocations.founder),
    );
  });

  it("has no founder vesting plan", () => {
    assert.equal("founder" in plan.vesting, false);
    assert.equal("founder" in plan.source, false);
  });

  it("vesting schedules are computed in calendar months from the configured start", () => {
    const investors = plan.vesting.investors;
    assert.equal(plan.source.investors.start, "2027-01-01T00:00:00Z");
    assert.equal(plan.source.investors.cliffEnd, "2028-01-01T00:00:00Z");
    assert.equal(plan.source.investors.vestingEnd, "2030-01-01T00:00:00Z");
    assert.equal(investors.cliffStart, Date.UTC(2027, 0, 1) / 1000);
    assert.equal(investors.cliffEnd, Date.UTC(2028, 0, 1) / 1000);
    assert.equal(investors.vestingEnd, Date.UTC(2030, 0, 1) / 1000);
    assert.deepEqual(Object.keys(plan.vesting), ["investors", "strategicPartnerships"]);
  });

  it("treasury delay is 48 hours in seconds; guardian carried and distinct", () => {
    assert.equal(plan.treasury.minDelay, 172_800);
    assert.equal(plan.treasury.guardian, LOCAL.treasury.guardian);
    assert.notEqual(plan.treasury.guardian.toLowerCase(), plan.treasury.safe.toLowerCase());
  });

  it("names the nine direct recipients, including both founder tranches", () => {
    assert.deepEqual(Object.keys(plan.recipients), [
      "publicLaunch",
      "communityStaking",
      "ecosystemGrowth",
      "liquidity",
      "founderUnrestricted",
      "founderReserved",
      "team",
      "earlyUsers",
      "grantsBugBounty",
    ]);
  });

  it("is deterministic", () => {
    assert.deepEqual(buildPlan(config()), plan);
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
      config((c) => (c.recipients.founderUnrestricted = zero)),
      /recipients\.founderUnrestricted: zero address/,
    );
    rejects(
      config((c) => (c.recipients.founderReserved = zero)),
      /recipients\.founderReserved: zero address/,
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
      config((c) => (c.recipients.founderUnrestricted = c.vesting.investors.beneficiary)),
      /recipients\.founderUnrestricted: same address as vesting\.investors\.beneficiary/,
    );
  });

  it("rejects a founder reserved address shared with the unrestricted tranche or any role", () => {
    rejects(
      config((c) => (c.recipients.founderReserved = c.recipients.founderUnrestricted)),
      /recipients\.founderReserved: same address as recipients\.founderUnrestricted/,
    );
    rejects(
      config((c) => (c.recipients.founderReserved = c.treasury.safe)),
      /recipients\.founderReserved: same address as treasury\.safe/,
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

  it("refuses any non-local chain while vesting schedules are TBD", () => {
    rejects(
      config((c) => {
        c.chainId = 11155111;
        c.requireRecipientCode = true;
      }),
      /vesting\.investors: the schedule is not approved \(TBD\)/,
    );
  });

  it("refuses any non-local chain while the founder reserved custody is TBD", () => {
    assert.throws(
      () => {
        founderReserveGate(false, false);
      },
      (e: unknown) =>
        e instanceof PlanError &&
        /recipients\.founderReserved: custody is not approved \(TBD\)/.test(e.message),
    );
    // Local Anvil may rehearse with the custody still TBD; an approved custody opens the gate.
    founderReserveGate(true, false);
    founderReserveGate(false, true);
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
