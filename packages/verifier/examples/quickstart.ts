// Quickstart: one verified ERC-8183 job, end to end, on a local Anvil chain.
//
//   cd contracts && forge build && cd ..
//   npm run quickstart -w @arl/verifier            # in-process runner (no Docker needed)
//   ARL_QUICKSTART_DOCKER=1 npm run quickstart -w @arl/verifier   # real container re-execution
//
// Steps: deploy ARLToken, ARLJobs and ARLVerifiedEvaluator; three validators stake; the client
// opens a job with the SDK (`openVerifiedJob`); the provider approves the committee, the client
// funds it; the provider runs the spec and submits the result; three unattended validators (`step`,
// the same code as `arl-verifier watch`) accept, re-execute and vote; the challenge window passes;
// the job is finalized and paid; the evidence bundle is built and verified. It prints the time each
// stage took. Without ARL_QUICKSTART_DOCKER the container is replaced by an in-process runner that
// writes exactly what the busybox spec writes, so the hashes are the same as a real run.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
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
  buildBundle,
  DockerRunner,
  execute,
  parseSpec,
  specHash,
  step,
  verifyBundle,
  type ContainerRunner,
  type WatchState,
} from "../src/index.ts";

const PORT = 8549;
const RPC = `http://127.0.0.1:${PORT}`;
// Fixed development keys, funded below with test ETH; local chain only.
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

const specPath = new URL("./busybox-summary.json", import.meta.url);
const specText = readFileSync(specPath, "utf8");
const SPEC = parseSpec(JSON.parse(specText) as unknown);
const inProcess: ContainerRunner = {
  async run(_s, _work, out) {
    await writeFile(join(out, "summary.txt"), "passed=3 failed=0\n");
    return { exitCode: 0, timedOut: false };
  },
};
const runner = process.env.ARL_QUICKSTART_DOCKER === "1" ? new DockerRunner() : inProcess;
const exec = {
  runner,
  fetcher: { file: () => Promise.reject(new Error("no inputs")), git: () => Promise.resolve() },
};

function artifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const url = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}

async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet(client).deployContract({ abi, bytecode: bytecode.object, args });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error(`${name} not deployed`);
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
  if (r.status !== "success") throw new Error(`${fn} reverted`);
}

const t0 = Date.now();
const lap = (label: string) => {
  process.stdout.write(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${label}\n`);
};

const anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
try {
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
  const token = await deploy("ARLToken", [
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
  const jobs = await deploy("ARLJobs", [token]);
  const zero = "0x0000000000000000000000000000000000000000";
  const evaluator = await deploy("ARLVerifiedEvaluator", [
    jobs,
    client.address,
    3600n,
    parseUnits("1", 18),
    zero,
    zero,
  ]);
  lap("contracts deployed (local chain)");

  for (const v of validators) {
    await send(client, token, "ARLToken", "transfer", [v.address, parseUnits("100", 18)]);
    await send(v, token, "ARLToken", "approve", [evaluator, parseUnits("100", 18)]);
    await send(v, evaluator, "ARLVerifiedEvaluator", "stake", [parseUnits("100", 18)]);
  }
  lap("three validators staked 100 ARL each");

  const { jobId } = await openVerifiedJob(
    { publicClient, walletClient: wallet(client) },
    {
      provider: provider.address,
      specUri:
        "https://raw.githubusercontent.com/armanalabsai/arlcoin.io/main/packages/verifier/examples/busybox-summary.json",
      specHash: specHash(SPEC),
      committee: validators.map((v) => v.address),
      threshold: 2,
      jobs,
      evaluator,
    },
  );
  await send(provider, evaluator, "ARLVerifiedEvaluator", "approveCommittee", [jobId]);
  await send(provider, jobs, "ARLJobs", "setBudget", [jobId, parseUnits("10", 18), "0x"]);
  await send(client, token, "ARLToken", "approve", [jobs, parseUnits("10", 18)]);
  await send(client, jobs, "ARLJobs", "fund", [jobId, parseUnits("10", 18), "0x"]);
  lap(`job ${jobId} opened with the SDK, committee approved, funded with 10 ARL`);

  const states = new Map<string, WatchState>();
  const specFetcher = { file: () => Promise.resolve(Buffer.from(specText)) };
  const pass = async () => {
    for (const v of validators) {
      const s = states.get(v.address) ?? { fromBlock: 0n, jobs: [] };
      states.set(
        v.address,
        await step({ client: publicClient, wallet: wallet(v), evaluator, exec, specFetcher }, s),
      );
    }
  };
  await pass();
  lap("validators accepted the job (unattended)");

  const { hash: deliverable } = await execute(SPEC, exec);
  await send(provider, jobs, "ARLJobs", "submit", [jobId, deliverable, "0x"]);
  lap(`provider submitted deliverable ${deliverable.slice(0, 10)}…`);

  await pass();
  lap("validators re-executed the spec and voted");

  await testClient.increaseTime({ seconds: 3600 });
  await testClient.mine({ blocks: 1 });
  await send(client, evaluator, "ARLVerifiedEvaluator", "finalize", [jobId]);
  lap("challenge window passed; job finalized and provider paid");

  const bundle = await buildBundle(publicClient, evaluator, jobId, 0n);
  const problems = await verifyBundle(publicClient, bundle, 0n);
  if (problems.length > 0) throw new Error(`evidence bundle invalid: ${problems.join("; ")}`);
  lap(
    `evidence bundle verified: ${bundle.votes.filter((v) => v.approve).length} approvals, escrow ${bundle.settlement?.outcome ?? "?"}`,
  );
  process.stdout.write(
    `\nDone in ${((Date.now() - t0) / 1000).toFixed(1)} s (${runner === inProcess ? "in-process runner" : "Docker"}).\n`,
  );
} finally {
  anvil.kill();
}
