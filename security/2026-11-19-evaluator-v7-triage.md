# Evaluator v7: Aderyn results (2026-11-19)

`ARLVerifiedEvaluator.sol` changed for evaluator v7 (a rejection closed with `release` reaches
the reputation registry, and `configure` needs the provider to be named). The baseline lines for
the file were moved to the new line numbers; the code on each of those lines is unchanged, so
every verdict in [2026-11-14-evaluator-v5-triage.md](2026-11-14-evaluator-v5-triage.md) and
[2026-11-19-evaluator-v6-triage.md](2026-11-19-evaluator-v6-triage.md) stands.

## Changed

`release` now calls `_feedback(jobId, false)` as its last statement when the settled decision was
a rejection. The phase is set and the bonds are unlocked before that call, the function is
`nonReentrant`, and the call goes to the reputation registry with a gas cap inside a `try`, as on
the late paths of `finalize`, `resolve` and `expireDispute`. No state is written after it.
