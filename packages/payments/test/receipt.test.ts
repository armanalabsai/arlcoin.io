import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  ArlUptoFacilitator,
  BASE_SEPOLIA,
  InMemoryAuthorizationStore,
  ReceiptError,
  buildUptoRequirements,
  buildUsageReceipt,
  checkUsageReceipt,
  receiptFromJson,
  receiptSignerOf,
  receiptToJson,
  resourceHash,
  signUsageReceipt,
  type Permit2Authorization,
  type SignedUsageReceipt,
  type UptoScheme,
} from "../src/index.ts";

// Test addresses and Foundry test keys only.
const ARL = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x2222222222222222222222222222222222222222";
const FACILITATOR = "0x3333333333333333333333333333333333333333";
const PAYER = "0x4444444444444444444444444444444444444444";
const NOW = 1_800_000_000;
const signer = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412cacc3dc8a9b8a7",
);
const other = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);
const RESPONSE = Buffer.from("the output");

function auth(overrides: Partial<Permit2Authorization> = {}): Permit2Authorization {
  return {
    from: PAYER,
    spender: BASE_SEPOLIA.uptoProxy,
    nonce: "42",
    deadline: String(NOW + 300),
    permitted: { token: ARL, amount: "1000" },
    witness: { to: PAY_TO, facilitator: FACILITATOR, validAfter: "0" },
    ...overrides,
  };
}

const receipt = (units = 7n, unitPrice = 100n) =>
  buildUsageReceipt({
    auth: auth(),
    resource: "echo?seconds=10",
    units,
    unitPrice,
    response: RESPONSE,
  });

const signed = (r = receipt(), by = signer) => signUsageReceipt(by, 84_532, r);

const check = async (
  s: unknown,
  overrides: {
    amount?: bigint;
    signer?: string;
    auth?: Permit2Authorization;
    response?: Uint8Array;
  } = {},
) =>
  checkUsageReceipt({
    chainId: 84_532,
    signed: s,
    signer: overrides.signer ?? signer.address,
    auth: overrides.auth ?? auth(),
    amount: overrides.amount ?? 700n,
    ...(overrides.response ? { response: overrides.response } : {}),
  });

