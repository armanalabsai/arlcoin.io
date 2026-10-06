// ARL usage-based payments over x402 `upto` (Permit2), for the app's local demo.
//
// The payer signs a ceiling. The service meters usage and its facilitator settles the metered
// amount, never more than the ceiling, through the canonical x402UptoPermit2Proxy. The proxy and
// Permit2 enforce the ceiling, payee, facilitator, token, nonce and deadline on-chain.

import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getAddress, isAddress } from "viem";
import type { Address } from "viem";

import { LOCAL_CHAIN_ID } from "./network.ts";

export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
export const UPTO_PROXY = "0x4020A4f3b7b90ccA423B9fabCc0CE57C6C240002" as const;

/**
 * Local demo roles (Anvil development accounts, unlocked by the local node; no keys):
 * the service that is paid, and the facilitator that settles for it.
 */
export const DEMO_SERVICE: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
export const DEMO_FACILITATOR: Address = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
/** Demo price: 0.001 ARL per unit of usage (for example per 1,000 model tokens). */
export const DEMO_UNIT_PRICE = 10n ** 15n;

export const MIN_WINDOW_SECONDS = 30;
export const MAX_WINDOW_SECONDS = 600;

export function uptoRequirements(args: {
  chainId: number;
  arl: Address;
  ceiling: bigint;
  payTo: Address;
  facilitator: Address;
  windowSeconds: number;
}): PaymentRequirements {
  const { chainId, arl, ceiling, payTo, facilitator, windowSeconds } = args;
  if (chainId !== LOCAL_CHAIN_ID) throw new Error("the payments demo runs on the local chain only");
  if (ceiling <= 0n) throw new Error("the ceiling must be above zero");
  if (
    !Number.isInteger(windowSeconds) ||
    windowSeconds < MIN_WINDOW_SECONDS ||
    windowSeconds > MAX_WINDOW_SECONDS
  ) {
    throw new Error(
      `the window must be ${String(MIN_WINDOW_SECONDS)}–${String(MAX_WINDOW_SECONDS)} seconds`,
    );
  }
  for (const a of [arl, payTo, facilitator])
    if (!isAddress(a)) throw new Error(`not an address: ${a}`);
  return {
    scheme: "upto",
    network: `eip155:${String(chainId)}`,
    asset: getAddress(arl),
    amount: ceiling.toString(),
    payTo: getAddress(payTo),
    maxTimeoutSeconds: windowSeconds,
    extra: { facilitatorAddress: getAddress(facilitator) },
  };
}

/** Amount to settle for `units` of usage: price × units, capped at the signed ceiling. */
export function meter(
  unitPrice: bigint,
  units: bigint,
  ceiling: bigint,
): { amount: bigint; capped: boolean } {
  if (unitPrice < 0n || units < 0n) throw new Error("price and units must not be negative");
  const cost = unitPrice * units;
  return cost > ceiling ? { amount: ceiling, capped: true } : { amount: cost, capped: false };
}

/** Permit2 unordered nonce → the (word, bit mask) pair that `invalidateUnorderedNonces` takes. */
export function nonceBitmap(nonce: bigint): { wordPos: bigint; mask: bigint } {
  return { wordPos: nonce >> 8n, mask: 1n << (nonce & 0xffn) };
}

export const permit2Abi = [
  {
    type: "function",
    name: "invalidateUnorderedNonces",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wordPos", type: "uint256" },
      { name: "mask", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "nonceBitmap",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "wordPos", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** An authorization as the payer signed it (x402 upto payload). */
export interface SignedCeiling {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
  nonce: bigint;
  deadline: bigint;
  ceiling: bigint;
}
