// An agent's ARL score (arl-reputation/1) read from Base Mainnet, the spec's read path end to end:
//
//   const { score, outcomes } = await getAgentScore(publicClient, 42n);
//   score.score_bps   // 0-10000, or null below 3 outcomes from 2 clients
//
// It reads the feedback the verified evaluators wrote to the ERC-8004 ReputationRegistry, the
// evaluators' own events and the jobs, joins them with `outcomesFromChain` and scores them with
// `reputationScore` (packages/protocol). Only the deployed verified evaluators count: earlier
// evaluators never had a job (contracts/deploy/base-mainnet-jobs.json).

import {
  isAddressEqual,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  outcomesFromChain,
  reputationScore,
  type EvaluatorLogs,
  type FeedbackRecord,
  type JobRecord,
  type Outcome,
  type Score,
} from "../../protocol/src/index.ts";
import { STATUS, jobsAbi } from "./jobs.ts";

export const REPUTATION_REGISTRY: Address = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

/** The verified evaluators on Base Mainnet, with their escrow and creation block. */
export const VERIFIED_EVALUATORS = [
  {
    token: "ARL",
    evaluator: "0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28",
    escrow: "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC",
    fromBlock: 59_577_368n,
  },
  {
    token: "USDC",
    evaluator: "0x7A00D45598Da7C13feEA8962fc1110FC4Db4D850",
    escrow: "0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04",
    fromBlock: 59_579_724n,
  },
] as const satisfies readonly {
  token: Outcome["token"];
  evaluator: Address;
  escrow: Address;
  fromBlock: bigint;
}[];

const registryEvents = parseAbi([
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
]);
const evaluatorEvents = parseAbi([
  "event Configured(uint256 indexed jobId, uint8 tier, uint8 threshold, uint64 voteWindow, uint64 challengeWindow, uint96 bond, uint256 providerAgentId, bytes32 specHash, address[] committee)",
  "event CommitteeApproved(uint256 indexed jobId, address indexed provider)",
  "event FeedbackFailed(uint256 indexed jobId, uint256 agentId)",
  "event Finalized(uint256 indexed jobId, bool approved, bytes32 voteHash)",
  "event Disputed(uint256 indexed jobId, address indexed challenger, bytes32 evidence)",
  "event Failed(uint256 indexed jobId)",
]);
const jobExpired = parseAbiItem("event JobExpired(uint256 indexed jobId)");

const MAX_SPAN = 50_000n;
const MIN_SPAN = 500n;
const RATE_LIMITED = /rate limit|request limit reached|too many requests|status: 429|-32011/i;
const TOO_WIDE = /range|query returned more than|response size|10000 results|-32614|-32005|exceed/i;

const errorText = (e: unknown) =>
  e instanceof Error
    ? `${e.message} ${(e as { details?: string }).details ?? ""} ${e.cause instanceof Error ? e.cause.message : ""}`
    : String(e);

/** How many block ranges are read at once, while the endpoint allows it. */
const CONCURRENCY = 2;

/**
 * getLogs over [from, to] in spans the endpoint accepts. The ranges are fixed 50,000-block steps
 * from `from` (so a finished range is always asked for the same way and can be cached) and are
 * read two at a time; the answer keeps block order. Once the endpoint rate-limits a request the
 * rest are read one after another.
 */
async function logsInRange<T>(
  from: bigint,
  to: bigint,
  read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
): Promise<T[]> {
  const spans: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += MAX_SPAN) {
    const end = start + MAX_SPAN - 1n;
    spans.push([start, end < to ? end : to]);
  }
  const parts = new Array<T[]>(spans.length);
  let next = 0;
  let limited = false;
  const worker = async (id: number) => {
    while (next < spans.length && !(limited && id > 0)) {
      const i = next++;
      const [start, end] = spans[i] as [bigint, bigint];
      parts[i] = await logsInSpan(start, end, read, () => {
        limited = true;
      });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, spans.length) }, (_, id) => worker(id)),
  );
  return parts.flat();
}

/**
 * One range: the span halves when the endpoint asks for a smaller range, and a rate-limited
 * request waits and is asked again (three times at most).
 */
async function logsInSpan<T>(
  from: bigint,
  to: bigint,
  read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  onRateLimited: () => void,
): Promise<T[]> {
  const out: T[] = [];
  let span = MAX_SPAN;
  let start = from;
  let waits = 0;
  while (start <= to) {
    const end = start + span - 1n < to ? start + span - 1n : to;
    try {
      out.push(...(await read(start, end)));
      start = end + 1n;
      waits = 0;
    } catch (e) {
      const text = errorText(e);
      if (RATE_LIMITED.test(text) && waits < 5) {
        onRateLimited();
        waits += 1;
        await new Promise((r) => setTimeout(r, 1000 * waits));
      } else if (TOO_WIDE.test(text) && span > MIN_SPAN) {
        span /= 2n;
      } else {
        throw e;
      }
    }
  }
  return out;
}

export interface AgentScore {
  agentId: bigint;
  /** The block everything was read at. */
  block: bigint;
  score: Score;
  outcomes: Outcome[];
  skipped: { what: string; reason: string }[];
}

