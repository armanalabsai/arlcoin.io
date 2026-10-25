// Conformance of the reference implementation with spec/x402-arl-upto v0.1.0: every vector in
// vectors.json must give the same result here. A change that breaks a vector is a breaking change
// of the spec and needs a new spec version.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  InMemoryAuthorizationStore,
  authorizationKey,
  checkUsageReceipt,
  decideSettlement,
  meter,
  type Permit2Authorization,
} from "../src/index.ts";

interface Vectors {
  chainId: number;
  meter: {
    input: { unitPrice: string; units: string; ceiling: string };
    amount: string;
    capped: boolean;
  }[];
  settlement: {
    authorization: Permit2Authorization;
    amount: string;
    nowSeconds: number;
    previousState: "settled" | null;
    decision: { action: string; key?: string; amount?: string; reason?: string };
  }[];
  receipt: {
    cases: {
      name: string;
      signed: unknown;
      signer: string;
      authorization: Permit2Authorization;
      amount: string;
      responseUtf8: string;
      problems: string[];
    }[];
  };
}

const v = JSON.parse(
  readFileSync(new URL("../../../spec/x402-arl-upto/v0.1.0/vectors.json", import.meta.url), "utf8"),
) as Vectors;

describe("spec x402-arl-upto v0.1.0 vectors", () => {
  it("metering", () => {
    for (const m of v.meter) {
      const r = meter({
        unitPrice: BigInt(m.input.unitPrice),
        units: BigInt(m.input.units),
        ceiling: BigInt(m.input.ceiling),
      });
      assert.equal(r.amount.toString(), m.amount);
      assert.equal(r.capped, m.capped);
    }
  });

  it("settlement decisions", async () => {
    for (const s of v.settlement) {
      const store = new InMemoryAuthorizationStore();
      if (s.previousState) {
        const key = authorizationKey(v.chainId, s.authorization);
        await store.claim(key, "settling");
        await store.finish(key, s.previousState);
      }
      const d = await decideSettlement({
        chainId: v.chainId,
        auth: s.authorization,
        amount: BigInt(s.amount),
        nowSeconds: s.nowSeconds,
        store,
      });
      const got = d.action === "settle" ? { ...d, amount: d.amount.toString() } : d;
      assert.deepEqual(got, s.decision);
    }
  });

  it("usage receipts", async () => {
    for (const c of v.receipt.cases) {
      const problems = await checkUsageReceipt({
        chainId: v.chainId,
        signed: c.signed,
        signer: c.signer,
        auth: c.authorization,
        amount: BigInt(c.amount),
        response: new TextEncoder().encode(c.responseUtf8),
      });
      assert.deepEqual(problems, c.problems, c.name);
    }
  });
});
