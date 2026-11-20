// Opening a verified job from the app: the checks the evaluator and the reference validators apply,
// run before any transaction, and the hashes the evaluator and the validators compare.

import { getAddress, isAddress, keccak256, stringToBytes, type Address, type Hex } from "viem";

/** The validators the ARL operator runs on Base Mainnet (stake on the current evaluator). */
export const OPERATOR_VALIDATORS: readonly Address[] = [
  "0x7E8e18bf48F07B82F64b846b0d509ad79FD86244",
  "0x394846C9E1161A07471F9e8baEda77E4AEa85fa1",
  "0xdAa1EFD5E765Baf67D8013C1c67039945819B760",
];

/** Tier.Reexecution in ARLVerifiedEvaluator. */
export const REEXECUTION = 1;

/** The evaluator's vote window bounds (MIN_VOTE_WINDOW, MAX_VOTE_WINDOW). */
export const MIN_VOTE_WINDOW = 10n * 60n;
export const MAX_VOTE_WINDOW = 7n * 24n * 60n * 60n;
/** The reference validator refuses vote windows shorter than this by default. */
export const VALIDATOR_MIN_VOTE_WINDOW = 60n * 60n;
/** The reference validator refuses deadlines further away than this by default. */
export const VALIDATOR_MAX_DEADLINE = 30n * 24n * 60n * 60n;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Canonical JSON (the RFC 8785 subset of arl-reexec/1): keys sorted by UTF-16 code units, no
 * whitespace, integers only. The same rules as packages/verifier/src/canonical.ts.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`not a safe integer: ${String(value)}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) {
      throw new Error("only plain objects can be canonicalized");
    }
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new Error(`cannot canonicalize a ${typeof value}`);
}

/** keccak256 of the canonical JSON: the specHash of a spec, the deliverable of a result. */
export function canonicalHash(value: unknown): Hex {
  return keccak256(stringToBytes(canonicalize(value)));
}

/** The specHash of an arl-reexec/1 spec given as JSON text. */
export function specHashOf(text: string): Hex {
  const spec = JSON.parse(text) as { version?: unknown };
  if (spec === null || typeof spec !== "object" || spec.version !== "arl-reexec/1") {
    throw new Error('The spec is not an arl-reexec/1 document (version "arl-reexec/1")');
  }
  return canonicalHash(spec);
}

/** The deliverable of an arl-reexec-result/1 result given as JSON text. */
export function deliverableOf(text: string): Hex {
  const result = JSON.parse(text) as { version?: unknown };
  if (result === null || typeof result !== "object" || result.version !== "arl-reexec-result/1") {
    throw new Error("The result is not an arl-reexec-result/1 document");
  }
  return canonicalHash(result);
}

export interface OpenInput {
  client: Address;
  arbiter: Address;
  specUrl: string;
  provider: string;
  committee: string;
  threshold: number;
  budget: bigint;
  bond: bigint;
  minBond: bigint;
  voteWindow: bigint;
  challengeWindow: bigint;
  minChallengeWindow: bigint;
  deadlineSeconds: bigint;
}

export interface OpenPlan {
  specUrl: string;
  provider: Address;
  committee: Address[];
  threshold: number;
  budget: bigint;
  bond: bigint;
  voteWindow: bigint;
  challengeWindow: bigint;
  deadlineSeconds: bigint;
}

export type Checked = { ok: true; plan: OpenPlan } | { ok: false; error: string };

/** Parses a committee written one address per line, or separated by commas or spaces. */
export function parseCommittee(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * The checks `configure` makes (ARLVerifiedEvaluator) and the default limits of the reference
 * validator (packages/verifier AcceptPolicy), so a job that would revert, or that no validator
 * would accept, is refused before the first transaction.
 */
export function checkOpen(i: OpenInput): Checked {
  const url = i.specUrl.trim();
  if (!/^https:\/\/\S+$/.test(url) && !/^ipfs:\/\/\S+$/.test(url)) {
    return { ok: false, error: "The spec link must start with https:// or ipfs://" };
  }
  if (!isAddress(i.provider.trim())) return { ok: false, error: "The provider is not an address" };
  const provider = getAddress(i.provider.trim());
  const client = getAddress(i.client);
  const arbiter = getAddress(i.arbiter);
  if (provider === client) return { ok: false, error: "The provider must be another wallet" };
  if (provider === arbiter) return { ok: false, error: "The arbiter cannot be the provider" };

  const raw = parseCommittee(i.committee);
  if (raw.length < 2 || raw.length > 7) {
    return { ok: false, error: "A re-execution committee has 2 to 7 members" };
  }
  const committee: Address[] = [];
  for (const m of raw) {
    if (!isAddress(m)) return { ok: false, error: `Committee member ${m} is not an address` };
    const a = getAddress(m);
    if (a === ZERO || a === client || a === provider || a === arbiter) {
      return {
        ok: false,
        error: "The client, the provider and the arbiter cannot sit on the committee",
      };
    }
    if (committee.includes(a)) return { ok: false, error: "A committee member is listed twice" };
    committee.push(a);
  }
  const n = committee.length;
  if (
    !Number.isInteger(i.threshold) ||
    i.threshold < 2 ||
    i.threshold > n ||
    2 * i.threshold <= n
  ) {
    return { ok: false, error: "The threshold must be a strict majority of the committee" };
  }

  if (i.bond < i.minBond) return { ok: false, error: "The bond is below the evaluator's minimum" };
  if (i.budget <= 0n) return { ok: false, error: "Enter a budget" };
  // ARL stakes and an ARL escrow: the reference validator accepts only budgets of at least the bond.
  if (i.budget < i.bond) {
    return {
      ok: false,
      error: "Validators accept a job only when the budget is at least the bond",
    };
  }

  if (i.voteWindow < MIN_VOTE_WINDOW || i.voteWindow > MAX_VOTE_WINDOW) {
    return { ok: false, error: "The vote window must be between 10 minutes and 7 days" };
  }
  if (i.voteWindow < VALIDATOR_MIN_VOTE_WINDOW) {
    return { ok: false, error: "Validators need a vote window of at least 1 hour" };
  }
  if (i.challengeWindow < i.minChallengeWindow) {
    return { ok: false, error: "The challenge window is below the evaluator's minimum" };
  }
  if (i.deadlineSeconds < i.voteWindow + 2n * i.challengeWindow) {
    return {
      ok: false,
      error: "The deadline must leave room for the vote and both challenge windows",
    };
  }
  if (i.deadlineSeconds > VALIDATOR_MAX_DEADLINE) {
    return {
      ok: false,
      error: "Validators lock a bond for at most 30 days: choose a nearer deadline",
    };
  }

  return {
    ok: true,
    plan: {
      specUrl: url,
      provider,
      committee,
      threshold: i.threshold,
      budget: i.budget,
      bond: i.bond,
      voteWindow: i.voteWindow,
      challengeWindow: i.challengeWindow,
      deadlineSeconds: i.deadlineSeconds,
    },
  };
}
