// arl-reputation/1: an agent's score computed only from verified outcomes (spec/arl-reputation/
// v0.1.0). Inputs come from the chain: the evaluator's ERC-8004 feedback (tag "arl-verified",
// value 100 approved / 0 rejected) joined with the ARLJobs job (client, budget, token) and expiry
// refunds of funded jobs. Self-reported feedback is never an input: readers query the
// ReputationRegistry with the deployed evaluators as the only allowed clients.

export const REPUTATION_VERSION = "arl-reputation/1";

export type OutcomeKind = "completed" | "rejected" | "expired" | "failed";

export interface Outcome {
  /** "<escrow address>:<job id>", unique per job. */
  job: string;
  client: string;
  token: "ARL" | "USDC";
  /** Budget in base units, decimal string. */
  budget: string;
  outcome: OutcomeKind;
  /** Unix seconds when the outcome was final on chain. */
  final_at: number;
  /** Whether a dispute was raised (and ruled) on this job. */
  disputed: boolean;
}

export interface ScoreParams {
  /** Half-life of an outcome's weight, in seconds. */
  half_life_seconds: number;
  /** Highest share of total weight a single client may contribute (anti wash-trading). */
  max_client_share: number;
  /** Outcomes needed before a score is published. */
  min_outcomes: number;
  /** Distinct clients needed before a score is published. */
  min_clients: number;
}

export const DEFAULT_PARAMS: ScoreParams = {
  half_life_seconds: 180 * 24 * 3600,
  max_client_share: 0.25,
  min_outcomes: 3,
  min_clients: 2,
};

export interface Score {
  version: typeof REPUTATION_VERSION;
  /** 0–10000 basis points (100.00 %), or null when there is not enough history. */
  score_bps: number | null;
  outcomes: number;
  clients: number;
  completed: number;
  rejected: number;
  expired: number;
  disputed: number;
}

const DECIMALS = { ARL: 18, USDC: 6 } as const;

export class ReputationError extends Error {
  override name = "ReputationError";
}

/** Whole token units, dampened: 1 + log10(1 + units). Budgets in different tokens are not priced. */
function sizeWeight(token: Outcome["token"], budget: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(budget))
    throw new ReputationError("budget must be a decimal string");
  const units = Number(BigInt(budget) / 10n ** BigInt(DECIMALS[token]));
  return 1 + Math.log10(1 + units);
}

/**
 * Computes the score. Completed counts 100, rejected and expired (a funded job the provider did
 * not deliver) count 0; failed jobs (the committee did not decide) are not the provider's doing
 * and are excluded. Each outcome is weighted by budget size and recency; a client's total weight
 * is capped at `max_client_share` of the total, so one counterparty cannot buy a reputation.
 */
export function reputationScore(
  outcomes: Outcome[],
  now: number,
  params: ScoreParams = DEFAULT_PARAMS,
): Score {
  const seen = new Set<string>();
  const counted = outcomes.filter((o) => {
    if (seen.has(o.job)) throw new ReputationError(`duplicate outcome for ${o.job}`);
    seen.add(o.job);
    if (o.final_at > now) throw new ReputationError(`outcome in the future: ${o.job}`);
    return o.outcome !== "failed";
  });

  const byClient = new Map<string, { w: number; wv: number }>();
  for (const o of counted) {
    const age = now - o.final_at;
    const w = sizeWeight(o.token, o.budget) * Math.pow(0.5, age / params.half_life_seconds);
    const value = o.outcome === "completed" ? 1 : 0;
    const key = o.client.toLowerCase();
    const c = byClient.get(key) ?? { w: 0, wv: 0 };
    c.w += w;
    c.wv += w * value;
    byClient.set(key, c);
  }

  const total = [...byClient.values()].reduce((s, c) => s + c.w, 0);
  const share = params.max_client_share;
  let w = 0;
  let wv = 0;
  for (const c of byClient.values()) {
    // Scale a dominant client down so its weight is at most `share` of the result, measured
    // against everyone else's weight, keeping its own success ratio.
    const cap = (share / (1 - share)) * (total - c.w);
    const f = byClient.size > 1 && c.w > cap ? cap / c.w : 1;
    w += c.w * f;
    wv += c.wv * f;
  }

  const enough = counted.length >= params.min_outcomes && byClient.size >= params.min_clients;
  return {
    version: REPUTATION_VERSION,
    score_bps: enough && w > 0 ? Math.round((wv / w) * 10_000) : null,
    outcomes: counted.length,
    clients: byClient.size,
    completed: counted.filter((o) => o.outcome === "completed").length,
    rejected: counted.filter((o) => o.outcome === "rejected").length,
    expired: counted.filter((o) => o.outcome === "expired").length,
    disputed: counted.filter((o) => o.disputed).length,
  };
}
