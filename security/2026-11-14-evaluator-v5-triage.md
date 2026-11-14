# Evaluator v5: Aderyn results (2026-11-14)

`ARLVerifiedEvaluator.sol` changed for evaluator v5 (bug bounty reports of 2026-11-14): a refund
the escrow token refuses no longer blocks the bond settlement (`_refund`, `RefundDeferred`),
`expireDispute` closes a dispute the arbiter has not ruled on within `ARBITER_WINDOW`, and the
arbiter and the provider can no longer be a party or a committee member where they would have a
conflict. Aderyn reports fifteen results in the file (CI run of 3a7fc1f). Each was read against
the new code.

## Moved, verdict unchanged

Thirteen results are the ones triaged in
[2026-11-12-evaluator-v4-triage.md](2026-11-12-evaluator-v4-triage.md); the code on each line is
unchanged and only the line number moved.

| Result                    | Was | Now | Line                                                          |
| ------------------------- | --: | --: | ------------------------------------------------------------- |
| `reentrancy-state-change` | 245 | 254 | `jobs_.paymentToken()` in the constructor                     |
| `reentrancy-state-change` | 282 | 291 | `jobs.getJob(jobId)` in `configure`                           |
| `reentrancy-state-change` | 318 | 334 | `jobs.getJob(jobId).provider` in `approveCommittee`           |
| `reentrancy-state-change` | 335 | 352 | `jobs.getJob(jobId)` in `accept`                              |
| `reentrancy-state-change` | 380 | 397 | `jobs.getJob(jobId)` in `vote`                                |
| `reentrancy-state-change` | 485 | 501 | `jobs.getJob(jobId)` in `resolve`                             |
| `reentrancy-state-change` | 511 | 556 | `jobs.getJob(jobId).status` in `release`                      |
| `costly-loop`             | 291 | 302 | committee loop in `configure` (at most `MAX_COMMITTEE` = 7)   |
| `costly-loop`             | 604 | 649 | committee loop in `_unlock` (at most 7)                       |
| `require-revert-in-loop`  | 291 | 302 | one invalid member rejects the whole `configure`              |
| `large-numeric-literal`   | 142 | 142 | `REGISTRY_GAS = 300_000`                                      |
| `large-numeric-literal`   | 348 | 365 | basis-point divisor `10_000`                                  |
| `unchecked-return`        | 461 | 477 | `_unlock(jobId, 0, false)` in `finalize`: returns 0 unslashed |

## New

| Result                               | Verdict        | Reason                                                                                                                                                                                 |
| ------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reentrancy-state-change` (line 532) | False positive | `jobs.getJob(jobId)` in `expireDispute` is a view call on the immutable escrow, the function is `nonReentrant`, and the phase is already final when the escrow pays (as in `resolve`). |
| `unchecked-return` (line 531)        | False positive | `_unlock(jobId, 0, false)` in `expireDispute` slashes nobody, so it always returns 0 (same as `finalize`).                                                                             |

The `try`/`catch` around the refund in `_refund` was read by hand: it catches only the escrow's
own call, re-reverts errors of four bytes or fewer (the escrow's custom errors and out-of-gas), so
a caller cannot skip a refund by starving it of gas, and records any other token refusal with
`RefundDeferred`. Covered by `test_RevertWhen_RefundFailsWithoutAReason` and the three
deny-list tests in `ARLVerifiedEvaluator.t.sol`.
