# ARL Protocol — Phase 0 repository baseline

Inspected 2026-10-31 at `main` `2f51d8c` (working tree clean). Read-only inspection; this file is
the only change. Chain reads are `eth_getCode` / `eth_call` against `https://mainnet.base.org`
(block 53,316,856) and `https://sepolia.base.org`; source verification is what basescan.org shows
on each address page.

## A. Executive summary

The repository is a monorepo: ten Solidity contracts (`contracts/src`), eight TypeScript packages
(`packages/`), three apps (`apps/web`, `apps/dapp`, `apps/telegram-bot`) and two x402 scheme
specifications (`spec/`). Every test command that could run without installing anything or
touching a live network passed: Foundry 371/371, workspace unit tests 501/501, local-chain tests
13/13. Critical invariants (escrow conservation, evaluator solvency, decisions settling before the
deadline) are covered by invariant suites. On Base Mainnet the token, vesting wallets, timelock,
four Uniswap v3 pools and two jobs-escrow/evaluator pairs (deployed today, nonces 23–26) have code.

Limitations: the four new jobs contracts and one vesting wallet are not exactly source-verified on
Basescan ("Similar Match"); the retired jobs pair (nonces 21–22) stays callable; the hosted testnet
operator API (`app.arlcoin.io`) answers 402. Fork, e2e and zk-profile suites were not run.

**Gate: passes for Phase 1**, with the source-verification gap as the smallest open action.

## B. Capability inventory

Status is for implementation and tests; deployment is a separate column.

