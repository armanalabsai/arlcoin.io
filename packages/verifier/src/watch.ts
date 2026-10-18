// A validator that runs unattended: it finds the jobs whose committee names it, accepts them once
// the provider has approved the committee and the client has funded the job, and when the
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

import { acceptJob, castVote, checkChain, JobStatus, MemberState, readJob } from "./chain.ts";
import type { Fetcher } from "./inputs.ts";
import { parseSpec, type ReexecSpec } from "./spec.ts";
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
}

/** The spec at `uri` (the job's description), parsed and size-checked. */
export async function fetchSpec(uri: string, fetcher: Pick<Fetcher, "file">): Promise<ReexecSpec> {
  if (!/^(https|ipfs):\/\//.test(uri)) throw new Error(`spec URI must be https or ipfs: ${uri}`);
  const body = await fetcher.file(uri);
  if (body.length > MAX_SPEC_BYTES) throw new Error(`spec at ${uri} is too large`);
  return parseSpec(JSON.parse(body.toString("utf8")) as unknown);
}

/** Adds the jobs configured since `state.fromBlock` whose committee names `me`. */
async function discover(deps: WatchDeps, state: WatchState, me: Address): Promise<WatchState> {
  // cacheTime 0: viem otherwise reuses a block number for a few seconds and misses fresh logs.
  const head = await deps.client.getBlockNumber({ cacheTime: 0 });
  const jobs = new Set(state.jobs);
  let from = state.fromBlock;
  while (from <= head) {
    const to = from + LOG_WINDOW - 1n < head ? from + LOG_WINDOW - 1n : head;
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
      const job = await readJob(deps.client, deps.evaluator, jobId, me);
      if (job.phase !== OPEN_PHASE) {
        log({ jobId: id, event: "settled", phase: job.phase });
        continue;
      }
      keep.push(id);
      if (job.memberState === MemberState.Member && job.status === JobStatus.Funded) {
        // accept() also requires the provider's committee approval; a revert here just means
        // "not yet" and the job is tried again on the next pass.
        const tx = await acceptJob(deps.wallet, deps.client, deps.evaluator, jobId).catch(
          () => null,
        );
        if (tx) log({ jobId: id, event: "accepted", tx });
      } else if (job.memberState === MemberState.Accepted && job.deliverable !== null) {
        const spec = await fetchSpec(job.description, deps.specFetcher);
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
