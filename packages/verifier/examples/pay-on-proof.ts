// Pay on proof, end to end, on a local Anvil chain: a service sells an HTTP endpoint through a
// verified job, and a caller pays for it with one function.
//
//   cd contracts && forge build && cd ..
//   npm run pay-on-proof -w @arl/verifier
//
// The service is `payOnProof` around a handler; the caller is `payVerified`. Nothing else is
// wired by hand: the caller's first request gets 402 with the service's terms, the SDK opens and
// funds a job that matches them and asks again, the service checks the job on chain, approves the
// committee, does the work and answers. Three unattended validators (the code behind
// `arl-verifier watch`) accept, re-execute and vote; after the challenge window the escrow pays
// the service. The HTTP calls stay in this process (the caller's `fetch` hands the request to the
// service's handler), so the example needs no port and no web framework; in a real service the
// same handler is a Next.js route, a Hono route or a Cloudflare Worker.

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

import { payOnProof, payVerified } from "@arl/sdk";

import {
  DEFAULT_ACCEPT_POLICY,
  DockerRunner,
  execute,
  parseSpec,
  specHash,
  step,
  type ContainerRunner,
  type WatchState,
} from "../src/index.ts";

const PORT = 8551;
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
  // The arbiter rules disputes and cannot be a party of a job; this walkthrough never disputes.
  const evaluator = await deploy("ARLVerifiedEvaluator", [
    jobs,
    "0x000000000000000000000000000000000000A4b1",
    3600n,
    parseUnits("1", 18),
    zero,
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

  const PRICE = parseUnits("10", 18);
  const SPEC_URI =
    "https://raw.githubusercontent.com/armanalabsai/arlcoin.io/main/packages/verifier/examples/busybox-summary.json";

  // --- The service: one wrapper around a handler -------------------------------------------
  const background: Promise<unknown>[] = [];
  const service = payOnProof(
    {
      clients: { publicClient, walletClient: wallet(provider) },
      offer: {
        chainId: chain.id,
        provider: provider.address,
        specUri: SPEC_URI,
        specHash: specHash(SPEC),
        budget: PRICE,
        committee: validators.map((v) => v.address),
        threshold: 2,
        jobs,
        evaluator,
      },
      acceptance: { pollMs: 200 },
      // A serverless runtime would pass its own waitUntil; here the promise is awaited below.
      waitUntil: (work) => background.push(work),
      onError: (e) => {
        throw e;
      },
    },
    async () => {
      // The work the spec describes. Its result manifest's hash is what the committee checks.
      const { hash } = await execute(SPEC, exec);
      return { body: JSON.stringify({ summary: "passed=3 failed=0" }), deliverable: hash };
    },
  );
  const calls: string[] = [];
  const toService: typeof fetch = async (input, init) => {
    const res = await service(new Request(input, init));
    calls.push(String(res.status));
    return res;
  };

  // --- The caller: one function ---------------------------------------------------------------
  const { response, jobId } = await payVerified(
    { publicClient, walletClient: wallet(client) },
    "https://service.example/run",
    { maxBudget: PRICE, fetch: toService, init: { method: "POST", body: "{}" } },
  );
  if (!response.ok || jobId === undefined) throw new Error(`service answered ${response.status}`);
  if (calls.join() !== "402,200") throw new Error(`expected 402 then 200, got ${calls.join()}`);
  lap(
    `caller got 402 with the terms, opened and funded job ${String(jobId)} with 10 ARL, asked again: 200`,
  );
  lap(`service answered ${JSON.stringify(await response.json())}`);
  if (
    (
      await service(
        new Request("https://service.example/run", {
          method: "POST",
          headers: { "X-ARL-Job": response.headers.get("X-ARL-Job") ?? "" },
        }),
      )
    ).status !== 409
  )
    throw new Error("a job must pay for one run only");
  lap("a second request for the same job was refused (409)");

  // --- The committee: unattended validators ---------------------------------------------------
  const states = new Map<string, WatchState>();
  const specFetcher = { file: () => Promise.resolve(Buffer.from(specText)) };
  const pass = async () => {
    for (const v of validators) {
      const s = states.get(v.address) ?? { fromBlock: 0n, jobs: [] };
      states.set(
        v.address,
        await step(
          {
            client: publicClient,
            wallet: wallet(v),
            evaluator,
            exec,
            specFetcher,
            // The demo job is small; a real validator keeps the default acceptance policy.
            acceptPolicy: { ...DEFAULT_ACCEPT_POLICY, minBudget: 0n, minVoteWindow: 0n },
          },
          s,
        ),
      );
    }
  };
  await pass();
  lap("validators accepted the job (unattended)");

  await Promise.all(background);
  lap(
    `service submitted deliverable ${(response.headers.get("X-ARL-Deliverable") ?? "").slice(0, 10)}… on chain`,
  );

  await pass();
  lap("validators re-executed the spec and voted");

  const before = (await publicClient.readContract({
    address: token,
    abi: artifact("ARLToken").abi,
    functionName: "balanceOf",
    args: [provider.address],
  })) as bigint;
  await testClient.increaseTime({ seconds: 86_400 + 1 });
  await testClient.mine({ blocks: 1 });
  await send(client, evaluator, "ARLVerifiedEvaluator", "finalize", [jobId]);
  const after = (await publicClient.readContract({
    address: token,
    abi: artifact("ARLToken").abi,
    functionName: "balanceOf",
    args: [provider.address],
  })) as bigint;
  if (after - before !== PRICE) throw new Error("the service was not paid the price");
  lap("challenge window passed; job finalized and the service paid 10 ARL");
  process.stdout.write(`
Done in ${((Date.now() - t0) / 1000).toFixed(1)} s.
`);
} finally {
  anvil.kill();
}
