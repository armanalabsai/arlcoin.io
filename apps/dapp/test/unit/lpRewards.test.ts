import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeFunctionData, keccak256 } from "viem";

import {
  ARL,
  POOL,
  PROGRAMME,
  PROGRAMME_ID,
  STAKER_ABI,
  USDT,
  exitCalls,
  inRange,
  isPoolPosition,
  parseTokenId,
  programmeState,
  stakeData,
} from "../../lib/lpRewards.ts";

describe("liquidity rewards programme", () => {
  it("names the programme the staker knows: the id is the hash of the encoded key", () => {
    assert.equal(keccak256(stakeData()), PROGRAMME_ID);
    assert.equal(PROGRAMME.rewardToken, ARL);
    assert.equal(PROGRAMME.pool, POOL);
    assert.equal(PROGRAMME.endTime - PROGRAMME.startTime, 30n * 86_400n);
    assert.equal(
      new Date(Number(PROGRAMME.startTime) * 1000).toISOString(),
      "2026-11-21T12:00:00.000Z",
    );
  });

  it("tells the programme's state from the chain time", () => {
    assert.equal(programmeState(PROGRAMME.startTime - 1n), "before");
    assert.equal(programmeState(PROGRAMME.startTime), "running");
    assert.equal(programmeState(PROGRAMME.endTime - 1n), "running");
    assert.equal(programmeState(PROGRAMME.endTime), "ended");
  });

  it("accepts only ARL/USDT 1% positions, in either token order", () => {
    assert.equal(isPoolPosition(ARL, USDT, 10_000), true);
    assert.equal(isPoolPosition(USDT, ARL, 10_000), true);
    assert.equal(isPoolPosition(ARL, USDT, 3_000), false);
    assert.equal(isPoolPosition(ARL, "0x4200000000000000000000000000000000000006", 10_000), false);
  });

  it("counts a position as earning only while the tick is inside its range", () => {
    assert.equal(inRange(-292_400, -294_400, -290_400), true);
    assert.equal(inRange(-294_400, -294_400, -290_400), true);
    assert.equal(inRange(-290_400, -294_400, -290_400), false);
    assert.equal(inRange(-295_000, -294_400, -290_400), false);
  });

  it("reads position ids and refuses anything else", () => {
    assert.equal(parseTokenId(" 1234567 "), 1_234_567n);
    for (const bad of ["", "0", "-1", "1.5", "0x10", "abc", "1".repeat(31)]) {
      assert.equal(parseTokenId(bad), undefined, bad);
    }
  });

  it("exits in one transaction: unstake, pay the owner, return the position to the owner", () => {
    const owner = "0x1111111111111111111111111111111111111111";
    const calls = exitCalls(42n, owner).map((data) =>
      decodeFunctionData({ abi: STAKER_ABI, data }),
    );
    assert.deepEqual(
      calls.map((c) => c.functionName),
      ["unstakeToken", "claimReward", "withdrawToken"],
    );
    assert.deepEqual(calls[0]?.args, [PROGRAMME, 42n]);
    assert.deepEqual(calls[1]?.args, [ARL, owner, 0n]);
    assert.deepEqual(calls[2]?.args, [42n, owner, "0x"]);
  });
});
