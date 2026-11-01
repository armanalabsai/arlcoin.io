# Baseline, 31 October 2026

A read-only snapshot of what ARL Protocol has, what is proven, and where it runs. Status words:
**LIVE** (deployed and checked on chain or online), **BUILDING** (code and tests exist, not deployed
for production), **PLANNED** (designed, no deployed code), **UNVERIFIED** (claimed, not checked for
this baseline).

## Capabilities

| Capability                                                      | Status     | Evidence                                                                                                      |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| ARL token, 21,000,000 fixed supply, no owner                    | LIVE       | Base Mainnet `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`; runtime code matches tag `v1.0.0-release-00d9056`  |
| Vesting wallets, timelock, allocation Safes                     | LIVE       | [mainnet-plan.md](mainnet-plan.md)                                                                            |
| Liquidity: four Uniswap v3 pools (USDC, USDT, WETH, cbBTC)      | LIVE       | Pool addresses in [mainnet-plan.md](mainnet-plan.md)                                                          |
| Jobs escrow (ERC-8183), paid in ARL and in USDC                 | LIVE       | Base Mainnet `0x4664…98f9` (ARL) and `0xc833…5bE6` (USDC); `jobs-record-cli.ts` 9/9 checks each on 2026-10-31 |
| Verified evaluator (staked ARL validators, 2-of-3 arbiter Safe) | LIVE       | Base Mainnet `0x817E…DAd6` (ARL) and `0x3F4E…84c9` (USDC), nonces 27 and 28, 9/9 checks each on 2026-11-01    |
| Website and the app under `/app`                                | LIVE       | `https://arlcoin.io` on Cloudflare Pages; `/`, `/faq/`, `/app/` answer 200                                    |
| Supply API                                                      | LIVE       | `https://arlcoin.io/api/supply` (circulating); `?q=total` returns 21000000                                    |
| App on Base Sepolia: faucet, staking, jobs, payments, polls     | LIVE       | Base Sepolia contracts in the README; app at arlcoin.io/app                                                   |
| Testnet operator API (faucet, joins, relay, x402 settlement)    | BUILDING   | Moving from Vercel to a Cloudflare Pages Function (PR #110); `app.arlcoin.io` answers 402 until it lands      |
| x402 `upto` payments with usage receipts                        | BUILDING   | `packages/payments`, spec v0.1.0 with test vectors; settles on Base Sepolia only                              |
| SDK: `payVerified`, `acquireArl`, escrow provider helpers       | BUILDING   | `packages/sdk`, unit and Anvil tests; mainnet addresses point to the live ARL pair                            |
| Validators re-executing jobs (`arl-reexec/1`)                   | BUILDING   | `packages/verifier`; three Base Sepolia validators on GitHub runners                                          |
| Staking rewards on Base Mainnet                                 | PLANNED    | [mainnet-services.md](mainnet-services.md), step 4                                                            |
| Operator API for x402 on Base Mainnet                           | PLANNED    | [mainnet-services.md](mainnet-services.md), step 3                                                            |
| Base Sepolia staking, signal and jobs with the 2026-10-28 fixes | PLANNED    | Rehearsal passed on a fork on 2026-10-30; the testnet operator key signs                                      |
| Auditor confirmation of the 2026-10-28 fixes                    | UNVERIFIED | Fixes merged (#105); the auditor's proofs of concept have not been run against them                           |

## Tests run for this baseline

Only commands run on this machine on 2026-10-30 and 2026-10-31:

| Command                                                                                 | Result                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `forge test` (Foundry 1.8.3, `contracts/`, after merging the audit fixes)               | 371 passed, 0 failed                            |
| `npm run check:bytecode`                                                                | the build reproduces the manifest (7 contracts) |
| `node --test "test/unit/**/*.test.ts"` in `apps/dapp`                                   | 96 passed, 0 failed                             |
| `node --test "test/**/*.test.ts"` in `packages/zk`                                      | 7 passed, 0 failed                              |
| `npm run test:anvil` in `packages/verifier`                                             | 5 passed, 0 failed                              |
| `node packages/deploy/src/jobs-record-cli.ts` for both `-v2` plans against Base Mainnet | 9 of 9 checks, each                             |
| `bash scripts/rehearse-sepolia-ecosystem.sh` (Base Sepolia fork)                        | passed                                          |

CI on GitHub runs the full set (contracts, coverage, Slither, Aderyn, Halmos, zk, dApp, web, e2e,
rehearsal) on every pull request; #105 was green on all required checks.

## Deployment evidence by network

- **Base Mainnet (8453):** token, vesting, timelock and Safes ([mainnet-plan.md](mainnet-plan.md));
  jobs escrows and evaluators at deployer nonces 23 to 28, record in
  `contracts/deploy/base-mainnet-jobs.json`; arbiter Safe `0x8FF6…466f` (2 of 3). The pair at
  nonces 21 and 22 is retired; it never held a job.
- **Base Sepolia (84532):** token, vesting, treasury, staking, jobs, evaluator and anonymous
  signals, recorded in `contracts/deploy/base-sepolia.json` and source-verified.
- **Web:** Cloudflare Pages project `arlcoin-io`; DNS on Cloudflare since 2026-10-30.

## Risks, ranked

1. **Testnet operator offline.** Until PR #110 merges and `ARL_OPERATOR_KEY` is set in Cloudflare,
   the app's faucet, poll joins and paid demo do not work.
2. **Base Sepolia contracts run pre-fix code.** Staking, signal and jobs on the testnet lack the
   2026-10-28 fixes; redeploying needs the testnet operator key.
3. **One signer for deployments.** Every mainnet deployment depends on one deployer wallet; the
   deployed contracts themselves have no owner.
4. **Audit loop not closed.** The auditor has not yet confirmed the fixes; the request is drafted.
5. **Distribution channels.** The Medium account is suspended pending an appeal; announcements go
   out on X, Telegram, dev.to and Product Hunt.
