// End-to-end: a local Anvil chain, the compiled ARLToken, ARLJobs and ARLVerifiedEvaluator, and
// openTask with the arl-task/1 test vector. Needs Foundry (anvil) on PATH and `forge build` run in
// contracts/. Run: npm run test:anvil -w @arl/sdk
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { URL } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  TaskError,
  getVerdict,
  openTask,
  taskHash,
  parseTask,
  type TaskDeployment,
} from "../src/index.ts";

const PORT = 8550;
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's first two development keys; local chain only.
const client = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const provider = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412cacc3dc8a9b8a7",
);
const chain = defineChain({
  id: 31_337,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account: client, chain, transport: http(RPC) });

function artifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const url = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}
async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await walletClient.deployContract({ abi, bytecode: bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.ok(receipt.contractAddress);
  return receipt.contractAddress;
}

const ARBITER: Address = "0x000000000000000000000000000000000000A4b1";
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
  // The arbiter cannot be a party of a job (evaluator v5); nothing here disputes.
  evaluator = await deploy("ARLVerifiedEvaluator", [
    jobs,
    ARBITER,
    3600n,
    parseUnits("1", 18),
    zero,
    zero,
    zero,
  ]);
});

after(() => {
  anvil.kill();
});

const vectors = JSON.parse(
  readFileSync(new URL("../../../spec/arl-task/v0.1.0/vectors.json", import.meta.url), "utf8"),
) as { valid: { name: string; task: Record<string, unknown> }[] };
const task = vectors.valid.find((v) => v.name === "reexec-arl")?.task;
assert.ok(task);
const COMMITTEE: Address[] = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
];
const read = parseAbi([
  "struct Job { uint256 id; address client; address provider; address evaluator; string description; uint256 budget; uint256 expiredAt; uint8 status; address hook; }",
  "function getJob(uint256 jobId) view returns (Job)",
  "struct Config { uint8 tier; uint8 threshold; uint64 voteWindow; uint64 challengeWindow; uint96 bond; uint256 providerAgentId; bytes32 specHash; address[] committee; }",
  "function getConfig(uint256 jobId) view returns (Config)",
  "function balanceOf(address) view returns (uint256)",
]);

describe("openTask", () => {
  const deployment = (): TaskDeployment => ({
    chainId: 31_337,
    token,
    jobs,
    evaluator,
    arbiter: ARBITER,
  });
  const opts = () => ({
    taskUri: "https://example.com/task.json",
    provider: provider.address,
    committee: COMMITTEE,
    deployment: deployment(),
  });

  it("opens, configures and funds the task as a verified job", async () => {
    const clients = { publicClient, walletClient };
    const before = await publicClient.readContract({
      address: token,
      abi: read,
      functionName: "balanceOf",
      args: [jobs],
    });
    const { jobId, taskHash: hash, txs } = await openTask(clients, task, opts());
    assert.equal(hash, taskHash(parseTask(task)));
    assert.deepEqual(Object.keys(txs).sort(), [
      "approve",
      "configure",
      "createJob",
      "fund",
      "setBudget",
    ]);
    const job = await publicClient.readContract({
      address: jobs,
      abi: read,
      functionName: "getJob",
      args: [jobId],
    });
    const budget = parseUnits("10", 18);
    assert.equal(job.status, 1); // Funded
    assert.equal(job.budget, budget);
    assert.equal(job.client, client.address);
    assert.equal(job.provider, provider.address);
    assert.equal(job.description, `arl-task:${hash} https://example.com/task.json`);
    const cfg = await publicClient.readContract({
      address: evaluator,
      abi: read,
      functionName: "getConfig",
      args: [jobId],
    });
    assert.equal(cfg.tier, 1);
    assert.equal(cfg.threshold, 2);
    assert.equal(cfg.specHash, (task.workload as { spec_hash: Hex }).spec_hash);
    assert.deepEqual(cfg.committee, COMMITTEE);
    const after = await publicClient.readContract({
      address: token,
      abi: read,
      functionName: "balanceOf",
      args: [jobs],
    });
    assert.equal(after - before, budget);
    // getVerdict decodes the evaluator's Verdict field by field (topApprovals included).
    const v = await getVerdict(publicClient, jobId, evaluator);
    assert.equal(v.phaseName, "Configured");
    assert.equal(v.providerApproved, false);
    assert.equal(v.topApprovals, 0);
    assert.equal(v.voteEnds, 0n);
    assert.equal(v.challenger, "0x0000000000000000000000000000000000000000");
    assert.equal(v.deliverable, `0x${"00".repeat(32)}`);
    assert.equal(v.voteHash, `0x${"00".repeat(32)}`);
  });

  it("sends nothing for a task that fails validation or names the arbiter", async () => {
    const clients = { publicClient, walletClient };
    const nonce = await publicClient.getTransactionCount({ address: client.address });
    await assert.rejects(openTask(clients, { ...task, title: "" }, opts()), TaskError);
    await assert.rejects(
      openTask(clients, task, { ...opts(), committee: [...COMMITTEE.slice(0, 2), ARBITER] }),
      TaskError,
    );
    await assert.rejects(
      openTask(clients, task, {
        taskUri: opts().taskUri,
        provider: provider.address,
        committee: COMMITTEE,
      }),
      /deployment is required/,
    );
    assert.equal(await publicClient.getTransactionCount({ address: client.address }), nonce);
  });
});
