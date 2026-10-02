# ARL App (`apps/dapp`)

Status: **IN DEVELOPMENT.** Runs on a local Anvil chain only. ARL is not deployed on any public
network, and the app has no setting that targets Base Mainnet.

The app is where ARL holders use the contracts: see their balance and send ARL, follow and release
a vesting schedule, and stake ARL for rewards. It is built on
[Scaffold-ETH 2](https://github.com/scaffold-eth/scaffold-eth-2) (MIT); what was taken and what was
changed is listed in [`THIRD_PARTY_LICENSES`](../THIRD_PARTY_LICENSES).

## Screens

| Screen   | Contract                                    | What the user can do                                                                                                                                             |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet   | `ARLToken`                                  | See the ARL balance, stake and unclaimed rewards; send ARL                                                                                                       |
| Vesting  | `ARLVestingWallet`                          | See beneficiary, cliff and end dates, released and releasable amounts; release to the beneficiary                                                                |
| Staking  | `ARLStakingRewards` and `ARLToken`          | Stake (approving exactly the amount), withdraw, claim rewards, or withdraw everything and claim                                                                  |
| Network  | ERC-8004 IdentityRegistry                   | List ARL services and compute capacity; register a service with its price, payee and facilitator; take it offline; pay it                                        |
| Payments | `ARLToken`, Permit2, `x402UptoPermit2Proxy` | Set or remove the Permit2 payment limit; sign a ceiling (x402 `upto`); a demo service charges the metered amount, capped at the ceiling; cancel an authorization |
| Private  | `ARLAnonymousSignal`                        | Create a private identity from a signature; join the demo group; vote in a poll with a zero-knowledge proof made in the browser                                  |
| Jobs     | `ARLJobs`, `ARLToken`                       | Post a job for a service, fund it into escrow, deliver, accept and pay, reject and refund, refund after the deadline                                             |

Design: Apple-style "liquid glass" in the website's night blue and amber. A fixed layer of soft
light sits behind the content; panels, tiles, the top bar and menus are translucent glass over it
(blur and saturation, a lit top edge, soft shadow), heavier for larger surfaces. Fields are recessed,
buttons respond on press. With "reduce transparency" or "increase contrast" turned on, surfaces
become solid; with "reduce motion", the press animation is off.

Rules the app follows:

- **Network gate** (`lib/network.ts`): the local chain (31337), and Base Sepolia (84532) once
  contracts are deployed there with approval. Base Mainnet (8453) and every other chain throw.
- **Wallets**: browser-extension wallets (MetaMask, Rabby, any injected wallet). No WalletConnect
  relay, and no "burner" wallet that would keep a private key in the browser. On the local chain a
  "Local dev account" entry uses Anvil's publicly known development account 1, which the local
  node unlocks; no key exists in the app.
- **Approvals**: staking approves exactly the amount being staked, never an unlimited allowance.
- **Consistent numbers**: vesting amounts that are added together are read at the same block.

## Payments (x402 `upto`)

The Payments screen uses the x402 SDK (`@x402/evm` 2.27.0) as published, against the canonical
Permit2 and `x402UptoPermit2Proxy` code, which the local chain setup installs at their canonical
addresses (`scripts/install-x402.ts`, code hashes checked). The flow:

1. **Payment limit.** The payer approves Permit2 for an amount they choose (never unlimited by
   default) and can remove it.
2. **Ceiling.** The payer signs a Permit2 witness for a ceiling, bound to the service (payee), the
   facilitator, ARL, a nonce and a 5 minute deadline.
3. **Charge.** The service measures usage (the demo prices it at 0.001 ARL per unit), and its
   facilitator verifies and settles the metered amount. More usage than the ceiling is charged at
   the ceiling. No usage sends nothing.
4. **Cancel.** Before a charge, the payer can cancel the authorization by invalidating its
   Permit2 nonce.

On a public network the facilitator is the service's server with its own key and gas. In the local
demo it runs in the browser as Anvil development account 4, which the local node unlocks; the
service is account 3. Neither has a key in the app.

## Private (anonymous polls)

The Private screen uses [`ARLAnonymousSignal`](zk-privacy.md). The wallet signs a fixed message;
the identity secret is derived from that signature in the page, kept only in memory, and never
sent. Joining publishes the identity's commitment (`MembersAdded`) and the new group root. The
screen rebuilds the member tree from those events and refuses to vote unless it matches the root
the contract holds.

A vote is a proof, made in the browser (noir_js and bb.js, a few seconds), that the voter is one
of the members, bound to the poll (scope) and the chosen option (message). The contract accepts
one proof per member per poll. On the local chain the group admin is account 0 and votes are sent
by a relayer (account 6), so the sending address is not the voter's wallet either.

Privacy notes: bb.js downloads its public proving parameters (CRS) from Aztec's CDN
(`crs.aztec-cdn.foundation`); the request carries nothing about the voter. Anyone who can see
both who joined and when a vote arrives in a very small group can guess more; the demo group is
small on purpose and is not a privacy guarantee.

## Jobs (ERC-8183)

Escrowed work paid in ARL; see [jobs.md](jobs.md).

## Network (ERC-8004)

ARL Network does not add a registry contract of its own. Providers register their services on
the ERC-8004 IdentityRegistry, the open "Trustless Agents" registry, which is already deployed at
`0x8004A818BFB912233c491871b3d84c89A494BD9e` on Base Sepolia (and at `0x8004A169…a432` on mainnets).
Each service is an ERC-8004 agent owned by the provider's wallet. Its registration file
(registration-v1, stored on-chain as a base64 JSON data URI) adds an `arl` section:

```json
"arl": {
  "version": 1, "scheme": "upto", "network": "eip155:31337", "asset": "<ARL>",
  "unitPrice": "1000000000000000", "unit": "1,000 tokens",
  "payTo": "<payee>", "facilitator": "<who settles>"
}
```

The Network screen lists every agent whose current file has valid ARL terms for this chain and
for ARL (other agents are ignored), lets a wallet register a service, and lets its owner take it
offline (a new file with `active: false`). "Pay with ARL" opens the Payments screen with that
service selected, and the payment uses the service's own price, payee and facilitator.

Everything read from the registry is validated (`lib/registry.ts`): size limits, no control
characters, addresses, a positive price, and links only over https (or http on this machine).

### Compute capacity

A compute provider adds a `compute` object to its `arl` section and is priced per `GPU second` or
`CPU second` (the unit must match the kind):

```json
"compute": {
  "kind": "gpu", "gpuModel": "NVIDIA H100 80GB", "gpus": 2, "gpuMemoryGb": 80,
  "vcpus": 32, "memoryGb": 256, "maxSeconds": 3600
}
```

CPU capacity has `"kind": "cpu"`, no `gpuModel`, and `gpus` and `gpuMemoryGb` set to 0. Values are
whole numbers within fixed bounds (`COMPUTE_LIMITS` in `lib/registry.ts`: up to 64 GPUs, 1,024 GB
per GPU, 1,024 vCPUs, 16,384 GB memory, jobs of 60 seconds to 24 hours); a file with malformed
capacity is not listed. The capacity is the provider's statement; nothing on-chain checks the
hardware, which is why the listing shows ratings from paid jobs next to it.

Billing (`lib/compute.ts`): the consumer signs a ceiling of price × seconds for the longest run it
accepts (at most the provider's `maxSeconds`); the provider measures the run, bills whole seconds
rounded up, and settles that amount, never above the ceiling, through the same x402 `upto` path
as any service. A longer job can also be hired through the Jobs screen with an escrowed budget and
a deadline. Provider software that runs workloads is not part of this repository.

Each service shows its rating from paid jobs (see [jobs.md](jobs.md#ratings-erc-8004-reputation)).

For the local chain, `scripts/install-canonical.ts` installs the identity and reputation registries' proxies and
implementation code, and the storage their initializers set, exactly as read from Base Sepolia
(`fixtures/erc8004-code.json`), and `scripts/seed-network.ts` registers the demo service.

## Local fixture

`contracts/script/DevDapp.s.sol` deploys ARL, one vesting wallet and the staking contract on local
Anvil and refuses every other chain. Its values are development placeholders, not ARL economics:

| Item                  | Value                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Demo user (account 1) | Holds the Public Launch allocation; beneficiary of the vesting wallet                                                              |
| Operator (account 0)  | Deployer, every other allocation, staking reward distributor                                                                       |
| Vesting wallet        | Holds the Investors allocation; 5 minute cliff, linear over 30 days                                                                |
| Jobs                  | `ARLJobs` with ARL as payment token, deployed by `DevDapp`; no jobs at start                                                       |
| Staking               | 30,000 ARL reward period over 30 days, funded at deployment                                                                        |
| Payments              | Canonical Permit2 and x402 upto proxy code; demo service account 3, facilitator account 4                                          |
| Private               | `contracts/zk-script/DevZk.s.sol`: verifier and `ARLAnonymousSignal`; demo group 0 (3 members), admin account 0, relayer account 6 |

The fixture is deployed by account 0 on a fresh chain, so contract addresses never change.
`contracts/deployedContracts.ts` is generated from it and checked on every end-to-end run.

## Run it

Requires Node 22 and Foundry v1.8.3.

```sh
cd apps/dapp
npm ci
npm run chain   # terminal 1: fresh Anvil (one block every 2 s) with the fixture deployed
npm run dev     # terminal 2: http://localhost:3100, then "Connect wallet" → "Local dev account"
```

To use MetaMask instead, add the network `http://127.0.0.1:8545`, chain id 31337.

## Tests

| Suite      | Command            | Covers                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `npm test`         | Amount parsing and formatting, vesting phase, reward share, network gate (Base Mainnet refused), poll options                                                                                                                                                                                                                             |
| End to end | `npm run test:e2e` | Production build in Chromium against a fresh Anvil chain: connect, send, stake / earn / claim / withdraw / exit, payment limit / signed ceiling / metered charge / cap / zero usage / cancel, anonymous vote proven in the browser and a second vote refused, jobs (pay, refund, expiry), vesting before and after the cliff, phone width |
| Contracts  | `forge test`       | `DevDappTest`: the fixture refuses non-local chains and deploys the expected state                                                                                                                                                                                                                                                        |

## Not yet

- Base Sepolia: needs the contracts deployed there (owner approval) and their addresses.
- Mobile wallets over WalletConnect: needs a WalletConnect project id (a free account; owner
  decision).
- A real (server-side) facilitator for services.
