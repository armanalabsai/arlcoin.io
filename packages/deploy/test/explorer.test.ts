import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { decodeAbiParameters, getAddress } from "viem";

import { checkAgainstBroadcast, explorerTargets, verifyCommand } from "../src/explorer.ts";
import type { DeploymentRecord } from "../src/manifest.ts";
import { buildPlan, type DeployConfig } from "../src/plan.ts";

const plan = buildPlan(
  JSON.parse(
    readFileSync(new URL("../../../contracts/deploy/config/local.json", import.meta.url), "utf8"),
  ) as DeployConfig,
);
const deployment: DeploymentRecord = {
  chainId: 31337,
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  token: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  investorsVesting: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  partnershipsVesting: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  timelock: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
};
const targets = explorerTargets(plan, deployment);

function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  assert.ok(v !== undefined, `item ${String(i)}`);
  return v;
}

describe("explorer source verification", () => {
  it("rebuilds every constructor's arguments from the plan and the record", () => {
    assert.deepEqual(
      targets.map((t) => [t.contract, t.address]),
      [
        ["src/ARLVestingWallet.sol:ARLVestingWallet", deployment.investorsVesting],
        ["src/ARLVestingWallet.sol:ARLVestingWallet", deployment.partnershipsVesting],
        ["src/ARLTimelock.sol:ARLTimelock", deployment.timelock],
        ["src/ARLToken.sol:ARLToken", deployment.token],
      ],
    );
    const [vesting, timelock, token] = [at(targets, 0), at(targets, 2), at(targets, 3)];
    const v = plan.vesting.investors;
    assert.deepEqual(
      decodeAbiParameters(
        [{ type: "address" }, { type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
        vesting.constructorArgs,
      ),
      [getAddress(v.beneficiary), BigInt(v.cliffStart), BigInt(v.cliffEnd), BigInt(v.vestingEnd)],
    );
    const [delay, proposers, executors, guardian] = decodeAbiParameters(
      [{ type: "uint256" }, { type: "address[]" }, { type: "address[]" }, { type: "address" }],
      timelock.constructorArgs,
    );
    assert.equal(delay, 172800n);
    assert.deepEqual(
      [proposers, executors],
      [[getAddress(plan.treasury.safe)], [getAddress(plan.treasury.safe)]],
    );
    assert.equal(guardian, getAddress(plan.treasury.guardian));
    // Eleven recipients in struct order; the vesting wallets and timelock take their slots.
    assert.equal((token.constructorArgs.length - 2) / 2, 11 * 32);
    const word = (i: number) =>
      getAddress(`0x${token.constructorArgs.slice(2 + i * 64 + 24, 2 + (i + 1) * 64)}`);
    assert.equal(word(3), deployment.partnershipsVesting);
    assert.equal(word(5), getAddress(plan.recipients.founder));
    assert.equal(word(6), deployment.investorsVesting);
    assert.equal(word(7), deployment.timelock);
  });

  it("matches a broadcast whose creations end with those arguments, and nothing else", () => {
    const run = {
      transactions: targets.map((t) => ({
        transactionType: "CREATE",
        contractAddress: t.address.toLowerCase(),
        transaction: { input: `0x6080deadbeef${t.constructorArgs.slice(2)}` },
      })),
    };
    assert.deepEqual(checkAgainstBroadcast(targets, run), []);
    const changed = structuredClone(run);
    const tx = at(changed.transactions, 2).transaction;
    tx.input = tx.input.replace(/.$/, "f");
    assert.deepEqual(checkAgainstBroadcast(targets, changed), [
      "treasury timelock: constructor arguments differ from the broadcast",
    ]);
    const extra = structuredClone(run);
    extra.transactions.push({
      ...at(extra.transactions, 0),
      contractAddress: "0x0000000000000000000000000000000000000001",
    });
    assert.deepEqual(checkAgainstBroadcast(targets, extra), [
      "broadcast creates 5 contracts, expected 4",
    ]);
    assert.equal(checkAgainstBroadcast(targets, { transactions: [] }).length, 5);
  });

  it("builds forge commands without any key, and never for Base Mainnet", () => {
    const cmd = verifyCommand(84532, at(targets, 3));
    assert.deepEqual(cmd.slice(0, 6), [
      "verify-contract",
      "--chain",
      "84532",
      "--verifier",
      "etherscan",
      "--watch",
    ]);
    assert.ok(!cmd.some((a) => /api-key/i.test(a)));
    assert.throws(() => verifyCommand(8453, at(targets, 3)), /locked/);
    assert.throws(
      () => explorerTargets({ ...plan, chainId: 8453 }, { ...deployment, chainId: 8453 }),
      /locked/,
    );
    assert.throws(() => explorerTargets(plan, { ...deployment, chainId: 84532 }), /differs/);
  });
});
