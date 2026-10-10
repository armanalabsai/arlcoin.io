import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEMO_FACILITATOR,
  DEMO_SERVICE,
  meter,
  nonceBitmap,
  uptoRequirements,
} from "../../lib/payments.ts";

const ARL = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const base = {
  chainId: 31_337,
  arl: ARL,
  ceiling: 5n,
  payTo: DEMO_SERVICE,
  facilitator: DEMO_FACILITATOR,
  windowSeconds: 300,
} as const;

describe("upto requirements", () => {
  it("binds asset, ceiling, payee and facilitator", () => {
    const r = uptoRequirements(base);
    assert.equal(r.scheme, "upto");
    assert.equal(r.network, "eip155:31337");
    assert.equal(r.asset, ARL);
    assert.equal(r.amount, "5");
    assert.equal(r.payTo, DEMO_SERVICE);
    assert.deepEqual(r.extra, { facilitatorAddress: DEMO_FACILITATOR });
  });
  it("refuses other chains, a zero ceiling and long windows", () => {
    for (const chainId of [8453, 1, 11_155_111])
      assert.throws(() => uptoRequirements({ ...base, chainId }));
    assert.equal(uptoRequirements({ ...base, chainId: 84_532 }).network, "eip155:84532");
    assert.throws(() => uptoRequirements({ ...base, ceiling: 0n }));
    assert.throws(() => uptoRequirements({ ...base, windowSeconds: 601 }));
    assert.throws(() => uptoRequirements({ ...base, windowSeconds: 10 }));
    assert.throws(() => uptoRequirements({ ...base, payTo: "0x1234" }));
  });
});

describe("metering", () => {
  it("charges usage and caps at the ceiling", () => {
    assert.deepEqual(meter(3n, 100n, 1000n), { amount: 300n, capped: false });
    assert.deepEqual(meter(3n, 1000n, 1000n), { amount: 1000n, capped: true });
    assert.deepEqual(meter(3n, 0n, 1000n), { amount: 0n, capped: false });
    assert.throws(() => meter(-1n, 1n, 1n));
  });
});

describe("Permit2 nonce bitmap", () => {
  it("splits a nonce into word and bit", () => {
    assert.deepEqual(nonceBitmap(0n), { wordPos: 0n, mask: 1n });
    assert.deepEqual(nonceBitmap(257n), { wordPos: 1n, mask: 2n });
    assert.deepEqual(nonceBitmap((5n << 8n) | 255n), { wordPos: 5n, mask: 1n << 255n });
  });
});
