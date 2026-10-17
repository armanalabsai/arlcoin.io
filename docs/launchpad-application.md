# Launchpad Application Pack

Status: **used for applications from 2026-10-05.** This collects what launchpads ask for, in one place, from the
repository's own sources. Every value is either a fact from this repository or marked `TBD`.
Nothing marked `TBD` may be filled in until it exists and can be verified
(`docs/content-standard.md`). Launchpads differ; check each form and its terms when applying.

ARL is deployed and source-verified on the Base Sepolia testnet, has an open bug bounty and is not
on Base Mainnet yet. Most launchpads require at least a deployed (testnet or mainnet) contract, so
the readiness table below is the real starting point.

## Readiness

| What launchpads usually ask for                 | ARL status                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project overview, website                       | Ready: https://arlcoin.io, overview below                                                                                                                                                                                                                                                                                                          |
| Token contract and standard                     | Written and tested: ERC-20 with EIP-2612 permit, fixed 21,000,000 supply, no mint function (`contracts/src/ARLToken.sol`)                                                                                                                                                                                                                          |
| Tokenomics and vesting                          | Ready: allocation table below (`packages/tokenomics`); vesting 12-month cliff + 36 months linear from the TGE                                                                                                                                                                                                                                      |
| Source code                                     | Ready: https://github.com/armanalabsai/arlcoin.io                                                                                                                                                                                                                                                                                                  |
| Tests and static analysis                       | Ready: see Security                                                                                                                                                                                                                                                                                                                                |
| Deployed contract (testnet)                     | Ready: Base Sepolia, token 0x244312b619127B6458154F3467eFD7c87CD28500, source-verified                                                                                                                                                                                                                                                             |
| Deployed contract (mainnet)                     | **Planned.** Base Mainnet deployment is the TGE, 2026-10-23; the tooling refuses it earlier                                                                                                                                                                                                                                                        |
| Sale parameters (allocation, price, raise, FDV) | Public Launch: no airdrop at TGE (a 500,000 ARL airdrop follows at a later date, rules announced later); up to 1,500,000 ARL for launchpad sales and 3,000,000 ARL sold on Uniswap from the listing price (owner 2026-10-10 and 2026-10-17, legal approval confirmed by the owner 2026-10-10); listing price 0.20 USD (`docs/launch-decisions.md`) |
| TGE date                                        | 2026-10-23 (owner decision 2026-10-16). Every vesting schedule starts at the TGE                                                                                                                                                                                                                                                                   |
| Liquidity plan                                  | The whole 2,000,000 ARL Liquidity allocation as ARL-only Uniswap v3 positions on ARL/USDC, ARL/USDT, ARL/WETH and ARL/cbBTC from 0.20 USD; positions held by the 2-of-3 Liquidity Safe for 12 months                                                                                                                                               |
| Team identity (KYC with the launchpad)          | Provided privately to the launchpad during KYC.                                                                                                                                                                                                                                                                                                    |
| Legal opinion on the token                      | Obtained by the owner                                                                                                                                                                                                                                                                                                                              |
| Whitepaper or litepaper                         | Partly: economic specification `docs/tokenomics-economic-spec.md`, architecture `docs/architecture.md`; no litepaper PDF                                                                                                                                                                                                                           |
| Pitch deck                                      | **TBD**                                                                                                                                                                                                                                                                                                                                            |
| Community and social accounts                   | X https://x.com/arlprotocol (@arlprotocol), Telegram https://t.me/arlcoin_community, email team@arlcoin.io, website https://arlcoin.io                                                                                                                                                                                                             |
| Product demo                                    | Ready locally: the ARL app (`apps/dapp`) runs on a local chain; not hosted publicly                                                                                                                                                                                                                                                                |

## Project overview

| Field           | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Name and ticker | ARL                                                                                           |
| Category        | AI and compute services; payments; privacy; DeFi                                              |
| Chain           | Base (Ethereum L2). Testnet: Base Sepolia (84532). Mainnet: Base (8453), locked until release |
| Website         | https://arlcoin.io                                                                            |
| Source code     | https://github.com/armanalabsai/arlcoin.io (Apache-2.0)                                       |
| Contact         | ARL Protocol team, team@arlcoin.io                                                            |
| Logo            | `assets/brand/png/arl-token-icon-200.png` (200 × 200), SVG `assets/brand/arl-token-icon.svg`  |

### Short description

> ARL is the native token of ARL Protocol, built on Base for AI and compute services: services
> are listed on the open ERC-8004 registry, paid per use in ARL over x402, hired through an
> ERC-8183 escrow and rated by paying clients. The supply is fixed at 21,000,000 ARL, minted once
> at deployment. Investor and partnership allocations vest over 48 months from the TGE, the
> treasury sits behind a 48-hour timelock and every allocation is held by a dedicated Safe.

Use present tense only for what is live on the day the form is submitted.

### What is built (code, tested, not deployed)

| Component                     | Contract or package             | Standard reused                                     |
| ----------------------------- | ------------------------------- | --------------------------------------------------- |
| Token                         | `ARLToken`                      | OpenZeppelin ERC-20 + EIP-2612                      |
| Vesting                       | `ARLVestingWallet`              | OpenZeppelin VestingWallet                          |
| Treasury timelock (48 h)      | `ARLTimelock`                   | OpenZeppelin TimelockController                     |
| Public Launch airdrop (later) | `ARLMerkleDistributor`          | OpenZeppelin MerkleProof, merkle-tree               |
| Staking                       | `ARLStakingRewards`             | Synthetix StakingRewards (via curvefi/unipool-fork) |
| Usage payments                | `@arl/payments`                 | x402 `upto` over Permit2                            |
| Service registry and ratings  | app                             | ERC-8004 Identity and Reputation registries         |
| Job escrow                    | `ARLJobs`                       | ERC-8183 Agentic Commerce                           |
| Anonymous polls               | `ARLAnonymousSignal`, `@arl/zk` | Semaphore protocol, Noir / UltraHonk                |
| App                           | `apps/dapp`                     | Scaffold-ETH 2                                      |

