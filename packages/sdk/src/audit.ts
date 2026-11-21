// The audit trail of one verified job: every event the escrow and the evaluator emitted for it, in
// order, with who acted, when, in which transaction and with which hashes. It answers the question
// an auditor asks about work an AI agent was paid for: who approved it, when, and on what evidence.
//
// Nothing here is interpreted beyond naming the step: each entry is one on-chain event, and the
// block the trail was read at is part of the answer, so anyone can re-read it.

import { getAddress, isAddressEqual, type Address, type Hex } from "viem";

import {
  HISTORY_START,
  VERIFIED_EVALUATORS,
  blockTime,
  readProtocolLogs,
  type HistoryOptions,
} from "./agentScore.ts";
import { entryOf, publicClientOf, type ReadClient } from "./client.ts";

/** What each event means, in the words of the flow (spec/x402-arl-escrow). */
const STEPS: Record<string, string> = {
  JobCreated: "The client opened the job",
  ProviderSet: "The provider was set",
  BudgetSet: "The budget was set",
  JobFunded: "The client funded the escrow",
  Configured: "The client configured the verification (committee, threshold, windows, bond, spec)",
  CommitteeApproved: "The provider approved the committee",
  Accepted: "A committee member accepted the job and locked its bond",
  JobSubmitted: "The provider submitted the deliverable",
  VotingStarted: "The vote window opened",
  Voted: "A committee member voted",
  Decided: "The committee reached a verdict; the challenge window opened",
  Disputed: "The verdict was disputed",
  Resolved: "The arbiter ruled on the dispute",
  DisputeExpired: "The arbiter did not rule in time; the verdict stood",
  Slashed: "A bond was slashed",
  Failed: "The committee did not decide; the job failed",
  Finalized: "The verdict was finalized",
  JobCompleted: "The escrow marked the job completed",
  PaymentReleased: "The escrow paid the provider",
  JobRejected: "The escrow marked the job rejected",
  Refunded: "The escrow refunded the client",
  RefundDeferred: "The refund could not be sent and waits for the client to claim it",
  JobExpired: "The job expired",
  Released: "The bonds were released",
  FeedbackFailed: "The outcome could not be written to the reputation registry",
};

/** The argument that names who acted, per event. */
const ACTOR: Record<string, string> = {
  JobCreated: "client",
  JobFunded: "client",
  ProviderSet: "provider",
  CommitteeApproved: "provider",
  JobSubmitted: "provider",
  Accepted: "validator",
  Voted: "validator",
  Disputed: "challenger",
  Slashed: "account",
  JobCompleted: "evaluator",
  JobRejected: "rejector",
};

export type AuditValue = string | boolean | number | string[];

export interface AuditEntry {
  /** What happened, in one sentence. */
  step: string;
  /** The on-chain event's name. */
  event: string;
  contract: "escrow" | "evaluator";
  block: bigint;
  /** Unix seconds of the block. */
  at: number;
  transaction: Hex;
  logIndex: number;
  /** Who acted, where the event names them. */
  actor?: Address;
  /** The event's other values: amounts in base units, hashes as emitted. */
  detail: Record<string, AuditValue>;
}

export interface JobAudit {
  token: "ARL" | "USDC";
  escrow: Address;
  evaluator: Address;
  jobId: bigint;
  /** The block the trail was read at. */
  block: bigint;
  entries: AuditEntry[];
}

const plain = (v: unknown): AuditValue =>
  typeof v === "bigint"
    ? v.toString()
    : Array.isArray(v)
      ? v.map((x) => String(x))
      : typeof v === "boolean" || typeof v === "number"
        ? v
        : String(v);

/** Reads the audit trail of a job on the ARL or the USDC escrow of the verified evaluators. */
export async function getJobAudit(
  c: ReadClient,
  token: "ARL" | "USDC" | Address,
  jobId: bigint,
  opts: HistoryOptions = {},
): Promise<JobAudit> {
  const client = publicClientOf(c);
  const deployment = entryOf(VERIFIED_EVALUATORS, (e) => [e.escrow, e.evaluator], token);
  if (!deployment) throw new Error(`no verified evaluator for ${token}`);
  const head = await client.getBlock();
  const logs = await readProtocolLogs(client, HISTORY_START, head.number, opts);

  const entries: AuditEntry[] = [];
  for (const l of logs) {
    const fromEscrow = isAddressEqual(l.address, deployment.escrow);
    if (!fromEscrow && !isAddressEqual(l.address, deployment.evaluator)) continue;
    const args = l.args as Record<string, unknown>;
    if (args.jobId !== jobId) continue;
    const actorKey = ACTOR[l.eventName];
    const detail: Record<string, AuditValue> = {};
    for (const [k, v] of Object.entries(args)) {
      if (k !== "jobId" && k !== actorKey) detail[k] = plain(v);
    }
    const actor = actorKey === undefined ? undefined : args[actorKey];
    entries.push({
      step: STEPS[l.eventName] ?? l.eventName,
      event: l.eventName,
      contract: fromEscrow ? "escrow" : "evaluator",
      block: l.blockNumber,
      at: await blockTime(client, l.blockNumber),
      transaction: l.transactionHash,
      logIndex: l.logIndex,
      ...(typeof actor === "string" ? { actor: getAddress(actor) } : {}),
      detail,
    });
  }
  entries.sort((a, b) =>
    a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1,
  );
  return {
    token: deployment.token,
    escrow: deployment.escrow,
    evaluator: deployment.evaluator,
    jobId,
    block: head.number,
    entries,
  };
}
