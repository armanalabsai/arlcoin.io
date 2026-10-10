import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";

import {
  CLAIM_LIST_SCHEMA,
  ClaimError,
  claimArgs,
  claimStatus,
  distributorAbi,
  leafHash,
  mismatches,
  parseClaimList,
  verifyProof,
} from "../../lib/claim.ts";

const ARL = "0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97";
const DISTRIBUTOR = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const CAROL = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const STRANGER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
const UNIT = 10n ** 18n;

/** A claim list built with the reference library, in the format the deploy tooling writes. */
function published(chainId = 31337) {
  const values: [string, string, string][] = [
    ["0", ALICE, (10_000n * UNIT).toString()],
    ["1", BOB, (2_500n * UNIT).toString()],
    ["2", CAROL, (1n * UNIT).toString()],
  ];
  const tree = StandardMerkleTree.of(values, ["uint256", "address", "uint256"]);
  const claims: Record<string, { index: number; amount: string; proof: string[] }> = {};
  for (const [i, [index, account, amount]] of tree.entries()) {
    claims[account] = { index: Number(index), amount, proof: tree.getProof(i) };
  }
  return {
    schema: CLAIM_LIST_SCHEMA,
    chainId,
    distributor: DISTRIBUTOR,
    token: ARL,
    distribution: {
      schema: "arl-distribution/1",
      allocation: "publicLaunch",
      merkleRoot: tree.root,
      leafEncoding: ["uint256", "address", "uint256"],
      total: (12_501n * UNIT).toString(),
      count: 3,
      claims,
    },
  };
}

describe("claim", () => {
  it("hashes leaves and verifies proofs exactly like the reference tree", () => {
    const file = published();
    const tree = StandardMerkleTree.of(
      [["0", ALICE, (10_000n * UNIT).toString()]],
      ["uint256", "address", "uint256"],
    );
    assert.equal(
      leafHash(0n, ALICE, 10_000n * UNIT),
      tree.leafHash(["0", ALICE, (10_000n * UNIT).toString()]),
    );
    const c = file.distribution.claims[BOB];
    assert.ok(c);
    const root = file.distribution.merkleRoot as Hex;
    assert.equal(verifyProof(root, leafHash(1n, BOB, 2_500n * UNIT), c.proof as Hex[]), true);
    assert.equal(verifyProof(root, leafHash(1n, BOB, 2_501n * UNIT), c.proof as Hex[]), false);
    assert.equal(verifyProof(root, leafHash(1n, ALICE, 2_500n * UNIT), c.proof as Hex[]), false);
  });

  it("reads a published list and finds each account", () => {
    const list = parseClaimList(published(), 31337);
    assert.equal(list.distributor, DISTRIBUTOR);
    assert.equal(list.count, 3);
    assert.equal(list.total, 12_501n * UNIT);
    assert.equal(list.claims.get(ALICE)?.amount, 10_000n * UNIT);
    assert.equal(list.claims.get(CAROL)?.index, 2n);
  });

  it("refuses a list for another chain, a wrong schema or a malformed file", () => {
    assert.throws(() => parseClaimList(published(84532), 31337), /chainId/);
    assert.throws(() => parseClaimList({ ...published(), schema: "x" }, 31337), ClaimError);
    assert.throws(() => parseClaimList(null, 31337), ClaimError);
    assert.throws(
      () => parseClaimList({ ...published(), distributor: "0x12" }, 31337),
      /distributor/,
    );
    assert.throws(
      () =>
        parseClaimList(
          { ...published(), token: "0x0000000000000000000000000000000000000000" },
          31337,
        ),
      /zero address/,
    );
  });

  it("refuses a tampered amount, proof, account, total or count", () => {
    const amount = published();
    const a = amount.distribution.claims[ALICE];
    assert.ok(a);
    a.amount = (20_000n * UNIT).toString();
    assert.throws(() => parseClaimList(amount, 31337), /proof does not reach the root/);

    const proof = published();
    const b = proof.distribution.claims[BOB];
    assert.ok(b);
    b.proof = b.proof.slice(1);
    assert.throws(() => parseClaimList(proof, 31337), /proof does not reach the root/);

    const moved = published();
    const c = moved.distribution.claims[CAROL];
    assert.ok(c);
    delete moved.distribution.claims[CAROL];
    moved.distribution.claims[STRANGER] = c;
    assert.throws(() => parseClaimList(moved, 31337), /proof does not reach the root/);

    const total = published();
    total.distribution.total = (99n * UNIT).toString();
    assert.throws(() => parseClaimList(total, 31337), /total/);

    const count = published();
    count.distribution.count = 4;
    assert.throws(() => parseClaimList(count, 31337), /count/);
  });

  it("requires the distributor on chain to match the list", () => {
    const list = parseClaimList(published(), 31337);
    const chain = { token: ARL as Address, merkleRoot: list.merkleRoot, claimEnd: 1_000n };
    assert.deepEqual(mismatches(list, chain, ARL), []);
    assert.equal(mismatches(list, { ...chain, merkleRoot: `0x${"11".repeat(32)}` }).length, 1);
    assert.equal(mismatches(list, { ...chain, token: STRANGER }).length, 1);
    assert.equal(mismatches(list, chain, STRANGER).length, 1);
  });

  it("reports not listed, claimed, closed and open", () => {
    const list = parseClaimList(published(), 31337);
    assert.equal(claimStatus(list, STRANGER, false, 100n, 50n).kind, "not-listed");
    assert.equal(
      claimStatus(list, ALICE.toLowerCase() as Address, true, 100n, 50n).kind,
      "claimed",
    );
    assert.equal(claimStatus(list, ALICE, false, 100n, 100n).kind, "closed");
    const open = claimStatus(list, ALICE, false, 100n, 99n);
    assert.equal(open.kind, "open");
  });

  it("builds the call the contract expects", () => {
    const list = parseClaimList(published(), 31337);
    const claim = list.claims.get(BOB);
    assert.ok(claim);
    const data = encodeFunctionData({
      abi: distributorAbi,
      functionName: "claim",
      args: claimArgs(BOB, claim),
    });
    const decoded = decodeFunctionData({ abi: distributorAbi, data });
    assert.equal(decoded.functionName, "claim");
    assert.deepEqual(decoded.args, [1n, BOB, 2_500n * UNIT, claim.proof]);
  });
});
