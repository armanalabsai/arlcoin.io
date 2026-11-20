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
  getAddress,
  isAddressEqual,
  parseAbi,
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
/** Every event of the escrow and the verified evaluator: all carry the job id as first topic. */
export const protocolEvents = parseAbi([
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
  "event ProviderSet(uint256 indexed jobId, address indexed provider)",
  "event BudgetSet(uint256 indexed jobId, uint256 amount)",
  "event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)",
  "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
  "event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)",
  "event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)",
  "event JobExpired(uint256 indexed jobId)",
  "event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)",
  "event Refunded(uint256 indexed jobId, address indexed client, uint256 amount)",
  "event Configured(uint256 indexed jobId, uint8 tier, uint8 threshold, uint64 voteWindow, uint64 challengeWindow, uint96 bond, uint256 providerAgentId, bytes32 specHash, address[] committee)",
  "event CommitteeApproved(uint256 indexed jobId, address indexed provider)",
  "event Accepted(uint256 indexed jobId, address indexed validator, uint256 bond)",
  "event VotingStarted(uint256 indexed jobId, uint64 voteEnds)",
  "event Voted(uint256 indexed jobId, address indexed validator, bool approve, bytes32 deliverable, bytes32 evidence)",
  "event Decided(uint256 indexed jobId, bool approved, uint64 challengeEnds)",
  "event Disputed(uint256 indexed jobId, address indexed challenger, bytes32 evidence)",
  "event Resolved(uint256 indexed jobId, bool approved, bool overturned, bytes32 reason)",
  "event Slashed(uint256 indexed jobId, address indexed account, uint256 amount)",
  "event Failed(uint256 indexed jobId)",
  "event Finalized(uint256 indexed jobId, bool approved, bytes32 voteHash)",
  "event Released(uint256 indexed jobId)",
  "event FeedbackFailed(uint256 indexed jobId, uint256 agentId)",
  "event RefundDeferred(uint256 indexed jobId)",
  "event DisputeExpired(uint256 indexed jobId)",
]);

const MAX_SPAN = 50_000n;
const MIN_SPAN = 500n;
// A rate limit and a range that is too wide are told apart by their wording: asking for a smaller
// range does not help against a rate limit, and waiting does not help against a range limit.
const TOO_WIDE =
  /block range|range (is )?too|max(imum)? (block )?range|query returned more than|response size|10000 results|-32614|-32602/i;
