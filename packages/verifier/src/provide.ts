// A provider that runs unattended: it finds the funded jobs that name it as provider on a verified
// evaluator, checks that each is one it is willing to do, approves the committee, runs the job's
// spec in the pinned container and submits the result hash once enough committee members have
// accepted. It is the provider's counterpart of `watch` (the validator's keeper), and the same
// code a validator re-runs: `execute`.
//
// Nothing here needs a server or a public address. A client opens a job with the SDK, the app or
// the MCP server and names this account as provider; the agent sees it on chain.

import {
  parseAbi,
  parseAbiItem,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

import { checkChain, JobStatus, MemberState } from "./chain.ts";
import type { Fetcher } from "./inputs.ts";
import { specHash, type ReexecSpec } from "./spec.ts";
import { execute, type ExecuteOptions } from "./verify.ts";
import { fetchJobSpec, LOG_WINDOW } from "./watch.ts";

const jobCreated = parseAbiItem(
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
);

const jobsAbi = parseAbi([
  "struct Job { uint256 id; address client; address provider; address evaluator; string description; uint256 budget; uint256 expiredAt; uint8 status; address hook; }",
  "function getJob(uint256 jobId) view returns (Job)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
]);

const evaluatorAbi = parseAbi([
  "struct Config { uint8 tier; uint8 threshold; uint64 voteWindow; uint64 challengeWindow; uint96 bond; uint256 providerAgentId; bytes32 specHash; address[] committee; }",
  "struct Verdict { uint8 phase; bool providerApproved; uint8 approvals; uint8 rejections; uint8 topApprovals; uint64 voteEnds; uint64 challengeEnds; address challenger; uint256 bond; bytes32 deliverable; bytes32 voteHash; }",
  "function jobs() view returns (address)",
  "function getConfig(uint256 jobId) view returns (Config)",
  "function getVerdict(uint256 jobId) view returns (Verdict)",
  "function voteOf(uint256 jobId, address validator) view returns (uint8)",
  "function approveCommittee(uint256 jobId)",
]);

const ZERO_HASH = `0x${"00".repeat(32)}`;

export interface ProvideState {
  /** Next block to read `JobCreated` logs from. */
  fromBlock: bigint;
  /** Jobs that name this provider and are not finished yet, as decimal strings. */
  jobs: string[];
  /**
   * The result hash of each job already run, by job id. Saved with the state, so a restart or a
   * wait for the committee never runs the work twice.
   */
  deliverables?: Record<string, Hex>;
}

/**
 * The work a provider is willing to do. Running a job costs compute before anything is paid, so
 * the provider takes only jobs inside limits its operator chose.
 */
export interface ProvidePolicy {
  /** Smallest budget accepted, in the escrow token's smallest unit. Required: there is no default price. */
  minBudget: bigint;
  /** Longest run the spec may ask for, in seconds. */
  maxSeconds: number;
  /** Most memory the spec may ask for, in MiB. */
  maxMemoryMb: number;
  /** When set, only these container digests are run. */
  images: readonly string[] | null;
  /** When set, only jobs from these clients are taken. */
  clients: readonly Address[] | null;
  /** When set, every committee member must be one of these validators. */
  validators: readonly Address[] | null;
  /** Shortest time left until the job's deadline (seconds): room to run, vote and settle. */
  minSecondsToDeadline: bigint;
}

export const DEFAULT_PROVIDE_POLICY: Omit<ProvidePolicy, "minBudget"> = {
  maxSeconds: 600,
  maxMemoryMb: 1024,
  images: null,
  clients: null,
  validators: null,
  minSecondsToDeadline: 6n * 60n * 60n,
};

interface Terms {
  client: Address;
  budget: bigint;
  expiredAt: bigint;
  committee: readonly Address[];
}

const includes = (list: readonly string[], value: string) =>
  list.some((x) => x.toLowerCase() === value.toLowerCase());

/** Why `policy` refuses the job at time `now` (seconds), or null when the provider may take it. */
export function provideProblem(
  job: Terms,
  spec: Pick<ReexecSpec, "container_digest" | "limits">,
  policy: ProvidePolicy,
  now: bigint,
): string | null {
  if (policy.clients && !includes(policy.clients, job.client))
    return "client is not on this provider's list";
  if (job.budget < policy.minBudget) return "budget is below this provider's price";
  if (job.expiredAt < now + policy.minSecondsToDeadline)
    return "deadline is too close to run, vote and settle";
  if (policy.validators && !job.committee.every((m) => includes(policy.validators ?? [], m)))
    return "committee names a validator this provider does not accept";
  if (policy.images && !includes(policy.images, spec.container_digest))
    return "container image is not on this provider's list";
  if (spec.limits.seconds > policy.maxSeconds) return "spec asks for a longer run than allowed";
  if (spec.limits.memory_mb > policy.maxMemoryMb) return "spec asks for more memory than allowed";
  return null;
}

export interface ProvideDeps {
  client: PublicClient;
  wallet: WalletClient<Transport, Chain, Account>;
  evaluator: Address;
  /** Execution: the container runner and the input fetcher. */
  exec: ExecuteOptions;
  /** Fetches the spec document a job's description points to. */
  specFetcher: Pick<Fetcher, "file">;
  policy: ProvidePolicy;
  log?: (event: Record<string, unknown>) => void;
  /** Blocks per `eth_getLogs` call; the RPC's own limit (default LOG_WINDOW). */
  logWindow?: bigint;
}

async function discover(deps: ProvideDeps, state: ProvideState, me: Address, jobs: Address) {
  const head = await deps.client.getBlockNumber();
  const window = deps.logWindow ?? LOG_WINDOW;
  const found = new Set(state.jobs);
  let from = state.fromBlock;
  while (from <= head) {
    const to = from + window - 1n < head ? from + window - 1n : head;
    const logs = await deps.client.getLogs({
      address: jobs,
      event: jobCreated,
      args: { provider: me },
      fromBlock: from,
      toBlock: to,
    });
    for (const l of logs) {
      if (
        l.args.jobId !== undefined &&
        l.args.evaluator?.toLowerCase() === deps.evaluator.toLowerCase()
      )
        found.add(l.args.jobId.toString());
    }
    from = to + 1n;
  }
  return { fromBlock: head + 1n, jobs: [...found] };
}

async function write(
  deps: ProvideDeps,
  call: Parameters<PublicClient["simulateContract"]>[0],
): Promise<Hex> {
  // Simulated first: a revert is reported before anything is signed.
  const { request } = await deps.client.simulateContract({ ...call, account: deps.wallet.account });
  const hash = await deps.wallet.writeContract(
    request as Parameters<typeof deps.wallet.writeContract>[0],
  );
  const receipt = await deps.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return hash;
}

/**
 * One pass: finds new jobs, and moves each open job one step forward. Safe to call on a timer;
 * every transaction is simulated before it is sent, and a job's work runs at most once.
 */
export async function provideStep(deps: ProvideDeps, state: ProvideState): Promise<ProvideState> {
  checkChain(await deps.client.getChainId());
  const me = deps.wallet.account.address;
  const log = deps.log ?? (() => undefined);
  const jobs = await deps.client.readContract({
    address: deps.evaluator,
    abi: evaluatorAbi,
    functionName: "jobs",
  });
  const next = await discover(deps, state, me, jobs);
  const deliverables: Record<string, Hex> = { ...state.deliverables };
  const keep: string[] = [];

  for (const id of next.jobs) {
    const jobId = BigInt(id);
    try {
      const job = await deps.client.readContract({
        address: jobs,
        abi: jobsAbi,
        functionName: "getJob",
        args: [jobId],
      });
      const { timestamp: now } = await deps.client.getBlock();
      if (job.status === JobStatus.Open) {
        // Not funded yet. Dropped once its deadline has passed, kept until then.
        if (job.expiredAt > now) keep.push(id);
        continue;
      }
      if (job.status !== JobStatus.Funded) {
        log({ jobId: id, event: "finished", status: job.status });
        continue;
      }
      if (job.expiredAt <= now) {
        log({ jobId: id, event: "expired" });
        continue;
      }
      keep.push(id);

      const [config, verdict] = await Promise.all([
        deps.client.readContract({
          address: deps.evaluator,
          abi: evaluatorAbi,
          functionName: "getConfig",
          args: [jobId],
        }),
        deps.client.readContract({
          address: deps.evaluator,
          abi: evaluatorAbi,
          functionName: "getVerdict",
          args: [jobId],
        }),
      ]);
      if (config.specHash === ZERO_HASH || config.committee.length === 0) {
        log({
          jobId: id,
          event: "not-taken",
          reason: "the job is not configured for verification",
        });
        continue;
      }

      let deliverable = deliverables[id];
      if (!deliverable) {
        // The spec the job commits to, or nothing: a spec that cannot be fetched or does not hash
        // to the committed specHash is never run.
        let spec: ReexecSpec;
        try {
          spec = await fetchJobSpec(job.description, deps.specFetcher);
        } catch (e) {
          log({
            jobId: id,
            event: "spec-unusable",
            reason: e instanceof Error ? e.message : String(e),
          });
          continue;
        }
        if (specHash(spec).toLowerCase() !== config.specHash.toLowerCase()) {
          log({
            jobId: id,
            event: "spec-unusable",
            reason: "spec does not match the committed hash",
          });
          continue;
        }
        const refused = provideProblem(
          {
            client: job.client,
            budget: job.budget,
            expiredAt: job.expiredAt,
            committee: config.committee,
          },
          spec,
          deps.policy,
          now,
        );
        if (refused) {
          log({ jobId: id, event: "not-taken", reason: refused });
          continue;
        }
        if (!verdict.providerApproved) {
          const tx = await write(deps, {
            address: deps.evaluator,
            abi: evaluatorAbi,
            functionName: "approveCommittee",
            args: [jobId],
          });
          log({ jobId: id, event: "committee-approved", tx });
        }
        const run = await execute(spec, deps.exec);
        deliverable = run.hash;
        deliverables[id] = deliverable;
        log({ jobId: id, event: "executed", deliverable });
      }

      // Submitting starts the vote window, so the provider waits until enough members have
      // accepted (and locked their bonds) to reach the threshold.
      const states = await Promise.all(
        config.committee.map((member) =>
          deps.client.readContract({
            address: deps.evaluator,
            abi: evaluatorAbi,
            functionName: "voteOf",
            args: [jobId, member],
          }),
        ),
      );
      const accepted = states.filter((s) => s === MemberState.Accepted).length;
      if (accepted < config.threshold) {
        log({ jobId: id, event: "waiting-for-committee", accepted, threshold: config.threshold });
        continue;
      }
      const tx = await write(deps, {
        address: jobs,
        abi: jobsAbi,
        functionName: "submit",
        args: [jobId, deliverable, "0x"],
      });
      log({ jobId: id, event: "submitted", deliverable, tx });
    } catch (e) {
      keep.push(id);
      log({ jobId: id, event: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  const kept = [...new Set(keep)];
  const keptDeliverables: Record<string, Hex> = {};
  for (const id of kept) {
    const d = deliverables[id];
    if (d) keptDeliverables[id] = d;
  }
  return { fromBlock: next.fromBlock, jobs: kept, deliverables: keptDeliverables };
}

/** Reads a saved state; a missing or malformed field is an error, never a silent default. */
export function parseProvideState(text: string): ProvideState {
  const raw = JSON.parse(text) as { fromBlock?: unknown; jobs?: unknown; deliverables?: unknown };
  if (typeof raw.fromBlock !== "string" || !/^\d+$/.test(raw.fromBlock))
    throw new Error("state: fromBlock must be a decimal string");
  if (!Array.isArray(raw.jobs) || !raw.jobs.every((j) => typeof j === "string" && /^\d+$/.test(j)))
    throw new Error("state: jobs must be decimal strings");
  const deliverables: Record<string, Hex> = {};
  if (raw.deliverables !== undefined) {
    if (typeof raw.deliverables !== "object" || raw.deliverables === null)
      throw new Error("state: deliverables must be an object");
    for (const [id, hash] of Object.entries(raw.deliverables)) {
      if (!/^\d+$/.test(id) || typeof hash !== "string" || !/^0x[0-9a-f]{64}$/.test(hash))
        throw new Error("state: deliverables must map job ids to 32-byte hashes");
      deliverables[id] = hash as Hex;
    }
  }
  return { fromBlock: BigInt(raw.fromBlock), jobs: raw.jobs as string[], deliverables };
}

export function serializeProvideState(state: ProvideState): string {
  return `${JSON.stringify(
    {
      fromBlock: state.fromBlock.toString(),
      jobs: state.jobs,
      deliverables: state.deliverables ?? {},
    },
    null,
    2,
  )}\n`;
}