## Token

| Field                     | Value                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Standard                  | ERC-20 with EIP-2612 permit; 18 decimals                                                    |
| Maximum and total supply  | 21,000,000 ARL, minted once in the constructor; no mint function, no pause, no upgrade path |
| Circulating supply at TGE | 2,100,000 ARL (the Founder allocation, unlocked at TGE); no airdrop at TGE                  |
| Contract address          | `TBD` (after deployment)                                                                    |

### Allocation (from `packages/tokenomics`)

| Allocation                    | ARL            | Share    | Release                                                                       |
| ----------------------------- | -------------- | -------- | ----------------------------------------------------------------------------- |
| Public Launch                 | 5,000,000      | 23.81%   | No airdrop at TGE; 500,000 ARL airdrop at a later date, rules announced later |
| Community & Staking           | 3,000,000      | 14.29%   | Staking rewards program; rates `TBD`                                          |
| Ecosystem & Growth            | 2,000,000      | 9.52%    | Programs tied to verifiable activity; rules `TBD`                             |
| Strategic Partnerships        | 2,000,000      | 9.52%    | Vesting wallet: 12-month cliff, then 36 months linear, from the TGE           |
| Liquidity                     | 2,000,000      | 9.52%    | Reserve held by a Safe; pool plan `TBD`                                       |
| Founder                       | 2,100,000      | 10.00%   | Unlocked at TGE; no cliff or vesting                                          |
| Investors / Strategic Capital | 1,500,000      | 7.14%    | Vesting wallet: 12-month cliff, then 36 months linear, from the TGE           |
| Treasury                      | 1,000,000      | 4.76%    | Timelock (48 h) controlled by the Treasury Safe, with a cancel-only guardian  |
| Team                          | 900,000        | 4.29%    | Per-grant vesting wallets funded from the pool; grant terms `TBD`             |
| Early Users                   | 1,100,000      | 5.24%    | Rewards for verifiable usage; rules `TBD`                                     |
| Grants / Bug Bounty           | 400,000        | 1.90%    | Paid per award                                                                |
| **Total**                     | **21,000,000** | **100%** |                                                                               |

Launchpads review TGE unlocks closely. The Founder allocation (10%) is fully unlocked at TGE by
the owner's decision of 2026-09-28. Expect launchpads to ask about it. Some require founder and
team tokens to be locked or vested. The decision and any change to it stay with the owner. A change
needs a reviewed change to the token, deployment plan and verifier.

## Sale parameters (all TBD; owner decisions)

| Parameter                         | Value                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens offered on the launchpad   | Up to 1,500,000 ARL reserved in the Public Launch Safe (owner 2026-10-10, reduced 2026-10-17); price at or above 0.20 USD; the later airdrop and the Uniswap sale are separate |
| Price per ARL, raise, FDV         | 0.20 USD per ARL; FDV 4,200,000 USD; raise `TBD`                                                                                                                               |
| Accepted currency                 | `TBD`                                                                                                                                                                          |
| TGE unlock for buyers and vesting | `TBD`                                                                                                                                                                          |
| Listing and initial liquidity     | 0.20 USD; pool paired with launch proceeds, or single-sided ARL at or above 0.20 USD; LP in the Liquidity Safe, 12-month lock                                                  |
| Jurisdictions excluded            | `TBD` (with legal advice)                                                                                                                                                      |

## Security

| Check                | Result                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unit and fuzz tests  | 246 Foundry tests (10,000 fuzz runs each), 18 more with real zero-knowledge proofs                             |
| Invariant tests      | Supply, allocations, vesting, timelock roles, distributor funds, staking accounting, job escrow                |
| Coverage             | 100% of lines and functions in every `src/` contract (`npm run coverage:contracts`)                            |
| Static analysis      | Slither: 0 findings (fails CI on Low or higher); Aderyn and Mythril reviewed (`docs/review-scope.md`)          |
| Symbolic checks      | Halmos, 11 of 11 properties proven                                                                             |
| Deployment rehearsal | Local chain and Base Sepolia fork: deployed, verified, 59 negative cases refused                               |
| Reproducible build   | Committed bytecode hashes checked by CI; deployed code verifiable against a clean build (`docs/deployment.md`) |
| Bug bounty           | In ARL, see `docs/bug-bounty.md`                                                                               |
| Admin keys           | No owner, upgrade or mint function in the token; allocations held by dedicated Safes; treasury timelock        |

## Roadmap to launch

1. Finalize contracts and tokenomics (sale parameters, TGE date, program rules).
2. Public testnet (Base Sepolia): deploy, verify, Safes and the 48-hour timelock in place.
3. Reproducible deployment proof; testnet operation and monitoring.
4. Mainnet release candidate, then Base Mainnet.
5. Launchpad sale and listing, after the above.

## Checklist before submitting

- [ ] Contracts deployed and verified on the network the launchpad requires
- [ ] Sale parameters decided and written into this document
- [ ] TGE date set
- [ ] Liquidity plan and LP custody documented
- [x] Legal opinion obtained
- [ ] Litepaper and pitch deck prepared from this document and the economic specification
- [ ] Social accounts created and linked from https://arlcoin.io
- [ ] Every `TBD` replaced with a verified value

Never pay anyone who promises a guaranteed launchpad slot or listing.
