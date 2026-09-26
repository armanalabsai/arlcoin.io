import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ALLOCATIONS, MAX_SUPPLY } from "@arl/tokenomics";

import { PlanError, addCalendarMonths, buildPlan, type DeployConfig } from "../src/plan.ts";

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

describe("buildPlan: valid local config", () => {
  const plan = buildPlan(config());

  it("allocations come from tokenomics and total exactly 21,000,000 ARL", () => {
    const total = Object.values(plan.allocations).reduce((s, v) => s + BigInt(v), 0n);
    assert.equal(total, 21_000_000n * 10n ** 18n);
    assert.equal(plan.maxSupply, (BigInt(MAX_SUPPLY) * 10n ** 18n).toString());
    assert.equal(Object.keys(plan.allocations).length, ALLOCATIONS.length);
    assert.equal(plan.allocations.founder, (2_100_000n * 10n ** 18n).toString());
    assert.equal(plan.allocations.team, (500_000n * 10n ** 18n).toString());
  });

  it("founder: 24 calendar months of cliff, then 36 calendar months", () => {
    assert.equal(plan.source.launchDate, "2027-01-01T00:00:00Z");
    assert.equal(plan.source.founderCliff, "2029-01-01T00:00:00Z");
    assert.equal(plan.source.founderVestingEnd, "2032-01-01T00:00:00Z");
    assert.equal(plan.founder.cliffStart, Date.UTC(2027, 0, 1) / 1000);
    assert.equal(plan.founder.cliffEnd, Date.UTC(2029, 0, 1) / 1000);
    assert.equal(plan.founder.vestingEnd, Date.UTC(2032, 0, 1) / 1000);
  });

  it("the cliff is not 24 x 30 days", () => {
    assert.notEqual(plan.founder.cliffEnd - plan.founder.cliffStart, 24 * 30 * 86_400);
  });

  it("ecosystem reserve starts at launch; duration is set by the contract constant", () => {
    assert.equal(plan.ecosystemReserve.start, plan.founder.cliffStart);
    assert.equal("end" in plan.ecosystemReserve, false);
  });

  it("treasury delay is 48 hours in seconds", () => {
    assert.equal(plan.treasury.minDelay, 172_800);
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
  it("rejects a zero recipient", () => {
    rejects(
      config((c) => {
        c.recipients.liquidity = "0x0000000000000000000000000000000000000000";
      }),
      /recipients\.liquidity: zero address/,
    );
  });

  it("rejects a zero founder beneficiary, reserve beneficiary or treasury Safe", () => {
    const zero = "0x0000000000000000000000000000000000000000";
    rejects(
      config((c) => (c.founderBeneficiary = zero)),
      /founderBeneficiary: zero/,
    );
    rejects(
      config((c) => (c.ecosystemReserveBeneficiary = zero)),
      /ecosystemReserveBeneficiary/,
    );
    rejects(
      config((c) => (c.treasury.safe = zero)),
      /treasury\.safe: zero/,
    );
  });

  it("rejects a malformed or missing address", () => {
    rejects(
      config((c) => (c.recipients.team = "0x1234")),
      /recipients\.team: not an address/,
    );
    rejects(
      config((c) => {
        delete (c.recipients as Partial<DeployConfig["recipients"]>).earlyUserRewards;
      }),
      /recipients\.earlyUserRewards: not an address/,
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
      config((c) => {
        delete (c as Partial<DeployConfig>).chainId;
      }),
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

  it("rejects dates that are malformed, unreal, non-UTC or ambiguous", () => {
    rejects(
      config((c) => (c.launchDate = "2027-01-01")),
      /YYYY-MM-DDTHH:MM:SSZ/,
    );
    rejects(
      config((c) => (c.launchDate = "2027-01-01T00:00:00+02:00")),
      /YYYY-MM-DDTHH:MM:SSZ/,
    );
    rejects(
      config((c) => (c.launchDate = "2027-02-30T00:00:00Z")),
      /not a real calendar date/,
    );
    rejects(
      config((c) => (c.launchDate = "2027-01-31T00:00:00Z")),
      /day of month must be 1-28/,
    );
    rejects(
      config((c) => (c.launchDate = "2027-01-01T24:00:00Z")),
      /not a real calendar date/,
    );
  });
});
