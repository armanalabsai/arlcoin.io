import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeFunctionData, parseAbi } from "viem";

import {
  FEE,
  PoolError,
  QUOTES,
  TICK_SPACING,
  UNISWAP_V3_BASE,
  buildPoolPlan,
  safeBatch,
  sqrtRatioAtTick,
  type PoolInput,
  type PoolLegPlan,
} from "../src/pool.ts";

// Expected Base Mainnet addresses (docs/mainnet-plan.md).
const ARL = "0x0e8A5434f12D3d839a0a7E88d3a66b11bd712b97";
const LIQUIDITY_SAFE = "0x220D3a21366FD386CEEEF4ba36c7aE6582AB3C18";
const DEADLINE = 1_796_083_200;
const Q192 = 2n ** 192n;
const WEI = 10n ** 18n;

const input: PoolInput = {
  token: ARL,
  liquiditySafe: LIQUIDITY_SAFE,
  priceUsd: "0.20",
  deadline: DEADLINE,
  legs: [
    { quote: "USDC", arlAmount: "200000", quoteUsd: "1" },
    { quote: "USDT", arlAmount: "100000", quoteUsd: "1" },
    { quote: "WETH", arlAmount: "150000", quoteUsd: "4000" },
    { quote: "cbBTC", arlAmount: "50000", quoteUsd: "100000" },
  ],
};
const abi = parseAbi([
  "function createAndInitializePoolIfNecessary(address,address,uint24,uint160) returns (address)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256,uint128,uint256,uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const at = <T>(xs: readonly T[], i: number): T => {
  const x = xs[i];
  if (x === undefined) throw new Error(`no item ${String(i)}`);
  return x;
};

/** price(sqrt) >= num / den, with price = sqrt^2 / 2^192. */
const atLeast = (sqrt: bigint, l: PoolLegPlan) =>
  sqrt ** 2n * BigInt(l.priceDen) >= BigInt(l.priceNum) * Q192;

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

  it("builds one 1% pool per quote token, ARL first in each", () => {
    assert.deepEqual(
      plan.legs.map((l) => [l.quote, l.token1]),
      [
        ["USDC", QUOTES.USDC.address],
        ["USDT", QUOTES.USDT.address],
        ["WETH", QUOTES.WETH.address],
        ["cbBTC", QUOTES.cbBTC.address],
      ],
    );
    for (const l of plan.legs) {
      assert.equal(l.arlIsToken0, true);
      assert.equal(l.token0, ARL);
      assert.equal(l.fee, FEE);
      assert.equal(Math.abs(l.tickLower % TICK_SPACING), 0);
      assert.equal(l.tickUpper, 887_200);
    }
    assert.equal(plan.totalArlWei, (500_000n * WEI).toString());
  });

  it("fixes each floor at 0.20 USD in the quote token", () => {
    const [usdc, usdt, weth, cbbtc] = plan.legs as [
      PoolLegPlan,
      PoolLegPlan,
      PoolLegPlan,
      PoolLegPlan,
    ];
    // 0.20 USD = 0.20 USDC = 0.20 USDT = 0.00005 WETH at 4,000 USD = 0.000002 cbBTC at 100,000 USD.
    assert.equal(BigInt(usdc.priceNum) * 10n ** 13n, BigInt(usdc.priceDen) * 2n);
    assert.equal(usdt.tickLower, usdc.tickLower);
    assert.equal(BigInt(weth.priceNum) * 100_000n, BigInt(weth.priceDen) * 5n);
    assert.equal(BigInt(cbbtc.priceNum) * 10n ** 16n, BigInt(cbbtc.priceDen) * 2n);
  });

  it("starts each range at the first usable tick at or above the floor, pool just below", () => {
    for (const l of plan.legs) {
      assert.ok(atLeast(sqrtRatioAtTick(l.tickLower), l));
      assert.ok(!atLeast(sqrtRatioAtTick(l.tickLower - TICK_SPACING), l));
      assert.equal(BigInt(l.sqrtPriceX96), sqrtRatioAtTick(l.tickLower) - 1n);
    }
  });

  it("encodes creates, one approval for the total, then mints to the Liquidity Safe", () => {
    const txs = plan.transactions;
    assert.equal(txs.length, 9);
    for (const [i, l] of plan.legs.entries()) {
      const c = decodeFunctionData({ abi, data: at(txs, i).data });
      assert.equal(at(txs, i).to, UNISWAP_V3_BASE.positionManager);
      assert.deepEqual(c.args, [ARL, l.token1, FEE, BigInt(l.sqrtPriceX96)]);
      const m = decodeFunctionData({ abi, data: at(txs, 5 + i).data });
      const p = (m.args as unknown as [Record<string, unknown>])[0];
      assert.equal(p.amount0Desired, BigInt(l.arlAmountWei));
      assert.equal(p.amount1Desired, 0n);
      assert.equal(p.amount1Min, 0n);
      assert.equal(p.amount0Min, (BigInt(l.arlAmountWei) * 999n) / 1000n);
      assert.equal(p.recipient, LIQUIDITY_SAFE);
      assert.equal(p.deadline, BigInt(DEADLINE));
    }
    assert.equal(at(txs, 4).to, ARL);
    const a = decodeFunctionData({ abi, data: at(txs, 4).data });
    assert.deepEqual(a.args, [UNISWAP_V3_BASE.positionManager, 500_000n * WEI]);
  });

  it("handles ARL above the quote token by mirroring the range below the price", () => {
    const high = buildPoolPlan({
      ...input,
      token: "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF",
      legs: [{ quote: "USDC", arlAmount: "1000", quoteUsd: "1" }],
    });
    const l = at(high.legs, 0);
    assert.equal(l.arlIsToken0, false);
    // Price is ARL per USDC: at most 5e12 raw at the range top, which is the current price.
    const sqrt = BigInt(l.sqrtPriceX96);
    assert.equal(sqrt, sqrtRatioAtTick(l.tickUpper));
    assert.ok(sqrt ** 2n <= 5_000_000_000_000n * Q192);
    assert.ok(sqrtRatioAtTick(l.tickUpper + TICK_SPACING) ** 2n > 5_000_000_000_000n * Q192);
  });

  it("writes a Safe Transaction Builder batch for chain 8453", () => {
    const batch = safeBatch(plan, LIQUIDITY_SAFE, 0);
    assert.equal(batch.chainId, "8453");
    assert.equal(batch.meta.createdFromSafeAddress, LIQUIDITY_SAFE);
    assert.equal(batch.transactions.length, 9);
  });

  it("refuses bad input", () => {
    const usdc = { quote: "USDC" as const, arlAmount: "1000", quoteUsd: "1" };
    for (const bad of [
      { legs: [] },
      { legs: [{ ...usdc, arlAmount: "0" }] },
      { legs: [{ ...usdc, arlAmount: "1.5" }] },
      { legs: [{ ...usdc, quoteUsd: "1.01" }] },
      { legs: [{ ...usdc, quote: "DAI" as "USDC" }] },
      { legs: [usdc, usdc] },
      { legs: [{ ...usdc, arlAmount: "2000001" }] },
      {
        legs: [
          { ...usdc, arlAmount: "1500000" },
          { quote: "WETH" as const, arlAmount: "600000", quoteUsd: "4000" },
        ],
      },
      { legs: [{ quote: "WETH" as const, arlAmount: "1", quoteUsd: "0" }] },
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
