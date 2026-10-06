// The Liquidity Safe's launch positions on Uniswap v3 (Base): one single-sided pool per quote
// token (USDC, USDT, WETH, cbBTC), each with a range that starts at the listing price, so it
// holds only ARL and never sells below that price (docs/launch-route.md, section 1). The batch:
//
//   1. NonfungiblePositionManager.createAndInitializePoolIfNecessary per pool, below its range
//   2. ARL.approve(positionManager, total)
//   3. NonfungiblePositionManager.mint per pool, ARL only, recipient the Liquidity Safe
//
// written as one Safe Transaction Builder batch. Uniswap's TickMath is ported to BigInt; no
// Uniswap SDK is needed. Addresses: developers.uniswap.org v3 Base deployments, Circle's USDC
// list, and on-chain symbol, decimals and supply checks on Base, 2026-10-05.

import { encodeFunctionData, getAddress, isAddress, parseUnits, type Hex } from "viem";

import { PRODUCTION_CHAIN_ID } from "./plan.ts";

export class PoolError extends Error {}
const fail = (message: string): never => {
  throw new PoolError(message);
};

/** Uniswap v3 on Base Mainnet. */
export const UNISWAP_V3_BASE = {
  factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
  quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
} as const;

/**
 * Quote tokens on Base Mainnet. USDT is the bridged Tether USD on Base (the one with real
 * supply; look-alike "USDT" contracts exist); cbBTC is Coinbase Wrapped BTC.
 */
