import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";

import {
  ArlUptoFacilitator,
  BASE_SEPOLIA,
  InMemoryAuthorizationStore,
  MAX_AUTHORIZATION_SECONDS,
  PaymentNetworkLocked,
  PaymentNetworkUnsupported,
  assertPinnedCode,
  buildUptoRequirements,
  decideSettlement,
  meter,
  paymentNetwork,
  type Permit2Authorization,
  type UptoScheme,
} from "../src/index.ts";

// Test addresses only; ARL is not deployed.
const ARL = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x2222222222222222222222222222222222222222";
const FACILITATOR = "0x3333333333333333333333333333333333333333";
const PAYER = "0x4444444444444444444444444444444444444444";
const NOW = 1_800_000_000;

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

function requirements(amount = "1000"): PaymentRequirements {
  return {
    ...buildUptoRequirements({
      chainId: 84_532,
      arlToken: ARL,
      maxAmount: 1000n,
      payTo: PAY_TO,
      facilitator: FACILITATOR,
      maxTimeoutSeconds: 300,
    }),
    amount,
  };
}

function payload(a: Permit2Authorization = auth()): PaymentPayload {
  return {
    x402Version: 2,
    accepted: requirements(),
    payload: { signature: "0x", permit2Authorization: a },
  };
}

/** A stand-in for the SDK scheme that records what it was asked to settle. */
class FakeScheme implements UptoScheme {
  settled: string[] = [];
  readonly outcome: "ok" | "fail" | "throw";
  constructor(outcome: "ok" | "fail" | "throw" = "ok") {
    this.outcome = outcome;
  }
  verify() {
    return Promise.resolve({ isValid: true, payer: PAYER });
  }
  settle(_p: PaymentPayload, r: PaymentRequirements): Promise<SettleResponse> {
    if (this.outcome === "throw") return Promise.reject(new Error("rpc down"));
    this.settled.push(r.amount);
    return Promise.resolve(
      this.outcome === "ok"
        ? { success: true, transaction: "0xabc", network: r.network, amount: r.amount }
        : { success: false, errorReason: "reverted", transaction: "", network: r.network },
    );
  }
}

function facilitator(scheme: UptoScheme, store = new InMemoryAuthorizationStore()) {
  return new ArlUptoFacilitator({
    chainId: 84_532,
    arlToken: ARL,
    scheme,
    store,
    nowSeconds: () => NOW,
  });
}

describe("network gate", () => {
  it("allows Base Sepolia only", () => {
    assert.equal(paymentNetwork(84_532).network, "eip155:84532");
  });
  it("refuses Base Mainnet unconditionally", () => {
    assert.throws(() => paymentNetwork(8453), PaymentNetworkLocked);
    assert.throws(
      () =>
        buildUptoRequirements({
          chainId: 8453,
          arlToken: ARL,
          maxAmount: 1n,
          payTo: PAY_TO,
          facilitator: FACILITATOR,
          maxTimeoutSeconds: 60,
        }),
      PaymentNetworkLocked,
    );
  });
  it("refuses every other chain", () => {
    for (const id of [1, 10, 31_337, 11_155_111])
      assert.throws(() => paymentNetwork(id), PaymentNetworkUnsupported);
  });
  it("checks pinned code hashes", async () => {
    const good = (a: string) =>
      Promise.resolve(
        a === BASE_SEPOLIA.permit2 ? BASE_SEPOLIA.permit2Codehash : BASE_SEPOLIA.uptoProxyCodehash,
      );
    await assertPinnedCode(BASE_SEPOLIA, good);
    const zeroHash: `0x${string}` = `0x${"00".repeat(32)}`;
    await assert.rejects(assertPinnedCode(BASE_SEPOLIA, () => Promise.resolve(zeroHash)));
  });
});

describe("requirements", () => {
  it("builds upto requirements in ARL with the facilitator bound", () => {
    const r = requirements();
    assert.equal(r.scheme, "upto");
    assert.equal(r.network, "eip155:84532");
    assert.equal(r.asset, ARL);
    assert.equal(r.amount, "1000");
    assert.deepEqual(r.extra, { facilitatorAddress: FACILITATOR });
  });
  it("rejects bad input", () => {
    const base = {
      chainId: 84_532,
      arlToken: ARL,
      maxAmount: 1n,
      payTo: PAY_TO,
      facilitator: FACILITATOR,
      maxTimeoutSeconds: 60,
    };
    assert.throws(() => buildUptoRequirements({ ...base, maxAmount: 0n }));
    assert.throws(() =>
      buildUptoRequirements({ ...base, maxTimeoutSeconds: MAX_AUTHORIZATION_SECONDS + 1 }),
    );
    assert.throws(() => buildUptoRequirements({ ...base, maxTimeoutSeconds: 5 }));
    assert.throws(() =>
      buildUptoRequirements({ ...base, payTo: "0x0000000000000000000000000000000000000000" }),
    );
    assert.throws(() => buildUptoRequirements({ ...base, arlToken: "not an address" }));
  });
});

