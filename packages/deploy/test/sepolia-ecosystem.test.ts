import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeFunctionData, parseAbi } from "viem";

import {
  ecosystemBatches,
  OPERATOR_FLOAT,
  SEPOLIA,
  SepoliaEcosystemError,
  STAKING_REWARD,
} from "../src/sepolia-ecosystem.ts";

const STAKING = "0x1111111111111111111111111111111111111111";
const OPERATOR = "0x3b33Db294B9f52993728103215be1D86A7777093";
const deployment = {
  chainId: 84_532,
  token: SEPOLIA.token,
  rewardsDistribution: SEPOLIA.communityStakingSafe,
  staking: STAKING,
  jobs: "0x2222222222222222222222222222222222222222",
};
const abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function notifyRewardAmount(uint256 reward)",
]);

test("community batch approves exactly the reward, then starts the period", () => {
  const { community } = ecosystemBatches(deployment, OPERATOR, 0);
  assert.equal(community.chainId, "84532");
  assert.equal(community.meta.createdFromSafeAddress, SEPOLIA.communityStakingSafe);
  const [approve, notify] = community.transactions;
  assert.equal(approve?.to, SEPOLIA.token);
  assert.deepEqual(decodeFunctionData({ abi, data: approve!.data }).args, [
    STAKING,
    STAKING_REWARD,
  ]);
  assert.equal(notify?.to, STAKING);
  assert.deepEqual(decodeFunctionData({ abi, data: notify!.data }).args, [STAKING_REWARD]);
  assert.ok(community.transactions.every((t) => t.value === "0"));
});

test("ecosystem batch sends the float to the operator only", () => {
  const { ecosystem } = ecosystemBatches(deployment, OPERATOR, 0);
  assert.equal(ecosystem.meta.createdFromSafeAddress, SEPOLIA.ecosystemGrowthSafe);
  assert.equal(ecosystem.transactions.length, 1);
  const d = decodeFunctionData({ abi, data: ecosystem.transactions[0]!.data });
  assert.equal(d.functionName, "transfer");
  assert.deepEqual(d.args, [OPERATOR, OPERATOR_FLOAT]);
});

test("rejects another chain, token, distributor or a Safe as operator", () => {
  const bad: [Partial<typeof deployment>, string][] = [
    [{ chainId: 8453 }, "chain"],
    [{ token: STAKING }, "token"],
    [{ rewardsDistribution: SEPOLIA.ecosystemGrowthSafe }, "distributor"],
  ];
  for (const [patch] of bad) {
    assert.throws(
      () => ecosystemBatches({ ...deployment, ...patch }, OPERATOR, 0),
      SepoliaEcosystemError,
    );
  }
  assert.throws(
    () => ecosystemBatches(deployment, SEPOLIA.ecosystemGrowthSafe, 0),
    SepoliaEcosystemError,
  );
  assert.throws(
    () => ecosystemBatches(deployment, "0x0000000000000000000000000000000000000000", 0),
    SepoliaEcosystemError,
  );
});
