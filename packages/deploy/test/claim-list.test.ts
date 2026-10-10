import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { Hex } from "viem";

import { CLAIM_LIST_SCHEMA, buildClaimList, type DistributorState } from "../src/claim-list.ts";
import { DistributionError, type Distribution } from "../src/distribution.ts";

const DISTRIBUTION = JSON.parse(
  readFileSync(
    new URL("../../../contracts/test/fixtures/distribution.json", import.meta.url),
    "utf8",
  ),
) as Distribution;
const ARL = "0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97";
const DISTRIBUTOR = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
const OTHER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const state = (change: Partial<DistributorState> = {}): DistributorState => ({
  chainId: 84532,
  code: "0x6080",
  token: ARL,
  merkleRoot: DISTRIBUTION.merkleRoot as Hex,
  claimEnd: 2_000n,
  balance: BigInt(DISTRIBUTION.total),
  now: 1_000n,
  ...change,
});

const rejects = (s: DistributorState, pattern: RegExp, d: Distribution = DISTRIBUTION) => {
  assert.throws(
    () => buildClaimList(d, DISTRIBUTOR, ARL, s),
    (e: unknown) => e instanceof DistributionError && pattern.test(e.message),
  );
};

describe("claim list", () => {
  it("is built from a distribution the deployed distributor honours", () => {
    const list = buildClaimList(DISTRIBUTION, DISTRIBUTOR.toLowerCase(), ARL, state());
    assert.equal(list.schema, CLAIM_LIST_SCHEMA);
    assert.equal(list.chainId, 84532);
    assert.equal(list.distributor, DISTRIBUTOR);
    assert.equal(list.token, ARL);
    assert.equal(list.claimEnd, 2_000);
    assert.deepEqual(list.distribution, DISTRIBUTION);
  });

  it("refuses a distributor that would not pay the list", () => {
    rejects(state({ code: "0x" }), /no contract/);
    rejects(state({ merkleRoot: `0x${"11".repeat(32)}` }), /root/);
    rejects(state({ token: OTHER }), /different token/);
    rejects(state({ claimEnd: 1_000n }), /closed/);
    rejects(state({ balance: BigInt(DISTRIBUTION.total) - 1n }), /cannot pay/);
    rejects(state({ chainId: 1 }), /only for Base/);
  });

  it("refuses a distribution whose claims do not reach its root", () => {
    const tampered = structuredClone(DISTRIBUTION);
    const first = Object.values(tampered.claims)[0];
    assert.ok(first);
    first.amount = (BigInt(first.amount) + 1n).toString();
    rejects(state(), /does not match|does not verify/, tampered);
  });
});
