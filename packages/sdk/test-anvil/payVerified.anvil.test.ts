// End-to-end: a local Anvil chain, the compiled ARLToken, ARLJobs and ARLVerifiedEvaluator, a
// service that answers 402 with an arl-escrow offer, and payVerified. Needs Foundry (anvil) on
// PATH and `forge build` run in contracts/. Run: npm run test:anvil -w @arl/sdk
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { URL } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  http,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { JOB_HEADER, payVerified } from "../src/index.ts";

const PORT = 8547;
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

describe("payVerified", () => {
  it("funds a verified job from a 402 offer and repeats the request with the job id", async () => {
    const budget = parseUnits("10", 18);
    const seen: (string | null)[] = [];
    const service: typeof fetch = (_url, init) => {
      const job = new Headers(init?.headers).get(JOB_HEADER);
      seen.push(job);
      if (job === null) {
        return Promise.resolve(
          Response.json(
            {
              x402Version: 2,
              accepts: [
                {
                  scheme: "arl-escrow",
                  network: "eip155:31337",
                  amount: budget.toString(),
                  payTo: provider.address,
                  extra: {
                    jobs,
                    evaluator,
                    specUri: "https://example.com/spec.json",
                    specHash: `0x${"ab".repeat(32)}`,
                    committee: [
                      "0x0000000000000000000000000000000000000001",
                      "0x0000000000000000000000000000000000000002",
                      "0x0000000000000000000000000000000000000003",
                    ],
                    threshold: 2,
                    voteWindow: "3600",
                    challengeWindow: "3600",
                    bond: parseUnits("1", 18).toString(),
                    expiresIn: "86400",
                  },
                },
              ],
            },
            { status: 402 },
          ),
        );
      }
      return Promise.resolve(Response.json({ ok: true }));
    };

    const before = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [jobs],
    });
    const { response, jobId } = await payVerified(
      { publicClient, walletClient },
      "https://service.test/run",
      {
        maxBudget: budget,
        fetch: service,
      },
    );
    assert.equal(response.status, 200);
    assert.equal(jobId, 1n);
    assert.equal(seen[1]?.toLowerCase(), `31337:${jobs}:1`.toLowerCase());
    const after = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [jobs],
    });
    assert.equal(after - before, budget);
  });

  it("refuses an offer above maxBudget before sending anything", async () => {
    const service: typeof fetch = () =>
      Promise.resolve(
        Response.json(
          {
            accepts: [
              {
                scheme: "arl-escrow",
                network: "eip155:31337",
                amount: parseUnits("1000", 18).toString(),
                payTo: provider.address,
                extra: {
                  jobs,
                  evaluator,
                  specUri: "https://example.com/spec.json",
                  specHash: `0x${"ab".repeat(32)}`,
                  committee: [],
                  threshold: 2,
                  voteWindow: "3600",
                  challengeWindow: "3600",
                  bond: "1",
                  expiresIn: "86400",
                },
              },
            ],
          },
          { status: 402 },
        ),
      );
    await assert.rejects(
      payVerified({ publicClient, walletClient }, "https://service.test/run", {
        maxBudget: parseUnits("10", 18),
        fetch: service,
      }),
      /maxBudget/,
    );
  });
});
