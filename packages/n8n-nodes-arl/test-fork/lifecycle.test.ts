// End to end on a LOCAL Anvil fork of Base Mainnet (nothing is sent to Base): the real ARL escrow
// and token, with the node's job functions. Start the fork first, then run:
//
//   anvil --fork-url https://base-rpc.publicnode.com --port 18546
//   ARL_FORK_RPC=http://127.0.0.1:18546 npm run test:fork
//
// Anvil's development accounts sign; the Community & Staking Safe is impersonated only to hand the
// client 100 ARL on the fork.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import {
  ESCROWS,
  createJob,
  fundJob,
  getJob,
  setBudget,
  settleJob,
  submitWork,
  type Clients,
} from "../src/jobs.ts";

const RPC = process.env.ARL_FORK_RPC;
const ARL: Address = "0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4";
const COMMUNITY_SAFE: Address = "0xfF12597A671ebAF0cAe37999EE659e03c4f444B5";
// Anvil development accounts 0 and 1 (public test keys, unlocked on every Anvil node).
const CLIENT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const PROVIDER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const erc20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

describe("job lifecycle on a Base Mainnet fork", { skip: !RPC }, () => {
  const transport = http(RPC);
  const publicClient = createPublicClient({ chain: base, transport });
  const as = (key: `0x${string}`): Clients =>
    ({
      publicClient,
      walletClient: createWalletClient({
        account: privateKeyToAccount(key),
        chain: base,
        transport,
      }),
    }) as unknown as Clients;
  const client = as(CLIENT_KEY);
  const provider = as(PROVIDER_KEY);
  const providerAddress = privateKeyToAccount(PROVIDER_KEY).address;
  const clientAddress = privateKeyToAccount(CLIENT_KEY).address;

  it("creates, prices, funds, delivers and pays a job; rejects and refunds another", async () => {
    const test = createTestClient({ chain: base, mode: "anvil", transport });
    await test.impersonateAccount({ address: COMMUNITY_SAFE });
    await test.setBalance({ address: COMMUNITY_SAFE, value: parseEther("1") });
    const safe = createWalletClient({ account: COMMUNITY_SAFE, chain: base, transport });
    const hash = await safe.writeContract({
      address: ARL,
      abi: erc20,
      functionName: "transfer",
      args: [clientAddress, parseEther("100")],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const created = await createJob(client, ESCROWS.ARL, {
      provider: providerAddress,
      hoursUntilDeadline: 24,
      description: "n8n test job",
    });
    const jobId = BigInt(created.jobId);
    await setBudget(provider, ESCROWS.ARL, jobId, "10");
    const funded = await fundJob(client, ESCROWS.ARL, jobId);
    assert.equal(funded.budget, "10");
    assert.ok(funded.approveTxHash, "the first funding approves the escrow");
    await submitWork(provider, ESCROWS.ARL, jobId, "https://example.org/result.json");
    assert.equal((await getJob(client, ESCROWS.ARL, jobId)).status, "Submitted");
    await settleJob(client, ESCROWS.ARL, jobId, "complete", "looks good");
    assert.equal((await getJob(client, ESCROWS.ARL, jobId)).status, "Completed");
    assert.equal(
      await publicClient.readContract({
        address: ARL,
        abi: erc20,
        functionName: "balanceOf",
        args: [providerAddress],
      }),
      parseEther("10"),
    );

    const second = BigInt(
      (
        await createJob(client, ESCROWS.ARL, {
          provider: providerAddress,
          hoursUntilDeadline: 2,
          description: "second",
        })
      ).jobId,
    );
    await setBudget(client, ESCROWS.ARL, second, "5");
    await fundJob(client, ESCROWS.ARL, second);
    await settleJob(client, ESCROWS.ARL, second, "reject", "");
    assert.equal((await getJob(client, ESCROWS.ARL, second)).status, "Rejected");
    assert.equal(
      await publicClient.readContract({
        address: ARL,
        abi: erc20,
        functionName: "balanceOf",
        args: [clientAddress],
      }),
      parseEther("90"),
    );
  });
});
