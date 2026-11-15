// A validator that runs unattended: it finds the jobs whose committee names it, accepts them once
// the provider has approved the committee and the client has funded the job (also when the
// provider has already submitted, as the contract allows until the vote window ends), and when the
// provider has submitted, re-executes the job's spec and votes. Each step is one `step` call, so
// the loop can be driven by a timer, a cron job or a test. Spec, re-execution and vote are the
// same code as the `vote` command (`decide`, `castVote`); this file only decides when to call them.

import {
  parseAbiItem,
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

import {
  acceptJob,
  castVote,
  checkChain,
  JobStatus,
  MemberState,
  Phase,
  readJob,
  settle,
  settlementDue,
} from "./chain.ts";
import { canonicalHash } from "./canonical.ts";
import type { Fetcher } from "./inputs.ts";
import { parseSpec, specHash, type ReexecSpec } from "./spec.ts";
import { decide, type ExecuteOptions } from "./verify.ts";

/** Largest spec document accepted, in bytes. */
export const MAX_SPEC_BYTES = 64 * 1024;

/** Logs are read in windows of this many blocks (public RPCs cap `eth_getLogs` ranges). */
export const LOG_WINDOW = 5_000n;

const configured = parseAbiItem(
  "event Configured(uint256 indexed jobId, uint8 tier, uint8 threshold, uint64 voteWindow, uint64 challengeWindow, uint96 bond, uint256 providerAgentId, bytes32 specHash, address[] committee)",
);

/** Verdict phases of ARLVerifiedEvaluator in which the validator still has something to do. */
const OPEN_PHASE = 1; // Configured

export interface WatchState {
  /** Next block to read `Configured` logs from. */
  fromBlock: bigint;
  /** Jobs that name this validator and are not settled yet, as decimal strings. */
  jobs: string[];
}

export interface WatchDeps {
  client: PublicClient;
  wallet: WalletClient<Transport, Chain, Account>;
  evaluator: Address;
  /** Re-execution: the container runner and the input fetcher. */
  exec: ExecuteOptions;
  /** Fetches the spec document a job's description points to. */
  specFetcher: Pick<Fetcher, "file">;
  log?: (event: Record<string, unknown>) => void;
  /** Blocks per `eth_getLogs` call; the RPC's own limit (default LOG_WINDOW). */
  logWindow?: bigint;
}

/** The spec at `uri` (the job's description), parsed and size-checked. */
export async function fetchSpec(uri: string, fetcher: Pick<Fetcher, "file">): Promise<ReexecSpec> {
  if (!/^(https|ipfs):\/\//.test(uri)) throw new Error(`spec URI must be https or ipfs: ${uri}`);
  const body = await fetcher.file(uri);
  if (body.length > MAX_SPEC_BYTES) throw new Error(`spec at ${uri} is too large`);
  return parseSpec(JSON.parse(body.toString("utf8")) as unknown);
}

/** An arl-task/1 job's description: `arl-task:<task hash> <task URI>` (spec/arl-task/v0.1.0). */
const TASK_DESCRIPTION = /^arl-task:(0x[0-9a-f]{64}) ((?:https|ipfs):\/\/\S+)$/;

/**
 * Where a job's spec lives. A job opened from an arl-task/1 task points at the task: the task is
 * fetched, checked against the hash in the description, and its reexec workload's spec_uri is the
 * spec (whose hash the evaluator holds as specHash). Any other description is the spec URI itself.
 */
export async function specUriOf(
  description: string,
  fetcher: Pick<Fetcher, "file">,
): Promise<string> {
  const m = TASK_DESCRIPTION.exec(description);
  if (!m) return description;
  const [, hash, uri] = m as unknown as [string, string, string];
  const body = await fetcher.file(uri);
  if (body.length > MAX_SPEC_BYTES) throw new Error(`task at ${uri} is too large`);
  const task = JSON.parse(body.toString("utf8")) as unknown;
  if (canonicalHash(task) !== hash) throw new Error(`task at ${uri} does not match its hash`);
  const t = task as { version?: unknown; workload?: { class?: unknown; spec_uri?: unknown } };
  if (t.version !== "arl-task/1" || t.workload?.class !== "reexec") {
    throw new Error(`task at ${uri} is not a reexec arl-task/1 task`);
  }
  if (typeof t.workload.spec_uri !== "string") throw new Error(`task at ${uri} has no spec_uri`);
  return t.workload.spec_uri;
}

/** The spec of a job, from its description (see specUriOf). */
export async function fetchJobSpec(
  description: string,
  fetcher: Pick<Fetcher, "file">,
): Promise<ReexecSpec> {
  return fetchSpec(await specUriOf(description, fetcher), fetcher);
}

/**
 * Specs fetched and checked before accepting, by job id: the vote reuses them if the spec's host
 * stops answering after the bond is locked.
 */
const checkedSpecs = new Map<string, ReexecSpec>();

/** The job's spec if it can be fetched and matches the committed hash; otherwise null. */
async function usableSpec(
  description: string,
  committed: string,
  fetcher: Pick<Fetcher, "file">,
): Promise<ReexecSpec | null> {
  try {
    const spec = await fetchJobSpec(description, fetcher);
    return specHash(spec).toLowerCase() === committed.toLowerCase() ? spec : null;
  } catch {
    return null;
  }
}

/** Adds the jobs configured since `state.fromBlock` whose committee names `me`. */
async function discover(deps: WatchDeps, state: WatchState, me: Address): Promise<WatchState> {
  // cacheTime 0: viem otherwise reuses a block number for a few seconds and misses fresh logs.
  const head = await deps.client.getBlockNumber({ cacheTime: 0 });
  const jobs = new Set(state.jobs);
  const window = deps.logWindow ?? LOG_WINDOW;
  let from = state.fromBlock;
  while (from <= head) {
    const to = from + window - 1n < head ? from + window - 1n : head;
    const logs = await deps.client.getLogs({
      address: deps.evaluator,
      event: configured,
      fromBlock: from,
      toBlock: to,
    });
    for (const l of logs) {
      const committee = l.args.committee ?? [];
      if (l.args.jobId !== undefined && committee.some((a) => a.toLowerCase() === me.toLowerCase()))
        jobs.add(l.args.jobId.toString());
    }
    from = to + 1n;
  }
  return { fromBlock: from, jobs: [...jobs] };
}

/** One pass: discover new jobs, then accept or vote where the job is ready. Returns the new state. */
export async function step(deps: WatchDeps, state: WatchState): Promise<WatchState> {
  checkChain(await deps.client.getChainId());
  const me = deps.wallet.account.address;
  const log = deps.log ?? (() => undefined);
  const next = await discover(deps, state, me);
  const keep: string[] = [];
  for (const id of next.jobs) {
    const jobId = BigInt(id);
    try {
      const job = await readJob(
        deps.client,
        deps.evaluator,
        jobId,
        me,
        deps.logWindow ?? LOG_WINDOW,
      );
      if (job.phase !== OPEN_PHASE) {
        const decided =
          job.phase === Phase.Approved ||
          job.phase === Phase.Rejected ||
          job.phase === Phase.Disputed;
        if (!decided) {
          log({ jobId: id, event: "settled", phase: job.phase });
          continue;
        }
        // Decided but not paid out yet: keep watching, and make the settlement call once it is
        // due, so the outcome never waits for the provider or the client to act in time.
        keep.push(id);
        const due = await settlementDue(deps.client, deps.evaluator, jobId);
        if (due) {
          const tx = await settle(deps.wallet, deps.client, deps.evaluator, jobId, due).catch(
            (e: unknown) => {
              log({
                jobId: id,
                event: `${due}-pending`,
                reason: e instanceof Error ? e.message : String(e),
              });
              return null;
            },
          );
          if (tx) log({ jobId: id, event: due, tx });
        }
        continue;
      }
      keep.push(id);
      if (
        job.memberState === MemberState.Member &&
        (job.status === JobStatus.Funded || job.status === JobStatus.Submitted)
      ) {
        // Accepting locks a bond that is burned if this validator does not vote, so it accepts
        // only a job whose spec it can fetch and that matches the committed hash. A spec that
        // never resolves (or is the wrong one) is skipped and retried next pass, never accepted.
        const spec = await usableSpec(job.description, job.specHash, deps.specFetcher);
        if (!spec) {
          log({ jobId: id, event: "spec-unusable", reason: "spec not fetchable or hash differs" });
          continue;
        }
        checkedSpecs.set(id, spec);
        // A job can go from Funded to Submitted between two passes; the contract still accepts
        // it until the vote window ends. accept() also requires the provider's committee
        // approval; a revert here just means "not yet" and the job is tried again next pass.
        const tx = await acceptJob(deps.wallet, deps.client, deps.evaluator, jobId).catch(
          (e: unknown) => {
            log({
              jobId: id,
              event: "accept-pending",
              reason: e instanceof Error ? e.message : String(e),
            });
            return null;
          },
        );
        if (tx) log({ jobId: id, event: "accepted", tx });
      } else if (job.memberState === MemberState.Accepted && job.deliverable !== null) {
        const spec =
          (await usableSpec(job.description, job.specHash, deps.specFetcher)) ??
          checkedSpecs.get(id) ??
          (await fetchJobSpec(job.description, deps.specFetcher));
        const decision = await decide(spec, job.specHash, job.deliverable, deps.exec);
        const tx = await castVote(
          deps.wallet,
          deps.client,
          deps.evaluator,
          jobId,
          decision.approve,
          job.deliverable,
          decision.evidence,
        );
        log({ jobId: id, event: "voted", approve: decision.approve, reason: decision.reason, tx });
      }
    } catch (e) {
      keep.push(id);
      log({ jobId: id, event: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { fromBlock: next.fromBlock, jobs: [...new Set(keep)] };
}
