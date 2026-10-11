# Compute provider (reference)

`packages/provider` (`@arl/provider`) is reference software for a compute provider on the ARL
network. It runs jobs that the provider has defined, for a time the consumer has paid for, and
settles the seconds used in ARL over x402 `upto` through `@arl/payments`. It is tested on this
machine only. No provider runs it, and it runs on no public network.

## How a run is paid

1. The consumer asks to run a job for up to `seconds`:
   `POST /jobs/<name>?seconds=<n>`.
2. Without a payment, the provider answers `402` with a `PAYMENT-REQUIRED` header. The header
   carries the x402 requirements for a ceiling of `pricePerSecond × seconds`. The authorization
   window is the run plus 60 seconds for the settlement.
3. The consumer's wallet signs that ceiling and sends the request again. The signed payment goes
   in the `PAYMENT-SIGNATURE` header, and the request body becomes the job's standard input.
4. The provider:
   - rebuilds the requirements itself and never uses the consumer's copy;
   - refuses a payment for another job, length, payee, asset or amount;
   - has the facilitator verify the authorization;
   - starts each authorization at most once.
5. The job runs and is killed when the paid time runs out. Any part of a second is billed as a
   whole second. The amount settled is price × billed seconds and never exceeds the ceiling.
6. The answer carries the job's output and a `PAYMENT-RESPONSE` header with the settlement
   receipt.

Who pays for what:

- A job that exits with an error is billed for the time it used.
- A job that could not start is billed nothing.
- A run that used no time retires the authorization.
- If the settlement fails, the output is withheld.

`GET /jobs` lists the jobs, the price per second and the longest run.

## What runs

The provider's own job table holds each job's command and arguments. A consumer chooses a job by
name and cannot pass a command.

- The process starts without a shell and with an empty environment, so the provider's keys and
  settings never reach it.
- Input and output are capped at 1 MiB by default.
- Further isolation belongs in the job's command, for example
  `docker run --rm --network none --gpus all <image>`. That covers containers, GPU assignment,
  and network and file-system limits.

```ts
import { ComputeProvider, createProviderServer } from "@arl/provider";

const provider = new ComputeProvider({
  chainId: 84532, // Base Sepolia; Base Mainnet is refused
  arlToken, // from the deployment manifest
  payTo, // the provider's public address
  facilitatorAddress,
  pricePerSecond: 10n ** 15n,
  maxSeconds: 300,
  jobs: { infer: { command: "docker", args: ["run", "--rm", "-i", "--network", "none", image] } },
  facilitator, // an ArlUptoFacilitator from @arl/payments
});
createProviderServer(provider).listen(8080); // behind a TLS-terminating proxy
```

## Tests

- `npm test -w @arl/provider` runs the unit tests: real processes, and ARL's facilitator wrapper
  with a stand-in for the SDK scheme.
- `ARL_FORK_RPC=<Base Sepolia RPC> npm run test:fork -w @arl/provider` runs end to end on a local
  Anvil fork of Base Sepolia, with the real x402 SDK client and facilitator and the real Permit2
  and upto proxy. It needs `forge build` and `anvil`. Every transaction stays in the fork. It
  shows that:
  - a job is billed for the seconds it used, and the payment moves on-chain;
  - a job is killed at the paid time and settled at the ceiling;
  - a replayed payment is refused before it runs.

## Limits

- One authorization pays for one run. The payments policy accepts authorizations that live at
  most 600 seconds, and an authorization must still be valid at settlement. A run is therefore at
  most 540 seconds (`MAX_RUN_SECONDS`).
- Longer jobs use the escrowed Jobs flow (ERC-8183, see [jobs.md](jobs.md)) or an on-chain
  per-second stream ([compute-streaming.md](compute-streaming.md), not deployed). Streaming payment
  through consecutive x402 authorizations is not built.
- The record of authorizations already started lives in memory. A provider with several
  instances or restarts needs a shared store, the same as the facilitator's `AuthorizationStore`.
- The capacity a provider lists is its own statement. Nothing on-chain checks the hardware.
- Running a facilitator needs a funded settlement account. That account and its key belong to
  whoever operates it, and are not part of this repository.
