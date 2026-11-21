// End to end on a local Anvil chain: an unattended provider (`provideStep`) and three unattended
// validators (`step`) take a job from funded to paid with nobody acting by hand after the client
// has opened and funded it. Needs Foundry (anvil) on PATH and `forge build` run in contracts/.
// Run: npm run test:anvil -w @arl/verifier
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { URL } from "node:url";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { openVerifiedJob } from "@arl/sdk";

import {
  DEFAULT_ACCEPT_POLICY,
  DEFAULT_PROVIDE_POLICY,
  parseProvideState,
  parseSpec,
  provideStep,
  serializeProvideState,
  specHash,
  step,
  type ContainerRunner,
  type ProvideState,
  type WatchState,
} from "../src/index.ts";

const PORT = 8553;
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's public development keys; local chain only.
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412cacc3dc8a9b8a7",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];
const [client, provider, ...validators] = KEYS.map((k) => privateKeyToAccount(k)) as [
  PrivateKeyAccount,
  PrivateKeyAccount,
  PrivateKeyAccount,
  PrivateKeyAccount,
  PrivateKeyAccount,
];
const chain = defineChain({
  id: 31_337,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });
const wallet = (a: PrivateKeyAccount) =>
  createWalletClient({ account: a, chain, transport: http(RPC) });

const specText = readFileSync(new URL("../examples/busybox-summary.json", import.meta.url), "utf8");
const SPEC = parseSpec(JSON.parse(specText) as unknown);
const SPEC_URI = "https://example.org/busybox-summary.json";
let runs = 0;
// Writes exactly what the example spec's container writes, so the hashes match a real run.
const runner: ContainerRunner = {
  async run(_s, _work, out) {
    runs += 1;
    await writeFile(join(out, "summary.txt"), "passed=3 failed=0\n");
    return { exitCode: 0, timedOut: false };
  },
};
const exec = {
  runner,
  fetcher: { file: () => Promise.reject(new Error("no inputs")), git: () => Promise.resolve() },
};
const specFetcher = { file: () => Promise.resolve(Buffer.from(specText)) };

function artifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const url = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}

async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet(client).deployContract({ abi, bytecode: bytecode.object, args });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  assert.ok(r.contractAddress);
  return r.contractAddress;
}

async function send(
  a: PrivateKeyAccount,
  address: Address,
  name: string,
  fn: string,
  args: readonly unknown[],
) {
  const hash = await wallet(a).writeContract({
    address,
    abi: artifact(name).abi,
    functionName: fn,
    args,
  });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success", fn);
}

let anvil: ChildProcess;
let token: Address;
let jobs: Address;
let evaluator: Address;

before(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch (e) {
      if (i > 50) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  for (const a of [client, provider, ...validators])
    await testClient.setBalance({ address: a.address, value: parseUnits("10", 18) });
  const h = client.address;
  token = await deploy("ARLToken", [
    {
      publicLaunch: h,
      communityStaking: h,
      ecosystemGrowth: h,
      strategicPartnerships: h,
      liquidity: h,
      founder: h,
      investors: h,
      treasury: h,
      team: h,
      earlyUsers: h,
      grantsBugBounty: h,
    },
  ]);
  jobs = await deploy("ARLJobs", [token]);
  const zero = "0x0000000000000000000000000000000000000000";
  evaluator = await deploy("ARLVerifiedEvaluator", [
    jobs,
    "0x000000000000000000000000000000000000A4b1",
    3600n,
    parseUnits("1", 18),
    zero,
    zero,
    zero,
  ]);
  for (const v of validators) {
    await send(client, token, "ARLToken", "transfer", [v.address, parseUnits("100", 18)]);
    await send(v, token, "ARLToken", "approve", [evaluator, parseUnits("100", 18)]);
    await send(v, evaluator, "ARLVerifiedEvaluator", "stake", [parseUnits("100", 18)]);
  }
});

after(() => {
  anvil.kill();
});

