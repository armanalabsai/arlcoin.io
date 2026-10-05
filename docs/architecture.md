# ARL Protocol — Architecture

Status: Phase 1 (token, vesting, treasury contracts), the Public Launch
Merkle claim distributor and the staking rewards contract are implemented and
tested. Nothing is deployed.

## Repository

| Item               | State                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| Language / runtime | TypeScript on Node.js 22.18+ (native type stripping, no build step)          |
| Package manager    | npm workspaces; exact versions in `package-lock.json`                        |
| Tests              | `node:test`                                                                  |
| Typecheck          | `tsc --noEmit`, strict                                                       |
| Lint / format      | ESLint (typescript-eslint strict, type-checked) and Prettier                 |
| CI                 | GitHub Actions: typecheck, lint, format check, tests, `npm audit`            |
| License            | Apache-2.0 (`LICENSE`, `NOTICE`); third parties in `THIRD_PARTY_LICENSES.md` |
| Security policy    | `SECURITY.md`                                                                |
| Contribution rules | `CONTRIBUTING.md`, `docs/content-standard.md`                                |
| Branch protection  | Documented in `docs/branch-protection.md`; set by the owner                  |

## Layout

```
ARLCOIN/
├── packages/
│   ├── tokenomics/        Allocation table, validation, share math
│   ├── deploy/            Deployment plan builder, manifest, circulating supply, claim lists
│   ├── monetary/          ARL Core monetary standard: reference implementation and test vectors
│   ├── payments/          ARL usage-based payments over x402 upto (Permit2), Base Sepolia only
│   └── provider/          Reference compute provider: runs paid jobs, settles seconds used
├── contracts/             Foundry project (solc 0.8.36)
│   ├── src/               ARL-specific contracts only
│   ├── test/              unit, fuzz, invariant and deployment tests
│   ├── test-fork/         Base Sepolia fork tests against deployed Permit2 and x402 contracts
│   ├── script/            deployment, plan validation and post-deployment verification
│   ├── deploy/config/     public deployment configs (local only so far)
│   └── lib/               OpenZeppelin v5.6.1, forge-std v1.16.2, solidity-datetime v2.2.0 (pinned submodules)
├── apps/
│   └── web/               ARL website
└── docs/
```

Rules:

- Upstream code lives only under `contracts/lib/` or `node_modules/`, pinned
  to an exact tag and commit, never edited in place. ARL-specific code lives in
  `contracts/src/`, `packages/` and `apps/`.
- `packages/tokenomics` is the single source of allocation data. The website,
  docs and deployment scripts consume it and never restate the numbers.
- Deployment tooling refuses to run unless `validateAllocations` returns no
  errors.
- Contracts stay chain-agnostic until the chain is chosen.

## Approved decisions

| Area         | Decision                                                                                             | Detail                                       |
| ------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Chain        | Base: Base Sepolia for testnet, Base Mainnet for production (opens at the TGE, 2026-11-01T00:00:00Z) | [`chain-evaluation.md`](chain-evaluation.md) |
| License      | Apache-2.0                                                                                           | `LICENSE`, `NOTICE`                          |
| Token        | ERC-20, 18 decimals, 21,000,000 ARL minted once, no mint function, no owner, no pause                | [`token-design.md`](token-design.md)         |
| Allocation   | 11 allocations totalling 21,000,000 ARL (approved 2026-09-27)                                        | [`tokenomics.md`](tokenomics.md)             |
| Custody      | Vesting wallets, timelock or a dedicated Safe per allocation (approved 2026-09-27)                   | [`tokenomics.md`](tokenomics.md#custody)     |
| Treasury     | Safe 2-of-3, minimum 48-hour timelock, guardian Safe that can only cancel (no sunset)                | [`token-design.md`](token-design.md)         |
| Dependencies | Open source first, provenance recorded                                                               | [`open-source.md`](open-source.md)           |
| Content      | English only; no unverified claims; no implied partnerships                                          | [`content-standard.md`](content-standard.md) |

## Decisions still open

| Decision                                                               | Needed before                |
| ---------------------------------------------------------------------- | ---------------------------- |
| Base Mainnet opening time (`networkGate`, 2026-11-01T00:00:00Z)        | Production deployment        |
| TGE date (both vesting schedules start at it; the date is TBD)         | Base Mainnet                 |
| Team grant schedule; program rules for staking, growth and early users | The programs                 |
| Exact launch and grant dates (contracts take explicit timestamps)      | Deployment                   |
| Signer sets and thresholds of the dedicated Safes                      | Production multisig creation |
| Copyright holder named in `NOTICE`                                     | Public release               |

Resolved on 2026-09-26: `ERC20Permit` included; Ecosystem Reserve released
linearly over 1,830 days (the Ecosystem Reserve was superseded on 2026-09-27).

Resolved on 2026-09-27 (Phase 2 Remediation Pack 2):

- M-1: a separate guardian Safe holds only `CANCELLER_ROLE` on the treasury
  timelock. It must differ from the proposer and executor. No sunset; the
  risk that a compromised guardian freezes Treasury operations is accepted.
- L-3: the timelock constructor rejects `address(0)` in the proposer and
  executor lists and as the guardian.

Resolved on 2026-09-27 (Phase 2 M-3):

- The founder beneficiary is a dedicated Safe. Off local Anvil, the deployment
  plan and the verifier require contract code at that address. Signers and
  thresholds are not stored in the repository.
- Team grants are irrevocable and made in tranches; each member's beneficiary
  is the member's own Safe or smart account. `ARLVestingWallet` is unchanged.

Superseded on 2026-09-27 (M-2 model replacement):

- The 10-allocation Phase 1 table, including the 7,000,000 ARL Ecosystem
  Reserve and its 1,830-day schedule, and the founder (24 + 36 months) and team
  (12 + 36 months) durations, are replaced by the 11-allocation model in
  [`tokenomics.md`](tokenomics.md). Vesting durations for the new model are TBD.
- The M-2 custody and vesting decision recorded earlier the same day (commit
  `91eaf10`) is superseded and kept in history only.
- Still in force: the Founder recipient (formerly the founder
  vesting beneficiary) is a dedicated Safe (M-3); team
  grants are irrevocable, in tranches, to each member's own Safe (M-3); the
  treasury guardian (M-1) and zero-address checks (L-3).
