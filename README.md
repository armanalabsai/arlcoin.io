# ARL Protocol

ARL is a fixed-supply ERC-20 token (21,000,000 ARL) on Base, with vesting, a timelocked treasury,
staking, escrowed jobs, usage-based payments and anonymous signals built around it.

**Status: Base Sepolia testnet only. Not on Base Mainnet. Not independently audited.** Every claim
below links to the code, the tests and the document that back it. Anything without that evidence
is listed as not built.

## Network and deployed contracts

| Network      | Chain ID | Status                                                                         |
| ------------ | -------: | ------------------------------------------------------------------------------ |
| Base Sepolia |    84532 | Deployed (testnet). RPC `https://sepolia.base.org`                             |
| Base Mainnet |     8453 | Not deployed. The code refuses Base Mainnet until the TGE gate is opened by review |

Base Sepolia contracts. The runtime bytecode of each address matches a clean build of `main`
(`compareRuntime` in [`packages/deploy/src/bytecode.ts`](packages/deploy/src/bytecode.ts), checked
2026-10-10 at block 47,939,236); source verification is listed in
[`docs/audit-evidence.md`](docs/audit-evidence.md#explorer-verification-base-sepolia).

| Contract                       | Address                                                                                                                                  | Source                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ARL token                      | [`0x244312b619127B6458154F3467eFD7c87CD28500`](https://base-sepolia.blockscout.com/address/0x244312b619127B6458154F3467eFD7c87CD28500) | [`ARLToken.sol`](contracts/src/ARLToken.sol)                   |
| Investors vesting              | [`0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE`](https://base-sepolia.blockscout.com/address/0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE) | [`ARLVestingWallet.sol`](contracts/src/ARLVestingWallet.sol)   |
| Strategic Partnerships vesting | [`0x02c7692918C98EC710970D390b08f247A76D5A37`](https://base-sepolia.blockscout.com/address/0x02c7692918C98EC710970D390b08f247A76D5A37) | [`ARLVestingWallet.sol`](contracts/src/ARLVestingWallet.sol)   |
| Treasury timelock              | [`0x5B3fd9E574BC07309949CD39161a295E22FbBd3D`](https://base-sepolia.blockscout.com/address/0x5B3fd9E574BC07309949CD39161a295E22FbBd3D) | [`ARLTimelock.sol`](contracts/src/ARLTimelock.sol)             |

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
| Public Launch Merkle claim               | [`ARLMerkleDistributor.sol`](contracts/src/ARLMerkleDistributor.sol)                                     | [unit](contracts/test/ARLMerkleDistributor.t.sol), [invariant](contracts/test/invariant/ARLDistributorInvariant.t.sol)                      | [deployment.md](docs/deployment.md)                              | Built, not deployed            |
| Staking (no new issuance)                | [`ARLStakingRewards.sol`](contracts/src/ARLStakingRewards.sol)                                           | [unit](contracts/test/ARLStakingRewards.t.sol), [invariant](contracts/test/invariant/ARLStakingInvariant.t.sol)                             | [app.md](docs/app.md)                                            | Built, not deployed            |
| AI / compute jobs paid in ARL (ERC-8183 escrow) | [`ARLJobs.sol`](contracts/src/ARLJobs.sol)                                                        | [unit](contracts/test/ARLJobs.t.sol), [invariant](contracts/test/invariant/ARLJobsInvariant.t.sol)                                          | [jobs.md](docs/jobs.md)                                          | Built, local chain only        |
| Usage-based payments in ARL (x402 `upto`) | [`packages/payments`](packages/payments/src)                                                            | [unit](packages/payments/test), [Base Sepolia fork](packages/payments/test-fork/upto.fork.test.ts)                                          | [payments.md](docs/payments.md)                                  | Built, no facilitator running  |
| Compute provider reference node          | [`packages/provider`](packages/provider/src)                                                             | [unit](packages/provider/test/provider.test.ts), [fork](packages/provider/test-fork/provider.fork.test.ts)                                  | [compute-provider.md](docs/compute-provider.md)                  | Reference software, no provider runs it |
| ZK anonymous signals (Semaphore, Noir/UltraHonk) | [`zk/semaphore`](zk/semaphore/src/main.nr), [`ARLAnonymousSignal.sol`](contracts/src/ARLAnonymousSignal.sol) | [circuit](zk/check.sh), [real proofs](contracts/test-zk/ARLAnonymousSignal.t.sol), [`@arl/zk`](packages/zk/test/zk.test.ts)               | [zk-privacy.md](docs/zk-privacy.md)                              | Built, local chain only        |
| Web app (claim, vesting, staking, jobs, payments, private signals) | [`apps/dapp`](apps/dapp)                                                          | [unit](apps/dapp/test/unit), [end-to-end on Anvil](apps/dapp/test/e2e)                                                                      | [app.md](docs/app.md)                                            | Local chain only               |
| DEX liquidity (Uniswap)                  | [`packages/deploy/src/pool.ts`](packages/deploy/src/pool.ts)                                             | [unit](packages/deploy/test/pool.test.ts), [fork](contracts/test-fork/UniswapLaunchFork.t.sol)                                              | [launch-route.md](docs/launch-route.md)                          | Planned, no pool exists        |

Not built: private payments and verifiable computation (no circuits exist), an ARL-operated
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
| `typescript`, `dapp`, `web` | Typecheck, lint, format, unit and end-to-end tests, `npm audit` (high/critical, reviewed allowlist)          |
| `secrets`                | Any secret in the full git history ([gitleaks](.gitleaks.toml))                                                  |
| `sbom`                   | CycloneDX SBOMs of the npm dependency trees, kept as an artifact                                                 |
| CodeQL                   | Security findings in TypeScript/JavaScript ([codeql.yml](.github/workflows/codeql.yml))                          |

Measured on 2026-10-10 (commit of this README): 272 Foundry tests (254 default profile, 18 with
real proofs), 230 TypeScript package tests, all passing; every contract at 100% line and function
coverage, 91% of branches.

Run locally: `npm ci && npm run check`, then `npm run check:contracts`, `npm run coverage:contracts`
and `npm run rehearse:local` (Foundry v1.8.3, `git submodule update --init`).

## Security

- Report vulnerabilities privately: [SECURITY.md](SECURITY.md). Bug bounty: [docs/bug-bounty.md](docs/bug-bounty.md).
- **No independent audit has been performed.** Internal evidence and scope:
  [audit-evidence.md](docs/audit-evidence.md), [audit-scope.md](docs/audit-scope.md),
  [security-analysis.md](docs/security-analysis.md); audit plan: [independent-audit-plan.md](docs/independent-audit-plan.md).
- Mainnet custody (Safes, timelock, guardian) and the launch procedure:
  [mainnet-plan.md](docs/mainnet-plan.md), [mainnet-runbook.md](docs/mainnet-runbook.md).

## Open items before Base Mainnet

Tracked with owners in [docs/release-readiness.md](docs/release-readiness.md). Done: mainnet signers
(2-of-3 role Safes, separate guardian) and a never-delegated deployer, checked read-only on Base
Mainnet ([mainnet-plan.md](docs/mainnet-plan.md)); the testnet deployer's EIP-7702 delegation is
removed. The rest need decisions or accounts held by the project owner.

| Item                                                        | Type     |
| ----------------------------------------------------------- | -------- |
| Opening the Base Mainnet network gate (reviewed change) and the TGE run, with owner approval | BLOCKER  |
| Independent audit, or a published "not audited" disclosure  | REQUIRED |
| Liquidity plan and sale parameters                          | REQUIRED |
| Legal opinion publication, KYC/AML policy, jurisdiction     | REQUIRED |
| Public team, contact and community channels                 | REQUIRED |
| Two-person review on `main` (second maintainer)             | REQUIRED |

## Documentation

| Topic                 | Documents                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Architecture          | [architecture.md](docs/architecture.md), [token-design.md](docs/token-design.md), [chain-evaluation.md](docs/chain-evaluation.md) |
| Tokenomics            | [tokenomics.md](docs/tokenomics.md), [tokenomics-economic-spec.md](docs/tokenomics-economic-spec.md)                              |
| Deployment            | [deployment.md](docs/deployment.md), [mainnet-plan.md](docs/mainnet-plan.md), [mainnet-runbook.md](docs/mainnet-runbook.md)      |
| Products              | [app.md](docs/app.md), [jobs.md](docs/jobs.md), [payments.md](docs/payments.md), [compute-provider.md](docs/compute-provider.md), [zk-privacy.md](docs/zk-privacy.md) |
| Process               | [CONTRIBUTING.md](CONTRIBUTING.md), [branch-protection.md](docs/branch-protection.md), [open-source.md](docs/open-source.md), [content-standard.md](docs/content-standard.md) |

## Disclaimer

ARL Protocol is a technology project under development. Nothing in this repository constitutes
financial, investment or legal advice.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Third-party components keep their
own licenses; see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
