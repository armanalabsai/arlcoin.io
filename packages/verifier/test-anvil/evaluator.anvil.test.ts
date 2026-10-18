// End-to-end on a local Anvil chain with the compiled ARLToken, ARLJobs and ARLVerifiedEvaluator:
// a client commits a spec hash, the provider approves the committee and submits the deliverable
// it computed with `execute`, and two validators read the job, re-execute the spec and vote
// through this package. The container is replaced by an in-process runner, so the test needs only
// Foundry (anvil) on PATH and `forge build` run in contracts/.
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

import {
  acceptJob,
  castVote,
  decide,
  evaluatorAbi,
  execute,
  MemberState,
  parseSpec,
  readJob,
  sha256,
  specHash,
  type ContainerRunner,
  type Fetcher,
} from "../src/index.ts";

const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's default development keys; local chain only.
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412cacc3dc8a9b8a7",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];
const [client, provider, v1, v2, v3] = KEYS.map((k) => privateKeyToAccount(k)) as [
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
const wallet = (account: PrivateKeyAccount) =>
  createWalletClient({ account, chain, transport: http(RPC) });

function artifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const url = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}

async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet(client).deployContract({ abi, bytecode: bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.ok(receipt.contractAddress);
  return receipt.contractAddress;
}

async function send(
  account: PrivateKeyAccount,
  address: Address,
  name: string,
  functionName: string,
  args: readonly unknown[],
) {
  const hash = await wallet(account).writeContract({
    address,
    abi: artifact(name).abi,
    functionName,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${functionName} reverted`);
}

const INPUT = Buffer.from("3 tests\n");
const SPEC = parseSpec({
  version: "arl-reexec/1",
  container_digest: `docker.io/library/busybox@sha256:${"b".repeat(64)}`,
  inputs: [
    { kind: "file", path: "in.txt", url: "https://example.com/in.txt", sha256: sha256(INPUT) },
  ],
  command: ["sh", "-c", "cp /work/in.txt /out/result.txt"],
  workdir: ".",
  env: {},
  outputs: ["result.txt"],
  limits: { seconds: 30, memory_mb: 64, cpus: 1 },
  verifier_digest: `sha256:${"0".repeat(64)}`,
});
// The job copies its input to its output; this runner does the same without a container.
const runner: ContainerRunner = {
  async run(_s, work, out) {
    await writeFile(join(out, "result.txt"), readFileSync(join(work, "in.txt")));
    return { exitCode: 0, timedOut: false };
  },
};
const fetcher: Fetcher = { file: () => Promise.resolve(INPUT), git: () => Promise.resolve() };
const opts = { runner, fetcher };

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
    } catch (error) {
      if (i > 50) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  for (const a of [client, provider, v1, v2, v3]) {
    await testClient.setBalance({ address: a.address, value: parseUnits("10", 18) });
  }
  const holder = client.address;
  token = await deploy("ARLToken", [
    {
      publicLaunch: holder,
      communityStaking: holder,
      ecosystemGrowth: holder,
      strategicPartnerships: holder,
      liquidity: holder,
      founder: holder,
      investors: holder,
      treasury: holder,
      team: holder,
      earlyUsers: holder,
      grantsBugBounty: holder,
    },
  ]);
  jobs = await deploy("ARLJobs", [token]);
  const zero = "0x0000000000000000000000000000000000000000";
  evaluator = await deploy("ARLVerifiedEvaluator", [
    jobs,
    client.address,
    3600n,
    parseUnits("1", 18),
    zero,
    zero,
  ]);
  for (const v of [v1, v2, v3]) {
    await send(client, token, "ARLToken", "transfer", [v.address, parseUnits("100", 18)]);
    await send(v, token, "ARLToken", "approve", [evaluator, parseUnits("100", 18)]);
    await send(v, evaluator, "ARLVerifiedEvaluator", "stake", [parseUnits("100", 18)]);
  }
  await send(client, token, "ARLToken", "approve", [jobs, parseUnits("1000", 18)]);
});

after(() => {
  anvil.kill();
});

describe("validator flow on Anvil", () => {
  it("ships an ABI that matches the compiled evaluator", () => {
    const names = (abi: Abi) =>
      new Set(abi.filter((x) => x.type === "function").map((x) => x.name));
    const compiled = names(artifact("ARLVerifiedEvaluator").abi);
    for (const n of names(evaluatorAbi)) assert.ok(compiled.has(n), `${n} missing`);
  });

  it("re-executes the spec and votes the job to an approval", async () => {
    const spec = specHash(SPEC);
    const { timestamp } = await publicClient.getBlock();
    await send(client, jobs, "ARLJobs", "createJob", [
      provider.address,
      evaluator,
      timestamp + 86_400n,
      "https://example.com/spec.json",
      "0x0000000000000000000000000000000000000000",
    ]);
    const jobId = 1n;
    await send(client, evaluator, "ARLVerifiedEvaluator", "configure", [
      jobId,
      {
        tier: 1,
        threshold: 2,
        voteWindow: 3600n,
        challengeWindow: 3600n,
        bond: parseUnits("1", 18),
        providerAgentId: 0n,
        specHash: spec,
        committee: [v1.address, v2.address, v3.address],
      },
    ]);
    await send(provider, evaluator, "ARLVerifiedEvaluator", "approveCommittee", [jobId]);
    await send(provider, jobs, "ARLJobs", "setBudget", [jobId, parseUnits("20", 18), "0x"]);
    await send(client, jobs, "ARLJobs", "fund", [jobId, parseUnits("20", 18), "0x"]);
    for (const v of [v1, v2]) await acceptJob(wallet(v), publicClient, evaluator, jobId);

    // The provider runs the job and submits the result hash as its deliverable.
    const { hash: deliverable } = await execute(SPEC, opts);
    await send(provider, jobs, "ARLJobs", "submit", [jobId, deliverable, "0x"]);

    for (const v of [v1, v2]) {
      const job = await readJob(publicClient, evaluator, jobId, v.address);
      assert.equal(job.memberState, MemberState.Accepted);
      assert.equal(job.description, "https://example.com/spec.json");
      assert.equal(job.specHash, spec);
      assert.equal(job.deliverable, deliverable);
      assert.ok(job.deliverable);
      const decision = await decide(SPEC, job.specHash, job.deliverable, opts);
      assert.equal(decision.approve, true);
      await castVote(
        wallet(v),
        publicClient,
        evaluator,
        jobId,
        decision.approve,
        job.deliverable,
        decision.evidence,
      );
    }
    const after = await readJob(publicClient, evaluator, jobId, v1.address);
    assert.equal(after.phase, 2); // Approved
    assert.equal(after.memberState, MemberState.Approved);

    await testClient.increaseTime({ seconds: 3600 });
    await testClient.mine({ blocks: 1 });
    await send(client, evaluator, "ARLVerifiedEvaluator", "finalize", [jobId]);
    const paid = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [provider.address],
    });
    assert.equal(paid, parseUnits("20", 18));
  });

  it("rejects a forged deliverable", async () => {
    const { timestamp } = await publicClient.getBlock();
    await send(client, jobs, "ARLJobs", "createJob", [
      provider.address,
      evaluator,
      timestamp + 86_400n,
      "https://example.com/spec.json",
      "0x0000000000000000000000000000000000000000",
    ]);
    const jobId = 2n;
    await send(client, evaluator, "ARLVerifiedEvaluator", "configure", [
      jobId,
      {
        tier: 1,
        threshold: 2,
        voteWindow: 3600n,
        challengeWindow: 3600n,
        bond: parseUnits("1", 18),
        providerAgentId: 0n,
        specHash: specHash(SPEC),
        committee: [v1.address, v2.address, v3.address],
      },
    ]);
    await send(provider, evaluator, "ARLVerifiedEvaluator", "approveCommittee", [jobId]);
    await send(provider, jobs, "ARLJobs", "setBudget", [jobId, parseUnits("20", 18), "0x"]);
    await send(client, jobs, "ARLJobs", "fund", [jobId, parseUnits("20", 18), "0x"]);
    await acceptJob(wallet(v3), publicClient, evaluator, jobId);
    const forged = `0x${"9".repeat(64)}`;
    await send(provider, jobs, "ARLJobs", "submit", [jobId, forged, "0x"]);
    const job = await readJob(publicClient, evaluator, jobId, v3.address);
    assert.ok(job.deliverable);
    const decision = await decide(SPEC, job.specHash, job.deliverable, opts);
    assert.equal(decision.approve, false);
    await castVote(
      wallet(v3),
      publicClient,
      evaluator,
      jobId,
      false,
      job.deliverable,
      decision.evidence,
    );
    assert.equal(
      (await readJob(publicClient, evaluator, jobId, v3.address)).memberState,
      MemberState.Rejected,
    );
  });
});
