// A portable evidence bundle for one verified job: everything a third party needs to check how an
// ERC-8183 job on ARLJobs was settled by ARLVerifiedEvaluator, in one JSON document. Each record
// carries the block and transaction it came from, so `verifyBundle` can re-read it from any RPC.
//
// What a valid bundle shows: the committed spec hash, the deliverable the provider submitted, every
// validator vote, that enough approvals named that same deliverable, and how the escrow settled.
// What it does not show: that a non-deterministic deliverable is semantically correct. Votes are
// re-execution results of a deterministic spec (docs/reexecution-spec.md), not a judgment of
// quality.

import { parseAbiItem, type Address, type Hex, type PublicClient } from "viem";

import { checkChain, evaluatorAbi, jobsAbi } from "./chain.ts";
import { LOG_WINDOW } from "./watch.ts";

export const BUNDLE_VERSION = "arl-evidence/1";

export interface EventRef {
  block: string;
  tx: Hex;
}

export interface EvidenceBundle {
  version: typeof BUNDLE_VERSION;
  chainId: number;
  jobs: Address;
  evaluator: Address;
  jobId: string;
  job: { client: Address; provider: Address; budget: string; status: number; description: string };
  config: { tier: number; threshold: number; specHash: Hex; committee: Address[] };
  submitted: (EventRef & { deliverable: Hex }) | null;
  votes: (EventRef & { validator: Address; approve: boolean; deliverable: Hex; evidence: Hex })[];
  decided: (EventRef & { approved: boolean }) | null;
  finalized: (EventRef & { approved: boolean; voteHash: Hex }) | null;
  settlement: (EventRef & { outcome: "completed" | "rejected" }) | null;
}

const ev = {
  submitted: parseAbiItem(
    "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
  ),
  completed: parseAbiItem(
    "event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)",
  ),
  rejected: parseAbiItem(
    "event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)",
  ),
  voted: parseAbiItem(
    "event Voted(uint256 indexed jobId, address indexed validator, bool approve, bytes32 deliverable, bytes32 evidence)",
  ),
  decided: parseAbiItem(
    "event Decided(uint256 indexed jobId, bool approved, uint64 challengeEnds)",
  ),
  finalized: parseAbiItem(
    "event Finalized(uint256 indexed jobId, bool approved, bytes32 voteHash)",
  ),
};

interface Log {
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  args: Record<string, unknown>;
}

const ref = (l: Log): EventRef => ({
  block: (l.blockNumber ?? 0n).toString(),
  tx: l.transactionHash ?? "0x",
});

