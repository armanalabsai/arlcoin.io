import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { encodeAbiParameters, keccak256 } from "viem";

import {
  DistributionError,
  buildDistribution,
  publicLaunchInput,
  verifyDistribution,
  type Distribution,
  type DistributionInput,
} from "../src/distribution.ts";

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../contracts/test/fixtures/${name}`, import.meta.url), "utf8"),
  ) as unknown;
const INPUT = fixture("distribution-input.json") as DistributionInput;
const OUTPUT = fixture("distribution.json") as Distribution;

const input = (change?: (i: DistributionInput) => void): DistributionInput => {
  const copy = structuredClone(INPUT);
  change?.(copy);
  return copy;
};
const rejects = (i: DistributionInput, pattern: RegExp) => {
  assert.throws(
    () => buildDistribution(i),
    (e: unknown) => e instanceof DistributionError && pattern.test(e.message),
  );
};

describe("distribution list", () => {
  it("the committed contract fixture matches the tooling output exactly", () => {
    assert.deepEqual(buildDistribution(INPUT), OUTPUT);
    verifyDistribution(OUTPUT);
  });

  it("leaves use the encoding ARLMerkleDistributor checks", () => {
    const [account, claim] = Object.entries(OUTPUT.claims)[0] ?? [];
    assert.ok(account && claim);
    const inner = keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "uint256" }],
        [BigInt(claim.index), account as `0x${string}`, BigInt(claim.amount)],
      ),
    );
    const tree = StandardMerkleTree.of(
      [[String(claim.index), account, claim.amount]],
      ["uint256", "address", "uint256"],
    );
    assert.equal(tree.leafHash([String(claim.index), account, claim.amount]), keccak256(inner));
  });

  it("reports the total the distributor must be funded with", () => {
    const sum = INPUT.claims.reduce((s, c) => s + BigInt(c.amount), 0n);
    assert.equal(OUTPUT.total, sum.toString());
    assert.equal(OUTPUT.count, INPUT.claims.length);
  });

  it("is deterministic", () => {
    assert.deepEqual(buildDistribution(input()), buildDistribution(input()));
  });
});

describe("distribution validation (fails closed)", () => {
  it("accepts only an allocation with an approved Merkle claim mechanism", () => {
    rejects(
      input((i) => (i.allocation = "earlyUsers")),
      /earlyUsers" has no approved Merkle claim/,
    );
    rejects(
      input((i) => (i.allocation = "liquidity")),
      /no approved Merkle claim/,
    );
    rejects(
      input((i) => (i.allocation = "__proto__")),
      /no approved Merkle claim/,
    );
  });

  it("rejects a budget above the Public Launch allocation (5,000,000 ARL)", () => {
    rejects(
      input((i) => (i.budget = (5_000_000n * 10n ** 18n + 1n).toString())),
      /budget: .* exceeds the publicLaunch allocation/,
    );
  });

  it("rejects a list whose total exceeds the budget", () => {
    rejects(
      input((i) => (i.budget = "1000")),
      /claims total .* exceeds budget 1000/,
    );
  });

  it("enforces the per-address limit when one is given", () => {
    rejects(
      input((i) => (i.maxPerAddress = "2")),
      /exceeds maxPerAddress 2/,
    );
    const noLimit = input((i) => delete i.maxPerAddress);
    assert.equal(buildDistribution(noLimit).merkleRoot, OUTPUT.merkleRoot);
  });

  it("rejects an account listed twice, in any letter case", () => {
    rejects(
      input((i) => {
        const first = i.claims[0];
        assert.ok(first);
        i.claims.push({ account: first.account.toLowerCase(), amount: "1" });
      }),
      /is listed twice/,
    );
  });

  it("rejects zero, malformed or missing addresses and amounts", () => {
    rejects(
      input((i) => i.claims.push({ account: `0x${"0".repeat(40)}`, amount: "1" })),
      /zero address/,
    );
    rejects(
      input((i) => i.claims.push({ account: "0x1234", amount: "1" })),
      /account: invalid/,
    );
    for (const amount of ["0", "-1", "1.5", "1e18", "01", ""]) {
      rejects(
        input((i) =>
          i.claims.push({ account: "0x000000000000000000000000000000000000bEEF", amount }),
        ),
        /amount: must be a positive integer string/,
      );
    }
    rejects(
      input((i) => (i.claims = [])),
      /claims: must be a non-empty list/,
    );
  });

  it("rejects unknown keys and other schemas", () => {
    rejects(
      input((i) => ((i as unknown as Record<string, unknown>).merkleRoot = "0x00")),
      /input\.merkleRoot: unexpected key/,
    );
    rejects(
      input((i) => ((i.claims[0] as unknown as Record<string, unknown>).bonus = "1")),
      /claims\[0\]\.bonus: unexpected key/,
    );
    rejects(
      input((i) => ((i as unknown as Record<string, unknown>).schema = "arl-distribution-input/0")),
      /schema: expected arl-distribution-input\/1/,
    );
  });

  it("detects a tampered distribution file", () => {
    const tampered = structuredClone(OUTPUT);
    const first = Object.values(tampered.claims)[0];
    assert.ok(first);
    first.amount = (BigInt(first.amount) + 1n).toString();
    assert.throws(() => {
      verifyDistribution(tampered);
    }, DistributionError);

    const wrongRoot = { ...structuredClone(OUTPUT), merkleRoot: `0x${"11".repeat(32)}` };
    assert.throws(() => {
      verifyDistribution(wrongRoot);
    }, /merkleRoot does not match/);
  });
});

describe("Public Launch list from a whitelist CSV (approved parameters)", () => {
  const A = "0xd18d96980742bc5fab940fc9078fa882cf85ecad";
  const B = "0xfedb036a961ad2d2224a293e4362665480963578";

  it("applies the approved budget and per-address cap", () => {
    const i = publicLaunchInput(`address,amount\n${A},10000\n${B},250\n`);
    assert.equal(i.budget, (500_000n * 10n ** 18n).toString());
    assert.equal(i.maxPerAddress, (10_000n * 10n ** 18n).toString());
    assert.equal(buildDistribution(i).total, (10_250n * 10n ** 18n).toString());
  });

  it("rejects a claim above 10,000 ARL", () => {
    rejects(publicLaunchInput(`${A},10001`), /exceeds maxPerAddress/);
  });

  it("rejects a list above the 500,000 ARL tranche", () => {
    const lines = Array.from({ length: 51 }, (_, k) => {
      const addr = `0x${(k + 1).toString(16).padStart(40, "0")}`;
      return `${addr},10000`;
    });
    rejects(publicLaunchInput(lines.join("\n")), /exceeds budget/);
  });

  it("rejects malformed lines and fractional amounts", () => {
    assert.throws(() => publicLaunchInput(A), /expected "address,amount"/);
    assert.throws(() => publicLaunchInput(`${A},1.5`), /whole number of ARL/);
    assert.throws(() => publicLaunchInput(`${A},10,x`), /expected "address,amount"/);
  });
});
