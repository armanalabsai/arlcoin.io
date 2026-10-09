// End-to-end: a local Anvil chain, the compiled ARLToken and ComputePayment, and the SDK.
// Needs Foundry (anvil) on PATH and `forge build` run in contracts/. Run: npm run test:anvil -w @arl/sdk
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
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
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  computePaymentAbi,
  stopComputeStream,
  streamComputePayment,
  StreamingError,
} from "../src/index.ts";

const PORT = 8546;
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's account 0 key and a fixed test key funded below; local chain only.
const client = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const provider = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412cacc3dc8a9b8a7",
);
// A local chain that reuses the Base Sepolia id, as a fork rehearsal would.
const chain = defineChain({
  id: 84_532,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

function artifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const url = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}

const publicClient = createPublicClient({ chain, transport: http(RPC) });
const walletClient = createWalletClient({ account: client, chain, transport: http(RPC) });
const providerWallet = createWalletClient({ account: provider, chain, transport: http(RPC) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });

let anvil: ChildProcess;
let token: Address;
let payment: Address;

async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await walletClient.deployContract({ abi, bytecode: bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.ok(receipt.contractAddress);
  return receipt.contractAddress;
}

before(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "84532", "--silent"], {
    stdio: "ignore",
  });
  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch (error) {
      if (i > 50) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  // Every allocation goes to the client account so that it holds the whole supply.
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
  payment = await deploy("ComputePayment", [token]);
  await testClient.setBalance({ address: provider.address, value: parseUnits("10", 18) });
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

describe("ComputePayment via the SDK on Anvil", () => {
  it("ships the ABI of the compiled contract", () => {
    assert.deepEqual(computePaymentAbi, artifact("ComputePayment").abi);
  });

  it("opens a stream, approving exactly the deposit, and settles it early", async () => {
    const rate = parseUnits("0.01", 18);
    const stream = await streamComputePayment(
      { publicClient, walletClient },
      {
        chain,
        contractAddress: payment,
        providerAddress: provider.address,
        tokenAddress: token,
        ratePerSecond: rate,
        maxDurationSeconds: 3600,
        maxCap: parseUnits("36", 18),
      },
    );
    assert.equal(stream.streamId, 1n);
    assert.equal(stream.deposit, parseUnits("36", 18));
    assert.equal(stream.endTime - stream.startTime, 3600n);
    assert.ok(stream.approvalTxHash);
    assert.equal(await balance(payment), stream.deposit);
    assert.equal(
      await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [client.address, payment],
      }),
      0n,
    );

    // 600 seconds later the provider stops it.
    await testClient.setNextBlockTimestamp({ timestamp: stream.startTime + 600n });
    const settled = await stopComputeStream(
      { publicClient, walletClient: providerWallet },
      { chain, contractAddress: payment, streamId: stream.streamId },
    );
    assert.equal(settled.providerAmount, rate * 600n);
    assert.equal(settled.refundAmount, stream.deposit - rate * 600n);
    assert.equal(await balance(provider.address), rate * 600n);
    assert.equal(await balance(payment), 0n);
  });

  it("decodes a contract revert before signing anything", async () => {
    await assert.rejects(
      stopComputeStream(
        { publicClient, walletClient },
        { chain, contractAddress: payment, streamId: 1n },
      ),
      (error: unknown) => {
        assert.ok(error instanceof StreamingError);
        assert.equal(error.code, "TX_REVERTED");
        assert.equal(error.revertName, "AlreadySettled");
        return true;
      },
    );
  });

  it("refuses a token that is not the contract's payment token", async () => {
    await assert.rejects(
      streamComputePayment(
        { publicClient, walletClient },
        {
          chain,
          contractAddress: payment,
          providerAddress: provider.address,
          tokenAddress: provider.address,
          ratePerSecond: 1n,
          maxDurationSeconds: 60,
          maxCap: 60n,
        },
      ),
      (error: unknown) => error instanceof StreamingError && error.code === "TOKEN_MISMATCH",
    );
  });

  it("refuses a stream the client cannot fund", async () => {
    await assert.rejects(
      streamComputePayment(
        { publicClient, walletClient: providerWallet },
        {
          chain,
          contractAddress: payment,
          providerAddress: client.address,
          tokenAddress: token,
          ratePerSecond: parseUnits("1", 18),
          maxDurationSeconds: 3600,
          maxCap: parseUnits("3600", 18),
        },
      ),
      (error: unknown) => error instanceof StreamingError && error.code === "INSUFFICIENT_BALANCE",
    );
  });
});
