import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { keccak256, stringToHex } from "viem";

import { ArlWalletApi } from "../src/credentials/ArlWalletApi.credentials.ts";
import {
  ArlJobError,
  ESCROWS,
  checkAddress,
  openArlTask,
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
      checkAddress(" 0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC ", "x"),
      "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC",
    );
    assert.throws(() => checkAddress("0x1234", "the provider"), /the provider/);
  });

  it("points at the Base Mainnet escrows", () => {
    assert.equal(ESCROWS.ARL, "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC");
    assert.equal(ESCROWS.USDC, "0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04");
  });
});

describe("open task", () => {
  // Every input is checked before the RPC is touched: this client throws if it is used.
  const offline = new Proxy(
    {},
    {
      get() {
        throw new Error("the RPC was used");
      },
    },
  );
  const c = { publicClient: offline, walletClient: offline } as never;
  const task = { spec: "arl-task/1", payment: { token: "ARL", budget: "1" } };
  const base = {
    task: JSON.stringify(task),
    taskUri: "https://example.com/task.json",
    provider: "0x2222222222222222222222222222222222222222",
    committee: "0x3333333333333333333333333333333333333333",
  };

  it("refuses bad input before sending anything", async () => {
    for (const [bad, why] of [
      [{ task: "{not json" }, /not valid JSON/],
      [{ task: JSON.stringify({ ...task, payment: { token: "DAI" } }) }, /ARL" or "USDC/],
      [{ taskUri: "http://example.com/task.json" }, /https/],
      [{ committee: "0x1234" }, /committee member 1/],
      [{ provider: "nobody" }, /the provider/],
    ] as const) {
      await assert.rejects(openArlTask(c, { ...base, ...bad }), why);
    }
  });

  it("accepts the task as an object too", async () => {
    await assert.rejects(openArlTask(c, { ...base, task }), /the RPC was used/);
  });
});

describe("node description", () => {
  const node = new Arl();
  const ops = node.description.properties.find((p) => p.name === "operation")?.options ?? [];
  const values = new Set(ops.map((o) => o.value));

  it("offers the job lifecycle", () => {
    assert.deepEqual(
      [...values],
      [
        "create",
        "openTask",
        "setBudget",
        "fund",
        "submit",
        "complete",
        "reject",
        "claimRefund",
        "get",
      ],
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