const balance = (who: Address) =>
  publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  });

/** The client's whole part: open, configure, set the budget and fund. Nothing else is by hand. */
async function openAndFund(budget: bigint): Promise<bigint> {
  const { jobId } = await openVerifiedJob(
    { publicClient, walletClient: wallet(client) },
    {
      provider: provider.address,
      specUri: SPEC_URI,
      specHash: specHash(SPEC),
      committee: validators.map((v) => v.address),
      threshold: 2,
      jobs,
      evaluator,
    },
  );
  await send(client, jobs, "ARLJobs", "setBudget", [jobId, budget, "0x"]);
  await send(client, token, "ARLToken", "approve", [jobs, budget]);
  await send(client, jobs, "ARLJobs", "fund", [jobId, budget, "0x"]);
  return jobId;
}

const policy = {
  ...DEFAULT_PROVIDE_POLICY,
  minBudget: parseUnits("10", 18),
  minSecondsToDeadline: 0n,
};
const events: Record<string, unknown>[] = [];
let providerState: ProvideState = { fromBlock: 0n, jobs: [] };
const validatorStates = new Map<string, WatchState>();

async function providerPass() {
  providerState = await provideStep(
    {
      client: publicClient,
      wallet: wallet(provider),
      evaluator,
      exec,
      specFetcher,
      policy,
      log: (e) => events.push(e),
    },
    // Through the saved form, as a restart would read it.
    parseProvideState(serializeProvideState(providerState)),
  );
}

async function validatorsPass() {
  for (const v of validators) {
    const s = validatorStates.get(v.address) ?? { fromBlock: 0n, jobs: [] };
    validatorStates.set(
      v.address,
      await step(
        {
          client: publicClient,
          wallet: wallet(v),
          evaluator,
          exec,
          specFetcher,
          acceptPolicy: { ...DEFAULT_ACCEPT_POLICY, minBudget: 0n, minVoteWindow: 0n },
        },
        s,
      ),
    );
  }
}

const named = (event: string) => events.filter((e) => e.event === event);

describe("an unattended provider on Anvil", () => {
  it("takes a funded job to paid with unattended validators, running the work once", async () => {
    const before = await balance(provider.address);
    const jobId = await openAndFund(parseUnits("10", 18));

    // Pass 1: the provider approves the committee, runs the work and waits for the committee.
    await providerPass();
    assert.equal(named("committee-approved").length, 1);
    assert.equal(named("executed").length, 1);
    assert.equal(named("waiting-for-committee").length, 1);
    assert.equal(runs, 1);

    // The validators accept; the provider submits without running the work again.
    await validatorsPass();
    await providerPass();
    assert.equal(named("submitted").length, 1);
    assert.equal(runs, 1, "the saved result is submitted; the work is not run twice");

    // The validators re-execute and vote; after the challenge window anyone finalizes.
    await validatorsPass();
    await testClient.increaseTime({ seconds: 3600 });
    await testClient.mine({ blocks: 1 });
    await send(client, evaluator, "ARLVerifiedEvaluator", "finalize", [jobId]);
    assert.equal((await balance(provider.address)) - before, parseUnits("10", 18));

    // The finished job leaves the provider's list.
    await providerPass();
    assert.deepEqual(providerState.jobs, []);
    assert.equal(named("finished").length, 1);
  });

  it("does not approve or run a job below its price", async () => {
    const runsBefore = runs;
    const jobId = await openAndFund(parseUnits("9", 18));
    await providerPass();
    const refusal = named("not-taken").find((e) => e.jobId === jobId.toString());
    assert.equal(refusal?.reason, "budget is below this provider's price");
    assert.equal(runs, runsBefore);
    const verdict = (await publicClient.readContract({
      address: evaluator,
      abi: artifact("ARLVerifiedEvaluator").abi,
      functionName: "getVerdict",
      args: [jobId],
    })) as { providerApproved: boolean };
    assert.equal(verdict.providerApproved, false);
  });
});
