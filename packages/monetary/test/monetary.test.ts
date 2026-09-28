import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ERC20_UNITS_PER_MOTE,
  MAX_MONEY,
  MonetaryError,
  SUPPLY_FLOOR,
  U64_MAX,
  applyBurn,
  burnEpochTimestamp,
  checkedAdd,
  checkedSub,
  checkedSum,
  decodeAmount,
  encodeAmount,
  erc20UnitsToMotes,
  formatArl,
  formatMotes,
  motesToErc20Units,
  mulDivFloor,
  parseArl,
  parseMotes,
  splitEvenly,
  toU64Money,
} from "../src/index.ts";

// Test vectors are the worked examples of economic specification section 17.

const rejects = (fn: () => unknown) => {
  assert.throws(fn, MonetaryError);
};

describe("units (17.1, 17.3)", () => {
  it("MAX_MONEY and SUPPLY_FLOOR", () => {
    assert.equal(MAX_MONEY, 2_100_000_000_000_000n);
    assert.equal(SUPPLY_FLOOR, 1_000_000_000_000_000n);
    assert.equal(ERC20_UNITS_PER_MOTE, 10_000_000_000n);
  });

  it("MAX_MONEY needs 51 bits and fits u64 with more than 8,000x headroom", () => {
    assert.equal(MAX_MONEY.toString(2).length, 51);
    assert.ok(U64_MAX / MAX_MONEY > 8_000n);
  });
});

describe("conversion equations (17.2)", () => {
  const table: [label: string, motes: bigint, units: bigint][] = [
    ["1 ARL", 100_000_000n, 1_000_000_000_000_000_000n],
    ["2.5 ARL", 250_000_000n, 2_500_000_000_000_000_000n],
    ["1 mote", 1n, 10_000_000_000n],
    ["21,000,000 ARL", 2_100_000_000_000_000n, 21_000_000_000_000_000_000_000_000n],
    ["10,000,000 ARL", 1_000_000_000_000_000n, 10_000_000_000_000_000_000_000_000n],
  ];
  for (const [label, motes, units] of table) {
    it(`${label}: exact in both directions`, () => {
      assert.equal(motesToErc20Units(motes), units);
      assert.deepEqual(erc20UnitsToMotes(units), { motes, remainder: 0n });
    });
  }

  it("rounds ERC-20 units down to motes and returns the remainder", () => {
    const units = 12_345_678_901_234_567_890n;
    const { motes, remainder } = erc20UnitsToMotes(units);
    assert.equal(motes, 1_234_567_890n);
    assert.equal(remainder, 1_234_567_890n);
    assert.equal(motes * ERC20_UNITS_PER_MOTE + remainder, units);
  });

  it("rejects negative or oversized ERC-20 amounts", () => {
    rejects(() => erc20UnitsToMotes(-1n));
    rejects(() => erc20UnitsToMotes(2n ** 128n));
    rejects(() => motesToErc20Units(MAX_MONEY + 1n));
  });
});

describe("checked arithmetic (17.3)", () => {
  it("adds and subtracts within range", () => {
    assert.equal(checkedAdd(1n, 2n), 3n);
    assert.equal(checkedAdd(MAX_MONEY - 1n, 1n), MAX_MONEY);
    assert.equal(checkedSub(5n, 5n), 0n);
  });

  it("fails closed on overflow, underflow and out-of-range operands", () => {
    rejects(() => checkedAdd(MAX_MONEY, 1n));
    rejects(() => checkedSub(1n, 2n));
    rejects(() => checkedAdd(-1n, 1n));
  });

  it("checks every partial sum", () => {
    assert.equal(checkedSum([1n, 2n, 3n]), 6n);
    rejects(() => checkedSum([MAX_MONEY, 1n, 0n]));
  });

  it("converts u128 intermediates back to u64 amounts with a check", () => {
    assert.equal(toU64Money(MAX_MONEY), MAX_MONEY);
    rejects(() => toU64Money(U64_MAX + 1n));
    rejects(() => toU64Money(MAX_MONEY + 1n));
  });

  it("mulDivFloor rounds down, keeps the remainder and refuses division by zero", () => {
    assert.deepEqual(mulDivFloor(100n, 1n, 3n), { quotient: 33n, remainder: 1n });
    assert.deepEqual(mulDivFloor(MAX_MONEY, 3n, 7n).quotient, (MAX_MONEY * 3n) / 7n);
    rejects(() => mulDivFloor(1n, 1n, 0n));
  });
});

