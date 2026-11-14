import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keccak256, stringToHex } from "viem";

import { ArlWalletApi } from "../src/credentials/ArlWalletApi.credentials.ts";
import {
  ArlJobError,
  ESCROWS,
  checkAddress,
  parseAmount,
  parseJobId,
  toBytes32,
} from "../src/jobs.ts";
import { Arl } from "../src/nodes/Arl/Arl.node.ts";

describe("inputs", () => {
  it("hashes text and keeps a 32-byte hash", () => {
    assert.equal(toBytes32("report.pdf"), keccak256(stringToHex("report.pdf")));
    const h = `0x${"ab".repeat(32)}`;
    assert.equal(toBytes32(h), h);
    assert.throws(() => toBytes32("  "), ArlJobError);
  });

  it("reads amounts in token units", () => {
    assert.equal(parseAmount("10", 18), 10n * 10n ** 18n);
    assert.equal(parseAmount("2.5", 6), 2_500_000n);
    for (const bad of ["0", "-1", "1e3", "abc", ""]) assert.throws(() => parseAmount(bad, 18));
  });

  it("reads job ids", () => {
    assert.equal(parseJobId("7"), 7n);
    assert.equal(parseJobId(12), 12n);
    for (const bad of ["0", "-3", "1.5", "x", ""]) assert.throws(() => parseJobId(bad));
  });

  it("checks addresses", () => {
    assert.equal(
      checkAddress(" 0x4664d58faffb6ab1cf36717c70058a323e2a98f9 ", "x"),
      "0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9",
    );
    assert.throws(() => checkAddress("0x1234", "the provider"), /the provider/);
  });

  it("points at the Base Mainnet escrows", () => {
    assert.equal(ESCROWS.ARL, "0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9");
    assert.equal(ESCROWS.USDC, "0xc833140D2eE8607fd41662cffFAc557f3D535bE6");
  });
});

describe("node description", () => {
  const node = new Arl();
  const ops = node.description.properties.find((p) => p.name === "operation")?.options ?? [];
  const values = new Set(ops.map((o) => o.value));

  it("offers the job lifecycle", () => {
    assert.deepEqual(
      [...values],
      ["create", "setBudget", "fund", "submit", "complete", "reject", "claimRefund", "get"],
    );
    for (const o of ops) assert.ok(o.action && o.description, o.value);
  });

  it("shows every field only for operations that exist", () => {
    for (const p of node.description.properties) {
      for (const op of p.displayOptions?.show.operation ?? []) assert.ok(values.has(op), op);
    }
  });

  it("uses the wallet credential, which hides the key", () => {
    assert.deepEqual(node.description.credentials, [{ name: "arlWalletApi", required: true }]);
    const cred = new ArlWalletApi();
    assert.equal(cred.name, "arlWalletApi");
    const key = cred.properties.find((p) => p.name === "privateKey");
    assert.equal(key?.typeOptions?.password, true);
    assert.equal(
      cred.properties.find((p) => p.name === "rpcUrl")?.default,
      "https://mainnet.base.org",
    );
  });
});
