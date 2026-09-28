import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isEmail, isEvmAddress, toChecksumAddress } from "../../src/content/forms.ts";

// Test vectors from EIP-55 (https://eips.ethereum.org/EIPS/eip-55).
const EIP55 = [
  "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
  "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
  "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
];

describe("EVM address", () => {
  it("computes the EIP-55 checksum", () => {
    for (const a of EIP55) assert.equal(toChecksumAddress(a.toLowerCase()), a);
  });

  it("accepts checksummed, all-lowercase and all-uppercase addresses", () => {
    for (const a of EIP55) {
      assert.ok(isEvmAddress(a), a);
      assert.ok(isEvmAddress(a.toLowerCase()));
      assert.ok(isEvmAddress("0x" + a.slice(2).toUpperCase()));
    }
  });

  it("rejects a mixed-case address with a wrong checksum", () => {
    const broken = EIP55[0]!.replace("aAeb", "AAeb");
    assert.equal(isEvmAddress(broken), false);
  });

  it("rejects malformed input and the zero address", () => {
    for (const bad of [
      "",
      "0x",
      "5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe",
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAedd",
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeg",
      " 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      "0x0000000000000000000000000000000000000000",
      "vitalik.eth",
    ]) {
      assert.equal(isEvmAddress(bad), false, JSON.stringify(bad));
    }
  });
});

describe("email", () => {
  it("accepts ordinary addresses", () => {
    for (const e of ["a@b.io", "first.last+tag@example.co.uk"]) assert.ok(isEmail(e), e);
  });

  it("rejects malformed addresses", () => {
    for (const e of ["", "a@b", "a b@c.io", "@c.io", "a@.io", "a@b.c"]) {
      assert.equal(isEmail(e), false, e);
    }
  });
});
