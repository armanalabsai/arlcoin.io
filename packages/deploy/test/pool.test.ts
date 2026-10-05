import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeFunctionData, parseAbi } from "viem";

import {
  FEE,
  PoolError,
  TICK_SPACING,
  UNISWAP_V3_BASE,
  USDC_BASE,
  buildPoolPlan,
  safeBatch,
  sqrtRatioAtTick,
} from "../src/pool.ts";

// Expected Base Mainnet addresses (docs/mainnet-plan.md).
const ARL = "0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97";
const LIQUIDITY_SAFE = "0x220D3a21366FD386CEEEF4ba36c7aE6582AB3C18";
const DEADLINE = 1_796_083_200;
const Q192 = 2n ** 192n;

const input = {
  token: ARL,
  liquiditySafe: LIQUIDITY_SAFE,
  arlAmount: "500000",
  priceUsd: "0.20",
  deadline: DEADLINE,
};
const pmAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address,address,uint24,uint160) returns (address)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256,uint128,uint256,uint256)",
  "function approve(address,uint256) returns (bool)",
]);

describe("Uniswap TickMath port", () => {
  it("matches the reference values at 0 and the edges", () => {
    assert.equal(sqrtRatioAtTick(0), 2n ** 96n);
    assert.equal(sqrtRatioAtTick(-887_272), 4_295_128_739n);
    assert.equal(
      sqrtRatioAtTick(887_272),
      1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n,
    );
    assert.throws(() => sqrtRatioAtTick(887_273), PoolError);
  });
  it("is strictly increasing", () => {
    for (let t = -1000; t < 1000; t += 7) assert.ok(sqrtRatioAtTick(t) < sqrtRatioAtTick(t + 1));
  });
});

describe("launch liquidity plan", () => {
  const plan = buildPoolPlan(input);
  // Raw price 0.20 USD/ARL = 0.20e6 / 1e18 = 1 / 5e12.
  const priceAtLeast = (sqrt: bigint) => sqrt ** 2n * 5_000_000_000_000n >= Q192;

  it("puts ARL first (lower address than USDC) and uses the 1% tier", () => {
    assert.equal(plan.arlIsToken0, true);
    assert.equal(plan.token0, ARL);
    assert.equal(plan.token1, USDC_BASE);
    assert.equal(plan.fee, FEE);
    assert.equal(Math.abs(plan.tickLower % TICK_SPACING), 0);
    assert.equal(Math.abs(plan.tickUpper % TICK_SPACING), 0);
  });

  it("starts the range at the first usable tick at or above 0.20 USD", () => {
    assert.ok(priceAtLeast(sqrtRatioAtTick(plan.tickLower)));
    assert.ok(!priceAtLeast(sqrtRatioAtTick(plan.tickLower - TICK_SPACING)));
    assert.equal(plan.tickUpper, 887_200);
  });

  it("initialises the pool just below the range, so the position holds only ARL", () => {
    const sqrt = BigInt(plan.sqrtPriceX96);
    assert.equal(sqrt, sqrtRatioAtTick(plan.tickLower) - 1n);
    assert.ok(sqrt >= sqrtRatioAtTick(plan.tickLower - 1));
  });

  it("encodes create, approve and mint for the Liquidity Safe", () => {
    const [create, approve, mint] = plan.transactions;
    assert.equal(create.to, UNISWAP_V3_BASE.positionManager);
    const c = decodeFunctionData({ abi: pmAbi, data: create.data });
    assert.deepEqual(c.args, [ARL, USDC_BASE, FEE, BigInt(plan.sqrtPriceX96)]);
    assert.equal(approve.to, ARL);
    const a = decodeFunctionData({ abi: pmAbi, data: approve.data });
    assert.deepEqual(a.args, [UNISWAP_V3_BASE.positionManager, 500_000n * 10n ** 18n]);
    const m = decodeFunctionData({ abi: pmAbi, data: mint.data });
    const p = (m.args as unknown as [Record<string, unknown>])[0];
    assert.equal(p.amount0Desired, 500_000n * 10n ** 18n);
    assert.equal(p.amount1Desired, 0n);
    assert.equal(p.amount1Min, 0n);
    assert.equal(p.amount0Min, (500_000n * 10n ** 18n * 999n) / 1000n);
    assert.equal(p.recipient, LIQUIDITY_SAFE);
    assert.equal(p.deadline, BigInt(DEADLINE));
  });

  it("handles ARL above USDC by mirroring the range below the price", () => {
    const high = buildPoolPlan({ ...input, token: "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF" });
    assert.equal(high.arlIsToken0, false);
    // Price is ARL per USDC: at most 5e12 raw at the range top, which is the current price.
    const sqrt = BigInt(high.sqrtPriceX96);
    assert.equal(sqrt, sqrtRatioAtTick(high.tickUpper));
    assert.ok(sqrt ** 2n <= 5_000_000_000_000n * Q192);
    assert.ok(sqrtRatioAtTick(high.tickUpper + TICK_SPACING) ** 2n > 5_000_000_000_000n * Q192);
  });

  it("writes a Safe Transaction Builder batch for chain 8453", () => {
    const batch = safeBatch(plan, LIQUIDITY_SAFE, 0);
    assert.equal(batch.chainId, "8453");
    assert.equal(batch.meta.createdFromSafeAddress, LIQUIDITY_SAFE);
    assert.equal(batch.transactions.length, 3);
  });

  it("refuses bad input", () => {
    for (const bad of [
      { arlAmount: "0" },
      { arlAmount: "2000001" },
      { arlAmount: "1.5" },
      { priceUsd: "0" },
      { priceUsd: "-1" },
      { token: "0x0000000000000000000000000000000000000000" },
      { liquiditySafe: "nope" },
      { deadline: 0 },
    ]) {
      assert.throws(() => buildPoolPlan({ ...input, ...bad }), PoolError);
    }
  });
});