const RATE_LIMITED =
  /rate limit|request limit|limit exceeded|too many requests|status: 429|-32011|-32005|-32016/i;

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
export async function logsInRange<T>(
  from: bigint,
  to: bigint,
  read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  wholeRange = false,
): Promise<T[]> {
  // A client that stores finished scans itself takes the whole range in one request.
  if (wholeRange) return read(from, to);
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
      if (TOO_WIDE.test(text) && span > MIN_SPAN) {
        span /= 2n;
      } else if (RATE_LIMITED.test(text) && waits < 5) {
        onRateLimited();
        waits += 1;
        await new Promise((r) => setTimeout(r, 1000 * waits));
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

export interface HistoryOptions {
  /**
   * Ask for the whole history in one `getLogs` request instead of 50,000-block ranges. Only for a
   * client whose transport stores finished scans and splits the request itself (the Agent API's
   * `cachedLogsProvider`); a plain RPC endpoint refuses a range this wide.
   */
  wholeRange?: boolean;
}

/** The first block any verified evaluator has code at: where every scan starts. */
export const HISTORY_START = VERIFIED_EVALUATORS.reduce<bigint>(
  (min, e) => (e.fromBlock < min ? e.fromBlock : min),
  VERIFIED_EVALUATORS[0].fromBlock,
);

/**
 * The events of every escrow and evaluator in [from, to], in one request per range. The filter is
 * the same for every caller, so a provider that stores finished ranges serves the score, the
 * trust graph and the audit trail from one store.
 */
export function readProtocolLogs(
  client: PublicClient,
  from: bigint,
  to: bigint,
  opts: HistoryOptions = {},
) {
  return logsInRange(
    from,
    to,
    (fromBlock, toBlock) =>
      client.getLogs({
        address: VERIFIED_EVALUATORS.flatMap((e) => [e.evaluator, e.escrow]),
        events: protocolEvents,
        fromBlock,
        toBlock,
      }),
    opts.wholeRange,
  );
}

/** Everything the verified evaluators recorded, read once and used for any number of agents. */
async function readHistory(client: PublicClient, opts: HistoryOptions = {}) {
  const head = await client.getBlock();
  const to = head.number;
  const from = HISTORY_START;

  // Two reads per block range: the feedback the evaluators wrote to the registry, and the
  // evaluators' and escrows' events (few, for every job) in one request. Neither filter names the
  // agent, so a provider that stores finished ranges serves every agent from the same store.
  const [feedbackLogs, protocolLogs] = await Promise.all([
    logsInRange(
      from,
      to,
      (fromBlock, toBlock) =>
        client.getLogs({
          address: REPUTATION_REGISTRY,
          event: registryEvents[0],
          args: { clientAddress: VERIFIED_EVALUATORS.map((e) => e.evaluator) },
          fromBlock,
          toBlock,
        }),
      opts.wholeRange,
    ),
    readProtocolLogs(client, from, to, opts),
  ]);

  return { head, to, feedbackLogs, protocolLogs };
}
type History = Awaited<ReturnType<typeof readHistory>>;

/** One agent's verified outcomes from the history, with the jobs read at the history's block. */
async function agentOutcomes(client: PublicClient, history: History, agentId: bigint) {
  const { to, feedbackLogs, protocolLogs } = history;
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

  return outcomesFromChain(agentId, feedback, evaluators, jobs);
}

export async function getAgentScore(
  client: PublicClient,
  agentId: bigint,
  opts: { now?: number } & HistoryOptions = {},
): Promise<AgentScore> {
  const history = await readHistory(client, opts);
  const { outcomes, skipped } = await agentOutcomes(client, history, agentId);
  const now = opts.now ?? Number(history.head.timestamp);
  return {
    agentId,
    block: history.to,
    score: reputationScore(outcomes, now),
    outcomes,
    skipped,
  };
}

/** Who hired whom, and how it ended: one edge per client and agent. */
export interface TrustEdge {
  client: Address;
  agentId: bigint;
  completed: number;
  rejected: number;
  expired: number;
  disputed: number;
  /** Budget of the completed jobs, in base units, per payment token. */
  paid: Partial<Record<Outcome["token"], string>>;
  /** Unix seconds of the first and the latest outcome between the two. */
  first: number;
  latest: number;
}

export interface TrustGraph {
  /** The block everything was read at. */
  block: bigint;
  agents: { agentId: bigint; score: Score }[];
  edges: TrustEdge[];
}

/**
 * The trust graph of verified work: every agent with a verified outcome, its score, and an edge
 * for each client it worked for. Built from the same records as the score, so an edge exists only
 * where a committee settled a job (or the agent let one expire).
 */
export async function getTrustGraph(
  client: PublicClient,
  opts: { now?: number } & HistoryOptions = {},
): Promise<TrustGraph> {
  const history = await readHistory(client, opts);
  const now = opts.now ?? Number(history.head.timestamp);
  const ids = new Set<bigint>();
  for (const l of history.protocolLogs) {
    if (l.eventName === "Configured")
      ids.add((l.args as { providerAgentId: bigint }).providerAgentId);
  }
  const agents: TrustGraph["agents"] = [];
  const edges = new Map<string, TrustEdge>();
  for (const agentId of [...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))) {
    const { outcomes } = await agentOutcomes(client, history, agentId);
    if (outcomes.length === 0) continue;
    agents.push({ agentId, score: reputationScore(outcomes, now) });
    for (const o of outcomes) {
      const key = `${o.client.toLowerCase()}:${agentId.toString()}`;
      let e = edges.get(key);
      if (!e) {
        e = {
          client: getAddress(o.client),
          agentId,
          completed: 0,
          rejected: 0,
          expired: 0,
          disputed: 0,
          paid: {},
          first: o.final_at,
          latest: o.final_at,
        };
        edges.set(key, e);
      }
      if (o.outcome === "completed") {
        e.completed += 1;
        e.paid[o.token] = (BigInt(e.paid[o.token] ?? "0") + BigInt(o.budget)).toString();
      } else if (o.outcome === "rejected") e.rejected += 1;
      else if (o.outcome === "expired") e.expired += 1;
      if (o.disputed) e.disputed += 1;
      e.first = Math.min(e.first, o.final_at);
      e.latest = Math.max(e.latest, o.final_at);
    }
  }
  return { block: history.to, agents, edges: [...edges.values()] };
}

const times = new Map<bigint, number>();
export async function blockTime(client: PublicClient, block: bigint): Promise<number> {
  const known = times.get(block);
  if (known !== undefined) return known;
  const t = Number((await client.getBlock({ blockNumber: block })).timestamp);
  times.set(block, t);
  return t;
}
