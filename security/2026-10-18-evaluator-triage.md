# Aderyn triage: ARLVerifiedEvaluator, 18 October 2026

`ARLVerifiedEvaluator.sol` was added after the [17 October 2026 audit](2026-10-17/README.md) and is
not in its scope. Aderyn 0.6.8 (the CI `static` job) reports the results below for it; each is
reviewed here and listed in [`aderyn-baseline.json`](aderyn-baseline.json).

| Aderyn result                                                                        | Verdict        | Reason                                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H `reentrancy-state-change`, `ARLVerifiedEvaluator.sol:207, 242, 278, 292, 328, 431` | False positive | Each flagged call is `getJob` or `paymentToken` on the immutable `ARLJobs`; both are `view`, so the compiler issues a STATICCALL. Entry points that move funds are `nonReentrant`. |
| L `costly-loop`, `ARLVerifiedEvaluator.sol:251, 508`                                 | Accepted       | The loops run over the job's committee, capped at `MAX_COMMITTEE` = 7.                                                                                                             |
| L `large-numeric-literal`, `ARLVerifiedEvaluator.sol:111, 298`                       | Accepted       | `REGISTRY_GAS = 300_000` and the basis-point divisor `10_000`.                                                                                                                     |
| L `require-revert-in-loop`, `ARLVerifiedEvaluator.sol:251`                           | By design      | One invalid committee member must reject the whole `configure`.                                                                                                                    |
| L `unchecked-return`, `ARLVerifiedEvaluator.sol:393, 437`                            | Informational  | `_unlock(jobId, 0, false)` returns the burned total, which is always 0 when `slash` is false.                                                                                      |
