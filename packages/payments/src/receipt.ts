// Signed usage receipts for x402 `upto` calls.
//
// The ceiling bounds what a payer can lose, but the amount settled under it is the service's own
// metering. A usage receipt makes that metering a signed, checkable claim: for every call the
// service signs (EIP-712) the authorization it charges (payer, Permit2 nonce, ceiling, deadline),
// what it delivered (a hash of the resource and of the response bytes), the units it counted,
// the unit price and the amount. The facilitator settles only an amount that a valid receipt
// states, and the payer keeps the receipt and checks it against the response it received and the
// settlement on chain. A receipt does not prove the units were really used; it makes the claim
// attributable and the charge reproducible from units × price, so a wrong charge is evidence
// against the service rather than its word against the payer's.

import {
  getAddress,
  isAddress,
  isHex,
  keccak256,
  recoverTypedDataAddress,
  stringToBytes,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";

import { meter } from "./metering.ts";
import type { Permit2Authorization } from "./policy.ts";

export const RECEIPT_DOMAIN_NAME = "ARL Usage Receipt";
export const RECEIPT_DOMAIN_VERSION = "1";

export const USAGE_RECEIPT_TYPES = {
  UsageReceipt: [
    { name: "payer", type: "address" },
    { name: "payTo", type: "address" },
    { name: "token", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "ceiling", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "resource", type: "bytes32" },
    { name: "units", type: "uint256" },
    { name: "unitPrice", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "response", type: "bytes32" },
  ],
} as const;

export interface UsageReceipt {
  payer: Address;
  payTo: Address;
  token: Address;
  /** The Permit2 nonce of the authorization charged. */
  nonce: bigint;
  /** The ceiling the payer signed. */
  ceiling: bigint;
  /** The authorization's deadline. */
  deadline: bigint;
  /** keccak256 of the resource identifier (for example `job?seconds=60`). */
  resource: Hex;
  units: bigint;
  unitPrice: bigint;
  /** min(units × unitPrice, ceiling): the amount settled. */
  amount: bigint;
  /** keccak256 of the response bytes delivered to the payer. */
  response: Hex;
}

/** The wire form: integers as decimal strings. */
export type UsageReceiptJson = { [K in keyof UsageReceipt]: string };

export interface SignedUsageReceipt {
  receipt: UsageReceiptJson;
  signature: Hex;
}

export class ReceiptError extends Error {
  override name = "ReceiptError";
}

export function receiptDomain(chainId: number) {
  return { name: RECEIPT_DOMAIN_NAME, version: RECEIPT_DOMAIN_VERSION, chainId } as const;
}

/** keccak256 of a resource identifier, as stored in `resource`. */
export function resourceHash(resource: string): Hex {
  return keccak256(stringToBytes(resource));
}

/** The receipt for one call, from the authorization charged and what was measured. */
export function buildUsageReceipt(args: {
  auth: Permit2Authorization;
  resource: string;
  units: bigint;
  unitPrice: bigint;
  response: Uint8Array;
}): UsageReceipt {
  const ceiling = BigInt(args.auth.permitted.amount);
  const { amount } = meter({ unitPrice: args.unitPrice, units: args.units, ceiling });
  return {
    payer: getAddress(args.auth.from),
    payTo: getAddress(args.auth.witness.to),
    token: getAddress(args.auth.permitted.token),
    nonce: BigInt(args.auth.nonce),
    ceiling,
    deadline: BigInt(args.auth.deadline),
    resource: resourceHash(args.resource),
    units: args.units,
    unitPrice: args.unitPrice,
    amount,
    response: keccak256(args.response),
  };
}

export function receiptToJson(r: UsageReceipt): UsageReceiptJson {
  return {
    payer: r.payer,
    payTo: r.payTo,
    token: r.token,
    nonce: r.nonce.toString(),
    ceiling: r.ceiling.toString(),
    deadline: r.deadline.toString(),
    resource: r.resource,
    units: r.units.toString(),
    unitPrice: r.unitPrice.toString(),
    amount: r.amount.toString(),
    response: r.response,
  };
}

const UINT = /^(0|[1-9][0-9]{0,77})$/;

/** Parses and shape-checks an untrusted receipt. */
export function receiptFromJson(raw: unknown): UsageReceipt {
  if (typeof raw !== "object" || raw === null) throw new ReceiptError("receipt is not an object");
  const o = raw as Record<string, unknown>;
  const fields = USAGE_RECEIPT_TYPES.UsageReceipt.map((f) => f.name);
  for (const k of Object.keys(o)) {
    if (!(fields as readonly string[]).includes(k)) throw new ReceiptError(`unknown field ${k}`);
  }
  const addr = (k: string): Address => {
    const v = o[k];
    if (typeof v !== "string" || !isAddress(v)) throw new ReceiptError(`${k} is not an address`);
    return getAddress(v);
  };
  const uint = (k: string): bigint => {
    const v = o[k];
    if (typeof v !== "string" || !UINT.test(v)) throw new ReceiptError(`${k} is not a uint`);
    const n = BigInt(v);
    if (n >= 2n ** 256n) throw new ReceiptError(`${k} is not a uint256`);
    return n;
  };
  const b32 = (k: string): Hex => {
    const v = o[k];
    if (typeof v !== "string" || !isHex(v, { strict: true }) || v.length !== 66) {
      throw new ReceiptError(`${k} is not a bytes32`);
    }
    return v.toLowerCase() as Hex;
  };
  return {
    payer: addr("payer"),
    payTo: addr("payTo"),
    token: addr("token"),
    nonce: uint("nonce"),
    ceiling: uint("ceiling"),
    deadline: uint("deadline"),
    resource: b32("resource"),
    units: uint("units"),
    unitPrice: uint("unitPrice"),
    amount: uint("amount"),
    response: b32("response"),
  };
}

export async function signUsageReceipt(
  signer: LocalAccount,
  chainId: number,
  receipt: UsageReceipt,
): Promise<SignedUsageReceipt> {
  const signature = await signer.signTypedData({
    domain: receiptDomain(chainId),
    types: USAGE_RECEIPT_TYPES,
    primaryType: "UsageReceipt",
    message: receipt,
  });
  return { receipt: receiptToJson(receipt), signature };
}

/** The address that signed `signed`; throws on a malformed receipt or signature. */
export async function receiptSignerOf(
  chainId: number,
  signed: SignedUsageReceipt,
): Promise<Address> {
  if (!isHex(signed.signature, { strict: true })) throw new ReceiptError("signature is not hex");
  return recoverTypedDataAddress({
    domain: receiptDomain(chainId),
    types: USAGE_RECEIPT_TYPES,
    primaryType: "UsageReceipt",
    message: receiptFromJson(signed.receipt),
    signature: signed.signature,
  });
}

/**
 * Every reason `signed` does not back a settlement of `amount` under `auth` by `signer`; empty
 * when it does. With `response`, also checks that the receipt covers exactly those bytes. Used
 * by the facilitator before settling and by the payer after receiving the response.
 */
export async function checkUsageReceipt(args: {
  chainId: number;
  signed: unknown;
  signer: string;
  auth: Permit2Authorization;
  amount: bigint;
  response?: Uint8Array;
}): Promise<string[]> {
  const { chainId, auth } = args;
  const s = args.signed as Partial<SignedUsageReceipt> | undefined;
  let r: UsageReceipt;
  let by: Address;
  try {
    if (typeof s !== "object" || typeof s.signature !== "string") {
      throw new ReceiptError("no signed receipt");
    }
    r = receiptFromJson(s.receipt);
    by = await receiptSignerOf(chainId, {
      receipt: s.receipt as UsageReceiptJson,
      signature: s.signature,
    });
  } catch (error) {
    return [error instanceof Error ? error.message : "unreadable receipt"];
  }
  const problems: string[] = [];
  const same = (a: string, b: string) => getAddress(a) === getAddress(b);
  if (!same(by, args.signer)) problems.push("receipt not signed by the service's receipt signer");
  if (!same(r.payer, auth.from)) problems.push("receipt payer differs from the authorization");
  if (!same(r.payTo, auth.witness.to))
    problems.push("receipt payee differs from the authorization");
  if (!same(r.token, auth.permitted.token))
    problems.push("receipt token differs from the authorization");
  if (r.nonce !== BigInt(auth.nonce)) problems.push("receipt nonce differs from the authorization");
  if (r.ceiling !== BigInt(auth.permitted.amount))
    problems.push("receipt ceiling differs from the authorization");
  if (r.deadline !== BigInt(auth.deadline))
    problems.push("receipt deadline differs from the authorization");
  if (r.amount !== args.amount) problems.push("receipt amount differs from the amount settled");
  if (
    r.ceiling > 0n &&
    r.amount !== meter({ unitPrice: r.unitPrice, units: r.units, ceiling: r.ceiling }).amount
  ) {
    problems.push("receipt amount is not min(units × unitPrice, ceiling)");
  }
  if (args.response !== undefined && r.response !== keccak256(args.response)) {
    problems.push("receipt does not cover the response received");
  }
  return problems;
}