export const QUOTES = {
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  USDT: { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
  WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  cbBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
} as const;
export type QuoteSymbol = keyof typeof QUOTES;
export const USDC_BASE = QUOTES.USDC.address;
export const ARL_DECIMALS = 18;
export const LIQUIDITY_ALLOCATION = 2_000_000n;

/** The 1% fee tier, the usual tier for a new token, and its tick spacing. */
export const FEE = 10_000;
export const TICK_SPACING = 200;

const MIN_TICK = -887_272;
const MAX_TICK = 887_272;
const Q96 = 2n ** 96n;
const MAX_UINT256 = 2n ** 256n - 1n;

/** Uniswap v3 TickMath.getSqrtRatioAtTick (core/contracts/libraries/TickMath.sol), in BigInt. */
export function sqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK)
    fail(`tick out of range: ${String(tick)}`);
  const abs = BigInt(Math.abs(tick));
  let ratio =
    (abs & 0x1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  const steps: [bigint, bigint][] = [
    [0x2n, 0xfff97272373d413259a46990580e213an],
    [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
    [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
    [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
    [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
    [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
    [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000n, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [bit, factor] of steps) if ((abs & bit) !== 0n) ratio = (ratio * factor) >> 128n;
  if (tick > 0) ratio = MAX_UINT256 / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/** The largest tick whose price (token1 per token0, raw units) is at most `num / den`. */
function tickAtOrBelow(num: bigint, den: bigint): number {
  // price(tick) = (sqrtRatio / 2^96)^2 <= num / den  <=>  sqrtRatio^2 * den <= num * 2^192
  const fits = (t: number) => sqrtRatioAtTick(t) ** 2n * den <= num * Q96 * Q96;
  let lo = MIN_TICK;
  let hi = MAX_TICK;
  if (!fits(lo)) fail("price below the minimum tick");
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const floorTo = (t: number, s: number) => Math.floor(t / s) * s;
const ceilTo = (t: number, s: number) => Math.ceil(t / s) * s;

/** A positive decimal string as a fraction [numerator, denominator]. */
function decimal(name: string, value: string): [bigint, bigint] {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m) return fail(`${name}: positive decimal`);
  const whole = m[1] ?? "0";
  const frac = m[2] ?? "";
  const num = BigInt(whole + frac);
  if (num === 0n) fail(`${name}: positive decimal`);
  return [num, 10n ** BigInt(frac.length)];
}

export interface PoolLeg {
  readonly quote: QuoteSymbol;
  /** Whole ARL placed in this pool. */
  readonly arlAmount: string;
  /** USD price of one quote token when the batch is built ("1" for USDC and USDT). */
  readonly quoteUsd: string;
}

export interface PoolInput {
  /** The ARL token address on Base Mainnet. */
  readonly token: string;
  /** The Liquidity Safe: it signs the batch and receives every position NFT. */
  readonly liquiditySafe: string;
  /** Listing price in USD per ARL, as a decimal string (approved: "0.20"). */
  readonly priceUsd: string;
  /** Unix seconds after which the mint calls revert. */
  readonly deadline: number;
  readonly legs: readonly PoolLeg[];
}

export interface SafeTx {
  readonly to: string;
  readonly value: "0";
  readonly data: Hex;
  readonly description: string;
}

export interface PoolLegPlan {
  readonly quote: QuoteSymbol;
  readonly quoteUsd: string;
  readonly token0: string;
  readonly token1: string;
  readonly arlIsToken0: boolean;
  readonly fee: number;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly sqrtPriceX96: string;
  readonly arlAmountWei: string;
  /** Floor price in raw units: quote raw per ARL raw = priceNum / priceDen. */
  readonly priceNum: string;
  readonly priceDen: string;
}

export interface PoolPlan {
  readonly chainId: number;
  readonly priceUsd: string;
  readonly totalArlWei: string;
  readonly legs: readonly PoolLegPlan[];
  readonly transactions: readonly SafeTx[];
}

const positionManagerAbi = [
  {
    type: "function",
    name: "createAndInitializePoolIfNecessary",
    stateMutability: "payable",
    inputs: [
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceX96", type: "uint160" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function address(name: string, value: string): `0x${string}` {
  if (!isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value))
    fail(`${name}: not an address`);
  return getAddress(value);
}

/**
 * One pool. The range starts at the first tick whose price is at least the floor and runs to the
 * edge of the price space; the pool starts one tick below it, so the position holds only ARL and
 * the first purchase moves the price into it.
 */
function buildLeg(token: `0x${string}`, leg: PoolLeg, priceUsd: string): PoolLegPlan {
  if (!Object.hasOwn(QUOTES, leg.quote)) fail(`quote: one of ${Object.keys(QUOTES).join(", ")}`);
  const quote = QUOTES[leg.quote];
  if (!/^[1-9]\d*$/.test(leg.arlAmount)) fail(`${leg.quote}: arlAmount must be whole ARL`);
  const [pn, pd] = decimal("priceUsd", priceUsd);
  const [qn, qd] = decimal(`${leg.quote}.quoteUsd`, leg.quoteUsd);
  if ((leg.quote === "USDC" || leg.quote === "USDT") && leg.quoteUsd !== "1")
    fail(`${leg.quote}.quoteUsd: stablecoins are priced at 1`);
  // Quote raw per ARL raw = (priceUsd / quoteUsd) * 10^quoteDecimals / 10^18.
  const priceNum = pn * qd * 10n ** BigInt(quote.decimals);
  const priceDen = pd * qn * 10n ** BigInt(ARL_DECIMALS);

  const arlIsToken0 = token.toLowerCase() < quote.address.toLowerCase();
  let tickLower: number;
  let tickUpper: number;
  let sqrtPriceX96: bigint;
  if (arlIsToken0) {
    // Price is quote per ARL. ARL-only positions lie above the current price.
    const t = tickAtOrBelow(priceNum, priceDen);
    const atOrAbove = sqrtRatioAtTick(t) ** 2n * priceDen === priceNum * Q96 * Q96 ? t : t + 1;
    tickLower = ceilTo(atOrAbove, TICK_SPACING);
    tickUpper = floorTo(MAX_TICK, TICK_SPACING);
    sqrtPriceX96 = sqrtRatioAtTick(tickLower) - 1n; // current tick = tickLower - 1
  } else {
    // Price is ARL per quote. ARL-only positions lie below the current price.
    tickUpper = floorTo(tickAtOrBelow(priceDen, priceNum), TICK_SPACING);
    tickLower = ceilTo(MIN_TICK, TICK_SPACING);
    sqrtPriceX96 = sqrtRatioAtTick(tickUpper); // current tick = tickUpper
  }
  const [token0, token1] = arlIsToken0 ? [token, quote.address] : [quote.address, token];
  return {
    quote: leg.quote,
    quoteUsd: leg.quoteUsd,
    token0,
    token1,
    arlIsToken0,
    fee: FEE,
    tickLower,
    tickUpper,
    sqrtPriceX96: sqrtPriceX96.toString(),
    arlAmountWei: parseUnits(leg.arlAmount, ARL_DECIMALS).toString(),
    priceNum: priceNum.toString(),
    priceDen: priceDen.toString(),
  };
}

/** Builds every pool, one approval for the total, and the mints, as one batch. */
export function buildPoolPlan(input: PoolInput): PoolPlan {
  const token = address("token", input.token);
  const safe = address("liquiditySafe", input.liquiditySafe);
  if (!Number.isInteger(input.deadline) || input.deadline <= 0) fail("deadline: unix seconds");
  if (input.legs.length === 0) fail("legs: at least one pool");
  const seen = new Set<string>();
  for (const leg of input.legs) {
    if (seen.has(leg.quote)) fail(`${leg.quote}: listed twice`);
    seen.add(leg.quote);
  }
  const legs = input.legs.map((leg) => buildLeg(token, leg, input.priceUsd));
  const total = legs.reduce((sum, l) => sum + BigInt(l.arlAmountWei), 0n);
  if (total > LIQUIDITY_ALLOCATION * 10n ** BigInt(ARL_DECIMALS))
    fail("legs: more than the 2,000,000 ARL Liquidity allocation in total");

  const pm = UNISWAP_V3_BASE.positionManager;
  const creates: SafeTx[] = legs.map((l) => ({
    to: pm,
    value: "0",
    data: encodeFunctionData({
      abi: positionManagerAbi,
      functionName: "createAndInitializePoolIfNecessary",
      args: [l.token0 as `0x${string}`, l.token1 as `0x${string}`, FEE, BigInt(l.sqrtPriceX96)],
    }),
    description: `Create the ARL/${l.quote} 1% pool just below ${input.priceUsd} USD per ARL`,
  }));
  const approve: SafeTx = {
    to: token,
    value: "0",
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [pm, total] }),
    description: "Allow the position manager to take exactly the total ARL for the pools",
  };
  const mints: SafeTx[] = legs.map((l) => {
    const amount = BigInt(l.arlAmountWei);
    const min = (amount * 999n) / 1000n;
    return {
      to: pm,
      value: "0",
      data: encodeFunctionData({
        abi: positionManagerAbi,
        functionName: "mint",
        args: [
          {
            token0: l.token0 as `0x${string}`,
            token1: l.token1 as `0x${string}`,
            fee: FEE,
            tickLower: l.tickLower,
            tickUpper: l.tickUpper,
            amount0Desired: l.arlIsToken0 ? amount : 0n,
            amount1Desired: l.arlIsToken0 ? 0n : amount,
            amount0Min: l.arlIsToken0 ? min : 0n,
            amount1Min: l.arlIsToken0 ? 0n : min,
            recipient: safe,
            deadline: BigInt(input.deadline),
          },
        ],
      }),
      description: `Open the ARL-only ARL/${l.quote} position from ${input.priceUsd} USD up; the NFT goes to the Liquidity Safe`,
    };
  });

  return {
    chainId: PRODUCTION_CHAIN_ID,
    priceUsd: input.priceUsd,
    totalArlWei: total.toString(),
    legs,
    transactions: [...creates, approve, ...mints],
  };
}

/** The batch in the Safe{Wallet} Transaction Builder's import format. */
export function safeBatch(plan: PoolPlan, safe: string, createdAt: number) {
  const pairs = plan.legs.map((l) => `ARL/${l.quote}`).join(", ");
  return {
    version: "1.0",
    chainId: String(plan.chainId),
    createdAt,
    meta: {
      name: `ARL launch liquidity (Uniswap v3 1%: ${pairs})`,
      description: plan.transactions.map((t, i) => `${String(i + 1)}. ${t.description}`).join(" "),
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: getAddress(safe),
      createdFromOwnerAddress: "",
    },
    transactions: plan.transactions.map((t) => ({
      to: t.to,
      value: t.value,
      data: t.data,
      contractMethod: null,
      contractInputsValues: null,
    })),
  };
}
