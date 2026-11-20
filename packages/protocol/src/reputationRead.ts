// arl-reputation/1 read path (spec/arl-reputation/v0.1.0, "Read path"): turns what the chain
// recorded into the outcomes `reputationScore` takes. Pure: the caller reads the logs and jobs.
//
// Completed and rejected outcomes come only from the feedback the deployed verified evaluators
// wrote to the ERC-8004 ReputationRegistry (tag "arl-verified", value 100 or 0). Each record is
// joined to its job through the evaluator's Finalized event with the same vote hash. Expired
// outcomes are jobs the agent took (CommitteeApproved with the agent bound) that were refunded
// after their deadline without a committee failure. Anything that does not join is left out and
// reported, never guessed.

import type { Outcome } from "./reputation.ts";

export const FEEDBACK_TAG = "arl-verified";

type Address = `0x${string}`;
type Hex = `0x${string}`;

/** A NewFeedback event of the ReputationRegistry. */
export interface FeedbackRecord {
  /** The evaluator that wrote it (the event's clientAddress). */
  evaluator: Address;
  agentId: bigint;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  feedbackHash: Hex;
  /** Unix seconds of the block. */
  timestamp: number;
  revoked?: boolean;
}

/** Events of one verified evaluator, for the jobs that matter. */
export interface EvaluatorLogs {
  evaluator: Address;
  /** The ARLJobs escrow this evaluator settles. */
  escrow: Address;
  token: Outcome["token"];
  configured: { jobId: bigint; providerAgentId: bigint }[];
  committeeApproved: bigint[];
  /** Jobs whose agent could not be bound at approval (FeedbackFailed before any vote). */
  unbound: bigint[];
  finalized: { jobId: bigint; voteHash: Hex }[];
  disputed: bigint[];
  failed: bigint[];
}

export interface JobRecord {
  escrow: Address;
  jobId: bigint;
  client: Address;
  budget: bigint;
  /** ARLJobs status name. */
  status: string;
  /** Unix seconds of the JobExpired event, when the job was refunded after its deadline. */
  expiredAt?: number;
}

export interface ReadResult {
  outcomes: Outcome[];
  /** Records that could not be joined, with the reason. */
  skipped: { what: string; reason: string }[];
}

const key = (escrow: string, jobId: bigint) => `${escrow.toLowerCase()}:${jobId.toString()}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function outcomesFromChain(
  agentId: bigint,
  feedback: readonly FeedbackRecord[],
  evaluators: readonly EvaluatorLogs[],
  jobs: readonly JobRecord[],
): ReadResult {
  const jobByKey = new Map(jobs.map((j) => [key(j.escrow, j.jobId), j]));
  const outcomes: Outcome[] = [];
  const skipped: ReadResult["skipped"] = [];
  const counted = new Set<string>();

  for (const f of feedback) {
    const what = `feedback ${f.feedbackHash} from ${f.evaluator}`;
    if (f.agentId !== agentId || f.tag1 !== FEEDBACK_TAG || f.revoked) continue;
    const ev = evaluators.find((e) => same(e.evaluator, f.evaluator));
    if (!ev) continue; // only the deployed evaluators are allowed clients
    if (f.valueDecimals !== 0 || (f.value !== 100n && f.value !== 0n)) {
      skipped.push({ what, reason: "value is not 100 or 0" });
      continue;
    }
    const fin = ev.finalized.filter(
      (x) => x.voteHash.toLowerCase() === f.feedbackHash.toLowerCase(),
    );
    const jobIds = [...new Set(fin.map((x) => x.jobId))];
    if (jobIds.length !== 1) {
      skipped.push({
        what,
        reason: `${String(jobIds.length)} finalized jobs carry this vote hash`,
      });
      continue;
    }
    const jobId = jobIds[0] as bigint;
    const conf = ev.configured.find((c) => c.jobId === jobId);
    if (!conf || conf.providerAgentId !== agentId) {
      skipped.push({ what, reason: `job ${jobId.toString()} is not configured for this agent` });
      continue;
    }
    const job = jobByKey.get(key(ev.escrow, jobId));
    if (!job) {
      skipped.push({ what, reason: `job ${jobId.toString()} was not read` });
      continue;
    }
    const k = key(ev.escrow, jobId);
    if (counted.has(k)) {
      skipped.push({ what, reason: `job ${jobId.toString()} already counted` });
      continue;
    }
    counted.add(k);
    outcomes.push({
      job: `${ev.escrow}:${jobId.toString()}`,
      client: job.client,
      token: ev.token,
      budget: job.budget.toString(),
      outcome: f.value === 100n ? "completed" : "rejected",
      final_at: f.timestamp,
      disputed: ev.disputed.includes(jobId),
    });
  }

  for (const ev of evaluators) {
    for (const c of ev.configured) {
      if (c.providerAgentId !== agentId) continue;
      const k = key(ev.escrow, c.jobId);
      if (counted.has(k)) continue;
      if (!ev.committeeApproved.includes(c.jobId) || ev.unbound.includes(c.jobId)) continue;
      if (ev.failed.includes(c.jobId)) continue; // the committee did not decide: excluded
      const job = jobByKey.get(k);
      if (!job || job.status !== "Expired") continue;
      if (job.expiredAt === undefined) {
        skipped.push({
          what: `job ${c.jobId.toString()}`,
          reason: "expired without a JobExpired time",
        });
        continue;
      }
      counted.add(k);
      outcomes.push({
        job: `${ev.escrow}:${c.jobId.toString()}`,
        client: job.client,
        token: ev.token,
        budget: job.budget.toString(),
        outcome: "expired",
        final_at: job.expiredAt,
        disputed: ev.disputed.includes(c.jobId),
      });
    }
  }

  outcomes.sort((a, b) => a.final_at - b.final_at || a.job.localeCompare(b.job));
  return { outcomes, skipped };
}
