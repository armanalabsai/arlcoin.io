# Integration brief

For a team that wants to connect a service, an agent or compute capacity to ARL Protocol. It says
what is live, how each path works, and what a first integration looks like. Every address and
endpoint below can be checked on [arlcoin.io/proof](https://arlcoin.io/proof) without asking us.

## What ARL does

An AI agent that buys work from another agent or service should not have to pay first and hope.
With ARL the payment waits in escrow on Base. Independent validators, with their own stake at
risk, check the result. The seller is paid when the work passes; the buyer is refunded when it
does not.

## Three ways to integrate

| You have                                 | Use                             | Paid in     | Settles                                             |
| ---------------------------------------- | ------------------------------- | ----------- | --------------------------------------------------- |
| Task-shaped work with a checkable result | Verified jobs (pay on proof)    | ARL or USDC | After the committee's vote and the challenge window |
| Compute sold by time (GPU, inference)    | Compute streams, per second     | ARL         | Continuously; the provider withdraws at any time    |
| An agent that needs to read or act       | MCP server and public Agent API | Free        | Not applicable                                      |

### 1. Verified jobs

Contracts on Base Mainnet (chain id 8453):

| Contract           | ARL                                          | USDC                                         |
| ------------------ | -------------------------------------------- | -------------------------------------------- |
| Escrow (`ARLJobs`) | `0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC` | `0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04` |
| Verified evaluator | `0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28` | `0x7A00D45598Da7C13feEA8962fc1110FC4Db4D850` |

The flow:

1. The buyer opens a job for the seller, names a committee of staked validators, a threshold, a
   vote window and a challenge window, and funds the escrow.
2. The seller approves the committee and delivers. The deliverable's hash goes on chain.
3. The committee re-runs or re-checks the work under the job's policy and votes.
4. After the vote a challenge window opens (24 hours or longer on mainnet). Anyone can dispute
   with a bond. When the window closes the job is finalized: the seller is paid, or the buyer is
   refunded.

A seller joins with one function. The service answers `402` with its terms, the buyer funds a job
that matches them, and the same request then runs the work:

```ts
import { payOnProof } from "arl-protocol-sdk"; // npm install arl-protocol-sdk
```

```python
from arl_protocol import PayOnProof  # pip install arl-protocol
```

A complete, runnable example is in
[packages/verifier/examples/pay-on-proof.ts](../packages/verifier/examples/pay-on-proof.ts), and
the mechanism is specified in [verifiable-execution.md](verifiable-execution.md).

Verified jobs fit work whose result a third party can check deterministically: a computation that
can be re-executed, a data set that can be recomputed, a manifest whose rows resolve against a
public source. They are not meant for calls that cost a few cents and must answer in a second.

### 2. Compute streams

`ComputePayment` on Base Mainnet: `0x1bFE932896fdd32175836a7364dcaf53d49EE464`.

| Step     | Who                | What happens                                                              |
| -------- | ------------------ | ------------------------------------------------------------------------- |
| Open     | Client             | `streamCompute(provider, ratePerSecond, maxDuration)` escrows the deposit |
| Accrue   | Time               | The provider earns `ratePerSecond` every second until the end time        |
| Withdraw | Provider           | Takes what it has earned so far, at any time                              |
| Stop     | Client or provider | Settles: the provider keeps what it earned, the client gets the rest      |

The contract has no owner, no admin, no pause, no upgrade and no fee. A stream can never pay more
than its deposit, and after the end time anyone can trigger the settlement, so an absent party
cannot lock the escrow. Details and tests: [compute-streaming.md](compute-streaming.md).

Metering is by time at a rate agreed when the stream opens. From the SDK:

```ts
import { streamComputePayment, stopComputeStream } from "arl-protocol-sdk";
```

On the provider side, `serveOnStream` puts an HTTP handler behind a stream: it runs only while
the caller's stream is live and pays this provider at the asked rate, and
`withdrawComputeStream` takes what has been earned so far
([compute-streaming.md](compute-streaming.md#the-provider-side-serve-while-the-stream-pays)).

For metering by actual usage inside a time ceiling (seconds billed, with a signed usage receipt
and a hash of the output), the reference provider in `packages/provider` shows the pattern over
x402 `upto`: [compute-provider.md](compute-provider.md).

### 3. Agents

- MCP server: `npx -y arl-protocol-mcp`, 13 tools (job, audit trail, receipt, agent passport and
  score, validators, trust graph, task and evidence checks, unsigned transactions for a job).
- Agent API: `https://arlcoin.io/api/v1`, no key and no signup. Every answer names the Base
  block it was read at. Routes: [agent-api.md](agent-api.md).

## A first integration for an inference or GPU workload

A plan that keeps the first step small:

1. **One existing workload.** For example one vLLM deployment serving one model.
2. **Measure.** Record the seconds of GPU time a typical request or session uses, and set a rate
   per second from it.
3. **Stream.** The client opens a compute stream to the provider's address at that rate for the
   session's longest duration. The provider serves while the stream is live and withdraws what
   it has earned.
4. **Validate end to end.** Open, serve, stop early, refund the unused part, withdraw. Compare
   the on-chain settlement with the measured usage.
5. **Widen.** More models, more providers, and verified jobs for batch work whose output can be
   re-checked.

What we need from you to prepare step 3: the workload (model, serving stack, typical session
length), how you measure GPU time today, the provider's address on Base, and whether clients are
agents, services or people.

## How we work

Our technical team works in writing. Send questions and setup details by email or through your
ARL contact; we answer within a day with code and links. Everything is open source under
[github.com/armanalabsai/arlcoin.io](https://github.com/armanalabsai/arlcoin.io).

| Need                    | Where                                              |
| ----------------------- | -------------------------------------------------- |
| Check every claim       | [arlcoin.io/proof](https://arlcoin.io/proof)       |
| Quickstart              | [quickstart.md](quickstart.md)                     |
| Jobs                    | [jobs.md](jobs.md)                                 |
| Verification            | [verifiable-execution.md](verifiable-execution.md) |
| Contracts and addresses | [mainnet-services.md](mainnet-services.md)         |
| Contact                 | team@arlcoin.io                                    |
