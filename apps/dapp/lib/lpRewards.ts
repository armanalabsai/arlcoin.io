// Liquidity rewards for the official ARL/USDT pool (Uniswap v3, 1% fee tier) on Base Mainnet.
//
// The programme runs on Uniswap's own staker contract (UniswapV3Staker, deployed by Uniswap on
// Base): a liquidity provider deposits a Uniswap v3 position there and earns ARL for every second
// the position is in range, pro rata to its share of the pool's in-range liquidity. Rewards come
// from the Community & Staking Safe, never from new issuance, and what is not earned returns to
// that Safe after the end. This module only names the programme and builds calls; the page sends
// them from the user's own wallet. Nothing here holds funds.

import { encodeAbiParameters, encodeFunctionData, type Address, type Hex } from "viem";

export const BASE_CHAIN_ID = 8_453;

export const ARL: Address = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4";
export const USDT: Address = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
export const POOL: Address = "0x4A5579fa8aE69c6a1bC1Ad716cfa0fa80c7D5273";
export const POOL_FEE = 10_000;
/** Uniswap v3 NonfungiblePositionManager on Base. */
export const POSITIONS: Address = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
/** UniswapV3Staker on Base; its factory and position manager are the two above. */
export const STAKER: Address = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";

/** The programme, exactly as created by the Community & Staking Safe. */
export const PROGRAMME = {
  rewardToken: ARL,
  pool: POOL,
  /** 2026-11-21 12:00 UTC */
  startTime: 1_795_262_400n,
  /** 2026-12-21 12:00 UTC */
  endTime: 1_797_854_400n,
  refundee: "0xfF12597A671ebAF0cAe37999EE659e03c4f444B5",
} as const satisfies {
  rewardToken: Address;
  pool: Address;
  startTime: bigint;
  endTime: bigint;
  refundee: Address;
};

export const PROGRAMME_ID: Hex =
  "0xdd218756e54db53e56add6833cc0f2a296ab71ec6f0fbb3e8b6341f956a4f3d8";

export const PROGRAMME_REWARD = 60_000n * 10n ** 18n;

const KEY = {
  type: "tuple",
  components: [
    { name: "rewardToken", type: "address" },
    { name: "pool", type: "address" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "refundee", type: "address" },
  ],
} as const;

export const STAKER_ABI = [
  {
    type: "function",
    name: "incentives",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "totalRewardUnclaimed", type: "uint256" },
      { name: "totalSecondsClaimedX128", type: "uint160" },
      { name: "numberOfStakes", type: "uint96" },
    ],
  },
  {
    type: "function",
    name: "deposits",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "numberOfStakes", type: "uint48" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
    ],
  },
  {
    type: "function",
    name: "getRewardInfo",
    stateMutability: "view",
    inputs: [
      { ...KEY, name: "key" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [
      { name: "reward", type: "uint256" },
      { name: "secondsInsideX128", type: "uint160" },
    ],
  },
  {
    type: "function",
    name: "rewards",
    stateMutability: "view",
    inputs: [
      { name: "rewardToken", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "unstakeToken",
    stateMutability: "nonpayable",
    inputs: [
      { ...KEY, name: "key" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimReward",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rewardToken", type: "address" },
      { name: "to", type: "address" },
      { name: "amountRequested", type: "uint256" },
    ],
    outputs: [{ name: "reward", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdrawToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

export const POSITIONS_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

/** The data sent with the position: the staker stakes it in this programme on receipt. */
export function stakeData(): Hex {
  return encodeAbiParameters([KEY], [PROGRAMME]);
}

/** One transaction that ends the stake, pays the ARL earned and returns the position. */
export function exitCalls(tokenId: bigint, owner: Address): Hex[] {
  return [
    encodeFunctionData({
      abi: STAKER_ABI,
      functionName: "unstakeToken",
      args: [PROGRAMME, tokenId],
    }),
    encodeFunctionData({ abi: STAKER_ABI, functionName: "claimReward", args: [ARL, owner, 0n] }),
    encodeFunctionData({
      abi: STAKER_ABI,
      functionName: "withdrawToken",
      args: [tokenId, owner, "0x"],
    }),
  ];
}

export type ProgrammeState = "before" | "running" | "ended";

export function programmeState(now: bigint): ProgrammeState {
  if (now < PROGRAMME.startTime) return "before";
  return now < PROGRAMME.endTime ? "running" : "ended";
}

/** Whether a position belongs to the ARL/USDT 1% pool (token order is by address). */
export function isPoolPosition(token0: Address, token1: Address, fee: number): boolean {
  const a = token0.toLowerCase();
  const b = token1.toLowerCase();
  return (
    fee === POOL_FEE &&
    ((a === ARL.toLowerCase() && b === USDT.toLowerCase()) ||
      (a === USDT.toLowerCase() && b === ARL.toLowerCase()))
  );
}

/** Whether the pool's current tick is inside the position's range: only then it earns. */
export function inRange(tick: number, tickLower: number, tickUpper: number): boolean {
  return tick >= tickLower && tick < tickUpper;
}

/** Parses a position id typed by the user; undefined unless it is a positive whole number. */
export function parseTokenId(text: string): bigint | undefined {
  const t = text.trim();
  if (!/^[0-9]{1,30}$/.test(t)) return undefined;
  const id = BigInt(t);
  return id > 0n ? id : undefined;
}
