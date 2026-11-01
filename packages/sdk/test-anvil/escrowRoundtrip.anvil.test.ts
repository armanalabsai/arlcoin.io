// Both sides of an arl-escrow payment on a local Anvil chain: the service builds the 402 offer
// (buildEscrowOffer), the client pays with payVerified, the service checks the funded job
// (checkFundedJob) before the work, approves the committee and submits the deliverable. Needs
// Foundry (anvil) on PATH and `forge build` run in contracts/.
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
  parseUnits,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  JOB_HEADER,
  acceptedCount,
  approveCommittee,
  buildEscrowOffer,
  checkFundedJob,
  parseEscrowOffer,
  payVerified,
  submitDeliverable,
  waitForAcceptance,
} from "../src/index.ts";

const PORT = 8550;
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's first development key and a fixed test key funded below; local chain only.
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
const clientWallet = createWalletClient({ account: client, chain, transport: http(RPC) });
const providerWallet = createWalletClient({ account: provider, chain, transport: http(RPC) });

function artifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const url = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}
async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await clientWallet.deployContract({ abi, bytecode: bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.ok(receipt.contractAddress);
  return receipt.contractAddress;
}

let anvil: ChildProcess;
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
  await publicClient.request({
    method: "anvil_setBalance" as never,
    params: [provider.address, "0x56BC75E2D63100000"] as never,
  });
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
  jobs = await deploy("ARLJobs", [token]);
  const zero = "0x0000000000000000000000000000000000000000";
  evaluator = await deploy("ARLVerifiedEvaluator", [
    jobs,
    client.address,
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

describe("arl-escrow round trip", () => {
  it("serves the work only for a funded job that matches the offer", async () => {
    const body = buildEscrowOffer({
      chainId: 31_337,
      provider: provider.address,
      specUri: "https://example.com/spec.json",
      specHash: `0x${"cd".repeat(32)}`,
      budget: parseUnits("5", 18),
      committee: [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
      ],
      threshold: 2,
      bond: parseUnits("1", 18),
      challengeWindow: 3600n,
      jobs,
      evaluator,
    });
    const offer = parseEscrowOffer(body);
    const providerClients = { publicClient, walletClient: providerWallet };
    let served: bigint | undefined;

    const service: typeof fetch = async (_url, init) => {
      const header = new Headers(init?.headers).get(JOB_HEADER);
      if (header === null) return Response.json(body, { status: 402 });
      const job = await checkFundedJob(publicClient, offer, header);
      await approveCommittee(providerClients, offer, job.jobId);
      served = job.jobId;
      return Response.json({ deliverable: `0x${"ee".repeat(32)}` });
    };

    const { response, jobId } = await payVerified(
      { publicClient, walletClient: clientWallet },
      "https://service.test/run",
      { maxBudget: parseUnits("5", 18), fetch: service },
    );
    assert.equal(response.status, 200);
    assert.equal(served, jobId);
    assert.ok(jobId !== undefined);
    // Nobody on this placeholder committee accepts: by default the provider may not submit, or the
    // job could only end undecided (report 2026-10-31).
    assert.equal(await acceptedCount(publicClient, offer, jobId), 0);
    await assert.rejects(
      submitDeliverable(providerClients, offer, jobId, `0x${"ee".repeat(32)}`),
      /only 0 of 2 members accepted/,
    );
    await assert.rejects(
      waitForAcceptance(publicClient, offer, jobId, { timeoutMs: 0, pollMs: 1 }),
      /0 of 2 members accepted/,
    );
    await submitDeliverable(providerClients, offer, jobId, `0x${"ee".repeat(32)}`, {
      requireAccepted: false,
    });

    await assert.rejects(
      checkFundedJob(publicClient, offer, `31337:${jobs}:${String(jobId)}`),
      /not funded/,
    );
    await assert.rejects(checkFundedJob(publicClient, offer, "garbage"), /malformed/);
    await assert.rejects(
      checkFundedJob(publicClient, { ...offer, budget: 1n }, `31337:${jobs}:${String(jobId)}`),
      /another budget/,
    );
  });
});
