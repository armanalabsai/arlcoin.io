import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PlanError, buildPlan, canonicalSafeSingletons } from "../src/plan.ts";
import { configFromSafes, type SafesRecord } from "../src/safes-config.ts";

// Placeholder addresses: keccak256("arl.safes.<n>") last 20 bytes would do; any distinct
// non-zero addresses work because the planner does not read the chain.
const address = (n: number) => `0x${(0x1000 + n).toString(16).padStart(40, "0")}`;
const record = (chainId: number): SafesRecord => ({
  chainId,
  singleton: "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e",
  safes: {
    founder: address(1),
    investors: address(2),
    strategicPartnerships: address(3),
    treasury: address(4),
    guardian: address(5),
    publicLaunch: address(6),
    communityStaking: address(7),
    ecosystemGrowth: address(8),
    liquidity: address(9),
    team: address(10),
    earlyUsers: address(11),
    grantsBugBounty: address(12),
  },
});
const START = "2027-01-01T00:00:00Z";

describe("config from created Safes", () => {
  it("builds a Base Sepolia config the planner accepts, with code checks and canonical Safes", () => {
    const config = configFromSafes(record(84532), START);
    assert.equal(config.network, "base-sepolia");
    assert.equal(config.requireRecipientCode, true);
    assert.equal(config.safe, undefined);
    assert.equal(config.treasury.minDelayHours, 48);
    assert.equal(config.vesting.investors.cliffMonths, 12);
    assert.equal(config.vesting.investors.vestingMonths, 36);
    assert.equal(config.recipients.founder, address(1));
    assert.equal(config.treasury.guardian, address(5));
    const plan = buildPlan(config);
    assert.deepEqual(plan.safe.singletons, canonicalSafeSingletons(84532));
  });

  it("lists the rehearsal's own singleton on local Anvil only", () => {
    const config = configFromSafes(record(31337), START);
    assert.deepEqual(config.safe, { singletons: [record(31337).singleton] });
  });

  it("refuses Base Mainnet and every unsupported chain", () => {
    assert.throws(() => configFromSafes(record(8453), START), /Base Mainnet\) is locked/);
    for (const chainId of [1, 10, 42161, 11155111]) {
      assert.throws(() => configFromSafes(record(chainId), START), PlanError);
    }
  });

  it("refuses a malformed start or a missing or extra Safe", () => {
    assert.throws(() => configFromSafes(record(84532), "2027-01-31T00:00:00Z"), /day of month/);
    assert.throws(() => configFromSafes(record(84532), "2027-01-01"), /vestingStart/);
    const missing = record(84532);
    delete (missing.safes as Partial<SafesRecord["safes"]>).guardian;
    assert.throws(() => configFromSafes(missing, START), /safes: expected exactly/);
    const extra = record(84532);
    (extra.safes as Record<string, string>).bonus = address(13);
    assert.throws(() => configFromSafes(extra, START), /safes: expected exactly/);
  });

  it("the planner still rejects a Safe reused for two roles", () => {
    const reused = record(84532);
    reused.safes.guardian = reused.safes.treasury;
    assert.throws(() => buildPlan(configFromSafes(reused, START)), /guardian: must differ/);
  });
});