describe("metering", () => {
  it("charges usage and caps at the ceiling", () => {
    assert.deepEqual(meter({ unitPrice: 3n, units: 100n, ceiling: 1000n }), {
      amount: 300n,
      capped: false,
    });
    assert.deepEqual(meter({ unitPrice: 3n, units: 1000n, ceiling: 1000n }), {
      amount: 1000n,
      capped: true,
    });
    assert.deepEqual(meter({ unitPrice: 5n, units: 0n, ceiling: 1n }), {
      amount: 0n,
      capped: false,
    });
    assert.throws(() => meter({ unitPrice: -1n, units: 1n, ceiling: 1n }));
    assert.throws(() => meter({ unitPrice: 1n, units: 1n, ceiling: 0n }));
  });
});

describe("settlement policy", () => {
  const decide = (
    a: Permit2Authorization,
    amount: bigint,
    store = new InMemoryAuthorizationStore(),
  ) => decideSettlement({ chainId: 84_532, auth: a, amount, nowSeconds: NOW, store });

  it("settles below and at the ceiling", async () => {
    assert.equal((await decide(auth(), 1n)).action, "settle");
    assert.equal((await decide(auth(), 1000n)).action, "settle");
  });
  it("refuses above the ceiling, expired and over-long authorizations", async () => {
    assert.equal((await decide(auth(), 1001n)).action, "refuse");
    assert.equal((await decide(auth({ deadline: String(NOW) }), 1n)).action, "refuse");
    assert.equal(
      (await decide(auth({ deadline: String(NOW + MAX_AUTHORIZATION_SECONDS + 1) }), 1n)).action,
      "refuse",
    );
  });
  it("retires a zero settlement", async () => {
    assert.equal((await decide(auth(), 0n)).action, "retire");
  });
});

describe("ARL facilitator", () => {
  it("settles once, then refuses a replay", async () => {
    const scheme = new FakeScheme();
    const f = facilitator(scheme);
    assert.equal((await f.settle(payload(), requirements("250"))).success, true);
    const again = await f.settle(payload(), requirements("250"));
    assert.equal(again.success, false);
    assert.match(again.errorReason ?? "", /already settled/);
    assert.deepEqual(scheme.settled, ["250"]);
  });

  it("never sends more than the signed ceiling", async () => {
    const scheme = new FakeScheme();
    const r = await facilitator(scheme).settle(payload(), requirements("1001"));
    assert.equal(r.success, false);
    assert.deepEqual(scheme.settled, []);
  });

  it("retires a zero settlement without sending and never settles it later", async () => {
    const scheme = new FakeScheme();
    const f = facilitator(scheme);
    const zero = await f.settle(payload(), requirements("0"));
    assert.equal(zero.success, true);
    assert.equal(zero.transaction, "");
    const later = await f.settle(payload(), requirements("500"));
    assert.equal(later.success, false);
    assert.match(later.errorReason ?? "", /already retired/);
    assert.deepEqual(scheme.settled, []);
  });

  it("marks a failed or thrown settlement as failed and does not retry it", async () => {
    for (const outcome of ["fail", "throw"] as const) {
      const store = new InMemoryAuthorizationStore();
      const f = facilitator(new FakeScheme(outcome), store);
      if (outcome === "fail")
        assert.equal((await f.settle(payload(), requirements("10"))).success, false);
      else await assert.rejects(f.settle(payload(), requirements("10")));
      const retry = await facilitator(new FakeScheme(), store).settle(
        payload(),
        requirements("10"),
      );
      assert.match(retry.errorReason ?? "", /already failed/);
    }
  });

  it("refuses another asset, network, scheme or spender", async () => {
    const scheme = new FakeScheme();
    const f = facilitator(scheme);
    const other = "0x5555555555555555555555555555555555555555";
    assert.equal(
      (await f.settle(payload(), { ...requirements(), asset: other })).errorReason,
      "arl_asset",
    );
    assert.equal(
      (
        await f.settle(
          payload(auth({ permitted: { token: other, amount: "1000" } })),
          requirements(),
        )
      ).errorReason,
      "arl_asset",
    );
    assert.equal(
      (await f.settle(payload(), { ...requirements(), network: "eip155:8453" })).errorReason,
      "arl_network",
    );
    assert.equal(
      (await f.settle(payload(), { ...requirements(), scheme: "exact" })).errorReason,
      "arl_scheme",
    );
    assert.equal(
      (await f.settle(payload(auth({ spender: other })), requirements())).errorReason,
      "arl_spender",
    );
    assert.equal((await f.verify(payload(), { ...requirements(), asset: other })).isValid, false);
    assert.deepEqual(scheme.settled, []);
  });

  it("claims before sending, so concurrent settlements of one authorization settle once", async () => {
    const scheme = new FakeScheme();
    const f = facilitator(scheme);
    const results = await Promise.allSettled([
      f.settle(payload(), requirements("1")),
      f.settle(payload(), requirements("1")),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
    assert.equal(ok, 1);
    assert.deepEqual(scheme.settled, ["1"]);
  });

  it("refuses to be built for Base Mainnet", () => {
    assert.throws(
      () =>
        new ArlUptoFacilitator({
          chainId: 8453,
          arlToken: ARL,
          scheme: new FakeScheme(),
          store: new InMemoryAuthorizationStore(),
        }),
      PaymentNetworkLocked,
    );
  });
});
