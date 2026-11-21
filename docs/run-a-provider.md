# Run a provider agent

A provider is the account that does a job's work and is paid for it. `arl-verifier provide` runs
one unattended: it takes the funded jobs that name it, runs each job's spec in the pinned
container and submits the result, and the validators and the escrow do the rest. It needs no
server and no public address, because it finds its jobs on chain.

It is the provider's counterpart of the validator's `watch`
([run-a-validator.md](run-a-validator.md)), and it runs the same code a validator re-runs.

## What it does with a job

1. **Finds it.** A client opens a job on the escrow with this account as provider and the
   verified evaluator as evaluator, configures the verification (committee, threshold, windows,
   spec hash), sets a budget and funds it. The SDK's `openVerifiedJob`, the app's Verified page
   and the MCP server all do this.
2. **Checks it.** The agent fetches the spec the job points to and takes the job only if the spec
   hashes to the hash committed on chain and the job is inside the limits its operator set: the
   price, the container image, run time and memory, the committee, the time left.
3. **Approves the committee.** Without the provider's approval no validator can accept, so a
   job the agent does not take never locks anyone's bond.
4. **Runs the work once.** The result hash is saved before anything else happens, so a restart or
   a wait for the committee never runs paid work twice.
5. **Submits.** Once enough committee members have accepted to reach the threshold, the agent
   submits the result hash. The validators re-run the spec and vote; after the challenge window
   the escrow pays the provider.

A job the agent does not take costs it nothing and is refunded to the client at its deadline.

## What you need

- A machine that stays on, with Node.js 24 and Docker.
- An account used only for providing, with its private key on that machine and a little ETH on
  Base for gas (approve and submit: two transactions per job, cents each).
- A Base RPC endpoint.

To build a public record, register the account's agent in the ERC-8004 identity registry and have
clients name that agent number when they configure a job: every verified outcome is then written
to the agent's passport ([arlcoin.io/agent](https://arlcoin.io/agent/)).

## Run

```sh
ARL_PROVIDER_KEY=0x<the provider account's private key> \
ARL_MIN_BUDGET=10000000000000000000 \
  node packages/verifier/src/cli.ts provide \
  https://mainnet.base.org 0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28 -20000
```

`ARL_MIN_BUDGET` is the provider's price in the escrow token's base units (the example is
10 ARL) and has no default. Every 15 seconds the agent makes one pass. Progress is kept in
`.arl-provider-state.json`; a state file that cannot be read stops the agent instead of starting
over. The key is read from the environment only and is never printed.

| Variable                    | Meaning                                                        | Default  |
| --------------------------- | -------------------------------------------------------------- | -------- |
| `ARL_MIN_BUDGET`            | Smallest budget taken, in base units: the price                | Required |
| `ARL_MAX_SECONDS`           | Longest run a spec may ask for                                 | 600      |
| `ARL_MAX_MEMORY_MB`         | Most memory a spec may ask for                                 | 1024     |
| `ARL_MIN_HOURS_TO_DEADLINE` | Shortest time left until the job's deadline                    | 6        |
| `ARL_IMAGES`                | Only run these container digests (comma-separated)             | Any      |
| `ARL_CLIENTS`               | Only take jobs from these clients (comma-separated)            | Any      |
| `ARL_VALIDATORS`            | Only take jobs whose whole committee is among these validators | Any      |

Set `ARL_IMAGES` unless you intend to run any image a client names: the container has no network
and no access to the host beyond its work directory, but what runs is the client's choice.

## Tested

`packages/verifier/test-anvil/provide.anvil.test.ts` runs the agent with three unattended
validators on a local chain: after the client has opened and funded a job nobody acts by hand,
the work runs once, and the provider is paid after the challenge window. A job below the price
is neither approved nor run. It runs in CI with the other local-chain tests.
