#!/usr/bin/env node
// arl-verifier: hash a spec, run it (a provider's deliverable), check a deliverable, or check a
// job on chain and vote on it.
//
//   node src/cli.ts make-spec <repository https url> <commit> [directory]   > spec.json
//   node src/cli.ts hash <spec.json>
//   node src/cli.ts run <spec.json>
//   node src/cli.ts check <spec.json> <deliverable>
//   ARL_VALIDATOR_KEY=0x… node src/cli.ts vote <rpc> <evaluator> <jobId> <spec.json>
//   ARL_VALIDATOR_KEY=0x… node src/cli.ts watch <rpc> <evaluator> <fromBlock> [state.json]
//
// `make-spec` prints the spec of a test run with Node's built-in runner at an exact commit: the
// job is accepted only when every test passes, and its result is the runner's summary counts.
//
// `watch` runs unattended: every 15 seconds it accepts the funded jobs whose committee names this
// validator and votes on the submitted ones, fetching each spec from the job's description
// (https or ipfs). Its progress is kept in state.json (default .arl-verifier-state.json). A
// negative fromBlock counts back from the head; ARL_WATCH_ONCE=1 makes one pass and exits.
//
//   ARL_PROVIDER_KEY=0x… ARL_MIN_BUDGET=<base units> node src/cli.ts provide <rpc> <evaluator> <fromBlock> [state.json]
//
// `provide` is the provider's side of `watch`: it takes the funded jobs that name this account as
// provider, approves the committee, runs the spec and submits the result hash once enough
// committee members have accepted. Its progress is kept in state.json (default
// .arl-provider-state.json), so a job's work runs once across restarts.
//
//   node src/cli.ts bundle <rpc> <evaluator> <jobId> <fromBlock>        > evidence.json
//   node src/cli.ts verify-bundle <rpc> <evidence.json> <fromBlock>
//
// `bundle` writes one job's evidence (arl-evidence/1: spec hash, submission, votes, decision,
// finalize, escrow settlement, each with block and tx). `verify-bundle` checks it for internal
// consistency and re-reads every field from the chain; it exits 1 on any mismatch.
//
// `vote` reads the job, refuses a spec whose hash differs from the job's specHash, re-runs it,
// and votes approve or reject (the validator must have accepted the job). Base Mainnet, Base
// Sepolia and the local chain only. The key is read from the environment, never from arguments.

import { readFile, rename, writeFile } from "node:fs/promises";
import process from "node:process";

import { createPublicClient, createWalletClient, http, isAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

import { castVote, MemberState, readJob } from "./chain.ts";
import { DockerRunner } from "./docker.ts";
import {
  DEFAULT_PROVIDE_POLICY,
  parseProvideState,
  provideStep,
  serializeProvideState,
  type ProvidePolicy,
  type ProvideState,
} from "./provide.ts";
import { parseWatchState, saveWatchState } from "./state.ts";
import { networkFetcher } from "./inputs.ts";
import { validatorKey } from "./key.ts";
import { nodeTestSpec } from "./make.ts";
import { parseSpec, specHash } from "./spec.ts";
import { decide, execute } from "./verify.ts";
import { buildBundle, verifyBundle, type EvidenceBundle } from "./bundle.ts";
import { DEFAULT_ACCEPT_POLICY, step, type AcceptPolicy, type WatchState } from "./watch.ts";

/** viem chain for signing: Base Mainnet as is, otherwise Base Sepolia's settings with the id. */
const chainFor = (id: number) => (id === base.id ? base : { ...baseSepolia, id });

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): never {
  process.stderr.write(`arl-verifier: ${message}\n`);
  process.exit(2);
}

async function loadSpec(path: string | undefined) {
  if (path === undefined) fail("missing spec path");
  return parseSpec(JSON.parse(await readFile(path, "utf8")) as unknown);
}

