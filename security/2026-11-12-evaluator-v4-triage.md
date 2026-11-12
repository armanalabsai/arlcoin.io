# Evaluator v4: Aderyn results (2026-11-12)

`ARLVerifiedEvaluator.sol` changed for evaluator v4 (approvals counted per deliverable; `release`
and `resolve` after the job's deadline). Aderyn reports thirteen results in the file. Each was
read against the new code.

## Moved, verdict unchanged

Twelve results are the ones triaged in [2026-10-18-evaluator-triage.md](2026-10-18-evaluator-triage.md);
the code on each line is unchanged and only the line number moved.

| Result                    | Was | Now | Line                                                          |
| ------------------------- | --: | --: | ------------------------------------------------------------- |
| `reentrancy-state-change` | 242 | 245 | `jobs_.paymentToken()` in the constructor                     |
| `reentrancy-state-change` | 279 | 282 | `jobs.getJob(jobId)` in `configure`                           |
| `reentrancy-state-change` | 315 | 318 | `jobs.getJob(jobId).provider` in `approveCommittee`           |
| `reentrancy-state-change` | 332 | 335 | `jobs.getJob(jobId)` in `accept`                              |
| `reentrancy-state-change` | 376 | 380 | `jobs.getJob(jobId)` in `vote`                                |
| `reentrancy-state-change` | 489 | 511 | `jobs.getJob(jobId).status` in `release`                      |
| `costly-loop`             | 288 | 291 | committee loop in `configure` (at most `MAX_COMMITTEE` = 7)   |
| `costly-loop`             | 579 | 604 | committee loop in `_unlock` (at most 7)                       |
| `require-revert-in-loop`  | 288 | 291 | one invalid member rejects the whole `configure`              |
| `large-numeric-literal`   | 141 | 142 | `REGISTRY_GAS = 300_000`                                      |
| `large-numeric-literal`   | 345 | 348 | basis-point divisor `10_000`                                  |
| `unchecked-return`        | 451 | 461 | `_unlock(jobId, 0, false)` in `finalize`: returns 0 unslashed |

## New

| Result                                                      | Verdict        | Reason                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H `reentrancy-state-change`, `ARLVerifiedEvaluator.sol:485` | False positive | New line in `resolve`: `jobs.getJob(jobId)` is read to see whether the escrow is still Submitted and before its deadline. `getJob` is `view` on the immutable `ARLJobs`, so the compiler issues a STATICCALL that cannot re-enter; `resolve` is `nonReentrant` and callable only by the arbiter. The state written after it is this job's verdict. |

## Removed

`unchecked-return` at the former line 495 (`_unlock(jobId, 0, false)` in `release`) no longer
exists: `release` now uses the returned total to burn the bonds of absent members.
