# ARL Protocol

ARL is a fixed-supply ERC-20 token (21,000,000 ARL) on Base, with vesting, a timelocked treasury,
staking, escrowed jobs, usage-based payments and anonymous signals built around it.

**Status (2026-10-17): live on the Base Sepolia testnet. The Base Mainnet launch (TGE) is
2026-10-23 at 00:00 UTC; the full launch was rehearsed on a Base Mainnet fork with the real
signers on 2026-10-17 and passed.** Every claim below links to the code, the tests and the
document that back it. Anything without that evidence is listed as not built.

| Live                 | URL                                                         | What it is                                                                 |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Website              | [arlcoin.io](https://arlcoin.io)                             | [`apps/web`](apps/web): the Interactive Core, roadmap, docs, whitelist     |
| App (Base Sepolia)   | [arlcoin.io/app](https://arlcoin.io/app/)                    | [`apps/dapp`](apps/dapp): faucet, claim, vesting, staking, jobs, payments, anonymous polls |
| Testnet operator API | [app.arlcoin.io/api/operator](https://app.arlcoin.io/api/operator/status) | Faucet, group joins, vote relay and x402 settlement for the app ([`route.api.ts`](apps/dapp/app/api/operator/%5Baction%5D/route.api.ts)) |
| Community bot        | [@Arlprotocol_bot](https://t.me/Arlprotocol_bot) in [t.me/arlcoin_community](https://t.me/arlcoin_community) | [`apps/telegram-bot`](apps/telegram-bot): `/start`, `/app`, `/faucet`, `/status` (live faucet and staking figures), `/launch`, `/whitelist`, `/rules`; scam filter, new-member link limits, flood control |
| Uptime monitor       | [Uptime workflow](.github/workflows/uptime.yml)             | Every 10 minutes: website, app, operator API, faucet float, Base Sepolia blocks and the staking reward window; a failure notifies the owner |

## Network and deployed contracts

| Network      | Chain ID | Status                                                                         |
| ------------ | -------: | ------------------------------------------------------------------------------ |
| Base Sepolia |    84532 | Deployed (testnet). RPC `https://sepolia.base.org`                             |
| Base Mainnet |     8453 | Not deployed. The network gate opens at the TGE, 2026-10-23 00:00 UTC; the planned addresses are in [mainnet-plan.md](docs/mainnet-plan.md) |

Base Sepolia contracts. The runtime bytecode of each address matches a clean build of `main`
(`compareRuntime` in [`packages/deploy/src/bytecode.ts`](packages/deploy/src/bytecode.ts), checked
2026-10-10 at block 47,939,236). The staking, jobs, signal and verifier contracts (and the
verifier's two linked libraries) were deployed on 2026-10-11 from blocks 47,962,102 to 47,962,116.
Source verification of every address is listed in
[`docs/verification-evidence.md`](docs/verification-evidence.md#explorer-verification-base-sepolia); all
addresses with their deploy blocks are recorded in
[`contracts/deploy/base-sepolia.json`](contracts/deploy/base-sepolia.json).

| Contract                       | Address                                                                                                                                  | Source                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ARL token                      | [`0x244312b619127B6458154F3467eFD7c87CD28500`](https://base-sepolia.blockscout.com/address/0x244312b619127B6458154F3467eFD7c87CD28500) | [`ARLToken.sol`](contracts/src/ARLToken.sol)                   |
| Investors vesting              | [`0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE`](https://base-sepolia.blockscout.com/address/0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE) | [`ARLVestingWallet.sol`](contracts/src/ARLVestingWallet.sol)   |
| Strategic Partnerships vesting | [`0x02c7692918C98EC710970D390b08f247A76D5A37`](https://base-sepolia.blockscout.com/address/0x02c7692918C98EC710970D390b08f247A76D5A37) | [`ARLVestingWallet.sol`](contracts/src/ARLVestingWallet.sol)   |
| Treasury timelock              | [`0x5B3fd9E574BC07309949CD39161a295E22FbBd3D`](https://base-sepolia.blockscout.com/address/0x5B3fd9E574BC07309949CD39161a295E22FbBd3D) | [`ARLTimelock.sol`](contracts/src/ARLTimelock.sol)             |
| Staking rewards                | [`0xA78480c1802F5c17B1007c59b7c2CF849549724e`](https://base-sepolia.blockscout.com/address/0xA78480c1802F5c17B1007c59b7c2CF849549724e) | [`ARLStakingRewards.sol`](contracts/src/ARLStakingRewards.sol) |
| Jobs escrow (ERC-8183)         | [`0xec79a897105aEd6daFBbB2a904E5bcFF71455644`](https://base-sepolia.blockscout.com/address/0xec79a897105aEd6daFBbB2a904E5bcFF71455644) | [`ARLJobs.sol`](contracts/src/ARLJobs.sol)                     |
| Anonymous signals              | [`0xFa5901E9dfD813b910061F29ef1f65a1faA0b268`](https://base-sepolia.blockscout.com/address/0xFa5901E9dfD813b910061F29ef1f65a1faA0b268) | [`ARLAnonymousSignal.sol`](contracts/src/ARLAnonymousSignal.sol) |
| ZK verifier (UltraHonk)        | [`0x86DEB322fe7E9d5e5296f8Ee4B90A643F886a012`](https://base-sepolia.blockscout.com/address/0x86DEB322fe7E9d5e5296f8Ee4B90A643F886a012) | [`ARLSemaphoreVerifier.sol`](contracts/zk/ARLSemaphoreVerifier.sol) |

Reproduce: `npm run check:bytecode` proves a clean build matches
[`contracts/deploy/bytecode.json`](contracts/deploy/bytecode.json);
`node packages/deploy/src/bytecode-cli.ts verify contracts <plan.json> <deployment.json> https://sepolia.base.org`
compares that build with the code at each deployed address.

## Claims and evidence

| Claim                                    | Code                                                                                                     | Tests                                                                                                                                       | Document                                                         | Status                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| 21,000,000 ARL, minted once, no mint/burn/admin | [`ARLToken.sol`](contracts/src/ARLToken.sol), [`ARLAllocation.sol`](contracts/src/ARLAllocation.sol) | [unit](contracts/test/ARLToken.t.sol), [invariant](contracts/test/invariant/ARLInvariant.t.sol), [Halmos](contracts/test/symbolic/ARLSymbolic.t.sol), [ABI guard](scripts/check-token-abi.mjs) | [token-design.md](docs/token-design.md)                          | Base Sepolia                   |
| 11 allocations, vesting 12-month cliff + 36 months linear | [`packages/tokenomics`](packages/tokenomics/src/allocations.ts), [`ARLVestingWallet.sol`](contracts/src/ARLVestingWallet.sol) | [allocations](packages/tokenomics/test/allocations.test.ts), [contract consistency](packages/tokenomics/test/contract-consistency.test.ts), [vesting](contracts/test/ARLVestingWallet.t.sol) | [tokenomics.md](docs/tokenomics.md)                              | Base Sepolia                   |
| Treasury: Safe 2-of-3, ≥ 48 h timelock, cancel-only guardian | [`ARLTimelock.sol`](contracts/src/ARLTimelock.sol)                                          | [unit](contracts/test/ARLTimelock.t.sol)                                                                                                    | [token-design.md](docs/token-design.md)                          | Base Sepolia                   |
| Public Launch Merkle claim               | [`ARLMerkleDistributor.sol`](contracts/src/ARLMerkleDistributor.sol)                                     | [unit](contracts/test/ARLMerkleDistributor.t.sol), [invariant](contracts/test/invariant/ARLDistributorInvariant.t.sol)                      | [deployment.md](docs/deployment.md)                              | Built, not deployed; reserved for a later airdrop |
| Staking (no new issuance)                | [`ARLStakingRewards.sol`](contracts/src/ARLStakingRewards.sol)                                           | [unit](contracts/test/ARLStakingRewards.t.sol), [invariant](contracts/test/invariant/ARLStakingInvariant.t.sol)                             | [app.md](docs/app.md)                                            | Base Sepolia (deployed and verified) |
| AI / compute jobs paid in ARL (ERC-8183 escrow) | [`ARLJobs.sol`](contracts/src/ARLJobs.sol)                                                        | [unit](contracts/test/ARLJobs.t.sol), [invariant](contracts/test/invariant/ARLJobsInvariant.t.sol)                                          | [jobs.md](docs/jobs.md)                                          | Base Sepolia (deployed and verified) |
| Verified evaluation of jobs (staked validator committee, challenge window, slashing, ERC-8004 outcome) | [`ARLVerifiedEvaluator.sol`](contracts/src/ARLVerifiedEvaluator.sol) | [unit](contracts/test/ARLVerifiedEvaluator.t.sol), [invariant](contracts/test/invariant/ARLVerifiedEvaluatorInvariant.t.sol) | [verifiable-execution.md](docs/verifiable-execution.md) | Deployed on Base Sepolia: [`0x6808…4d14`](https://base-sepolia.blockscout.com/address/0x6808F80Eb11538543d31cf4b50332B268dDd4d14), arbiter Safe (2-of-3) [`0x8FF6…466f`](https://base-sepolia.blockscout.com/address/0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f) |
| Usage-based payments in ARL (x402 `upto`) | [`packages/payments`](packages/payments/src)                                                            | [unit](packages/payments/test), [Base Sepolia fork](packages/payments/test-fork/upto.fork.test.ts)                                          | [payments.md](docs/payments.md)                                  | Base Sepolia; settled by the app's testnet operator |
| Reference validator: re-executes `arl-reexec/1` specs in a pinned, isolated container and votes | [`packages/verifier`](packages/verifier/src) | [unit](packages/verifier/test/verifier.test.ts), [container](packages/verifier/test-docker/docker.test.ts), [local chain](packages/verifier/test-anvil/evaluator.anvil.test.ts) | [reexecution-spec.md](docs/reexecution-spec.md) | Reference software, no validator runs it |
| Compute provider reference node          | [`packages/provider`](packages/provider/src)                                                             | [unit](packages/provider/test/provider.test.ts), [fork](packages/provider/test-fork/provider.fork.test.ts)                                  | [compute-provider.md](docs/compute-provider.md)                  | Reference software, no provider runs it |
| ZK anonymous signals (Semaphore, Noir/UltraHonk) | [`zk/semaphore`](zk/semaphore/src/main.nr), [`ARLAnonymousSignal.sol`](contracts/src/ARLAnonymousSignal.sol) | [circuit](zk/check.sh), [real proofs](contracts/test-zk/ARLAnonymousSignal.t.sol), [`@arl/zk`](packages/zk/test/zk.test.ts)               | [zk-privacy.md](docs/zk-privacy.md)                              | Base Sepolia (deployed and verified) |
| Web app (claim, vesting, staking, jobs, payments, private signals) | [`apps/dapp`](apps/dapp)                                                          | [unit](apps/dapp/test/unit), [end-to-end on Anvil](apps/dapp/test/e2e)                                                                      | [app.md](docs/app.md)                                            | Live on Base Sepolia ([arlcoin.io/app](https://arlcoin.io/app/)) |
| Website: "Live on Base Sepolia" badge (reads the chain every 30 s), structured data, sitemap | [`apps/web`](apps/web), [`LiveStatus.tsx`](apps/web/src/site/LiveStatus.tsx) | [unit](apps/web/test/unit), [end-to-end](apps/web/test/e2e/site.spec.ts) | [content-standard.md](docs/content-standard.md) | Live at [arlcoin.io](https://arlcoin.io) |
| DEX launch: 5,000,000 ARL in ARL-only Uniswap v3 pools from 0.20 USD | [`pool.ts`](packages/deploy/src/pool.ts), [`launch-pools.mjs`](scripts/launch-pools.mjs), [`launch-day-pools.sh`](scripts/launch-day-pools.sh) | [unit](packages/deploy/test/pool.test.ts), [fork](contracts/test-fork/UniswapLaunchFork.t.sol), [sale fork](contracts/test-fork/UniswapPublicLaunchFork.t.sol), [mainnet rehearsal](scripts/rehearse-base-mainnet-fork.sh) | [mainnet-runbook.md](docs/mainnet-runbook.md) | Prepared for the TGE; no pool exists yet |

Not built: private payments and proof-verified computation (no circuits exist; the committee-based
evaluator above is built, the proof tier is a design in [verifiable-execution.md](docs/verifiable-execution.md)), an ARL-operated
network or chain, governance or a DAO. ARL runs on Base; it is not a separate chain.

## Quality gates (CI, every pull request)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml), mirrored in [`.gitlab-ci.yml`](.gitlab-ci.yml).
Every tool and action is pinned by version, commit or SHA-256.

| Gate                     | What fails the build                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `contracts`              | `forge fmt`, size limits, unit/fuzz (10,000 runs)/invariant tests, gas snapshot drift, token ABI growth          |
| `coverage`               | Any contract below 100% line or function coverage, or branches below 90% ([gate](scripts/coverage-gate.mjs)); lcov kept as an artifact |
| `slither`                | Any Slither finding of low severity or higher                                                                    |
| `symbolic`               | A Halmos property that does not hold                                                                             |
| `zk`                     | Circuit tests; the committed circuit and verifier must rebuild byte for byte; contract tests with real proofs    |
| `rehearsal`              | A clean build that differs from the committed bytecode hashes; a failed local deploy-verify rehearsal            |
| `typescript`, `dapp`, `web` | Typecheck, lint, format, unit and end-to-end tests, npm dependency vulnerability scan (high/critical, reviewed allowlist)          |
| `secrets`                | Any secret in the full git history ([gitleaks](.gitleaks.toml))                                                  |
| `sbom`                   | CycloneDX SBOMs of the npm dependency trees, kept as an artifact                                                 |
| CodeQL                   | Security findings in TypeScript/JavaScript ([codeql.yml](.github/workflows/codeql.yml))                          |

Outside pull requests: [Uptime](.github/workflows/uptime.yml) every 10 minutes and
[Monitor mainnet](.github/workflows/monitor.yml) every 6 hours once the deployment is recorded.
`main` is protected by a ruleset: pull requests only, every gate above required, no force push
or deletion ([branch-protection.md](docs/branch-protection.md)).

Measured on 2026-10-17: 289 Foundry tests (271 default profile, 18 with real proofs), 10 Uniswap
fork tests, 276 TypeScript package tests, 86 app unit tests, 32 website unit tests, 107 website
end-to-end tests and 30 bot tests, all passing; every contract at 100% line and function
coverage, 91% of branches.

## Requirements

| Tool                     | Version                          | Needed for                                              |
| ------------------------ | -------------------------------- | ------------------------------------------------------- |
| Node.js and npm          | 22 ([`.nvmrc`](.nvmrc)), ≥ 22.18 | Packages, the website and the app                       |
| Foundry                  | v1.8.3                           | Contracts: build, tests, scripts, local rehearsals      |
| git submodules           | `git submodule update --init`    | OpenZeppelin, forge-std and the other contract libraries |
| Python 3.12              | Slither 0.11.6, Halmos 0.3.3     | The `slither` and `symbolic` gates (optional locally)   |
| Noir `nargo`, Barretenberg `bb` | 1.0.0-rc.3, 5.2.0         | Rebuilding the ZK circuit and verifier (`zk/check.sh`)  |
| Chromium for Playwright  | the version `@playwright/test` pins | End-to-end tests (`PW_CHROMIUM_PATH` uses a preinstalled one) |

Run locally:

```sh
git submodule update --init
npm ci && npm run check          # packages: typecheck, lint, format, unit tests
(cd apps/web && npm ci && npm run check)    # website: typecheck, lint, tests, build, end-to-end
(cd apps/dapp && npm ci && npm run check)   # app: typecheck, lint, tests, build, end-to-end on Anvil
npm run check:contracts          # forge fmt, size limits, unit, fuzz and invariant tests
npm run coverage:contracts       # coverage gate
npm run rehearse:local           # full deploy-and-verify rehearsal on a local chain
```

Deployment needs these repository secrets (never committed): `VERCEL_TOKEN`, `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` for the website; `VERCEL_APP_PROJECT_ID` (optional, the app project is linked
by name otherwise) and `ARL_OPERATOR_KEY` (the testnet operator, Base Sepolia only) for the app;
`ETHERSCAN_API_KEY` locally for Basescan verification. The website and the app deploy from `main`
only after CI passes ([deploy-site.yml](.github/workflows/deploy-site.yml),
[deploy-app.yml](.github/workflows/deploy-app.yml)).

## Security

- Report vulnerabilities privately: [SECURITY.md](SECURITY.md). Bug bounty: [docs/bug-bounty.md](docs/bug-bounty.md).
- Verification evidence and review scope:
  [verification-evidence.md](docs/verification-evidence.md), [review-scope.md](docs/review-scope.md),
  [security-analysis.md](docs/security-analysis.md).
- Security audit of 2026-10-17: [report](security/2026-10-17/report.md) (PDF, scope, raw tool
  outputs, triage and findings in [security/2026-10-17](security/2026-10-17/)); reproduced on every
  change by [security-audit.yml](.github/workflows/security-audit.yml).
- Mainnet custody (Safes, timelock, guardian) and the launch procedure:
  [mainnet-plan.md](docs/mainnet-plan.md), [mainnet-runbook.md](docs/mainnet-runbook.md).

## Launch (TGE, 2026-10-23 00:00 UTC)

The order and every check are in [docs/mainnet-runbook.md](docs/mainnet-runbook.md); the owners
sign every transaction in their own wallets and no key is handled by the tooling.

| Step | Who signs | What happens |
| ---- | --------- | ------------ |
| 1 | Deployer | 12 Safes (11 role Safes 2-of-3, guardian 1-of-1), from a run prepared by the rehearsal |
| 2 | Deployer | Two vesting wallets, the 48-hour treasury timelock and the token, which mints 21,000,000 ARL once ([`8453-deploy.json`](apps/dapp/public/plans/8453-deploy.json)) |
| 3 | Liquidity Safe, 2 of 3 | 2,000,000 ARL in ARL-only pools against USDC, USDT, WETH and cbBTC from 0.20 USD |
| 4 | Public Launch Safe, 2 of 3 | 3,000,000 ARL on the same pools and ranges (sale positions) |
| 5 | none | Addresses published on arlcoin.io and here, token list, supply API, mainnet monitor |

Circulating at TGE: 2,100,000 ARL (the Founder allocation); ARL bought from the pools adds to it.
The Public Launch Safe keeps 500,000 ARL for a later airdrop and 1,500,000 ARL for launchpad
sales. No project funds are added to the pools.

Open items, tracked in [docs/release-readiness.md](docs/release-readiness.md):

| Item                                                        | Type     |
| ----------------------------------------------------------- | -------- |
| Deployer funded on Base (owner, 2026-10-20)                 | BLOCKER  |
| The TGE run itself (steps 1 to 4 above)                     | BLOCKER  |
| Legal opinion publication, KYC/AML policy, jurisdiction     | REQUIRED |
| Two-person review on `main` (second maintainer)             | REQUIRED |

## Documentation

| Topic                 | Documents                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Architecture          | [architecture.md](docs/architecture.md), [token-design.md](docs/token-design.md), [chain-evaluation.md](docs/chain-evaluation.md) |
| Tokenomics            | [tokenomics.md](docs/tokenomics.md), [tokenomics-economic-spec.md](docs/tokenomics-economic-spec.md), [launch-decisions.md](docs/launch-decisions.md), [launch-route.md](docs/launch-route.md) |
| Deployment            | [deployment.md](docs/deployment.md), [mainnet-plan.md](docs/mainnet-plan.md), [mainnet-runbook.md](docs/mainnet-runbook.md)      |
| Products              | [app.md](docs/app.md), [telegram bot](apps/telegram-bot/README.md), [jobs.md](docs/jobs.md), [payments.md](docs/payments.md), [compute-provider.md](docs/compute-provider.md), [zk-privacy.md](docs/zk-privacy.md), [operator-api.md](docs/operator-api.md), [incident-response.md](docs/incident-response.md) |
| Process               | [CONTRIBUTING.md](CONTRIBUTING.md), [branch-protection.md](docs/branch-protection.md), [open-source.md](docs/open-source.md), [content-standard.md](docs/content-standard.md) |

## Community and contact

| Channel   | Link                                                             |
| --------- | ---------------------------------------------------------------- |
| Website   | [arlcoin.io](https://arlcoin.io)                                 |
| X         | [@arlprotocol](https://x.com/arlprotocol)                        |
| Telegram  | [t.me/arlcoin_community](https://t.me/arlcoin_community)         |
| Email     | [team@arlcoin.io](mailto:team@arlcoin.io)                        |
| Security  | private reports per [SECURITY.md](SECURITY.md)                   |

ARL never asks for a private key, a seed phrase or a payment in any channel.

## Disclaimer

ARL Protocol is a technology project under development. Nothing in this repository constitutes
financial, investment or legal advice.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party components keep their
own licenses; see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Name and logo use:
[TRADEMARKS.md](TRADEMARKS.md). Changes: [CHANGELOG.md](CHANGELOG.md).
