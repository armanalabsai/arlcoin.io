// ARL's settlement policy, applied before the x402 SDK is asked to settle.
//
// The x402 SDK and the upto proxy already enforce: amount <= signed ceiling, signature, payee,
// asset, deadline, nonce and facilitator binding. This layer adds what they leave to the operator:
//
// 1. One settlement per authorization. An authorization (payer + Permit2 nonce) that was
//    settled, or retired, is never settled again, even if the chain would still accept it.
// 2. Zero settlements retire the authorization. The SDK answers a zero settlement with success
//    and no transaction, so the Permit2 nonce stays unused and the signed ceiling stays spendable
//    until its deadline. ARL records it as retired and never settles it later.
// 3. Short windows. Authorizations whose deadline is more than MAX_AUTHORIZATION_SECONDS away,
//    or already past, are refused.

import { getAddress } from "viem";

import { MAX_AUTHORIZATION_SECONDS } from "./requirements.ts";

export interface Permit2Authorization {
  from: string;
  spender: string;
  nonce: string;
  deadline: string;
  permitted: { token: string; amount: string };
  witness: { to: string; facilitator: string; validAfter: string };
}

/**
 * `settling`: claimed, settlement in progress. `settled`: paid on-chain. `retired`: settled for
 * zero, never to be used. `failed`: the settlement attempt failed; the authorization is not
 * retried, the payer signs a new one.
 */
export type AuthorizationState = "settling" | "settled" | "retired" | "failed";

/** Durable record of authorizations already used. Must be shared by every facilitator instance. */
export interface AuthorizationStore {
  get(key: string): Promise<AuthorizationState | undefined>;
  /** Records the first state; must fail if the key already has one (compare-and-set). */
  claim(key: string, state: AuthorizationState): Promise<void>;
  /** Moves a claimed key from `settling` to its final state. */
  finish(key: string, state: Exclude<AuthorizationState, "settling">): Promise<void>;
}

export class InMemoryAuthorizationStore implements AuthorizationStore {
  readonly #records = new Map<string, AuthorizationState>();

  get(key: string): Promise<AuthorizationState | undefined> {
    return Promise.resolve(this.#records.get(key));
  }

  claim(key: string, state: AuthorizationState): Promise<void> {
    if (this.#records.has(key)) {
      return Promise.reject(
        new Error(`authorization ${key} already ${String(this.#records.get(key))}`),
      );
    }
    this.#records.set(key, state);
    return Promise.resolve();
  }

  finish(key: string, state: Exclude<AuthorizationState, "settling">): Promise<void> {
    if (this.#records.get(key) !== "settling") {
      return Promise.reject(new Error(`authorization ${key} is not being settled`));
    }
    this.#records.set(key, state);
    return Promise.resolve();
  }
}

export function authorizationKey(chainId: number, auth: Permit2Authorization): string {
  return `${String(chainId)}:${getAddress(auth.from)}:${BigInt(auth.nonce).toString()}`;
}

/** Extracts and shape-checks the Permit2 authorization from an x402 upto payload. */
export function readAuthorization(payload: Record<string, unknown>): Permit2Authorization {
  const a = payload.permit2Authorization as Partial<Permit2Authorization> | undefined;
  if (
    !a ||
    typeof a.from !== "string" ||
    typeof a.spender !== "string" ||
    typeof a.nonce !== "string" ||
    typeof a.deadline !== "string" ||
    typeof a.permitted?.token !== "string" ||
    typeof a.permitted.amount !== "string" ||
    typeof a.witness?.to !== "string" ||
    typeof a.witness.facilitator !== "string" ||
    typeof a.witness.validAfter !== "string"
  ) {
    throw new Error("payload is not an upto Permit2 authorization");
  }
  return a as Permit2Authorization;
}

export type Decision =
  | { action: "settle"; key: string; amount: bigint }
  | { action: "retire"; key: string }
  | { action: "refuse"; reason: string };

export async function decideSettlement(args: {
  chainId: number;
  auth: Permit2Authorization;
  amount: bigint;
  nowSeconds: number;
  store: AuthorizationStore;
}): Promise<Decision> {
  const { chainId, auth, amount, nowSeconds, store } = args;
  const key = authorizationKey(chainId, auth);
  const state = await store.get(key);
  if (state) return { action: "refuse", reason: `authorization already ${state}` };
  if (amount < 0n) return { action: "refuse", reason: "negative amount" };
  if (amount > BigInt(auth.permitted.amount)) {
    return { action: "refuse", reason: "amount exceeds the signed ceiling" };
  }
  const deadline = BigInt(auth.deadline);
  const now = BigInt(nowSeconds);
  if (deadline <= now) return { action: "refuse", reason: "authorization expired" };
  if (deadline - now > BigInt(MAX_AUTHORIZATION_SECONDS)) {
    return { action: "refuse", reason: "authorization window too long" };
  }
  if (amount === 0n) return { action: "retire", key };
  return { action: "settle", key, amount };
}