| #   | Capability                             | Status             | Implementation                                                                                                                                                                   | Tests (bodies read)                                                                                                                                                                                       | Deployment                                                                                       | Limitation                                                                                                     |
| --- | -------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | Agent identity / ERC-8004              | LIVE (integration) | `contracts/src/ARLVerifiedEvaluator.sol#ARLVerifiedEvaluator._ownedBy`; `IERC8004Identity`, `IERC8004Reputation`                                                                 | `test/ARLVerifiedEvaluator.t.sol::test_feedbackSkippedWhenAgentNotProviders`; `::test_feedbackSkippedWithoutAgentId`                                                                                      | Canonical registries `0x8004A169…a432`, `0x8004BAa1…9b63` have code (130 B each)                 | ARL runs no registry of its own; it reads and writes the canonical one                                         |
| 2   | Task specification                     | LIVE               | `packages/verifier/src/spec.ts`; `docs/reexecution-spec.md`; `Config.specHash` in the evaluator                                                                                  | `packages/verifier/test` (64 pass); `ARLVerifiedEvaluator.t.sol::test_configure`                                                                                                                          | Base Sepolia job 1 evidence in `docs/evidence/` (per README)                                     | One spec format (`arl-reexec/1`)                                                                               |
| 3   | Proof format and evidence validation   | BUILDING           | `packages/verifier/src/bundle.ts`, `verify.ts`; `Tier.Attested` is a label, not an on-chain proof check                                                                          | `packages/verifier/test/bundle.test.ts > accepts a consistent approved bundle`; `> rejects a double vote, an approval without submission and a settlement mismatch`                                       | Not applicable                                                                                   | Re-execution and committee votes only; proof-verified computation is a design (`docs/verifiable-execution.md`) |
| 4   | Verification policy                    | LIVE               | `ARLVerifiedEvaluator.sol:63-67` (`Tier`), `configure`, `_checkWindows`, `_checkFits` (`:517`), `_checkThreshold`                                                                | `::test_RevertWhen_ConfigureBadThreshold`; `::test_RevertWhen_AcceptTooLateToEvaluate`; `::test_evaluationThatJustFitsPaysTheProvider`                                                                    | New evaluators `0x4f7f…7FA7`, `0xa2f8…009E` have code                                            | Arbiter is a 2-of-3 Safe (`0x8FF6…466f`)                                                                       |
| 5   | Escrow and funding                     | LIVE               | `contracts/src/ARLJobs.sol:151` (`fund`, expected budget), `:104` (`createJob`, `MAX_DURATION`); `ComputePayment.sol` (streams)                                                  | `ARLJobs.t.sol::test_longestJobIsStillRefundable`; `invariant/ARLJobsInvariant.t.sol`; `invariant/ComputePaymentInvariant.t.sol::invariant_neverPaysMoreThanDeposit`                                      | ARLJobs `0xc833…5bE6` (USDC), `0x4664…98f9` (ARL) have code; ComputePayment only on Base Sepolia | Push payments (finding L-02, accepted)                                                                         |
| 6   | Settlement, refunds, failure paths     | LIVE               | `ARLJobs.sol:182` `complete`, `:200` `reject`, `:220` `claimRefund`; evaluator `finalize` (`:414`), `resolve` (`:427`), `release` (`:451`), `closeUndecided` (`:378`)            | `ARLJobs.t.sol::test_completeRevertsAtExpiry`; `ARLVerifiedEvaluator.t.sol::testFuzz_escrowToExactlyOneSide`; `invariant/ARLVerifiedEvaluatorInvariant.t.sol::invariant_decisionsSettleBeforeTheDeadline` | As row 5                                                                                         | No dispute ruled after the deadline (refund path instead), by design                                           |
| 7   | External payment adapters / x402       | BUILDING           | `packages/payments/src` (`facilitator.ts`, `metering.ts`, `receipt.ts`); `spec/x402-arl-upto/v0.1.0`, `spec/x402-arl-escrow/v0.2.0-draft`                                        | `packages/payments/test/spec-vectors.test.ts > settlement decisions`; `> usage receipts` (42 pass)                                                                                                        | Hosted facilitator `app.arlcoin.io/api/operator/status` answers **402**                          | Fork suite not run; hosting moved off Vercel, operator not yet                                                 |
| 8   | Reputation writeback                   | LIVE (code)        | `ARLVerifiedEvaluator.sol:576` `_feedback`, gas-capped (`REGISTRY_GAS = 300_000`, `:118`), `try/catch` (`:584`)                                                                  | `::test_finalizeApprovedPaysProviderAndWritesReputation` (asserts `reputation.count() == 1`); `::test_feedbackFailureNeverBlocksSettlement`                                                               | Evaluators deployed; **no mainnet job has run yet**                                              | Mainnet behaviour UNVERIFIED until a first job                                                                 |
| 9   | Monitoring, emergency controls, safety | BUILDING           | `.github/workflows/monitor.yml`, `uptime.yml`; no pause or owner by design; `ARLTimelock.sol` (48 h floor, cancel-only guardian)                                                 | `ARLTimelock.t.sol` (pass); invariant suites                                                                                                                                                              | Timelock `0xF382…B1c2` has code                                                                  | Uptime targets include the 402 operator; no on-chain kill switch for the retired jobs pair                     |
| 10  | SDK, API, CLI                          | BUILDING           | `packages/sdk/src/verified.ts` (`openVerifiedJob`, `checkEvaluationFits`), `payVerified.ts`, `escrowProvider.ts`; `packages/verifier/src/cli.ts`; `packages/deploy/src/*-cli.ts` | `packages/sdk/test/verified.test.ts > refuses what the evaluator would reject`; `packages/sdk/test-anvil` (8 pass)                                                                                        | SDK points at the new ARL pair; HTTP operator API down (402)                                     | API not hosted                                                                                                 |
| 11  | Reference agents and examples          | BUILDING           | `packages/provider/src` (`runner.ts`, `server.ts`); `docs/quickstart.md`                                                                                                         | `packages/provider/test` (24 pass)                                                                                                                                                                        | No hosted reference agent                                                                        | Runs locally or on Base Sepolia only                                                                           |
| 12  | Standards governance and versioning    | BUILDING           | `spec/*` versioned folders, `CHANGELOG.md`; on-chain governance is Safes + `ARLTimelock`, no DAO                                                                                 | `packages/payments/test/spec-vectors.test.ts` (conformance vectors)                                                                                                                                       | Not applicable                                                                                   | Escrow scheme is a draft                                                                                       |
| 13  | Deployment and release workflow        | LIVE               | `.github/workflows/ci.yml` (required checks), `scripts/build-cloudflare.sh`, `wrangler.toml`, `contracts/deploy/bytecode.json`, `packages/deploy` plan/record/verify CLIs        | `packages/deploy/test` (142 pass); `apps/dapp/test/unit/mainnetPlans.test.ts`                                                                                                                             | arlcoin.io 200 on Cloudflare Pages                                                               | `deploy-app.yml` still targets the blocked Vercel account                                                      |

