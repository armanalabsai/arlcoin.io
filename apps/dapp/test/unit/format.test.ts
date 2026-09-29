import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkAmount,
  formatArl,
  parseArl,
  percent,
  rewardPerDay,
  timeLeft,
  vestingPhase,
} from "../../lib/format.ts";

const ARL = 10n ** 18n;

describe("formatArl", () => {
  it("groups thousands and trims decimals", () => {
    assert.equal(formatArl(21_000_000n * ARL), "21,000,000");
    assert.equal(formatArl(1_234_567n * ARL + ARL / 2n), "1,234,567.5");
    assert.equal(formatArl(123_456_789_012_345_678n), "0.1234");
    assert.equal(formatArl(123_456_789_012_345_678n, 8), "0.12345678");
    assert.equal(formatArl(0n), "0");
    assert.equal(formatArl(1n), "0");
  });
});

describe("parseArl", () => {
  it("parses whole, fractional and grouped input", () => {
    assert.deepEqual(parseArl("1"), { ok: true, value: ARL });
    assert.deepEqual(parseArl("1,000.25"), { ok: true, value: 1000n * ARL + ARL / 4n });
    assert.deepEqual(parseArl(".5"), { ok: true, value: ARL / 2n });
    assert.deepEqual(parseArl("0.000000000000000001"), { ok: true, value: 1n });
  });
  it("rejects bad input", () => {
    for (const bad of [
      "",
      "abc",
      "-1",
      "0",
      "0.0",
      ".",
      "1e18",
      "1.2.3",
      "0.0000000000000000001",
    ]) {
      assert.equal(parseArl(bad).ok, false, bad);
    }
  });
  it("checks against the available balance", () => {
    assert.equal(checkAmount("2", 2n * ARL).ok, true);
    assert.deepEqual(checkAmount("2.1", 2n * ARL), { ok: false, error: "More than available" });
  });
});

describe("schedule and reward math", () => {
  it("vesting phases", () => {
    assert.equal(vestingPhase(99n, 100n, 200n), "cliff");
    assert.equal(vestingPhase(100n, 100n, 200n), "vesting");
    assert.equal(vestingPhase(200n, 100n, 200n), "complete");
  });
  it("percent", () => {
    assert.equal(percent(1n, 3n), "33.3");
    assert.equal(percent(5n, 5n), "100.0");
    assert.equal(percent(1n, 0n), "0");
  });
  it("reward per day follows the staker's share", () => {
    assert.equal(rewardPerDay(10n, 25n, 100n), 216_000n);
    assert.equal(rewardPerDay(10n, 25n, 0n), 0n);
  });
  it("time left", () => {
    assert.equal(timeLeft(0n, 90_061n), "1d 1h");
    assert.equal(timeLeft(0n, 3_720n), "1h 2m");
    assert.equal(timeLeft(0n, 125n), "2m 5s");
    assert.equal(timeLeft(10n, 10n), "ended");
  });
});