export async function getAgentScore(
  client: PublicClient,
  agentId: bigint,
  opts: { now?: number } = {},
): Promise<AgentScore> {
  const head = await client.getBlock();
  const to = head.number;
  const from = VERIFIED_EVALUATORS.reduce<bigint>(
    (min, e) => (e.fromBlock < min ? e.fromBlock : min),
    VERIFIED_EVALUATORS[0].fromBlock,
  );

  // Two reads per block range: the feedback the evaluators wrote to the registry, and the
  // evaluators' and escrows' events (few, for every job) in one request. Neither filter names the
  // agent, so a provider that stores finished ranges serves every agent from the same store.
  const [feedbackLogs, protocolLogs] = await Promise.all([
    logsInRange(from, to, (fromBlock, toBlock) =>
      client.getLogs({
        address: REPUTATION_REGISTRY,
        event: registryEvents[0],
        args: { clientAddress: VERIFIED_EVALUATORS.map((e) => e.evaluator) },
        fromBlock,
        toBlock,
      }),
    ),
    logsInRange(from, to, (fromBlock, toBlock) =>
      client.getLogs({
        address: VERIFIED_EVALUATORS.flatMap((e) => [e.evaluator, e.escrow]),
        events: [...evaluatorEvents, jobExpired],
        fromBlock,
        toBlock,
      }),
    ),
  ]);

  const evaluators: EvaluatorLogs[] = [];
  const jobs: JobRecord[] = [];
  for (const e of VERIFIED_EVALUATORS) {
    const ev: EvaluatorLogs = {
      evaluator: e.evaluator,
      escrow: e.escrow,
      token: e.token,
      configured: [],
      committeeApproved: [],
      unbound: [],
      finalized: [],
      disputed: [],
      failed: [],
    };
    const of = (address: string) =>
      protocolLogs.filter((l) => isAddressEqual(l.address, address as Address));
    const logs = of(e.evaluator);
    const approvedTx = new Map<string, bigint>();
    for (const l of logs) {
      const a = l.args as Record<string, unknown>;
      const jobId = a.jobId as bigint;
      switch (l.eventName) {
        case "Configured":
          ev.configured.push({ jobId, providerAgentId: a.providerAgentId as bigint });
          break;
        case "CommitteeApproved":
          ev.committeeApproved.push(jobId);
          approvedTx.set(l.transactionHash, jobId);
          break;
        case "Finalized":
          ev.finalized.push({ jobId, voteHash: a.voteHash as Hex });
          break;
        case "Disputed":
          ev.disputed.push(jobId);
          break;
        case "Failed":
          ev.failed.push(jobId);
          break;
        default:
          break;
      }
    }
    // FeedbackFailed in the approval transaction: the agent could not be bound to the job.
    for (const l of logs)
      if (l.eventName === "FeedbackFailed" && approvedTx.get(l.transactionHash) !== undefined)
        ev.unbound.push((l.args as { jobId: bigint }).jobId);
    evaluators.push(ev);

    const mine = ev.configured.filter((c) => c.providerAgentId === agentId).map((c) => c.jobId);
    const expiredBlock = new Map<bigint, bigint>();
    for (const l of of(e.escrow)) {
      const id = (l.args as { jobId?: bigint }).jobId;
      if (l.eventName === "JobExpired" && id !== undefined && mine.includes(id))
        expiredBlock.set(id, l.blockNumber);
    }
    for (const jobId of mine) {
      const j = await client.readContract({
        address: e.escrow,
        abi: jobsAbi,
        functionName: "getJob",
        args: [jobId],
        blockNumber: to,
      });
      const at = expiredBlock.get(jobId);
      jobs.push({
        escrow: e.escrow,
        jobId,
        client: j.client,
        budget: j.budget,
        status: STATUS[j.status] ?? `Status ${String(j.status)}`,
        ...(at === undefined ? {} : { expiredAt: await blockTime(client, at) }),
      });
    }
  }

  const feedback: FeedbackRecord[] = [];
  for (const l of feedbackLogs) {
    if (l.args.agentId !== agentId) continue;
    feedback.push({
      evaluator: l.args.clientAddress as Address,
      agentId: l.args.agentId,
      value: l.args.value as bigint,
      valueDecimals: l.args.valueDecimals as number,
      tag1: l.args.tag1 as string,
      feedbackHash: l.args.feedbackHash as Hex,
      timestamp: await blockTime(client, l.blockNumber),
    });
  }

  const { outcomes, skipped } = outcomesFromChain(agentId, feedback, evaluators, jobs);
  const now = opts.now ?? Number(head.timestamp);
  return { agentId, block: to, score: reputationScore(outcomes, now), outcomes, skipped };
}

const times = new Map<bigint, number>();
async function blockTime(client: PublicClient, block: bigint): Promise<number> {
  const known = times.get(block);
  if (known !== undefined) return known;
  const t = Number((await client.getBlock({ blockNumber: block })).timestamp);
  times.set(block, t);
  return t;
}