## C. Test baseline

Commands run (Foundry 1.8.3, Node 22, no install, no network except local Anvil):

| Package               | Declared test command                              | Run                              | Result                                  |
| --------------------- | -------------------------------------------------- | -------------------------------- | --------------------------------------- |
| `contracts`           | `forge test` (`check:contracts`)                   | `forge test`                     | 371 passed, 0 failed, 23 suites, 33.9 s |
| `packages/tokenomics` | `node --test "test/**/*.test.ts"`                  | `npm test`                       | 52/52                                   |
| `packages/deploy`     | same pattern                                       | `npm test`                       | 142/142                                 |
| `packages/monetary`   | same                                               | `npm test`                       | 26/26                                   |
| `packages/payments`   | same; `test:fork`                                  | `npm test`                       | 42/42                                   |
| `packages/provider`   | same; `test:fork`                                  | `npm test`                       | 24/24                                   |
| `packages/zk`         | same                                               | `npm test`                       | 7/7                                     |
| `packages/sdk`        | same; `test:anvil`; `test:fork`                    | `npm test`; `npm run test:anvil` | 15/15; 8/8                              |
| `packages/verifier`   | same; `test:anvil`                                 | `npm test`; `npm run test:anvil` | 64/64; 5/5                              |
| `apps/dapp`           | `node --test "test/unit/**/*.test.ts"`; `test:e2e` | `npm test`                       | 96/96                                   |
| `apps/web`            | `node --test "test/unit/**/*.test.ts"`; `test:e2e` | `npm test`                       | 33/33                                   |

Not run, and why:

- `test:fork` (payments, provider, sdk), `contracts/test-fork/*`: need a live RPC fork.
- `test:e2e` (dapp, web), `test:hosted`: build and browser runs; they write build artifacts.
- `FOUNDRY_PROFILE=zk forge test` (`contracts/test-zk`), Halmos (`test/symbolic`), coverage,
  Slither, Aderyn, Mythril: run in CI (`ci.yml`, `security-audit.yml`), not repeated here.
- `apps/telegram-bot` (Python): no test run.

