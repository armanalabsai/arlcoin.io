# Security hardening (Phase 4)

Status: **plan and findings**, 14 November 2026. Phase 4 of the
[master architecture and roadmap](../architecture/MASTER-ARCHITECTURE-ROADMAP.md). Sources:
[baseline](../baseline.md), [incident-response.md](../incident-response.md),
[bug-bounty.md](../bug-bounty.md), [audit remediation](../audit-2026-10-28-remediation.md),
[verifiable-execution.md](../verifiable-execution.md). Nothing here was changed on chain.

## Current posture

| Area            | State                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Contract design | No owner, no upgrade, no pause on any ARL contract; fixed supply token                                                |
| Testing         | 391 Foundry tests (unit, fuzz, invariant), Halmos, Slither, Aderyn, Mythril, CodeQL in CI on every pull request       |
| External review | Internal audit 2026-10-17; external report 2026-10-28 fixed in #105; auditor confirmation **not received**            |
| Bug bounty      | Live since 2026-10-05, paid in ARL from the Grants / Bug Bounty Safe; several reports accepted and paid or being paid |
| Custody         | Allocations in dedicated Safes; treasury behind a 48-hour timelock with a cancel-only guardian                        |
| Deployment      | One deployer wallet signs every deployment (no ongoing power over deployed contracts)                                 |
| Disputes        | Arbiter Safe 2-of-3 for disputed verified jobs only; cannot receive escrow or slashed funds                           |
| Monitoring      | Site uptime and contract record checks; **no alert on protocol events** (jobs, votes, disputes, large stakes)         |

## Findings and remediation priorities

| #   | Finding                                                                                                 | Severity (operational)     | Action                                                                                                                                                                | Owner |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| S-1 | Mainnet `ARLJobs` is v2; v3 (balance-delta check in `fund`, `claimRefundTo`) is merged but not deployed | Medium                     | Decide D-1: redeploy v3 escrows and v4 evaluators bound to them before the pilot, or limit the pilot to ARL and USDC (both plain ERC-20s, which v2 handles correctly) | Owner |
| S-2 | Auditor confirmation of the 2026-10-28 fixes missing                                                    | Medium                     | Send the confirmation request with the #105 diff; record the answer in the remediation document                                                                       | Team  |
| S-3 | Single deployer key                                                                                     | Medium                     | Future deployments from a deployer Safe (Safe `CreateCall`); keep the EOA for nothing else                                                                            | Owner |
| S-4 | No alerting on protocol events                                                                          | Medium                     | Add a monitor for `JobFunded`, `Voted`, `Disputed`, `Slashed`, `FeedbackFailed` and stake changes with alerts to the owner                                            | Team  |
| S-5 | Arbiter Safe is a central dispute authority                                                             | Low (by design, disclosed) | Signers on separate hardware wallets; written ruling procedure (Phase 8); timelock then proof resolution                                                              | Owner |
| S-6 | `incident-response.md` still names the testnet operator and Base Sepolia checks                         | Low                        | Done in this change: the document names the mainnet services                                                                                                          | Team  |
| S-7 | `ARLVerifiedEvaluator` is not in the bytecode manifest                                                  | Low                        | Add it so `npm run check:bytecode` covers every deployed contract                                                                                                     | Team  |
| S-8 | Staking holds user funds with no reward period                                                          | Low (no risk of loss)      | Fund the first period (token utility P-1) or say so publicly                                                                                                          | Owner |

## Threat scenarios for the verified flow

| Scenario                                            | Control in place                                                     | Added by this roadmap                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Provider and validators collude to approve bad work | Client proposes the committee, provider approves it; bonds; disputes | Policy rule `threshold × bond ≥ budget` (arl-policy/1)                                         |
| Bribed validators                                   | Bonds burned on overturn                                             | Same rule makes corruption cost at least the budget                                            |
| Model-produced verdicts gamed by prompt injection   | —                                                                    | Model verdicts are evidence only, capped by budget, weights pinned (arl-policy/1, arl-proof/1) |
| Fake reputation through self-dealing                | Only evaluator feedback counts                                       | Per-client cap and minimum history (arl-reputation/1)                                          |
| Tampered evidence shown to users                    | On-chain re-read (`verify-bundle`)                                   | Cross-document checks (`checkEvidence`, arl-evidence/2)                                        |
| Spec or proof swapped after the fact                | Hashes on chain                                                      | Task hash in the job description; proof hash or result hash submitted                          |
| Arbiter key compromise                              | 2-of-3 Safe, disputed jobs only, no funds                            | Ruling procedure and alerts on `Resolved`                                                      |
| RPC or registry failure                             | Gas-capped registry calls; deadline refunds                          | Alerts on `FeedbackFailed`                                                                     |

## Acceptance for leaving Phase 4

- S-1 decided and, if redeploying, done through the Deploy screen with records written by the
  existing record CLIs;
- S-2 answered or a second independent review commissioned;
- S-4 alerts firing in a test;
- no open High or Medium bug bounty report.
