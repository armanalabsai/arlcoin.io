# Baseline, 14 November 2026

A read-only snapshot of what ARL Protocol has, what is proven, and where it runs (Phase 0 of the
[master architecture and roadmap](architecture/MASTER-ARCHITECTURE-ROADMAP.md)). Status words:
**LIVE** (deployed and checked on chain or online), **BUILDING** (code and tests exist, not deployed
or not operated in production), **PLANNED** (designed, no deployed code), **UNVERIFIED** (claimed,
not checked for this baseline). The previous baseline (31 October 2026) is in the git history.

On-chain reads: Base Mainnet (8453), block 57,249,534 (2026-11-14 07:11 UTC), public RPC
`base-rpc.publicnode.com`. Nothing was written to any contract.

## Capabilities

| Capability                                                     | Status     | Evidence                                                                                                                                          |
| -------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARL token, 21,000,000 fixed supply, no owner                   | LIVE       | `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`; `totalSupply()` = 21,000,000; runtime size 3,775 bytes = the release build                          |
| Vesting wallets, timelock, allocation Safes                    | LIVE       | Investors `0x8E2C…A643`, partnerships `0x36C9…a95B` (2,256 bytes each); timelock `0xF382…B1c2` runtime hash equal to the manifest                 |
| Liquidity: Uniswap v3 pools                                    | LIVE       | GeckoTerminal lists ARL/USDT, ARL/WETH and ARL/cbBTC (1 % fee) on Base; addresses in [mainnet-plan.md](mainnet-plan.md)                           |
| Jobs escrow (ERC-8183), paid in ARL and in USDC                | LIVE       | `0x4664…98f9` (ARL) and `0xc833…5bE6` (USDC), 5,107 bytes each; **`jobCounter()` = 0 on both**                                                    |
| Verified evaluator v4 (staked ARL validators, arbiter Safe)    | LIVE       | `0x5cA6…7DfF` (ARL) and `0x8C01…0CFC` (USDC), 14,885 bytes each; **ARL held = 0** (no validator stake, no bonds)                                  |
| Arbiter Safe, 2 of 3                                           | LIVE       | `0x8FF6…466f` (Safe proxy, code present)                                                                                                          |
| Compute payment                                                | LIVE       | `0x1bFE…E464`, 4,120 bytes = the manifest size; holds no ARL (no stream open)                                                                     |
| Staking rewards                                                | BUILDING   | `0x15e2…a102`, 4,335 bytes = the manifest size; **about 6.11 ARL staked by users**, `rewardRate` = 0, `periodFinish` = 0: no reward period funded |
| Website, app under `/app`, developer page `/build`             | LIVE       | `https://arlcoin.io`, `/app/`, `/build/` answer 200 (Cloudflare Pages)                                                                            |
| Supply API                                                     | LIVE       | `/api/supply` answers 7,099,999.99… (circulating); `?q=total` answers 21000000                                                                    |
| TypeScript SDK `arl-protocol-sdk`, n8n node `n8n-nodes-arl`    | LIVE       | Published on npm (0.1.0 each)                                                                                                                     |
| Python package `arl_protocol`                                  | LIVE       | Installable from GitHub (`pip install "git+…#subdirectory=packages/python-sdk"`); not on PyPI                                                     |
| Telegram bot                                                   | LIVE       | Cloudflare Worker `arl-telegram-bot`; setup endpoint merged (#151)                                                                                |
| Validators re-executing jobs (`arl-reexec/1`), evidence bundle | BUILDING   | `packages/verifier`; **no validator runs on Base Mainnet**                                                                                        |
| x402 `upto` payments with usage receipts                       | BUILDING   | `packages/payments`; does not open 8453; no facilitator runs                                                                                      |
| x402 `arl-escrow` scheme                                       | PLANNED    | `spec/x402-arl-escrow/v0.2.0-draft` (draft for review)                                                                                            |
| `ARLX402JobGateway`, `IExecutionVerifier`                      | PLANNED    | Interfaces in [verifiable-execution.md](verifiable-execution.md); no source                                                                       |
| Anonymous signals                                              | BUILDING   | Local chain only ([zk-privacy.md](zk-privacy.md))                                                                                                 |
| Auditor confirmation of the 2026-10-28 fixes                   | UNVERIFIED | Fixes merged (#105); no confirmation from the auditor in the repository                                                                           |

## Deployed code vs repository code

| Contract               | Deployed runtime | Repository build (`contracts/deploy/bytecode.json`) | Finding                                                                                                                          |
| ---------------------- | ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ARLJobs`              | 5,107 bytes (v2) | 5,722 bytes (v3, #153)                              | **Mainnet runs v2.** v3 (balance-delta check in `fund`, `claimRefundTo`) is merged but not deployed; decision D-1 of the roadmap |
| `ARLToken`             | 3,775 bytes      | 3,775 bytes                                         | **Matches** the release build with immutables masked (`compareRuntime`)                                                          |
| `ARLVestingWallet`     | 2,256 bytes      | 2,256 bytes                                         | **Matches** the build with immutables masked (both)                                                                              |
| `ARLTimelock`          | 6,599 bytes      | 6,599 bytes                                         | Runtime hash equal                                                                                                               |
| `ARLStakingRewards`    | 4,335 bytes      | 4,335 bytes                                         | **Matches** the build with immutables masked                                                                                     |
| `ComputePayment`       | 4,120 bytes      | 4,120 bytes                                         | **Matches** the build with immutables masked                                                                                     |
| `ARLVerifiedEvaluator` | 14,885 bytes     | not in the manifest                                 | **Both v4 evaluators match** the build with immutables masked; added to the manifest (finding S-7)                               |

## Tests run for this baseline

Commands run on 2026-11-14 on the owner's Windows machine:

| Command                              | Result                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forge test` (Foundry, `contracts/`) | 391 passed, 0 failed, 24 suites                                                                                                                                               |
| `npm test` (all workspaces)          | All pass except 3 tests in `packages/verifier` that need symlinks and Docker paths on Windows (`EPERM: operation not permitted, symlink`); the same tests pass in CI on Linux |
| CI on `main` (`b63a7b0`, #161)       | 19 checks: all success or skipped                                                                                                                                             |

## Risks, ranked

1. **The verified flow has never run on mainnet.** No jobs, no validator stake. Phase 9 (pilot)
   needs an operator-run validator set first.
2. **Mainnet escrow is v2, repository is v3.** Documentation of `ARLJobs` in `main` describes code
   that is not live; decision D-1 (redeploy or keep v2 with policy limits).
3. **Staking holds user funds without rewards.** About 6.11 ARL is staked while no reward period is
   funded; the first 300,000 ARL period is the owner's action.
4. **One signer for deployments.** Every mainnet deployment depends on one deployer wallet; the
   deployed contracts themselves have no owner.
5. **Audit loop not closed.** The auditor has not confirmed the 2026-10-28 fixes.
6. ~~Evaluator not in the bytecode manifest.~~ Fixed: `ARLVerifiedEvaluator` is in the manifest and
   both mainnet v4 evaluators match the build.