CI: `ci.yml` runs typescript, contracts, coverage, slither, symbolic, zk, web, dapp, rehearsal,
secrets, sbom; `security-audit.yml` static/dynamic/symbolic. The last three merged PRs (#101, #104,
#105) were green on every GitHub check; only the external "Vercel – …" statuses fail ("Account is
blocked"), which are not required checks.

## D. Deployment evidence and ranked risks

**Base Mainnet (chain 8453), code size at block 53,316,856 and Basescan state**

| Contract                                   | Address                                                    |          Code | Basescan               |
| ------------------------------------------ | ---------------------------------------------------------- | ------------: | ---------------------- |
| ARLToken                                   | `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`               |       3,775 B | Source Code Verified   |
| Vesting wallet 1                           | `0x8E2CC3a5F39038836475650f63A91d107BabA643`               |       2,256 B | Source Code Verified   |
| Vesting wallet 2                           | `0x36C94925c2BAB7897A000c57CE5536F5Bc60a95B`               |       2,256 B | **Similar Match only** |
| ARLTimelock                                | `0xF3820BC1510a9A1B9aa2b318Dd997127f198B1c2`               |       6,599 B | Source Code Verified   |
| ARLJobs (USDC), nonce 23                   | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6`               |       5,107 B | **Similar Match only** |
| Evaluator, nonce 24                        | `0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7`               |      14,069 B | **Similar Match only** |
| ARLJobs (ARL), nonce 25                    | `0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9`               |       5,107 B | **Similar Match only** |
| Evaluator, nonce 26                        | `0xa2f8945f301C46f2649b79Cd42A7eb1102e9009E`               |      14,069 B | **Similar Match only** |
| Retired ARLJobs, nonce 21                  | `0x6c8A7712010f951f5B03A11C24b46C8b18d5997F`               |       4,952 B | Source Code Verified   |
| Retired evaluator, nonce 22                | `0x3a5dC803b84D5F150FCd2b070cb9D8a12BC35F34`               |      13,487 B | Source Code Verified   |
| Arbiter Safe                               | `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f`               | 123 B (proxy) | Similar Match          |
| Uniswap v3 pools (USDC, USDT, WETH, cbBTC) | `0xBE1c…9b72`, `0x4A55…5273`, `0x23C8…3A78`, `0x6445…75db` | 22,142 B each | —                      |

The four pools hold 1,550,000, 1,300,000, 1,274,993 and 875,000 ARL (`balanceOf`). The new pairs
also passed `packages/deploy/src/jobs-record-cli.ts` (9 of 9 checks each) on 2026-10-31.

**Base Sepolia (chain 84532)**: ARLJobs `0xec79…5644` (4,952 B), evaluator `0x6808…4d14`
(13,487 B), staking `0xA784…724e` (4,276 B), signal `0xFa59…b268` (3,184 B) have code; they run
code from before the fixes of 2026-10-25 and 2026-10-28 (README notes this).

**Ranked risks** (no Critical observed; this is not a full audit)

1. **High — retired jobs pair stays callable.** `ARLJobs` `0x6c8A…997F` and evaluator
   `0x3a5d…5F34` carry B-1/B-2 (`security/2026-10-25-jobs-deadline.md`) and F-2/F-3
   (`docs/audit-2026-10-28-remediation.md`). No owner, so they cannot be paused. Impact: a user who
   funds a job there can have an approved job refunded or an unbounded deadline. Evidence: code
   present and source-verified above. Blocks Phase 1: **no** (no app, SDK or document points to it).
2. **High (custody) — shared Safe owners.** About 79% of supply sits in Safes with the same three
   owners, 2-of-3 (`security/2026-10-17/findings.md` H-01, mitigated by procedure). Impact: key
   compromise of two owners moves allocation funds. Blocks Phase 1: **no**.
3. **Medium (assurance) — new contracts not exactly source-verified.** Nonces 23–26 and vesting
   wallet 2 show "Similar Match" only. Impact: users and listing sites cannot confirm the exact
   source; no fund impact (bytecode was checked against the plan files and the build).
   Blocks Phase 1: **yes**, for any public use of the new escrows.
4. **Medium — external calls in settlement.** `ARLJobs` pushes tokens to provider/client
   (`safeTransfer`, L-02 accepted); the evaluator calls the reputation registry with a 300,000-gas
   cap inside `try/catch` (`ARLVerifiedEvaluator.sol:584`). Impact: a blocklisting payment token
   (USDC) could block settlement for a blocklisted party. Evidence:
   `::test_feedbackFailureNeverBlocksSettlement`. Blocks Phase 1: **no**.
5. **Medium (operations) — testnet operator API down.** `app.arlcoin.io` answers 402; faucet,
   relay and x402 settlement on Base Sepolia are unavailable; `deploy-app.yml` targets the blocked
   Vercel account. Blocks Phase 1: **no** (testnet only).

## E. Phase 0 gate and next action

- **Evidence is sufficient** to proceed: tests exist for every critical contract path and pass;
  invariants cover escrow conservation, solvency, locks and the deadline rule.
- **Gaps**: fork, e2e and zk-profile suites were not run here (CI runs them); Python bot untested
  here; reputation writeback unexercised on mainnet.
- **Unavailable evidence**: exact source verification for nonces 23–26 and vesting wallet 2.
  No `project-context.md` exists; README and `docs/` were used instead.
- **Single smallest action**: source-verify the four new jobs contracts (and vesting wallet 2) on
  Basescan with `forge verify-contract --chain 8453`, constructor arguments from
  `apps/dapp/public/plans/8453-verified-jobs-{usdc,arl}-v2.json`.

Phase 1 has not been started. Waiting for human review.
