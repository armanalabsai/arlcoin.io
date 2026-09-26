# ARL Protocol — Architecture

Status: Phase 1 (token, vesting, treasury contracts) implemented and tested.
Nothing is deployed.

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
│   └── deploy/            Deployment plan builder (UTC calendar arithmetic, validation)
├── contracts/             Foundry project (solc 0.8.36)
│   ├── src/               ARL-specific contracts only
│   ├── test/              unit, fuzz, invariant and deployment tests
│   ├── script/            deployment, plan validation and post-deployment verification
│   ├── deploy/config/     public deployment configs (local only so far)
│   └── lib/               OpenZeppelin v5.6.1, forge-std v1.16.2 (pinned submodules)
├── apps/
│   └── web/               ARL website (not created)
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

| Area            | Decision                                                                              | Detail                                       |
| --------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| Chain           | EVM-compatible; production chain chosen before deployment                             | [`chain-evaluation.md`](chain-evaluation.md) |
| License         | Apache-2.0                                                                            | `LICENSE`, `NOTICE`                          |
| Token           | ERC-20, 18 decimals, 21,000,000 ARL minted once, no mint function, no owner, no pause | [`token-design.md`](token-design.md)         |
| Founder vesting | 24-month cliff, 36 months linear                                                      | [`tokenomics.md`](tokenomics.md)             |
| Team vesting    | 12-month cliff, 36 months linear, per member; unassigned tokens in a multisig pool    | [`tokenomics.md`](tokenomics.md)             |
| Treasury        | Safe 3-of-5, minimum 48-hour timelock                                                 | [`token-design.md`](token-design.md)         |
| Dependencies    | Open source first, provenance recorded                                                | [`open-source.md`](open-source.md)           |
| Content         | English only; no unverified claims; no implied partnerships                           | [`content-standard.md`](content-standard.md) |

## Decisions still open

| Decision                                                                | Needed before                |
| ----------------------------------------------------------------------- | ---------------------------- |
| Production chain                                                        | Deployment scripts           |
| Exact launch and grant dates (contracts take explicit timestamps)       | Deployment                   |
| Signer sets and overlap across treasury, reserve, team and reward Safes | Production multisig creation |
| Copyright holder named in `NOTICE`                                      | Public release               |

Resolved on 2026-09-26: `ERC20Permit` included; Ecosystem Reserve released
linearly over 1,830 days.
