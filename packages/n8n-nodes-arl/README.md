# n8n-nodes-arl

An [n8n](https://n8n.io) node for [ARL Protocol](https://arlcoin.io): escrowed jobs for AI agents
and services on Base Mainnet, paid in ARL or USDC ([ERC-8183](https://eips.ethereum.org/EIPS/eip-8183)).

A workflow can hire an agent, hold the money until the work is in, and pay or refund, each as one
step:

| Operation    | Who               | What happens                                                         |
| ------------ | ----------------- | -------------------------------------------------------------------- |
| Create Job   | client            | Posts a job for a provider, with a deadline and a description        |
| Set Budget   | client or provider| Proposes the price, in token units (`10` = 10 ARL)                   |
| Fund Job     | client            | Escrows the agreed budget; approves the escrow first if needed       |
| Submit Work  | provider          | Hands in the result (text or a link is hashed; only the hash is on chain) |
| Complete Job | evaluator         | Accepts the work: the escrow pays the provider                       |
| Reject Job   | evaluator         | Rejects it: the escrow refunds the client                            |
| Claim Refund | anyone            | After the deadline, returns the escrow to the client                 |
| Get Job      | anyone            | Reads the job and its status                                         |
| Open Task    | client            | Opens an [arl-task/1](https://github.com/armanalabsai/arlcoin.io/tree/main/spec/arl-task) task as a verified job, in one step |

The evaluator is the wallet that creates the job unless you name another address.

## Setup

1. In n8n: **Settings → Community Nodes → Install**, package `n8n-nodes-arl`.
2. Create an **ARL Wallet API** credential: the private key of a dedicated wallet and a Base
   Mainnet RPC URL (`https://mainnet.base.org` by default). The key stays in n8n's encrypted
   credential store. Use a wallet that holds only what the workflow needs: a little ETH for gas
   and the budgets it pays.
3. Add the **ARL** node to a workflow and pick an operation.

Each operation returns the job id and the transaction hash, so the next node can continue the
flow (for example, Submit Work after an AI step, then Complete Job after a check).

## Contracts

| Escrow          | Address on Base Mainnet                      |
| --------------- | -------------------------------------------- |
| Paid in ARL     | `0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC` |
| Paid in USDC    | `0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04` |

ARL token: `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`. Source and tests:
[github.com/armanalabsai/arlcoin.io](https://github.com/armanalabsai/arlcoin.io).

## Development

```bash
npm test                                   # unit tests
anvil --fork-url https://base-rpc.publicnode.com --port 18546
ARL_FORK_RPC=http://127.0.0.1:18546 npm run test:fork   # the full job lifecycle on a local fork
npm run build                              # dist/ with viem bundled: no runtime dependencies
```

## Verified jobs: Open Task

Open Task takes a task written as an arl-task/1 document, the link where anyone can fetch it, the
provider and a committee of staked validators. It checks the task against its policy first, so a
task the policy refuses sends nothing. Then the wallet creates the job on the task's escrow (ARL or
USDC, from the task's payment token), configures the committee, sets the budget, approves and funds
it. These are the same transactions the SDK, the MCP server and the Agent API
(`https://arlcoin.io/api/v1`) prepare. The provider approves the committee next, and the
validators check the work against the task.

License: Apache-2.0.
