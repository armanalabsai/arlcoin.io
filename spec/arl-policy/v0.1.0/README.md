# arl-policy/1 (v0.1.0)

Status: **v0.1.0**, 14 November 2026. Phase 2C of the
[master architecture and roadmap](../../../docs/architecture/MASTER-ARCHITECTURE-ROADMAP.md).
Reference implementation: [`@arl/protocol`](../../../packages/protocol/src/policy.ts). Built-in
policies: [`policies/`](policies). Test vectors: [`vectors.json`](vectors.json).

A verification policy says how a class of task is checked. An `arl-task/1` names its policy in
`verification.policy` as `arl-policy/1:<id>`. The contracts enforce the committee shape, windows
and bonds within their own bounds; a policy narrows those bounds and adds the rules validators
follow when they vote. A validator that votes against its policy can be disputed and slashed.

## Document

| Field                      | Rule                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `version`                  | `"arl-policy/1"`                                                                                                           |
| `id`                       | lowercase letters, digits and dashes, ≤ 48                                                                                 |
| `workload_classes`         | non-empty subset of `reexec`, `attested`, `model-assisted`, `review`                                                       |
| `tiers`                    | non-empty subset of `fallback`, `reexecution`, `attested`                                                                  |
| `committee`                | `{ min_size, max_size }` within 1–7                                                                                        |
| `vote_window_seconds`      | `[min, max]` within the evaluator bounds (600–604,800)                                                                     |
| `challenge_window_seconds` | `[min, max]` within 86,400–2,592,000                                                                                       |
| `min_bond_floor`           | ARL base units; tasks must set at least this floor (Base Mainnet evaluators require 100 ARL)                               |
| `bond_covers_budget`       | ARL tasks: `threshold × max(floor, budget / 10) ≥ budget`. Not applied to USDC tasks (bonds are in ARL; it needs a price)  |
| `required_evidence`        | evidence kinds every task under this policy must require                                                                   |
| `model.allowed`            | whether a model verdict may decide an acceptance rule                                                                      |
| `model.max_budget`         | per token, the highest budget at which a model verdict may decide; required when models are allowed                        |
| `model.models`             | `{ name, weights_sha256 }` a validator may use; empty means any model pinned by its weights hash                           |

A `reexec` policy never allows model verdicts: re-execution decides.

## Validator vote (`decideVote`)

A validator checks each acceptance rule of the task itself and records an outcome per rule:
`by: "check"` (its own deterministic check or review) or `by: "model"` (a model verdict, with the
weights SHA-256). It votes **approve only if every rule has an admissible passing outcome**. A
model outcome is admissible only if the policy allows models, the task's budget is within the
policy's cap for its token, and, when the policy lists models, the weights are listed. A missing,
failed or inadmissible outcome is a **reject**, never an approve.

This is how open models such as NVIDIA Nemotron are used: as a validator's tool for checking
non-deterministic work up to a budget cap, with the model and weights pinned in the proof
(`arl-proof/1`), the vote still bonded and every decision still open to dispute.

## Built-in policies

| Policy                  | Classes          | Tier          | Committee | Vote window | Challenge window | Min bond floor | Model verdicts                       |
| ----------------------- | ---------------- | ------------- | --------- | ----------- | ---------------- | -------------- | ------------------------------------ |
| `reexec-standard`       | `reexec`         | `reexecution` | 3–7       | 1–24 h      | 24–72 h          | 100 ARL        | no                                   |
| `model-assisted-review` | `model-assisted` | `attested`    | 3–7       | 1–48 h      | 24–72 h          | 100 ARL        | yes, up to 100 ARL or 100 USDC       |
| `fallback-review`       | `review`         | `fallback`    | 1         | 10 min–24 h | 24–48 h          | 100 ARL        | no                                   |

The `model-assisted-review` model list is empty until the owner pins the model (decision D-6 of
the roadmap); until then any model pinned by its weights hash is admissible within the cap.
