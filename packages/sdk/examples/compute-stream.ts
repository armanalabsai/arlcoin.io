// Compute paid by the second, end to end, on a local Anvil chain: an inference service that
// answers only while the caller's stream pays it.
//
//   cd contracts && forge build && cd ..
//   npm run compute-stream -w @arl/sdk
//
// The service is `serveOnStream` around a handler. The caller opens a stream with
// `streamComputePayment` and sends its id and a signature with every request
// (`streamAuthHeaders`). The provider withdraws what it has earned while the stream runs, the
// caller stops the stream when it is done, and the unused part of the deposit returns to it. The
// HTTP calls stay in this process, so the example needs no port and no web framework; in a real
// service the same handler is a Next.js route, a Hono route or a Cloudflare Worker in front of
// the model server.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  getComputeStream,
  serveOnStream,
  stopComputeStream,
  streamAuthHeaders,
  streamComputePayment,
  withdrawComputeStream,
} from "../src/index.ts";

const PORT = 8552;
const RPC = `http://127.0.0.1:${PORT}`;
// Anvil's public development keys; local chain only.
const client = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const provider = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9c86dae88c7a8412cacc3dc8a9b8a7",
);
const stranger = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);
const chain = defineChain({
  id: 31_337,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const wallet = (account: typeof client) =>
  createWalletClient({ account, chain, transport: http(RPC) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });

const started = Date.now();
const say = (text: string) => {
  process.stdout.write(`${((Date.now() - started) / 1000).toFixed(1).padStart(6)} s  ${text}
`);
};
const arl = (amount: bigint) => `${formatUnits(amount, 18)} ARL`;

function artifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const url = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
}

async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet(client).deployContract({ abi, bytecode: bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`${name} was not deployed`);
  return receipt.contractAddress;
}

async function main() {
  // 1. A local chain with the ARL token and the ComputePayment contract.
  const holder = client.address;
  const token = await deploy("ARLToken", [
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
  const payment = await deploy("ComputePayment", [token]);
  await testClient.setBalance({ address: provider.address, value: parseUnits("10", 18) });
  const balance = (who: Address) =>
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [who],
    });
  say("contracts deployed (local chain)");

  // 2. The provider's service: an inference endpoint at 0.01 ARL per second.
  const rate = parseUnits("0.01", 18);
  const service = serveOnStream(
    {
      publicClient,
      chainId: chain.id,
      provider: provider.address,
      ratePerSecond: rate,
      contract: payment,
    },
    async (request, stream) => {
      const prompt = await request.text();
      return new Response(
        JSON.stringify({
          completion: prompt.toUpperCase(),
          paidSecondsLeft: stream.secondsLeft.toString(),
        }),
      );
    },
  );
  const ask = async (who: typeof client, streamId: bigint, prompt: string) => {
    const now = Number((await publicClient.getBlock()).timestamp);
    const headers = await streamAuthHeaders(
      wallet(who),
      { chainId: chain.id, contract: payment, streamId },
      now,
    );
    return service(
      new Request("http://service.local/v1/completions", { method: "POST", headers, body: prompt }),
    );
  };

  // 3. Without a stream the service names its price.
  const terms = await service(
    new Request("http://service.local/v1/completions", { method: "POST" }),
  );
  const offer = (await terms.json()) as { accepts: { extra: { ratePerSecond: string } }[] };
  say(
    `no stream: ${String(terms.status)}, the service asks ${arl(BigInt(offer.accepts[0]?.extra.ratePerSecond ?? "0"))} per second`,
  );

  // 4. The caller opens a ten-minute stream and is served.
  const stream = await streamComputePayment(
    { publicClient, walletClient: wallet(client) },
    {
      chain,
      contractAddress: payment,
      providerAddress: provider.address,
      tokenAddress: token,
      ratePerSecond: rate,
      maxDurationSeconds: 600,
      maxCap: parseUnits("6", 18),
    },
  );
  say(
    `caller opened stream ${stream.streamId.toString()} and escrowed ${arl(stream.deposit)} for up to 600 s`,
  );
  const first = await ask(client, stream.streamId, "hello from the caller");
  say(`caller asked: ${String(first.status)} ${await first.text()}`);

  // 5. Someone else names the same stream: refused, because the signature is not the sender's.
  const stolen = await ask(stranger, stream.streamId, "let me in");
  say(
    `another account named the same stream: ${String(stolen.status)} (${((await stolen.json()) as { error: string }).error})`,
  );

  // 6. 120 seconds in, the provider takes what it has earned. The stream keeps running.
  await testClient.setNextBlockTimestamp({ timestamp: stream.startTime + 119n });
  await testClient.mine({ blocks: 1 });
  await testClient.setNextBlockTimestamp({ timestamp: stream.startTime + 120n });
  const withdrawal = await withdrawComputeStream(
    { publicClient, walletClient: wallet(provider) },
    { chain, contractAddress: payment, streamId: stream.streamId },
  );
  say(`after 120 s the provider withdrew ${arl(withdrawal.amount)}`);

  // 7. The caller is done after 300 seconds and stops: the unused half returns to it.
  await testClient.setNextBlockTimestamp({ timestamp: stream.startTime + 300n });
  const settled = await stopComputeStream(
    { publicClient, walletClient: wallet(client) },
    { chain, contractAddress: payment, streamId: stream.streamId },
  );
  say(
    `caller stopped at 300 s: provider paid ${arl(settled.providerAmount)} more, caller refunded ${arl(settled.refundAmount)}`,
  );

  // 8. The stream has ended, so the service stops answering.
  const late = await ask(client, stream.streamId, "one more");
  say(
    `caller asked again: ${String(late.status)} (${((await late.json()) as { error: string }).error})`,
  );

  const earned = await balance(provider.address);
  const state = await getComputeStream(publicClient, stream.streamId, payment);
  if (earned !== rate * 300n || state.live || (await balance(payment)) !== 0n) {
    throw new Error("the settlement does not match 300 seconds at the agreed rate");
  }
  say(
    `the provider holds ${arl(earned)}: exactly 300 s at ${arl(rate)} per second; the contract holds nothing`,
  );
}

const anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
try {
  for (let i = 0; ; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch (error) {
      if (i > 50) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await main();
  process.stdout.write(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)} s.
`);
} finally {
  anvil.kill();
}
