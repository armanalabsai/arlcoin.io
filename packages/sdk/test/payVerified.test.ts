import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BASE_MAINNET_VERIFIED,
  ESCROW_SCHEME,
  parseEscrowOffer,
  verifiedDeployment,
} from "../src/index.ts";

const offer = {
  scheme: ESCROW_SCHEME,
  network: "eip155:8453",
  amount: "100000000000000000000",
  payTo: "0x00000000000000000000000000000000000000aa",
  extra: {
    jobs: BASE_MAINNET_VERIFIED.jobs,
    evaluator: BASE_MAINNET_VERIFIED.evaluator,
    specUri: "https://example.com/spec.json",
    specHash: `0x${"1".repeat(64)}`,
    committee: [
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
      "0x0000000000000000000000000000000000000003",
    ],
    threshold: 2,
    voteWindow: "3600",
    challengeWindow: "86400",
    bond: "100000000000000000000",
    expiresIn: "259200",
  },
};

describe("arl-escrow offers", () => {
  it("reads an offer from a 402 body", () => {
    const o = parseEscrowOffer({ x402Version: 2, accepts: [{ scheme: "upto" }, offer] });
    assert.equal(o.budget, 100n * 10n ** 18n);
    assert.equal(o.provider, "0x00000000000000000000000000000000000000AA");
    assert.equal(o.committee.length, 3);
    assert.equal(o.challengeWindow, 86_400n);
  });

  it("refuses a body without an arl-escrow offer or with malformed fields", () => {
    const bad: unknown[] = [
      {},
      { accepts: [{ scheme: "upto" }] },
      { accepts: [{ ...offer, network: "base" }] },
      { accepts: [{ ...offer, amount: "-1" }] },
      { accepts: [{ ...offer, payTo: "0x1234" }] },
      { accepts: [{ ...offer, extra: { ...offer.extra, specHash: "0x12" } }] },
      { accepts: [{ ...offer, extra: { ...offer.extra, committee: "x" } }] },
      { accepts: [{ ...offer, extra: { ...offer.extra, threshold: 1.5 } }] },
    ];
    for (const b of bad)
      assert.throws(() => {
        parseEscrowOffer(b);
      });
  });

  it("knows the Base Mainnet and Base Sepolia deployments, none locally", () => {
    assert.equal(verifiedDeployment(8453)?.jobs, BASE_MAINNET_VERIFIED.jobs);
    assert.ok(verifiedDeployment(84_532));
    assert.equal(verifiedDeployment(31_337), undefined);
  });
});
