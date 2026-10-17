# ARL Protocol security audit report

|                 |                                              |
| --------------- | -------------------------------------------- |
| Version         | 1.0                                          |
| Date            | 17 October 2026                              |
| Reviewed commit | `ab7595bc39c9256641fffc70103575c03a1cce9d`   |
| Fixes           | PR #55 (runbook procedure for M-03 and L-01) |

## Summary

All evidence (raw tool outputs, triage, findings) is public at
[github.com/armanalabsai/arlcoin.io/tree/main/security/2026-10-17](https://github.com/armanalabsai/arlcoin.io/tree/main/security/2026-10-17).

This audit was multi-layer and built on open-source tools. It covered the nine ARL contracts,
the deployment scripts and the signed Base Mainnet run for the launch on 23 October 2026.

- **No critical finding, and no exploitable vulnerability in contract code.**
- **Contract design.** The token has no owner, mint, pause or upgrade. There is no proxy and no `delegatecall`.
- **Deployment run.** All four transactions in `apps/dapp/public/plans/8453-deploy.json` carry the bytecode built from the reviewed commit, and their constructor arguments equal `docs/mainnet-plan.md`.
- **Findings.** 1 high, 4 medium, 3 low and 4 informational, all concerning custody, launch procedure or documented design choices. Every finding is closed: fixed in the launch procedure, or mitigated or accepted with the reason recorded (`findings.md`).

## Layers

| Layer                 | Tool                                               | Result                                                                                       | Evidence                                                        |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Static analysis       | Slither 0.11.6, 102 detectors                      | 0 results                                                                                    | `static/slither.json`, `static/slither.sarif`                   |
| Static analysis       | Aderyn 0.6.8                                       | 16 results (2 H, 14 L), all false positive or by design                                      | `static/aderyn.json`, `static/aderyn.sarif`, `static/aderyn.md` |
| Unit, fuzz, invariant | Foundry 1.8.3                                      | 271/271 pass; 29 fuzz tests at 10,000 runs; 5 invariant suites, 32,768 calls each, 0 reverts | `dynamic/forge-test.json.gz`                                    |
| Long campaign         | Foundry, `deep` profile                            | 271/271 pass; 200,000 runs per fuzz test; invariants 2,000 × 256 (512,000 calls each)        | `dynamic/forge-test-deep.json.gz`                               |
| Symbolic proofs       | Halmos 0.3.3                                       | 11/11 properties proved (bounded)                                                            | `symbolic/halmos.json`                                          |
| Symbolic execution    | Mythril 0.24.8 on runtime bytecode (TGE contracts) | No exploitable issue (see triage)                                                            | `symbolic/mythril-*.json.gz`                                    |
| Fork rehearsal        | Base Mainnet fork                                  | Full launch day passes with the real signers                                                 | `docs/mainnet-runbook.md`                                       |
| Manual and AI triage  | ARL team                                           | 12 findings, 0 open                                                                          | `triage.md`, `findings.md`                                      |

## Areas checked

| Area                          | Result                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Access control and ownership  | Token: none. Vesting: beneficiary fixed. Timelock: no external admin, 48-hour floor, independent canceller. Custody risk: H-01, M-02. |
| Supply and ERC-20 logic       | Fixed 21,000,000 ARL minted once. Unmodified OpenZeppelin ERC20 and ERC20Permit. No-supply-change proved by Halmos.                   |
| Reentrancy and external calls | `nonReentrant` or checks-effects-interactions everywhere. ARL has no hooks.                                                           |
| Arithmetic                    | Solidity 0.8 checked arithmetic. Escrow amounts bounded to `uint128`.                                                                 |
| Visibility                    | ABI of the token is pinned by CI (`scripts/check-token-abi.mjs`).                                                                     |
| Events                        | Every state change emits an event.                                                                                                    |
| Gas and DoS                   | No unbounded loops over user data in TGE contracts. Escrow push payments: L-02.                                                       |
| Base and bridges              | ARL is native to Base. No bridge contract.                                                                                            |
| Upgradeability                | None: no proxy, so no storage layout risk.                                                                                            |

## Findings

See `findings.md` for the table and the details of each finding, and `triage.md` for every tool
result and why it was or was not a finding.

## Reproduce

```
cd contracts
slither . --foundry-compile-all --filter-paths "lib/|test/" --exclude-dependencies --json slither.json --sarif slither.sarif
aderyn . --src src -o aderyn.json
forge test --json > forge-test.json
FOUNDRY_DYNAMIC_TEST_LINKING=false halmos --match-contract ARLSymbolic --solver-timeout-assertion 120000
```

`.github/workflows/security-audit.yml` runs the same checks on every change and on `main`:

- Slither must report nothing.
- Every Aderyn result must be in the triaged baseline (`security/aderyn-baseline.json`).
- Every test must pass, and every fuzz test must run at least 10,000 times.
- Halmos must prove every property.
- Mythril runs weekly.

## Limits

- This is an internal audit by the project team, not an independent third-party audit.
- The Halmos proofs are bounded, not full formal verification.
- The internals of OpenZeppelin, Safe and Uniswap v3 are trusted as published.
- Off-chain components and market risk are out of scope (`scope.md`).
