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
| Paid in ARL     | `0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9` |
| Paid in USDC    | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6` |

ARL token: `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`. Source and tests:
[github.com/armanalabsai/arlcoin.io](https://github.com/armanalabsai/arlcoin.io).

## Development

```bash
npm test                                   # unit tests
anvil --fork-url https://base-rpc.publicnode.com --port 18546
ARL_FORK_RPC=http://127.0.0.1:18546 npm run test:fork   # the full job lifecycle on a local fork
npm run build                              # dist/ with viem bundled: no runtime dependencies
```

Verified jobs, where a committee of staked validators checks the work, come in a later version.

License: Apache-2.0.
