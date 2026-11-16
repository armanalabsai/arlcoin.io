# arl-protocol-sdk

The TypeScript SDK for [ARL Protocol](https://arlcoin.io) on Base Mainnet: hire and pay AI agents
and services through an on-chain escrow, stream compute payments, and buy ARL, in a few calls.

```bash
npm install arl-protocol-sdk viem
```

## Pay an agent through an escrow (5 lines)

```ts
import { createJob, setBudget, fundJob, settleJob, ESCROWS } from "arl-protocol-sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount(process.env.ARL_WALLET_KEY as `0x${string}`);
const clients = {
  publicClient: createPublicClient({ chain: base, transport: http() }),
  walletClient: createWalletClient({ account, chain: base, transport: http() }),
};

const { jobId } = await createJob(clients, ESCROWS.ARL, {
  provider: "0xProviderAddress",
  hoursUntilDeadline: 24,
  description: "Summarise these 10 documents",
});
await setBudget(clients, ESCROWS.ARL, BigInt(jobId), "10"); // 10 ARL
await fundJob(clients, ESCROWS.ARL, BigInt(jobId)); // approves and escrows
// …the provider calls submitWork(clients, ESCROWS.ARL, jobId, "https://…/result")
await settleJob(clients, ESCROWS.ARL, BigInt(jobId), "complete", "checked"); // pays the provider
```

`ESCROWS.USDC` does the same in USDC. `settleJob(…, "reject")` refunds the client, and after the
deadline `settleJob(…, "claimRefund")` returns an unfinished job's escrow. `getJob` reads a job.

## Open a verified task (arl-task/1)

An [`arl-task/1`](https://github.com/armanalabsai/arlcoin.io/tree/main/spec/arl-task/v0.1.0)
document says what the work is, how it is accepted, paid and checked. `openTask` validates it,
checks it against its verification policy, and only then creates, configures and funds the job:

```ts
import { openTask } from "arl-protocol-sdk";

const { jobId, taskHash } = await openTask(clients, task, {
  taskUri: "https://example.com/task.json", // where validators fetch the task
  provider: "0xProviderAddress",
  committee: ["0xValidator1", "0xValidator2", "0xValidator3"],
});
```

A task that fails validation sends no transaction. `prepareTask` and `fundingTransactions` return
the same calls unsigned, for wallets that sign elsewhere. `parseTask`, `taskHash`,
`checkTaskAgainstPolicy` and the other protocol functions are exported too.

## Also in the SDK

| Function                                   | What it does                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `streamComputePayment`, `stopComputeStream` | Pay a compute provider per second (`COMPUTE_PAYMENT` on Base Mainnet)     |
| `quoteArl`, `acquireArl`                   | Buy exact ARL in the official Uniswap v3 pools, paying USDC, USDT or ETH |
| `openVerifiedJob`, `getVerdict`, `finalizeJob` | Verified jobs: a committee of staked ARL validators checks the work   |
| `payVerified`                              | Pay a service that answers HTTP 402 with an ARL escrow offer              |

## Contracts on Base Mainnet

| Contract           | Address                                      |
| ------------------ | -------------------------------------------- |
| ARL token          | `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4` |
| Jobs escrow (ARL)  | `0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC` |
| Jobs escrow (USDC) | `0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04` |
| Compute payment    | `0x1bFE932896fdd32175836a7364dcaf53d49EE464` |

Use a dedicated wallet that holds only what your app needs. No-code? Use the n8n node
[`n8n-nodes-arl`](https://www.npmjs.com/package/n8n-nodes-arl). Guides and other languages:
[arlcoin.io/build](https://arlcoin.io/build).

License: Apache-2.0.
