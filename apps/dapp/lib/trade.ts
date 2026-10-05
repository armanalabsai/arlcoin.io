// Buying and selling ARL in the official Uniswap v3 pools on Base (docs/launch-route.md): ARL
// against USDC, USDT, WETH and cbBTC, 1% fee tier, opened by the Liquidity Safe at the TGE.
//
// Quotes come from Uniswap's QuoterV2 and swaps go through SwapRouter02, both deployed by Uniswap
// (developers.uniswap.org, v3 Base deployments). This module only builds calls and does the
// arithmetic; the page sends them from the user's own wallet. Nothing here holds funds.

import { encodeFunctionData, getAddress, isAddress, type Address, type Hex } from "viem";

export const BASE_CHAIN_ID = 8_453;

/** The approved TGE: trading in the official pools starts at the Base Mainnet deployment. */
export const TGE_DATE = "2026-11-01T00:00:00Z";

export const UNISWAP = {
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
  quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
} as const satisfies Record<string, Address>;

export const POOL_FEE = 10_000;

export const QUOTE_TOKENS = [
  { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
  { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
] as const satisfies readonly { symbol: string; address: Address; decimals: number }[];

export type QuoteSymbol = (typeof QUOTE_TOKENS)[number]["symbol"];
export type Side = "buy" | "sell";

export const ARL_DECIMALS = 18;

/** Default and largest accepted slippage, in basis points. */
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_SLIPPAGE_BPS = 1_000;

export class TradeError extends Error {
  override name = "TradeError";
}

/**
 * The ARL token on Base Mainnet, from NEXT_PUBLIC_ARL_MAINNET_TOKEN, set once the token is
 * deployed and verified. Null until then: the trade page stays closed.
 */
export function mainnetToken(value: string | undefined): Address | null {
  if (!value) return null;
  if (!isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value)) {
    throw new TradeError("NEXT_PUBLIC_ARL_MAINNET_TOKEN is not an address");
  }
  return getAddress(value);
}

/** Trading is open only once the token is set and the TGE has passed. */
export function tradingOpen(token: Address | null, nowMs: number): boolean {
  return token !== null && nowMs >= Date.parse(TGE_DATE);
}

export function quoteToken(symbol: QuoteSymbol) {
  const t = QUOTE_TOKENS.find((q) => q.symbol === symbol);
  if (!t) throw new TradeError(`unknown quote token ${symbol}`);
  return t;
}

/** Token in and out, with decimals, for one side of a trade. */
export function route(token: Address, symbol: QuoteSymbol, side: Side) {
  const q = quoteToken(symbol);
  const arl = { symbol: "ARL", address: token, decimals: ARL_DECIMALS };
  return side === "buy" ? { tokenIn: q, tokenOut: arl } : { tokenIn: arl, tokenOut: q };
}

/** The least the user accepts: the quote less the slippage tolerance, rounded down. */
export function minimumOut(quoted: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new TradeError(`slippage must be 0 to ${String(MAX_SLIPPAGE_BPS / 100)}%`);
  }
  if (quoted <= 0n) throw new TradeError("no quote");
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

export const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const routerAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** Arguments for QuoterV2.quoteExactInputSingle, read with eth_call. */
export function quoteArgs(tokenIn: Address, tokenOut: Address, amountIn: bigint) {
  if (amountIn <= 0n) throw new TradeError("amount must be positive");
  return [{ tokenIn, tokenOut, amountIn, fee: POOL_FEE, sqrtPriceLimitX96: 0n }] as const;
}

/** The swap call: exact input, the user's own address as recipient, a minimum out. */
export function swapCall(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  amountOutMinimum: bigint,
  recipient: Address,
): { to: Address; data: Hex } {
  if (amountIn <= 0n) throw new TradeError("amount must be positive");
  if (amountOutMinimum <= 0n) throw new TradeError("minimum out must be positive");
  return {
    to: UNISWAP.swapRouter02,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee: POOL_FEE,
          recipient: getAddress(recipient),
          amountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    }),
  };
}

/** USD-free price of one ARL in the quote token, for display: quote per ARL. */
export function pricePerArl(
  side: Side,
  amountIn: bigint,
  amountOut: bigint,
  quoteDecimals: number,
): number {
  const [arl, quote] = side === "buy" ? [amountOut, amountIn] : [amountIn, amountOut];
  if (arl === 0n) return 0;
  return Number(quote) / 10 ** quoteDecimals / (Number(arl) / 10 ** ARL_DECIMALS);
}
