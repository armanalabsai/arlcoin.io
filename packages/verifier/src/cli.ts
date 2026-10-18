#!/usr/bin/env node
// arl-verifier: hash a spec, run it (a provider's deliverable), check a deliverable, or check a
// job on chain and vote on it.
//
//   node src/cli.ts hash <spec.json>
//   node src/cli.ts run <spec.json>
//   node src/cli.ts check <spec.json> <deliverable>
//   ARL_VALIDATOR_KEY=0x… node src/cli.ts vote <rpc> <evaluator> <jobId> <spec.json>
//   ARL_VALIDATOR_KEY=0x… node src/cli.ts watch <rpc> <evaluator> <fromBlock> [state.json]
//
// `watch` runs unattended: every 15 seconds it accepts the funded jobs whose committee names this
// validator and votes on the submitted ones, fetching each spec from the job's description
// (https or ipfs). Its progress is kept in state.json (default .arl-verifier-state.json). A
// negative fromBlock counts back from the head; ARL_WATCH_ONCE=1 makes one pass and exits.
//
// `vote` reads the job, refuses a spec whose hash differs from the job's specHash, re-runs it,
// and votes approve or reject (the validator must have accepted the job). Base Sepolia and the
// local chain only. The key is read from the environment, never from arguments.

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { createPublicClient, createWalletClient, http, isAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { castVote, MemberState, readJob } from "./chain.ts";
import { DockerRunner } from "./docker.ts";
import { networkFetcher } from "./inputs.ts";
import { parseSpec, specHash } from "./spec.ts";
import { decide, execute } from "./verify.ts";
import { step, type WatchState } from "./watch.ts";

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
      const key = process.env.ARL_VALIDATOR_KEY;
      if (key === undefined || !isHex(key) || key.length !== 66)
        fail("ARL_VALIDATOR_KEY must be set");
      const account = privateKeyToAccount(key);
      const client = createPublicClient({ transport: http(rpc) });
      const chainId = await client.getChainId();
      const chain = { ...baseSepolia, id: chainId };
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
      const key = process.env.ARL_VALIDATOR_KEY;
      if (key === undefined || !isHex(key) || key.length !== 66)
        fail("ARL_VALIDATOR_KEY must be set");
      const account = privateKeyToAccount(key);
      const client = createPublicClient({ transport: http(rpc) });
      const chain = { ...baseSepolia, id: await client.getChainId() };
      const wallet = createWalletClient({ account, chain, transport: http(rpc) });
      // A negative fromBlock counts back from the head ("-86400": the last two days on Base).
      const head = await client.getBlockNumber({ cacheTime: 0 });
      const from = fromText.startsWith("-") ? head + BigInt(fromText) : BigInt(fromText);
      let state: WatchState = { fromBlock: from < 0n ? 0n : from, jobs: [] };
      try {
        const saved = JSON.parse(await readFile(statePath, "utf8")) as {
          fromBlock: string;
          jobs: string[];
        };
        state = { fromBlock: BigInt(saved.fromBlock), jobs: saved.jobs };
      } catch {
        // No saved state yet: start from the given block.
      }
      const deps = {
        client,
        wallet,
        evaluator,
        exec: opts,
        specFetcher: networkFetcher,
        // ARL_LOG_WINDOW: blocks per eth_getLogs call, up to the RPC's limit.
        logWindow: BigInt(process.env.ARL_LOG_WINDOW ?? "5000"),
        log: (e: Record<string, unknown>) => {
          print({ at: new Date().toISOString(), ...e });
        },
      };
      for (;;) {
        try {
          state = await step(deps, state);
          await writeFile(
            statePath,
            JSON.stringify({ fromBlock: state.fromBlock.toString(), jobs: state.jobs }),
          );
        } catch (e) {
          print({ event: "error", error: e instanceof Error ? e.message : String(e) });
        }
        // ARL_WATCH_ONCE=1: one pass and exit, for a scheduled job (.github/workflows/validators.yml).
        if (process.env.ARL_WATCH_ONCE === "1") return;
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    default:
      fail("commands: hash, run, check, vote, watch");
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
