#!/usr/bin/env node
// arl-verifier: hash a spec, run it (a provider's deliverable), check a deliverable, or check a
// job on chain and vote on it.
//
//   node src/cli.ts hash <spec.json>
//   node src/cli.ts run <spec.json>
//   node src/cli.ts check <spec.json> <deliverable>
//   ARL_VALIDATOR_KEY=0x… node src/cli.ts vote <rpc> <evaluator> <jobId> <spec.json>
//
// `vote` reads the job, refuses a spec whose hash differs from the job's specHash, re-runs it,
// and votes approve or reject (the validator must have accepted the job). Base Sepolia and the
// local chain only. The key is read from the environment, never from arguments.

import { readFile } from "node:fs/promises";
import process from "node:process";

import { createPublicClient, createWalletClient, http, isAddress, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { castVote, MemberState, readJob } from "./chain.ts";
import { DockerRunner } from "./docker.ts";
import { networkFetcher } from "./inputs.ts";
import { parseSpec, specHash } from "./spec.ts";
import { decide, execute } from "./verify.ts";

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
    default:
      fail("commands: hash, run, check, vote");
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
