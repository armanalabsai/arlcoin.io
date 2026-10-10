// The rules of the testnet operator (app/api/operator): what each request must look like and when
// it may be served. Pure functions, shared by the server and the tests. On Base Sepolia the
// operator does what development accounts do on the local chain: it runs the testnet ARL faucet,
// adds members to the demo poll group, relays anonymous votes (so the voter's wallet is not the
// sender) and settles x402 `upto` payments to its demo service. It never holds user funds.

import { SNARK_FIELD } from "@arl/zk";
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

import { POLL } from "./poll.ts";

export class OperatorRequestError extends Error {
  override name = "OperatorRequestError";
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const fail = (message: string, status = 400): never => {
  throw new OperatorRequestError(message, status);
};

export const OPERATOR_ACTIONS = ["status", "faucet", "join", "relay", "settle"] as const;
export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];

/** Largest request body accepted (a proof is about 15 KB of hex). */
export const MAX_BODY_BYTES = 64 * 1024;

/** Testnet ARL per faucet request, and the balance below which an account may ask. */
export const FAUCET_AMOUNT = 1_000n * 10n ** 18n;
/** One faucet payment per account per day (Base blocks are 2 s apart). */
export const FAUCET_WINDOW_BLOCKS = 43_200n;

function record(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    fail("body must be a JSON object");
  return body as Record<string, unknown>;
}

function address(value: unknown, what: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value))
    fail(`${what} must be an address`);
  return getAddress(value as string);
}

function uint(value: unknown, what: string, max: bigint): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value))
    fail(`${what} must be a decimal integer`);
  const n = BigInt(value as string);
  if (n > max) fail(`${what} is out of range`);
  return n;
}

const fieldElement = (value: unknown, what: string): bigint => {
  const n = uint(value, what, SNARK_FIELD - 1n);
  if (n === 0n) fail(`${what} must not be zero`);
  return n;
};

export function parseFaucet(body: unknown): { account: Address } {
  return { account: address(record(body).account, "account") };
}

/** Whether `account` may receive a faucet payment now. */
export function faucetDecision(args: {
  balance: bigint;
  paidRecently: boolean;
  operatorBalance: bigint;
}): { ok: true } | { ok: false; reason: string } {
  if (args.balance >= FAUCET_AMOUNT)
    return { ok: false, reason: "this account already holds 1,000 testnet ARL or more" };
  if (args.paidRecently)
    return { ok: false, reason: "this account was paid by the faucet in the last 24 hours" };
  if (args.operatorBalance < FAUCET_AMOUNT)
    return { ok: false, reason: "the faucet is empty; try again later" };
  return { ok: true };
}

/** The message a wallet signs to ask the operator to add its commitment to the demo group. */
export function joinMessage(commitment: bigint, chainId: number): string {
  return `Add my ARL anonymous identity commitment ${commitment.toString()} to the demo poll group on chain ${String(chainId)}.`;
}

export function parseJoin(body: unknown): { account: Address; commitment: bigint; signature: Hex } {
  const b = record(body);
  const signature = b.signature;
  if (
    typeof signature !== "string" ||
    !isHex(signature) ||
    signature.length < 132 ||
    signature.length > 4096
  )
    fail("signature must be a hex signature");
  return {
    account: address(b.account, "account"),
    commitment: fieldElement(b.commitment, "commitment"),
    signature: signature as Hex,
  };
}

export interface RelayRequest {
  scope: bigint;
  message: bigint;
  root: bigint;
  nullifier: bigint;
  proof: Hex;
}

/** A vote in the demo poll: only the poll's scope and options are relayed. */
export function parseRelay(body: unknown): RelayRequest {
  const b = record(body);
  const scope = uint(b.scope, "scope", SNARK_FIELD);
  if (scope !== POLL.scope) fail("only the demo poll is relayed");
  const message = uint(b.message, "message", BigInt(POLL.options.length));
  if (message === 0n) fail("message must be a poll option");
  const proof = b.proof;
  if (typeof proof !== "string" || !isHex(proof) || proof.length < 66 || proof.length > 40_000)
    fail("proof must be hex");
  return {
    scope,
    message,
    root: fieldElement(b.root, "root"),
    nullifier: fieldElement(b.nullifier, "nullifier"),
    proof: proof as Hex,
  };
}

export interface SettleRequest {
  payload: {
    x402Version: number;
    accepted: Record<string, unknown>;
    payload: Record<string, unknown>;
  };
  /** The signed terms, with the ceiling as `amount` (verification checks the signature against it). */
  requirements: Record<string, unknown> & { amount: string };
  /** The metered charge to settle, at most the ceiling. */
  amount: bigint;
}

/**
 * A settlement for the operator's demo service: the requirements must pay the operator, in ARL,
 * on this network, under the `upto` scheme; `amount` (the metered charge) at most the ceiling.
 */
export function parseSettle(
  body: unknown,
  expect: { payTo: Address; asset: Address; network: string },
): SettleRequest {
  const b = record(body);
  const payload = record(b.payload);
  const requirements = record(b.requirements);
  if (payload.x402Version !== 2) fail("x402Version must be 2");
  record(payload.accepted);
  record(payload.payload);
  if (requirements.scheme !== "upto") fail("scheme must be upto");
  if (requirements.network !== expect.network) fail("wrong network");
  if (address(requirements.payTo, "payTo") !== expect.payTo)
    fail("the operator settles only its own service", 403);
  if (address(requirements.asset, "asset") !== expect.asset) fail("asset must be ARL");
  const ceiling = uint(requirements.amount, "ceiling", 10n ** 30n);
  const amount = uint(b.amount, "amount", ceiling);
  return {
    payload: payload as SettleRequest["payload"],
    requirements: { ...requirements, amount: ceiling.toString() } as SettleRequest["requirements"],
    amount,
  };
}