/** Reads the job's evidence from `fromBlock` (the evaluator's deployment block) to the head. */
export async function buildBundle(
  client: PublicClient,
  evaluator: Address,
  jobId: bigint,
  fromBlock: bigint,
  window: bigint = LOG_WINDOW,
): Promise<EvidenceBundle> {
  const chainId = await client.getChainId();
  checkChain(chainId);
  const jobs = await client.readContract({
    address: evaluator,
    abi: evaluatorAbi,
    functionName: "jobs",
  });
  const [job, config] = await Promise.all([
    client.readContract({ address: jobs, abi: jobsAbi, functionName: "getJob", args: [jobId] }),
    client.readContract({
      address: evaluator,
      abi: evaluatorAbi,
      functionName: "getConfig",
      args: [jobId],
    }),
  ]);
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const logs = async (address: Address, event: (typeof ev)[keyof typeof ev]): Promise<Log[]> => {
    const out: Log[] = [];
    for (let from = fromBlock; from <= head; from += window) {
      const to = from + window - 1n < head ? from + window - 1n : head;
      const batch = await client.getLogs({
        address,
        event,
        args: { jobId },
        fromBlock: from,
        toBlock: to,
      });
      out.push(...(batch as unknown as Log[]));
    }
    return out;
  };
  const [sub, comp, rej, votes, dec, fin] = await Promise.all([
    logs(jobs, ev.submitted),
    logs(jobs, ev.completed),
    logs(jobs, ev.rejected),
    logs(evaluator, ev.voted),
    logs(evaluator, ev.decided),
    logs(evaluator, ev.finalized),
  ]);
  const lastSub = sub.at(-1);
  const lastDec = dec.at(-1);
  const lastFin = fin.at(-1);
  const settle = comp.at(-1) ?? rej.at(-1);
  return {
    version: BUNDLE_VERSION,
    chainId,
    jobs,
    evaluator,
    jobId: jobId.toString(),
    job: {
      client: job.client,
      provider: job.provider,
      budget: job.budget.toString(),
      status: job.status,
      description: job.description,
    },
    config: {
      tier: config.tier,
      threshold: config.threshold,
      specHash: config.specHash,
      committee: [...config.committee],
    },
    submitted: lastSub ? { ...ref(lastSub), deliverable: lastSub.args.deliverable as Hex } : null,
    votes: votes.map((v) => ({
      ...ref(v),
      validator: v.args.validator as Address,
      approve: v.args.approve as boolean,
      deliverable: v.args.deliverable as Hex,
      evidence: v.args.evidence as Hex,
    })),
    decided: lastDec ? { ...ref(lastDec), approved: lastDec.args.approved as boolean } : null,
    finalized: lastFin
      ? {
          ...ref(lastFin),
          approved: lastFin.args.approved as boolean,
          voteHash: lastFin.args.voteHash as Hex,
        }
      : null,
    settlement: settle
      ? { ...ref(settle), outcome: settle === comp.at(-1) ? "completed" : "rejected" }
      : null,
  };
}

/** Internal consistency, no network: returns the problems found (empty when the bundle holds). */
export function checkBundle(b: EvidenceBundle): string[] {
  const p: string[] = [];
  if ((b.version as string) !== BUNDLE_VERSION) p.push(`unknown version ${b.version}`);
  const committee = new Set(b.config.committee.map((a) => a.toLowerCase()));
  const seen = new Set<string>();
  for (const v of b.votes) {
    const who = v.validator.toLowerCase();
    if (!committee.has(who)) p.push(`vote by ${v.validator}, who is not in the committee`);
    if (seen.has(who)) p.push(`${v.validator} voted twice`);
    seen.add(who);
  }
  const approvals = b.votes.filter((v) => v.approve);
  if (b.decided?.approved) {
    if (!b.submitted) p.push("approved without a submitted deliverable");
    if (approvals.length < b.config.threshold)
      p.push(`approved with ${approvals.length} approvals, threshold ${b.config.threshold}`);
    for (const v of approvals)
      if (b.submitted && v.deliverable.toLowerCase() !== b.submitted.deliverable.toLowerCase())
        p.push(`${v.validator} approved a different deliverable`);
  }
  if (b.finalized && b.decided && b.finalized.approved !== b.decided.approved)
    p.push("finalized outcome differs from the decision");
  if (b.finalized && b.settlement) {
    const expected = b.finalized.approved ? "completed" : "rejected";
    if (b.settlement.outcome !== expected)
      p.push(`escrow ${b.settlement.outcome}, expected ${expected}`);
  }
  return p;
}

/** Re-reads the job from the chain and lists every field that differs from the bundle. */
export async function verifyBundle(
  client: PublicClient,
  b: EvidenceBundle,
  fromBlock: bigint,
  window: bigint = LOG_WINDOW,
): Promise<string[]> {
  const problems = checkBundle(b);
  const fresh = await buildBundle(client, b.evaluator, BigInt(b.jobId), fromBlock, window);
  const norm = (x: unknown) => JSON.stringify(x).toLowerCase();
  for (const k of Object.keys(fresh) as (keyof EvidenceBundle)[]) {
    if (norm(fresh[k]) !== norm(b[k])) problems.push(`${k} does not match the chain`);
  }
  return problems;
}
