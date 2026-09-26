# ARL Protocol — Phase 0 Architecture Proposal

Status: **proposal, awaiting approval.** Nothing in this document is implemented
unless it is listed under "Implemented".

## 1. Current repository state

| Item | State |
| --- | --- |
| Content | `README.md` (project baseline), `packages/tokenomics`, `docs/` |
| Language / runtime | TypeScript on Node.js 22 (native type stripping, no build step) |
| Package manager | npm workspaces, committed `package-lock.json` |
| Tests | `node:test` (built into Node, no test framework dependency) |
| Typecheck | `tsc --noEmit`, strict |
| Lint / format | Not configured yet — see §5 |
| CI | Not configured yet — see §5 |
| License | Not chosen — see §6 |

## 2. Target layout

```
ARLCOIN/
├── packages/
│   └── tokenomics/        Allocation table, validation, share math (implemented)
├── contracts/             Phase 1 — Foundry project (not created)
│   ├── src/               ARL-specific contracts only
│   ├── test/              unit, fuzz and invariant tests
│   ├── script/            deployment scripts (read packages/tokenomics output)
│   └── lib/               upstream dependencies as pinned git submodules
├── apps/
│   └── web/               ARL website (Next.js), paused until approved
├── docs/                  architecture, tokenomics, security, listing readiness
├── THIRD_PARTY_NOTICES.md created with the first upstream dependency
└── README.md
```

Rules:

- Upstream code lives only under `contracts/lib/` or `node_modules/`, pinned
  to an exact tag or commit, never edited in place. ARL-specific code lives in
  `contracts/src/`, `packages/` and `apps/`.
- `packages/tokenomics` is the single source of allocation data. The website,
  the docs and the deployment scripts consume it; none restate the numbers.
- Every module is independently testable and has no hidden coupling to
  another module.

## 3. Phase 1 decisions required before any contract code

| Decision | Recommendation | Status |
| --- | --- | --- |
| Target chain | An EVM chain (Ethereum mainnet or an Ethereum L2). The specific network is a business decision. | undecided |
| Token standard | ERC-20 | proposal |
| Decimals | 18 (ERC-20 convention, expected by wallets and exchanges) | proposal |
| Supply model | Entire 21,000,000 ARL minted once in the constructor to the allocation holders; no `mint` function exists afterwards | proposal |
| Ownership / admin | No owner on the token contract. No admin role that can mint, burn others' tokens, pause, or blacklist | proposal |
| Pause / emergency | None on the token. Emergency controls, if any, live in treasury and program contracts and cannot affect supply | proposal |
| Vesting | Per-beneficiary vesting contracts (OpenZeppelin `VestingWallet` with a cliff), funded at deployment | proposal |
| Ecosystem reserve | Dedicated contract releasing at most 1,400,000 ARL per year for 5 years to a multisig | proposal |
| Treasury | Safe multisig plus a timelock (OpenZeppelin `TimelockController`) | proposal — signer set, threshold and delay undecided |
| Role separation | Separate multisigs for treasury, ecosystem reserve and reward programs | proposal |

## 4. Open-source components under evaluation

No upstream dependency is added until its analysis is approved.

| Component | Repository | License | Use | Status |
| --- | --- | --- | --- | --- |
| OpenZeppelin Contracts | github.com/OpenZeppelin/openzeppelin-contracts | MIT | ERC-20, `VestingWallet`, `TimelockController`, `ReentrancyGuard` | candidate |
| Safe smart account | github.com/safe-global/safe-smart-account | LGPL-3.0 | Treasury multisig (deployed instance, not vendored code) | candidate |
| Foundry | github.com/foundry-rs/foundry | MIT / Apache-2.0 | Build, unit, fuzz and invariant tests | candidate |
| Slither | github.com/crytic/slither | AGPL-3.0 (tool only, not distributed) | Static analysis in CI | candidate |

Exact versions and commits will be recorded when each is adopted.

## 5. Phase 0 remaining work

Once this proposal is approved:

1. CI: GitHub Actions running `npm ci`, `npm run typecheck`, `npm test` on every
   pull request; actions pinned by commit SHA.
2. `SECURITY.md` (vulnerability reporting), `CONTRIBUTING.md` (branch and PR
   rules, English-only), Dependabot for npm and GitHub Actions.
3. Lint and format: add ESLint and Prettier together with the first larger
   TypeScript module; for one small package, strict `tsc` plus `.editorconfig`
   is sufficient.
4. Branch protection on `main` (requires the repository owner).

## 6. Decisions for the project lead

- Repository license (MIT and Apache-2.0 are both compatible with the
  candidates above).
- Target chain.
- Team vesting schedule (see `tokenomics.md`).
- Treasury signer set, threshold and timelock delay.

## Implemented

- `packages/tokenomics`: the approved 21,000,000 ARL allocation table,
  deep-frozen at runtime, a fail-closed validator, and a deterministic
  basis-point share calculation.
- 20 tests covering totals, the approved table, release rules, immutability
  and rejection of invalid tables.