describe("rounding (17.6)", () => {
  it("100 motes split among 3 is 33 each, remainder 1, and nothing is lost", () => {
    const { share, remainder } = splitEvenly(100n, 3n);
    assert.equal(share, 33n);
    assert.equal(remainder, 1n);
    assert.equal(share * 3n + remainder, 100n);
  });
});

describe("RPC strings (17.5)", () => {
  it("formats motes and ARL exactly", () => {
    assert.equal(formatMotes(250_000_000n), "250000000");
    assert.equal(formatArl(250_000_000n), "2.50000000");
    assert.equal(formatArl(1n), "0.00000001");
    assert.equal(formatArl(MAX_MONEY), "21000000.00000000");
  });

  it("parses valid strings", () => {
    assert.equal(parseMotes("250000000"), 250_000_000n);
    assert.equal(parseMotes("0"), 0n);
    assert.equal(parseArl("2.5"), 250_000_000n);
    assert.equal(parseArl("2.50000000"), 250_000_000n);
    assert.equal(parseArl("0.00000001"), 1n);
    assert.equal(parseArl("21000000"), MAX_MONEY);
  });

  it("rejects signs, exponents, whitespace, grouping, extra precision and overflow", () => {
    for (const bad of ["-1", "+1", "1e8", " 1", "1 ", "1,000", "01", "", "0x10", "1.5"]) {
      rejects(() => parseMotes(bad));
    }
    for (const bad of [
      "-1",
      "1e8",
      "1.",
      ".5",
      "1,000.0",
      "0.123456789",
      "01.0",
      "21000000.00000001",
    ]) {
      rejects(() => parseArl(bad));
    }
  });
});

describe("serialization (17.4)", () => {
  it("250,000,000 motes is 80 B2 E6 0E 00 00 00 00", () => {
    assert.deepEqual(
      [...encodeAmount(250_000_000n)],
      [0x80, 0xb2, 0xe6, 0x0e, 0x00, 0x00, 0x00, 0x00],
    );
    assert.equal(decodeAmount(Uint8Array.from([0x80, 0xb2, 0xe6, 0x0e, 0, 0, 0, 0])), 250_000_000n);
  });

  it("round-trips the full range boundaries", () => {
    for (const v of [0n, 1n, MAX_MONEY]) assert.equal(decodeAmount(encodeAmount(v)), v);
  });

  it("rejects a wrong length and values above MAX_MONEY", () => {
    rejects(() => decodeAmount(new Uint8Array(7)));
    rejects(() => decodeAmount(new Uint8Array(9)));
    rejects(() => decodeAmount(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])));
    rejects(() => encodeAmount(MAX_MONEY + 1n));
  });
});

describe("10,000,000 ARL supply floor (17.8)", () => {
  it("accepts a burn that ends exactly at the floor", () => {
    assert.equal(applyBurn(MAX_MONEY, MAX_MONEY - SUPPLY_FLOOR), SUPPLY_FLOOR);
  });

  it("rejects a burn that would cross the floor; it is never clamped", () => {
    rejects(() => applyBurn(MAX_MONEY, MAX_MONEY - SUPPLY_FLOOR + 1n));
    rejects(() => applyBurn(SUPPLY_FLOOR, 1n));
    rejects(() => applyBurn(1n, 2n));
  });
});

describe("burn epoch (17.9)", () => {
  it("T(2027) = 1811818800", () => {
    assert.equal(burnEpochTimestamp(2027), 1_811_818_800n);
  });

  it("matches June 1, 03:00:00 UTC for every year 1970-2400", () => {
    for (let y = 1970; y <= 2400; y++) {
      assert.equal(burnEpochTimestamp(y), BigInt(Date.UTC(y, 5, 1, 3, 0, 0) / 1000), String(y));
    }
  });

  it("rejects invalid years", () => {
    rejects(() => burnEpochTimestamp(1969));
    rejects(() => burnEpochTimestamp(2027.5));
  });
});
