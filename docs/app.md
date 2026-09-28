# ARL App (`apps/dapp`)

Status: **IN DEVELOPMENT.** Runs on a local Anvil chain only. ARL is not deployed on any public
network, and the app has no setting that targets Base Mainnet.

The app is where ARL holders use the contracts: see their balance and send ARL, follow and release
a vesting schedule, and stake ARL for rewards. It is built on
[Scaffold-ETH 2](https://github.com/scaffold-eth/scaffold-eth-2) (MIT); what was taken and what was
changed is listed in [`THIRD_PARTY_LICENSES`](../THIRD_PARTY_LICENSES).

## Screens

| Screen  | Contract                           | What the user can do                                                                              |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Wallet  | `ARLToken`                         | See the ARL balance, stake and unclaimed rewards; send ARL                                        |
| Vesting | `ARLVestingWallet`                 | See beneficiary, cliff and end dates, released and releasable amounts; release to the beneficiary |
| Staking | `ARLStakingRewards` and `ARLToken` | Stake (approving exactly the amount), withdraw, claim rewards, or withdraw everything and claim   |

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

## Local fixture

`contracts/script/DevDapp.s.sol` deploys ARL, one vesting wallet and the staking contract on local
Anvil and refuses every other chain. Its values are development placeholders, not ARL economics:

| Item                  | Value                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| Demo user (account 1) | Holds the Public Launch allocation; beneficiary of the vesting wallet |
| Operator (account 0)  | Deployer, every other allocation, staking reward distributor          |
| Vesting wallet        | Holds the Investors allocation; 5 minute cliff, linear over 30 days   |
| Staking               | 30,000 ARL reward period over 30 days, funded at deployment           |

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

| Suite      | Command            | Covers                                                                                                                                                           |
| ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `npm test`         | Amount parsing and formatting, vesting phase, reward share, network gate (Base Mainnet refused)                                                                  |
| End to end | `npm run test:e2e` | Production build in Chromium against a fresh Anvil chain: connect, send, stake / earn / claim / withdraw / exit, vesting before and after the cliff, phone width |
| Contracts  | `forge test`       | `DevDappTest`: the fixture refuses non-local chains and deploys the expected state                                                                               |

## Not yet

- Base Sepolia: needs the contracts deployed there (owner approval) and their addresses.
- Mobile wallets over WalletConnect: needs a WalletConnect project id (a free account; owner
  decision).
- AI Payments (x402) and Compute screens.