describe("usage receipt", () => {
  it("states the authorization, the usage and the response", () => {
    const r = receipt();
    assert.equal(r.payer, PAYER);
    assert.equal(r.payTo, PAY_TO);
    assert.equal(r.token, ARL);
    assert.equal(r.nonce, 42n);
    assert.equal(r.ceiling, 1000n);
    assert.equal(r.deadline, BigInt(NOW + 300));
    assert.equal(r.resource, resourceHash("echo?seconds=10"));
    assert.equal(r.resource, keccak256(stringToBytes("echo?seconds=10")));
    assert.equal(r.amount, 700n);
    assert.equal(r.response, keccak256(RESPONSE));
  });

  it("caps the amount at the ceiling", () => {
    assert.equal(receipt(50n, 100n).amount, 1000n);
  });

  it("round-trips through JSON", () => {
    assert.deepEqual(receiptFromJson(receiptToJson(receipt())), receipt());
  });

  it("recovers its signer", async () => {
    assert.equal(await receiptSignerOf(84_532, await signed()), signer.address);
  });

  it("is bound to the chain", async () => {
    const s = await signed();
    assert.notEqual(await receiptSignerOf(1, s), signer.address);
  });

  it("checks out against the authorization, the amount and the response", async () => {
    assert.deepEqual(await check(await signed(), { response: RESPONSE }), []);
  });

  it("refuses another signer, amount, response or authorization", async () => {
    const s = await signed();
    assert.match((await check(await signed(receipt(), other))).join(), /not signed by/);
    assert.match((await check(s, { amount: 701n })).join(), /amount differs/);
    assert.match((await check(s, { response: Buffer.from("other") })).join(), /does not cover/);
    const problems = await check(s, {
      auth: auth({
        from: FACILITATOR,
        nonce: "43",
        deadline: "1",
        permitted: { token: PAY_TO, amount: "999" },
        witness: { to: ARL, facilitator: FACILITATOR, validAfter: "0" },
      }),
    });
    for (const what of ["payer", "payee", "token", "nonce", "ceiling", "deadline"]) {
      assert.ok(
        problems.some((p) => p.includes(what)),
        what,
      );
    }
  });

  it("refuses an amount that is not units × price", async () => {
    const r = { ...receipt(), amount: 600n };
    assert.match((await check(await signed(r), { amount: 600n })).join(), /min\(units/);
  });

  it("refuses an edited receipt (the signature no longer matches)", async () => {
    const s = await signed();
    const edited: SignedUsageReceipt = {
      ...s,
      receipt: { ...s.receipt, units: "6", amount: "600" },
    };
    assert.match((await check(edited, { amount: 600n })).join(), /not signed by/);
  });

  it("refuses malformed receipts", async () => {
    const s = await signed();
    assert.deepEqual(await check(undefined), ["no signed receipt"]);
    assert.deepEqual(await check({ receipt: s.receipt }), ["no signed receipt"]);
    assert.equal((await check({ ...s, signature: "0x12" })).length, 1);
    assert.equal((await check({ ...s, signature: "zz" })).length, 1);
    for (const bad of [
      { ...s.receipt, extra: "1" },
      { ...s.receipt, payer: "0x12" },
      { ...s.receipt, units: "-1" },
      { ...s.receipt, units: "01" },
      { ...s.receipt, units: (2n ** 256n).toString() },
      { ...s.receipt, response: "0x12" },
    ]) {
      assert.equal((await check({ ...s, receipt: bad })).length, 1);
    }
    assert.throws(() => receiptFromJson(null), ReceiptError);
  });
});

class FakeScheme implements UptoScheme {
  settled: string[] = [];
  verify() {
    return Promise.resolve({ isValid: true, payer: PAYER });
  }
  settle(_p: PaymentPayload, r: PaymentRequirements): Promise<SettleResponse> {
    this.settled.push(r.amount);
    return Promise.resolve({
      success: true,
      transaction: "0xabc",
      network: r.network,
      amount: r.amount,
    });
  }
}

describe("facilitator with a receipt signer", () => {
  const base = buildUptoRequirements({
    chainId: 84_532,
    arlToken: ARL,
    maxAmount: 1000n,
    payTo: PAY_TO,
    facilitator: FACILITATOR,
    maxTimeoutSeconds: 300,
  });
  const payload = (): PaymentPayload => ({
    x402Version: 2,
    accepted: base,
    payload: { signature: "0x", permit2Authorization: auth() },
  });
  const facilitator = (scheme: FakeScheme, signers: Record<string, string>) =>
    new ArlUptoFacilitator({
      chainId: 84_532,
      arlToken: ARL,
      scheme,
      store: new InMemoryAuthorizationStore(),
      nowSeconds: () => NOW,
      receiptSigners: signers,
    });

  it("settles exactly the amount a valid receipt states", async () => {
    const scheme = new FakeScheme();
    const r = { ...base, amount: "700", extra: { ...base.extra, usageReceipt: await signed() } };
    const out = await facilitator(scheme, { [PAY_TO]: signer.address }).settle(payload(), r);
    assert.equal(out.success, true);
    assert.deepEqual(scheme.settled, ["700"]);
  });

  it("refuses without a receipt, with a different amount, or from another signer", async () => {
    const scheme = new FakeScheme();
    const f = facilitator(scheme, { [PAY_TO]: signer.address });
    const none = await f.settle(payload(), { ...base, amount: "700" });
    assert.equal(none.success, false);
    assert.match(none.errorReason ?? "", /^arl_receipt: no signed receipt/);

    const more = await f.settle(payload(), {
      ...base,
      amount: "800",
      extra: { ...base.extra, usageReceipt: await signed() },
    });
    assert.match(more.errorReason ?? "", /amount differs/);

    const forged = await f.settle(payload(), {
      ...base,
      amount: "700",
      extra: { ...base.extra, usageReceipt: await signed(receipt(), other) },
    });
    assert.match(forged.errorReason ?? "", /not signed by/);
    assert.deepEqual(scheme.settled, []);
  });

  it("needs no receipt for a payee without a signer", async () => {
    const scheme = new FakeScheme();
    const out = await facilitator(scheme, { [ARL]: signer.address }).settle(payload(), {
      ...base,
      amount: "700",
    });
    assert.equal(out.success, true);
  });
});
