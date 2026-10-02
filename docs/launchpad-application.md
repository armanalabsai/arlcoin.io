# Launchpad Application Pack

Status: **draft; not submitted.** This collects what launchpads ask for, in one place, from the
repository's own sources. Every value is either a fact from this repository or marked `TBD`.
Nothing marked `TBD` may be filled in until it exists and can be verified
(`docs/content-standard.md`). Launchpads differ; check each form and its terms when applying.

ARL is not deployed on any public network, has not been externally audited and has no sale
parameters yet. Most launchpads require at least an audit and a deployed (testnet or mainnet)
contract, so the readiness table below is the real starting point.

## Readiness

| What launchpads usually ask for                 | ARL status                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Project overview, website                       | Ready: https://arlcoin.io, overview below                                                                                 |
| Token contract and standard                     | Written and tested: ERC-20 with EIP-2612 permit, fixed 21,000,000 supply, no mint function (`contracts/src/ARLToken.sol`) |
| Tokenomics and vesting                          | Ready: allocation table below (`packages/tokenomics`); vesting 12-month cliff + 36 months linear from the TGE             |
| Source code                                     | Ready: https://github.com/gokturkalazdaghan-dot/ARLCOIN                                                                   |
| Tests and static analysis                       | Ready: see Security                                                                                                       |
| Independent security audit                      | **Missing.** Scope prepared in `docs/audit-scope.md`; an audit firm has not been engaged                                  |
| Deployed contract (testnet)                     | **Missing.** Base Sepolia deployment rehearsed on a fork; not yet broadcast (needs the owner's wallet)                    |
| Deployed contract (mainnet)                     | **Missing.** Base Mainnet is locked in code until audit and release review                                                |
| Sale parameters (allocation, price, raise, FDV) | **TBD** (owner decision; see Sale parameters)                                                                             |
| TGE date                                        | **TBD.** Rule decided: every vesting schedule starts at the TGE                                                           |
| Liquidity plan                                  | **TBD.** 2,000,000 ARL Liquidity reserve exists; pool size, pair and LP custody not decided                               |
| Team identity (KYC with the launchpad)          | Founder: Alaz Daghan Gokturk, Founder and CEO. KYC is done privately with each launchpad by the founder                   |
| Legal opinion on the token                      | **TBD.** Not obtained                                                                                                     |
| Whitepaper or litepaper                         | Partly: economic specification `docs/tokenomics-economic-spec.md`, architecture `docs/architecture.md`; no litepaper PDF  |
| Pitch deck                                      | **TBD**                                                                                                                   |
| Community and social accounts                   | **TBD**                                                                                                                   |
| Product demo                                    | Ready locally: the ARL app (`apps/dapp`) runs on a local chain; not hosted publicly                                       |

## Project overview

| Field           | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Name and ticker | ARL                                                                                           |
| Category        | AI and compute services; payments; privacy; DeFi                                              |
| Chain           | Base (Ethereum L2). Testnet: Base Sepolia (84532). Mainnet: Base (8453), locked until release |
| Website         | https://arlcoin.io                                                                            |
| Source code     | https://github.com/gokturkalazdaghan-dot/ARLCOIN (Apache-2.0)                                 |
| Contact         | armanalabsai@gmail.com                                                                        |
| Founder         | Alaz Daghan Gokturk, Founder and CEO                                                          |
| Logo            | `assets/brand/png/arl-token-icon-200.png` (200 × 200), SVG `assets/brand/arl-token-icon.svg`  |

### Short description

> ARL is the native token of ARL Protocol, built on Base for AI and compute services: services
> are listed on the open ERC-8004 registry, paid per use in ARL over x402, hired through an
> ERC-8183 escrow and rated by paying clients. The supply is fixed at 21,000,000 ARL, minted once
> at deployment. Investor and partnership allocations vest over 48 months from the TGE, the
> treasury sits behind a 48-hour timelock and every allocation is held by a dedicated Safe.

Use present tense only for what is live on the day the form is submitted.

### What is built (code, tested, not deployed)

| Component                    | Contract or package             | Standard reused                                     |
| ---------------------------- | ------------------------------- | --------------------------------------------------- |
| Token                        | `ARLToken`                      | OpenZeppelin ERC-20 + EIP-2612                      |
| Vesting                      | `ARLVestingWallet`              | OpenZeppelin VestingWallet                          |
| Treasury timelock (48 h)     | `ARLTimelock`                   | OpenZeppelin TimelockController                     |
| Public Launch claim          | `ARLMerkleDistributor`          | OpenZeppelin MerkleProof, merkle-tree               |
| Staking                      | `ARLStakingRewards`             | Synthetix StakingRewards (via curvefi/unipool-fork) |
| Usage payments               | `@arl/payments`                 | x402 `upto` over Permit2                            |
| Service registry and ratings | app                             | ERC-8004 Identity and Reputation registries         |
| Job escrow                   | `ARLJobs`                       | ERC-8183 Agentic Commerce                           |
| Anonymous polls              | `ARLAnonymousSignal`, `@arl/zk` | Semaphore protocol, Noir / UltraHonk                |
| App                          | `apps/dapp`                     | Scaffold-ETH 2                                      |

## Token

| Field                     | Value                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Standard                  | ERC-20 with EIP-2612 permit; 18 decimals                                                    |
| Maximum and total supply  | 21,000,000 ARL, minted once in the constructor; no mint function, no pause, no upgrade path |
| Circulating supply at TGE | 2,100,000 ARL (the Founder allocation, unlocked at TGE), before any Public Launch claims    |
| Contract address          | `TBD` (after deployment)                                                                    |

### Allocation (from `packages/tokenomics`)

| Allocation                    | ARL            | Share    | Release                                                                      |
| ----------------------------- | -------------- | -------- | ---------------------------------------------------------------------------- |
| Public Launch                 | 5,000,000      | 23.81%   | Merkle claim from a published list; amount at TGE, limits and window `TBD`   |
| Community & Staking           | 3,000,000      | 14.29%   | Staking rewards program; rates `TBD`                                         |
| Ecosystem & Growth            | 2,000,000      | 9.52%    | Programs tied to verifiable activity; rules `TBD`                            |
| Strategic Partnerships        | 2,000,000      | 9.52%    | Vesting wallet: 12-month cliff, then 36 months linear, from the TGE          |
| Liquidity                     | 2,000,000      | 9.52%    | Reserve held by a Safe; pool plan `TBD`                                      |
| Founder                       | 2,100,000      | 10.00%   | Unlocked at TGE; no cliff or vesting                                         |
| Investors / Strategic Capital | 1,500,000      | 7.14%    | Vesting wallet: 12-month cliff, then 36 months linear, from the TGE          |
| Treasury                      | 1,000,000      | 4.76%    | Timelock (48 h) controlled by the Treasury Safe, with a cancel-only guardian |
| Team                          | 900,000        | 4.29%    | Per-grant vesting wallets funded from the pool; grant terms `TBD`            |
| Early Users                   | 1,100,000      | 5.24%    | Rewards for verifiable usage; rules `TBD`                                    |
| Grants / Bug Bounty           | 400,000        | 1.90%    | Paid per award                                                               |
| **Total**                     | **21,000,000** | **100%** |                                                                              |

Launchpads review TGE unlocks closely. The Founder allocation (10%) is fully unlocked at TGE by
the owner's decision of 2026-09-28. Expect launchpads to ask about it. Some require founder and
team tokens to be locked or vested. The decision and any change to it stay with the owner. A change
needs a reviewed change to the token, deployment plan and verifier.

## Sale parameters (all TBD; owner decisions)

| Parameter                         | Value                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Tokens offered on the launchpad   | `TBD` (would come from the Public Launch allocation)                          |
| Price per ARL, raise, FDV         | `TBD`                                                                         |
| Accepted currency                 | `TBD`                                                                         |
| TGE unlock for buyers and vesting | `TBD`                                                                         |
| Listing and initial liquidity     | `TBD` (from the 2,000,000 ARL Liquidity reserve; LP custody documented first) |
| Jurisdictions excluded            | `TBD` (with legal advice)                                                     |

## Security

| Check                | Result                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Unit and fuzz tests  | 246 Foundry tests (10,000 fuzz runs each), 18 more with real zero-knowledge proofs                             |
| Invariant tests      | Supply, allocations, vesting, timelock roles, distributor funds, staking accounting, job escrow                |
| Coverage             | 100% of lines and functions in every `src/` contract (`npm run coverage:contracts`)                            |
| Static analysis      | Slither: 0 findings (fails CI on Low or higher); Aderyn and Mythril reviewed (`docs/audit-scope.md`)           |
| Symbolic checks      | Halmos, 10 of 11 properties proven                                                                             |
| Deployment rehearsal | Local chain and Base Sepolia fork: deployed, verified, 58 negative cases refused                               |
| Reproducible build   | Committed bytecode hashes checked by CI; deployed code verifiable against a clean build (`docs/deployment.md`) |
| Independent audit    | **Not yet**                                                                                                    |
| Admin keys           | No owner, upgrade or mint function in the token; allocations held by dedicated Safes; treasury timelock        |

## Roadmap to launch

1. Finalize contracts and tokenomics (sale parameters, TGE date, program rules).
2. Independent external audit; fix the findings.
3. Public testnet (Base Sepolia): deploy, verify, Safes and the 48-hour timelock in place.
4. Reproducible deployment proof; testnet operation and monitoring.
5. Mainnet release candidate, then Base Mainnet.
6. Launchpad sale and listing, after the above.

## Checklist before submitting

- [ ] Audit report published
- [ ] Contracts deployed and verified on the network the launchpad requires
- [ ] Sale parameters decided and written into this document
- [ ] TGE date set
- [ ] Liquidity plan and LP custody documented
- [ ] Legal opinion obtained
- [ ] Litepaper and pitch deck prepared from this document and the economic specification
- [ ] Social accounts created and linked from https://arlcoin.io
- [ ] Every `TBD` replaced with a verified value

Never pay anyone who promises a guaranteed launchpad slot or listing.
