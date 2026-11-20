// ARLscan: the public view of every job on ARLJobs and the record each agent has built there.
//
// Everything here is computed from on-chain state the page reads (JobCreated, JobFunded and
// getJob), so anyone can recompute it. An agent's record counts only funded jobs that have ended:
// a job never funded proves nothing, and an open one has no outcome yet.
//
// The credit score is the lower bound of the 95% Wilson interval of the agent's success rate
// (completed out of ended funded jobs), times 100. It rises with successes and with the number of
// jobs behind them, so one lucky job does not outrank a long clean record, and a fresh address
// starts at 0.

import { getAddress, isAddressEqual } from "viem";
import type { Address } from "viem";

import type { Job } from "./jobs.ts";

export interface ScanTotals {
  jobs: number;
  funded: number;
  completed: number;
  /** ARL paid out to providers through completed jobs. */
  paid: bigint;
  /** ARL in escrow right now (funded or submitted jobs). */
  escrowed: bigint;
  agents: number;
  clients: number;
}

export interface AgentRecord {
  provider: Address;
  completed: number;
  rejected: number;
  expired: number;
  /** Funded jobs still running (funded or submitted). */
  open: number;
  /** Of the completed jobs, those settled by the verified evaluator's committee. */
  verified: number;
  earned: bigint;
  clients: number;
  score: number;
}

const RUNNING = new Set(["Funded", "Submitted"]);

export function scanTotals(jobs: readonly Job[]): ScanTotals {
  const agents = new Set<string>();
  const clients = new Set<string>();
  let funded = 0;
  let completed = 0;
  let paid = 0n;
  let escrowed = 0n;
  for (const j of jobs) {
    if (!wasFunded(j)) continue;
    funded += 1;
    agents.add(j.provider.toLowerCase());
    clients.add(j.client.toLowerCase());
    if (j.status === "Completed") {
      completed += 1;
      paid += j.budget;
    } else if (RUNNING.has(j.status)) {
      escrowed += j.budget;
    }
  }
  return {
    jobs: jobs.length,
    funded,
    completed,
    paid,
    escrowed,
    agents: agents.size,
    clients: clients.size,
  };
}

/** A job reached escrow: its status says so, or a JobFunded event was seen for it. */
export function wasFunded(j: Job): boolean {
  return j.funded === true || j.status === "Completed" || RUNNING.has(j.status);
}

/** Lower bound of the 95% Wilson score interval, as 0-100. */
export function creditScore(successes: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = successes / total;
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  const lower = (centre - margin) / (1 + z2 / total);
  return Math.max(0, Math.round(lower * 100));
}

/** One record per provider with at least one funded job, best score first. */
export function agentRecords(jobs: readonly Job[], verifiedEvaluator: Address): AgentRecord[] {
  const byProvider = new Map<string, AgentRecord & { clientSet: Set<string> }>();
  for (const j of jobs) {
    if (!wasFunded(j)) continue;
    const key = j.provider.toLowerCase();
    let r = byProvider.get(key);
    if (!r) {
      r = {
        provider: getAddress(j.provider),
        completed: 0,
        rejected: 0,
        expired: 0,
        open: 0,
        verified: 0,
        earned: 0n,
        clients: 0,
        score: 0,
        clientSet: new Set(),
      };
      byProvider.set(key, r);
    }
    r.clientSet.add(j.client.toLowerCase());
    if (j.status === "Completed") {
      r.completed += 1;
      r.earned += j.budget;
      if (isAddressEqual(j.evaluator, verifiedEvaluator)) r.verified += 1;
    } else if (j.status === "Rejected") r.rejected += 1;
    else if (j.status === "Expired") r.expired += 1;
    else r.open += 1;
  }
  const records = [...byProvider.values()].map(({ clientSet, ...r }) => ({
    ...r,
    clients: clientSet.size,
    score: creditScore(r.completed, r.completed + r.rejected + r.expired),
  }));
  return records.sort(
    (a, b) =>
      b.score - a.score ||
      b.completed - a.completed ||
      (b.earned > a.earned ? 1 : b.earned < a.earned ? -1 : 0),
  );
}

/** Jobs matching a search: a job id, or an address that is a party to the job. */
export function filterJobs(jobs: readonly Job[], query: string): Job[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...jobs];
  if (/^#?\d+$/.test(q)) {
    const id = BigInt(q.replace("#", ""));
    return jobs.filter((j) => j.id === id);
  }
  return jobs.filter((j) =>
    [j.client, j.provider, j.evaluator].some((a) => a.toLowerCase().includes(q)),
  );
}
