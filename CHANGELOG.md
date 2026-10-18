# Changelog

Notable changes to ARL Protocol, newest first. Dates are UTC. Every entry links to the code and
documents that back it; nothing here is deployed on Base Mainnet.

## 2026-10-18

- Validators run unattended: `arl-verifier watch` accepts the funded jobs whose committee names
  the validator and re-executes and votes once the provider submits; three Base Sepolia validators
  run it every 10 minutes on GitHub runners ([validators.yml](.github/workflows/validators.yml)).
  `@arl/sdk` gains `openVerifiedJob`, `getVerdict` and `finalizeJob`, and the app's Verified page
  shows the network's jobs, verdicts, validators, stake, disputes and slashing.
- Verified evaluator deployed on Base Sepolia (testnet): `ARLVerifiedEvaluator` at
  `0x6808F80Eb11538543d31cf4b50332B268dDd4d14` (source verified) with a 2-of-3 arbiter Safe at
  `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f`; a first sample job was approved by a staked
  three-validator committee. The evaluator was added after the 17 October 2026 internal security
  audit; its own tests, fuzzing, invariants, Slither and Aderyn results are in the repository.
- Signed usage receipts for x402 `upto` calls: the provider signs an EIP-712 receipt of the
  authorization charged, the units, the price, the amount and a hash of the output; the
  facilitator settles only the amount a valid receipt states, and the payer checks it with
  `checkUsageReceipt` ([payments.md](docs/payments.md#usage-receipts)). Tested through the HTTP
  facilitator and on a Base Sepolia fork.

## 2026-10-17

- Launch prepared for the TGE, 2026-10-23 00:00 UTC: the mainnet fork rehearsal passes with the
  real signers; the contract run is published for the deploy screen; the pool batches are built
  from Chainlink prices by [`launch-day-pools.sh`](scripts/launch-day-pools.sh)
  ([mainnet-runbook.md](docs/mainnet-runbook.md)).
- Pools at TGE: 5,000,000 ARL (2,000,000 Liquidity, 3,000,000 Public Launch) from 0.20 USD; the
  launchpad reserve is 1,500,000 ARL (owner decision).
- Telegram community bot live (@Arlprotocol_bot) with `/status`, `/launch` and link commands;
  uptime workflow every 10 minutes; "Live on Base Sepolia" badge in the site header.
- FAQ entry that tells ARL Protocol apart from other tokens using the ARL ticker.
- Verified evaluation of ERC-8183 jobs: `ARLVerifiedEvaluator`, a staked validator committee
  chosen by the client that acts as the job's evaluator, with a challenge window, disputes, an
  arbiter limited to disputed jobs, burn slashing and outcomes written to ERC-8004 reputation.
  Built and tested (unit, fuzz, invariant; 100% coverage)
  ([verifiable-execution.md](docs/verifiable-execution.md)).
- Verified evaluator: per-job vote and challenge windows, bond in the escrow token
  (max(budget / 10, floor)), provider approval of the committee, `accept` with a penalty for
  members that do not vote, and a Safe arbiter of at least 2-of-3 created by
  `CreateArbiterSafe` ([arbiter-safe.md](docs/arbiter-safe.md)). Tested on a Base Sepolia fork
  with a real Safe ruling and an allowlisted ERC-8004 read.
- Re-execution spec `arl-reexec/1` and the reference validator `packages/verifier`: canonical spec
  hash, inputs checked by hash and commit, a pinned container with no network, no capabilities and
  an unprivileged user, the result hash as deliverable, and on-chain accept and vote
  ([reexecution-spec.md](docs/reexecution-spec.md)).

## 2026-10-16

- Website: official channels (X @arlprotocol, Telegram t.me/arlcoin_community, team@arlcoin.io),
  structured data, web app manifest, `/.well-known/security.txt`, HSTS with subdomains, FAQ on
  testnet value, official channels and data deletion; background music removed.
- Documents state the Base Sepolia deployment everywhere; new
  [operator API security model](docs/operator-api.md) and [incident response](docs/incident-response.md).
- Repository links point to https://github.com/armanalabsai/arlcoin.io.

## 2026-10-11

- Base Sepolia ecosystem deployed and source-verified: staking, ERC-8183 jobs escrow, zero-knowledge
  verifier and anonymous-signal contract ([verification-evidence.md](docs/verification-evidence.md#explorer-verification-base-sepolia)).
- The ARL app on Base Sepolia at https://arlcoin.io/app/ with the testnet operator at
  https://app.arlcoin.io (faucet, poll joins, vote relay, x402 settlement).
- Mainnet signer addresses checked read-only on Base Mainnet ([mainnet-plan.md](docs/mainnet-plan.md)).

## 2026-10-04

- Base Sepolia deployment of 12 Safes, the ARL token, two vesting wallets and the treasury
  timelock, source-verified on Basescan, Blockscout and Sourcify.
