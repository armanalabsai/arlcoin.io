# ARL Protocol

ARL is a fixed-supply ERC-20 token (21,000,000 ARL) on Base, with vesting, a timelocked treasury,
staking, escrowed jobs, usage-based payments and anonymous signals built around it.

**Live on Base Mainnet since 2026-10-24.** Token
[`0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`](https://basescan.org/token/0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4)
(block 53,023,206, source-verified on Basescan) and four Uniswap v3 pools holding 5,000,000 ARL.
This is the only official ARL contract. A CoinMarketCap listing has been requested (#1470740) and
is not live yet; listing status is in [listing-pack.md](docs/listing-pack.md#status-2026-11-01).
Every claim below links to the code, the tests and the document that back it.

**Build on ARL in a minute:** `npm install arl-protocol-sdk` for TypeScript, `n8n-nodes-arl` for n8n, `arl_protocol` for Python, or plain contract calls from any language. See [arlcoin.io/build](https://arlcoin.io/build/).

| Live           | URL                                                                                                                                              | What it is                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website        | [arlcoin.io](https://arlcoin.io)                                                                                                                 | [`apps/web`](apps/web): the Interactive Core, roadmap, docs, whitelist                                                                                                                                                                                                                                         |
| App            | [arlcoin.io/app](https://arlcoin.io/app/)                                                                                                        | [`apps/dapp`](apps/dapp) on Base Mainnet: wallet, trade, vesting, claim, staking, jobs, verified jobs                                                                                                                                                                                                         |
| Build with ARL | [arlcoin.io/build](https://arlcoin.io/build/) | Developer quickstart: n8n, TypeScript, Python and plain contract calls, with the Base Mainnet addresses |
| TypeScript SDK | [npm: arl-protocol-sdk](https://www.npmjs.com/package/arl-protocol-sdk) | [`packages/sdk`](packages/sdk): escrowed jobs in a few calls (`createJob`, `fundJob`, `settleJob`), compute streams, verified jobs, ARL purchase |
| Python package | [`packages/python-sdk`](packages/python-sdk) | `arl_protocol`: one `Arl` class to create, fund, submit and settle escrowed jobs with web3.py |
| n8n node | [npm: n8n-nodes-arl](https://www.npmjs.com/package/n8n-nodes-arl) | [`packages/n8n-nodes-arl`](packages/n8n-nodes-arl): create, fund, submit and settle escrowed jobs from any n8n workflow |
| Community      | [t.me/arlprotocol_community](https://t.me/arlprotocol_community) (announcements), [t.me/arlprotocol_chat](https://t.me/arlprotocol_chat) (chat) | Official Telegram channel and its chat group, the chat moderated by the community bot ([`packages/telegram-bot`](packages/telegram-bot), a Cloudflare Worker): an assistant that answers questions in private chats and when mentioned in the group (`/ask`, sourced answers, optional NVIDIA Nemotron fallback that can only repeat known addresses and links), `/roadmap`, `/build`, `/contracts`, `/verified`, `/status`, `/supply`, `/bounty`, `/links` and more; scam filter, new-member link limits, flood control |
| Uptime monitor | [Uptime workflow](.github/workflows/uptime.yml)                                                                                                  | Every 10 minutes: website, app, Base Mainnet blocks and the staking reward window; a failure notifies the owner                                                                                                                                                                                                  |

## Network and deployed contracts

Everything runs on **Base Mainnet (chain 8453)**. Every address is source-verified or recorded on
chain by the verified-record tools; the full lists are in [mainnet-plan.md](docs/mainnet-plan.md)
(token, Safes, vesting, timelock) and [mainnet-services.md](docs/mainnet-services.md) (network
services).

| Contract                         | Address                                                                                                                        | Since      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| ARL token                        | [`0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`](https://basescan.org/token/0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4)          | 2026-10-24 |
| Investors vesting                | [`0x8E2CC3a5F39038836475650f63A91d107BabA643`](https://basescan.org/address/0x8E2CC3a5F39038836475650f63A91d107BabA643)        | 2026-10-24 |
| Strategic Partnerships vesting   | [`0x36C94925c2BAB7897A000c57CE5536F5Bc60a95B`](https://basescan.org/address/0x36C94925c2BAB7897A000c57CE5536F5Bc60a95B)        | 2026-10-24 |
| Treasury timelock                | [`0xF3820BC1510a9A1B9aa2b318Dd997127f198B1c2`](https://basescan.org/address/0xF3820BC1510a9A1B9aa2b318Dd997127f198B1c2)        | 2026-10-24 |
| Jobs escrow, paid in ARL         | [`0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9`](https://basescan.org/address/0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9)        | 2026-10-31 |
| Jobs escrow, paid in USDC        | [`0xc833140D2eE8607fd41662cffFAc557f3D535bE6`](https://basescan.org/address/0xc833140D2eE8607fd41662cffFAc557f3D535bE6)        | 2026-10-31 |
| Verified evaluator v4, ARL       | [`0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF`](https://basescan.org/address/0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF)        | 2026-11-12 |
| Verified evaluator v4, USDC      | [`0x8C017f24615AC749Ec7297FB07b14E558B670CFC`](https://basescan.org/address/0x8C017f24615AC749Ec7297FB07b14E558B670CFC)        | 2026-11-12 |
| Compute payment                  | [`0x1bFE932896fdd32175836a7364dcaf53d49EE464`](https://basescan.org/address/0x1bFE932896fdd32175836a7364dcaf53d49EE464)        | 2026-11-12 |
| Staking rewards (180-day period) | [`0x15e257009BE9B1875fbfa69D291320aaFE3fa102`](https://basescan.org/address/0x15e257009BE9B1875fbfa69D291320aaFE3fa102)        | 2026-11-12 |

Reproduce: `npm run check:bytecode` proves a clean build matches
[`contracts/deploy/bytecode.json`](contracts/deploy/bytecode.json);
`node packages/deploy/src/bytecode-cli.ts verify contracts <plan.json> <deployment.json> https://mainnet.base.org`
compares that build with the code at each deployed address.

## Claims and evidence

| Claim                                    | Code                                                                                                     | Tests                                                                                                                                       | Document                                                         | Status                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| 21,000,000 ARL, minted once, no mint/burn/admin | [`ARLToken.sol`](contracts/src/ARLToken.sol), [`ARLAllocation.sol`](contracts/src/ARLAllocation.sol) | [unit](contracts/test/ARLToken.t.sol), [invariant](contracts/test/invariant/ARLInvariant.t.sol), [Halmos](contracts/test/symbolic/ARLSymbolic.t.sol), [ABI guard](scripts/check-token-abi.mjs) | [token-design.md](docs/token-design.md)                          | Base Mainnet                   |
| 11 allocations, vesting 12-month cliff + 36 months linear | [`packages/tokenomics`](packages/tokenomics/src/allocations.ts), [`ARLVestingWallet.sol`](contracts/src/ARLVestingWallet.sol) | [allocations](packages/tokenomics/test/allocations.test.ts), [contract consistency](packages/tokenomics/test/contract-consistency.test.ts), [vesting](contracts/test/ARLVestingWallet.t.sol) | [tokenomics.md](docs/tokenomics.md)                              | Base Mainnet                   |
| Treasury: Safe 2-of-3, ≥ 48 h timelock, cancel-only guardian | [`ARLTimelock.sol`](contracts/src/ARLTimelock.sol)                                          | [unit](contracts/test/ARLTimelock.t.sol)                                                                                                    | [token-design.md](docs/token-design.md)                          | Base Mainnet                   |
| Public Launch Merkle claim               | [`ARLMerkleDistributor.sol`](contracts/src/ARLMerkleDistributor.sol)                                     | [unit](contracts/test/ARLMerkleDistributor.t.sol), [invariant](contracts/test/invariant/ARLDistributorInvariant.t.sol)                      | [deployment.md](docs/deployment.md)                              | Built, not deployed; reserved for a later airdrop |
| Staking (no new issuance)                | [`ARLStakingRewards.sol`](contracts/src/ARLStakingRewards.sol)                                           | [unit](contracts/test/ARLStakingRewards.t.sol), [invariant](contracts/test/invariant/ARLStakingInvariant.t.sol)                             | [app.md](docs/app.md)                                            | Base Mainnet [`0x15e2…a102`](https://basescan.org/address/0x15e257009BE9B1875fbfa69D291320aaFE3fa102) (first reward period not funded yet) |
| AI / compute jobs paid in ARL (ERC-8183 escrow) | [`ARLJobs.sol`](contracts/src/ARLJobs.sol)                                                        | [unit](contracts/test/ARLJobs.t.sol), [invariant](contracts/test/invariant/ARLJobsInvariant.t.sol)                                          | [jobs.md](docs/jobs.md)                                          | Base Mainnet: paid in ARL [`0x4664…98f9`](https://basescan.org/address/0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9), paid in USDC [`0xc833…5bE6`](https://basescan.org/address/0xc833140D2eE8607fd41662cffFAc557f3D535bE6) |
| Verified evaluation of jobs (staked validator committee, challenge window, slashing, ERC-8004 outcome) | [`ARLVerifiedEvaluator.sol`](contracts/src/ARLVerifiedEvaluator.sol) | [unit](contracts/test/ARLVerifiedEvaluator.t.sol), [invariant](contracts/test/invariant/ARLVerifiedEvaluatorInvariant.t.sol) | [verifiable-execution.md](docs/verifiable-execution.md) | Base Mainnet (v4): for the ARL escrow [`0x5cA6…7DfF`](https://basescan.org/address/0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF), for the USDC escrow [`0x8C01…0CFC`](https://basescan.org/address/0x8C017f24615AC749Ec7297FB07b14E558B670CFC) ([mainnet-services.md](docs/mainnet-services.md)); the earlier ones are retired. Arbiter Safe (2-of-3) [`0x8FF6…466f`](https://basescan.org/address/0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f) |
| Usage-based payments in ARL (x402 `upto`) | [`packages/payments`](packages/payments/src)                                                            | [unit](packages/payments/test), [fork](packages/payments/test-fork/upto.fork.test.ts)                                          | [payments.md](docs/payments.md)                                  | Built and tested; not deployed on Base Mainnet yet |
| Validator: re-executes `arl-reexec/1` specs in a pinned, isolated container and votes; `watch` runs it unattended; `bundle` / `verify-bundle` export and check a job's evidence | [`packages/verifier`](packages/verifier/src), [`validators.yml`](.github/workflows/validators.yml) | [unit](packages/verifier/test/verifier.test.ts), [container](packages/verifier/test-docker/docker.test.ts), [local chain, incl. unattended `watch`](packages/verifier/test-anvil/evaluator.anvil.test.ts) | [reexecution-spec.md](docs/reexecution-spec.md) | Validators for Base Mainnet are being set up |
| SDK for verified jobs: `openVerifiedJob`, `getVerdict`, `finalizeJob`; one-command [quickstart](docs/quickstart.md) | [`packages/sdk`](packages/sdk/src/verified.ts) | [unit](packages/sdk/test/verified.test.ts), [local chain](packages/verifier/test-anvil/evaluator.anvil.test.ts) | [reexecution-spec.md](docs/reexecution-spec.md) | Base Mainnet and local chain |
| Compute provider reference node          | [`packages/provider`](packages/provider/src)                                                             | [unit](packages/provider/test/provider.test.ts), [fork](packages/provider/test-fork/provider.fork.test.ts)                                  | [compute-provider.md](docs/compute-provider.md)                  | Reference software, no provider runs it |
| ZK anonymous signals (Semaphore, Noir/UltraHonk) | [`zk/semaphore`](zk/semaphore/src/main.nr), [`ARLAnonymousSignal.sol`](contracts/src/ARLAnonymousSignal.sol) | [circuit](zk/check.sh), [real proofs](contracts/test-zk/ARLAnonymousSignal.t.sol), [`@arl/zk`](packages/zk/test/zk.test.ts)               | [zk-privacy.md](docs/zk-privacy.md)                              | Built and tested; not on Base Mainnet yet |
| Web app on Base Mainnet (wallet, trade, claim, vesting, staking, jobs, verified jobs with public network activity) | [`apps/dapp`](apps/dapp)                                                          | [unit](apps/dapp/test/unit), [end-to-end on Anvil](apps/dapp/test/e2e)                                                                      | [app.md](docs/app.md)                                            | Live on Base Mainnet ([arlcoin.io/app](https://arlcoin.io/app/)) |
| Website: "Live on Base" badge (reads the chain every 30 s), structured data, sitemap | [`apps/web`](apps/web), [`LiveStatus.tsx`](apps/web/src/site/LiveStatus.tsx) | [unit](apps/web/test/unit), [end-to-end](apps/web/test/e2e/site.spec.ts) | [content-standard.md](docs/content-standard.md) | Live at [arlcoin.io](https://arlcoin.io) |
| DEX launch: 5,000,000 ARL in ARL-only Uniswap v3 pools from 0.20 USD | [`pool.ts`](packages/deploy/src/pool.ts), [`launch-pools.mjs`](scripts/launch-pools.mjs), [`launch-day-pools.sh`](scripts/launch-day-pools.sh) | [unit](packages/deploy/test/pool.test.ts), [fork](contracts/test-fork/UniswapLaunchFork.t.sol), [sale fork](contracts/test-fork/UniswapPublicLaunchFork.t.sol), [mainnet rehearsal](scripts/rehearse-base-mainnet-fork.sh) | [mainnet-runbook.md](docs/mainnet-runbook.md) | Live on Base Mainnet since 2026-10-24: four pools holding 5,000,000 ARL ([addresses](docs/mainnet-plan.md#uniswap-v3-pools)) |

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

The website (with the app under `/app`) is built and served by Cloudflare Pages from this
repository ([`wrangler.toml`](wrangler.toml), [`scripts/build-cloudflare.sh`](scripts/build-cloudflare.sh));
`main` is production. Secrets (never committed): `ETHERSCAN_API_KEY` locally for Basescan
verification.

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

## Launch (2026-10-24; TGE date for vesting 2026-10-23)

The order and every check are in [docs/mainnet-runbook.md](docs/mainnet-runbook.md); the owners
signed every transaction in their own wallets and no key was handled by the tooling. On chain:
`VerifyARL`, the bytecode check against a clean build and the supply check all passed (total
21,000,000 ARL, circulating 2,100,000 at deployment), and the four contracts are source-verified
on Basescan.

| Step | Who signs | What happens |
| ---- | --------- | ------------ |
| 1 | Deployer | 12 Safes (11 role Safes 2-of-3, guardian 1-of-1), from a run prepared by the rehearsal |
| 2 | Deployer | Two vesting wallets, the 48-hour treasury timelock and the token, which mints 21,000,000 ARL once ([`8453-deploy.json`](apps/dapp/public/plans/8453-deploy.json)) |
| 3 | Liquidity Safe, 2 of 3 | 2,000,000 ARL in ARL-only pools against USDC, USDT, WETH and cbBTC from 0.20 USD |
| 4 | Public Launch Safe, 2 of 3 | 3,000,000 ARL on the same pools and ranges (sale positions) |
| 5 | none | Addresses published on arlcoin.io and here, token list, supply API, mainnet monitor |

Circulating at the token deployment: 2,100,000 ARL (the Founder allocation). Once the pools opened
on 2026-10-24, the 5,000,000 ARL deposited in them count as circulating too (economic
specification section 5), so the supply API reported about 7,100,000 ARL.
The Public Launch Safe keeps 500,000 ARL for a later airdrop and 1,500,000 ARL for launchpad
sales. No project funds are added to the pools.

## Documentation

| Topic                 | Documents                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Architecture          | [architecture.md](docs/architecture.md), [token-design.md](docs/token-design.md), [chain-evaluation.md](docs/chain-evaluation.md) |
| Tokenomics            | [tokenomics.md](docs/tokenomics.md), [tokenomics-economic-spec.md](docs/tokenomics-economic-spec.md), [launch-decisions.md](docs/launch-decisions.md), [launch-route.md](docs/launch-route.md) |
| Deployment            | [deployment.md](docs/deployment.md), [mainnet-plan.md](docs/mainnet-plan.md), [mainnet-runbook.md](docs/mainnet-runbook.md)      |
| Products              | [app.md](docs/app.md), [jobs.md](docs/jobs.md), [payments.md](docs/payments.md), [compute-provider.md](docs/compute-provider.md), [zk-privacy.md](docs/zk-privacy.md), [incident-response.md](docs/incident-response.md) |
| Process               | [CONTRIBUTING.md](CONTRIBUTING.md), [branch-protection.md](docs/branch-protection.md), [open-source.md](docs/open-source.md), [content-standard.md](docs/content-standard.md) |

## Community and contact

| Channel   | Link                                                             |
| --------- | ---------------------------------------------------------------- |
| Website   | [arlcoin.io](https://arlcoin.io)                                 |
| X         | [@arlprotocol](https://x.com/arlprotocol)                        |
| Telegram  | [t.me/arlprotocol_community](https://t.me/arlprotocol_community) (announcements), [t.me/arlprotocol_chat](https://t.me/arlprotocol_chat) (chat) |
| Email     | [team@arlcoin.io](mailto:team@arlcoin.io)                        |
| Security  | private reports per [SECURITY.md](SECURITY.md)                   |

ARL never asks for a private key, a seed phrase or a payment in any channel.

## Disclaimer

Nothing in this repository constitutes financial, investment or legal advice.

## License

Author: Alazdg. Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party components keep their
own licenses; see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Name and logo use:
[TRADEMARKS.md](TRADEMARKS.md). Changes: [CHANGELOG.md](CHANGELOG.md).