const opts = { runner: new DockerRunner(), fetcher: networkFetcher };

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...args] = argv;
  switch (command) {
    case "make-spec": {
      const [repository, commit, directory] = args;
      if (repository === undefined || commit === undefined) {
        fail("usage: make-spec <repository https url> <commit> [directory]");
      }
      const spec = nodeTestSpec({ repository, commit, ...(directory ? { directory } : {}) });
      print(spec);
      process.stderr.write(`specHash ${specHash(spec)}\n`);
      return;
    }
    case "hash": {
      print({ specHash: specHash(await loadSpec(args[0])) });
      return;
    }
    case "run": {
      const { result, hash } = await execute(await loadSpec(args[0]), opts);
      print({ deliverable: hash, result });
      return;
    }
    case "check": {
      const spec = await loadSpec(args[0]);
      const deliverable = args[1];
      if (
        deliverable === undefined ||
        !isHex(deliverable, { strict: true }) ||
        deliverable.length !== 66
      ) {
        fail("deliverable must be 0x + 64 hex");
      }
      print(await decide(spec, specHash(spec), deliverable, opts));
      return;
    }
    case "vote": {
      const [rpc, evaluator, jobIdText, specPath] = args;
      if (
        rpc === undefined ||
        evaluator === undefined ||
        !isAddress(evaluator) ||
        jobIdText === undefined
      ) {
        fail("usage: vote <rpc> <evaluator> <jobId> <spec.json>");
      }
      let key: `0x${string}`;
      try {
        key = validatorKey(process.env.ARL_VALIDATOR_KEY);
      } catch (error) {
        fail((error as Error).message);
      }
      const account = privateKeyToAccount(key);
      const client = createPublicClient({ transport: http(rpc) });
      const chainId = await client.getChainId();
      const chain = chainFor(chainId);
      const wallet = createWalletClient({ account, chain, transport: http(rpc) });
      const jobId = BigInt(jobIdText);
      const job = await readJob(client, evaluator, jobId, account.address);
      if (job.memberState !== MemberState.Accepted) fail("this validator has not accepted the job");
      if (job.deliverable === null) fail("the job has no submitted deliverable");
      const decision = await decide(await loadSpec(specPath), job.specHash, job.deliverable, opts);
      const tx = await castVote(
        wallet,
        client,
        evaluator,
        jobId,
        decision.approve,
        job.deliverable,
        decision.evidence,
      );
      print({ ...decision, tx });
      return;
    }
    case "watch": {
      const [rpc, evaluator, fromText, statePath = ".arl-verifier-state.json"] = args;
      if (
        rpc === undefined ||
        evaluator === undefined ||
        !isAddress(evaluator) ||
        fromText === undefined ||
        !/^-?\d+$/.test(fromText)
      ) {
        fail("usage: watch <rpc> <evaluator> <fromBlock> [state.json]");
      }
      // What this validator accepts (see AcceptPolicy). Amounts are in the token's smallest unit.
      //   ARL_MIN_BUDGET        smallest job budget (default: at least the bond; required when
      //                         stakes are in another token than the escrow's)
      //   ARL_MAX_BOND          largest bond locked for one job (default 100 ARL)
      //   ARL_MAX_DEADLINE_DAYS longest time until the job's deadline (default 30)
      //   ARL_MIN_VOTE_MINUTES  shortest vote window (default 60)
      //   ARL_CLIENTS           comma-separated client addresses; when set, only their jobs
      let acceptPolicy: AcceptPolicy;
      try {
        const env = process.env;
        const clients = (env.ARL_CLIENTS ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c !== "");
        const bad = clients.find((c) => !isAddress(c));
        if (bad !== undefined) throw new Error(`ARL_CLIENTS: ${bad} is not an address`);
        acceptPolicy = {
          minBudget: env.ARL_MIN_BUDGET
            ? BigInt(env.ARL_MIN_BUDGET)
            : DEFAULT_ACCEPT_POLICY.minBudget,
          maxBond: env.ARL_MAX_BOND ? BigInt(env.ARL_MAX_BOND) : DEFAULT_ACCEPT_POLICY.maxBond,
          maxSecondsToDeadline: env.ARL_MAX_DEADLINE_DAYS
            ? BigInt(env.ARL_MAX_DEADLINE_DAYS) * 86_400n
            : DEFAULT_ACCEPT_POLICY.maxSecondsToDeadline,
          minVoteWindow: env.ARL_MIN_VOTE_MINUTES
            ? BigInt(env.ARL_MIN_VOTE_MINUTES) * 60n
            : DEFAULT_ACCEPT_POLICY.minVoteWindow,
          clients: clients.length > 0 ? (clients as `0x${string}`[]) : null,
        };
      } catch (error) {
        fail(`accept policy: ${(error as Error).message}`);
      }
      let key: `0x${string}`;
      try {
        key = validatorKey(process.env.ARL_VALIDATOR_KEY);
      } catch (error) {
        fail((error as Error).message);
      }
      const account = privateKeyToAccount(key);
      const client = createPublicClient({ transport: http(rpc) });
      const chain = chainFor(await client.getChainId());
      const wallet = createWalletClient({ account, chain, transport: http(rpc) });
      // A negative fromBlock counts back from the head ("-86400": the last two days on Base).
      const head = await client.getBlockNumber({ cacheTime: 0 });
      const from = fromText.startsWith("-") ? head + BigInt(fromText) : BigInt(fromText);
      let state: WatchState = { fromBlock: from < 0n ? 0n : from, jobs: [] };
      // A missing file is a first start; anything else that fails to load stops the validator
      // loudly instead of silently starting over and forgetting its jobs (security report
      // 2026-11-20).
      let savedText: string | null = null;
      try {
        savedText = await readFile(statePath, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (savedText !== null) {
        try {
          state = parseWatchState(savedText);
        } catch (e) {
          fail(
            `the watch state ${statePath} is unreadable (${(e as Error).message}); ` +
              "restore it or move it aside before starting again",
          );
        }
      }
      const deps = {
        client,
        wallet,
        evaluator,
        exec: opts,
        specFetcher: networkFetcher,
        // ARL_LOG_WINDOW: blocks per eth_getLogs call, up to the RPC's limit.
        logWindow: BigInt(process.env.ARL_LOG_WINDOW ?? "5000"),
        acceptPolicy,
        log: (e: Record<string, unknown>) => {
          print({ at: new Date().toISOString(), ...e });
        },
      };
      for (;;) {
        try {
          state = await step(deps, state);
          await saveWatchState(statePath, state);
        } catch (e) {
          print({ event: "error", error: e instanceof Error ? e.message : String(e) });
        }
        // ARL_WATCH_ONCE=1: one pass and exit, for a scheduled job (.github/workflows/validators.yml).
        if (process.env.ARL_WATCH_ONCE === "1") return;
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    case "bundle": {
      const [rpc, evaluator, jobIdText, fromText] = args;
      if (
        rpc === undefined ||
        evaluator === undefined ||
        !isAddress(evaluator) ||
        jobIdText === undefined ||
        !/^\d+$/.test(jobIdText) ||
        fromText === undefined ||
        !/^\d+$/.test(fromText)
      ) {
        fail("usage: bundle <rpc> <evaluator> <jobId> <fromBlock>");
      }
      const client = createPublicClient({ transport: http(rpc) });
      const window = BigInt(process.env.ARL_LOG_WINDOW ?? "5000");
      print(await buildBundle(client, evaluator, BigInt(jobIdText), BigInt(fromText), window));
      return;
    }
    case "verify-bundle": {
      const [rpc, path, fromText] = args;
      if (
        rpc === undefined ||
        path === undefined ||
        fromText === undefined ||
        !/^\d+$/.test(fromText)
      )
        fail("usage: verify-bundle <rpc> <evidence.json> <fromBlock>");
      const bundle = JSON.parse(await readFile(path, "utf8")) as EvidenceBundle;
      const client = createPublicClient({ transport: http(rpc) });
      const window = BigInt(process.env.ARL_LOG_WINDOW ?? "5000");
      const problems = await verifyBundle(client, bundle, BigInt(fromText), window);
      print({ valid: problems.length === 0, problems });
      if (problems.length > 0) process.exit(1);
      return;
    }
    case "provide": {
      const [rpc, evaluator, fromText, statePath = ".arl-provider-state.json"] = args;
      if (
        rpc === undefined ||
        evaluator === undefined ||
        !isAddress(evaluator) ||
        fromText === undefined ||
        !/^-?\d+$/.test(fromText)
      ) {
        fail("usage: provide <rpc> <evaluator> <fromBlock> [state.json]");
      }
      // What this provider takes (see ProvidePolicy). Amounts are in the token's smallest unit.
      //   ARL_MIN_BUDGET             smallest job budget: the provider's price (required)
      //   ARL_MAX_SECONDS            longest run a spec may ask for (default 600)
      //   ARL_MAX_MEMORY_MB          most memory a spec may ask for (default 1024)
      //   ARL_MIN_HOURS_TO_DEADLINE  shortest time left until the job's deadline (default 6)
      //   ARL_IMAGES                 comma-separated container digests; when set, only these run
      //   ARL_CLIENTS                comma-separated client addresses; when set, only their jobs
      //   ARL_VALIDATORS             comma-separated validators; when set, the whole committee must be among them
      let policy: ProvidePolicy;
      try {
        const env = process.env;
        const list = (name: string) => {
          const items = (env[name] ?? "")
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c !== "");
          return items.length > 0 ? items : null;
        };
        const addresses = (name: string) => {
          const items = list(name);
          const bad = items?.find((c) => !isAddress(c));
          if (bad !== undefined) throw new Error(`${name}: ${bad} is not an address`);
          return items as `0x${string}`[] | null;
        };
        if (!env.ARL_MIN_BUDGET || !/^\d+$/.test(env.ARL_MIN_BUDGET) || env.ARL_MIN_BUDGET === "0")
          throw new Error("ARL_MIN_BUDGET must be set to the provider's price in base units");
        policy = {
          minBudget: BigInt(env.ARL_MIN_BUDGET),
          maxSeconds: env.ARL_MAX_SECONDS
            ? Number(env.ARL_MAX_SECONDS)
            : DEFAULT_PROVIDE_POLICY.maxSeconds,
          maxMemoryMb: env.ARL_MAX_MEMORY_MB
            ? Number(env.ARL_MAX_MEMORY_MB)
            : DEFAULT_PROVIDE_POLICY.maxMemoryMb,
          minSecondsToDeadline: env.ARL_MIN_HOURS_TO_DEADLINE
            ? BigInt(env.ARL_MIN_HOURS_TO_DEADLINE) * 3_600n
            : DEFAULT_PROVIDE_POLICY.minSecondsToDeadline,
          images: list("ARL_IMAGES"),
          clients: addresses("ARL_CLIENTS"),
          validators: addresses("ARL_VALIDATORS"),
        };
        if (!Number.isSafeInteger(policy.maxSeconds) || policy.maxSeconds <= 0)
          throw new Error("ARL_MAX_SECONDS must be a positive integer");
        if (!Number.isSafeInteger(policy.maxMemoryMb) || policy.maxMemoryMb <= 0)
          throw new Error("ARL_MAX_MEMORY_MB must be a positive integer");
      } catch (error) {
        fail(`provider policy: ${(error as Error).message}`);
      }
      let key: `0x${string}`;
      try {
        // The same format as the validator key; only the variable's name differs.
        key = validatorKey(process.env.ARL_PROVIDER_KEY);
      } catch (error) {
        fail((error as Error).message.replace("ARL_VALIDATOR_KEY", "ARL_PROVIDER_KEY"));
      }
      const account = privateKeyToAccount(key);
      const client = createPublicClient({ transport: http(rpc) });
      const chain = chainFor(await client.getChainId());
      const wallet = createWalletClient({ account, chain, transport: http(rpc) });
      const head = await client.getBlockNumber({ cacheTime: 0 });
      const from = fromText.startsWith("-") ? head + BigInt(fromText) : BigInt(fromText);
      let state: ProvideState = { fromBlock: from < 0n ? 0n : from, jobs: [] };
      // A missing file is a first start; a file that does not load stops the provider loudly
      // instead of starting over and running paid work twice.
      let savedText: string | null = null;
      try {
        savedText = await readFile(statePath, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (savedText !== null) {
        try {
          state = parseProvideState(savedText);
        } catch (e) {
          fail(
            `the provider state ${statePath} is unreadable (${(e as Error).message}); ` +
              "restore it or move it aside before starting again",
          );
        }
      }
      const deps = {
        client,
        wallet,
        evaluator,
        exec: opts,
        specFetcher: networkFetcher,
        logWindow: BigInt(process.env.ARL_LOG_WINDOW ?? "5000"),
        policy,
        log: (e: Record<string, unknown>) => {
          print({ at: new Date().toISOString(), ...e });
        },
      };
      for (;;) {
        try {
          state = await provideStep(deps, state);
          // Written beside the file and renamed over it, so a crash never leaves half a state.
          await writeFile(`${statePath}.tmp`, serializeProvideState(state));
          await rename(`${statePath}.tmp`, statePath);
        } catch (e) {
          print({ event: "error", error: e instanceof Error ? e.message : String(e) });
        }
        // ARL_WATCH_ONCE=1: one pass and exit, for a scheduled job.
        if (process.env.ARL_WATCH_ONCE === "1") return;
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    default:
      fail("commands: make-spec, hash, run, check, vote, watch, provide, bundle, verify-bundle");
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
