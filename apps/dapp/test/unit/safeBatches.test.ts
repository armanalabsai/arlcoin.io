import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { decodeFunctionData, getAddress, parseAbi, parseUnits } from "viem";

// Safe Transaction Builder batches published with the app (public/safe-batches/), so a Safe
// owner can import them from a phone. Each one must call exactly what its description says.
const batch = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../public/safe-batches/${name}.json`, import.meta.url), "utf8"),
  ) as {
    chainId: string;
    meta: { createdFromSafeAddress: string };
    transactions: { to: string; value: string; data: `0x${string}` }[];
  };

const docServices = readFileSync(
  new URL("../../../../docs/mainnet-services.md", import.meta.url),
  "utf8",
);
const docPlan = readFileSync(new URL("../../../../docs/mainnet-plan.md", import.meta.url), "utf8");

const TOKEN = getAddress("0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4");
const STAKING = getAddress("0x15e257009BE9B1875fbfa69D291320aaFE3fa102");
const STAKING_SAFE = getAddress("0xfF12597A671ebAF0cAe37999EE659e03c4f444B5");
const abi = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function notifyRewardAmount(uint256 reward)",
]);

describe("8453-staking-fund-300k Safe batch", () => {
  const b = batch("8453-staking-fund-300k.safe-batch");
  const amount = parseUnits("300000", 18);

  it("is for Base Mainnet and the Community & Staking Safe named in the docs", () => {
    assert.equal(b.chainId, "8453");
    assert.equal(getAddress(b.meta.createdFromSafeAddress), STAKING_SAFE);
    assert.match(docPlan, new RegExp(`Community & Staking Safe +\\| \`${STAKING_SAFE}\``));
    assert.ok(docServices.includes(STAKING) || docServices.includes(STAKING.toLowerCase()));
  });

  it("approves exactly 300,000 ARL to staking, then funds the period with the same amount", () => {
    assert.equal(b.transactions.length, 2);
    const [approve, notify] = b.transactions;
    assert.ok(approve && notify);

    assert.equal(getAddress(approve.to), TOKEN);
    assert.equal(approve.value, "0");
    const a = decodeFunctionData({ abi, data: approve.data });
    assert.equal(a.functionName, "approve");
    assert.deepEqual(a.args, [STAKING, amount]);

    assert.equal(getAddress(notify.to), STAKING);
    assert.equal(notify.value, "0");
    const n = decodeFunctionData({ abi, data: notify.data });
    assert.equal(n.functionName, "notifyRewardAmount");
    assert.deepEqual(n.args, [amount]);
  });
});
