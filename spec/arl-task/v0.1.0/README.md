# arl-task/1 (v0.1.0)

Status: **v0.1.0**, 14 November 2026. Phase 2A of the
[master architecture and roadmap](../../../docs/architecture/MASTER-ARCHITECTURE-ROADMAP.md).
Reference implementation: [`@arl/protocol`](../../../packages/protocol/src/task.ts) (TypeScript)
and [`arl_protocol.task`](../../../packages/python-sdk/src/arl_protocol/task.py) (hashing, Python).
Test vectors: [`vectors.json`](vectors.json).

`arl-task/1` describes one agent-to-agent task: the work, how it is accepted, how it is paid and
how it is verified. It is an off-chain document. Its hash is committed on chain through the
existing contracts (`ARLJobs` and `ARLVerifiedEvaluator`), which are unchanged.

## Document

A JSON object with exactly these fields; unknown fields are refused.

| Field                                   | Type                                                                    | Rule                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `version`                               | `"arl-task/1"`                                                          | exact                                                                                  |
| `title`                                 | string                                                                  | 1–120 characters, not blank                                                            |
| `description`                           | string                                                                  | at most 4,000 characters (may be empty)                                                |
| `workload.class`                        | `reexec` \| `attested` \| `model-assisted` \| `review`                  | how the work can be checked                                                            |
| `workload.spec_uri`, `workload.spec_hash` | `https://` or `ipfs://` URL; `0x` + 64 lowercase hex                  | together or not at all; **required for `reexec`** (an `arl-reexec/1` spec and its hash) |
| `acceptance[]`                          | `{ id, rule }`                                                          | 1–20 rules; `id` lowercase letters, digits, dashes (≤ 32), unique; `rule` ≤ 500 chars  |
| `deliverable.media_type`                | string                                                                  | lowercase media type, for example `application/json`                                   |
| `deliverable.max_bytes`                 | integer                                                                 | optional, ≥ 1                                                                          |
| `payment.token`                         | `ARL` \| `USDC`                                                         | the escrow that holds the budget                                                       |
| `payment.budget`                        | decimal string                                                          | base units of the token (ARL 18 decimals, USDC 6), > 0, ≤ 2²⁵⁶ − 1                    |
| `payment.deadline_hours`                | integer                                                                 | 1–8,760 and ≥ vote window + 2 × challenge window                                       |
| `verification.policy`                   | `arl-policy/1:<id>`                                                     | the verification policy (Phase 2C)                                                     |
| `verification.tier`                     | `fallback` \| `reexecution` \| `attested`                               | the evaluator tier                                                                     |
| `verification.committee_size`           | integer                                                                 | 1–7                                                                                    |
| `verification.threshold`                | integer                                                                 | `fallback`: exactly 1 of 1; otherwise a strict majority of at least 2                  |
| `verification.vote_window_seconds`      | integer                                                                 | 600–604,800                                                                            |
| `verification.challenge_window_seconds` | integer                                                                 | 86,400–2,592,000 (Base Mainnet minimum is 24 hours)                                    |
| `verification.bond_floor`               | decimal string                                                          | ARL base units, > 0; the contract takes `max(floor, budget / 10)`                      |
| `evidence[]`                            | `result-manifest` \| `logs` \| `artifact` \| `attestation` \| `model-verdict` | non-empty, no repeats                                                            |

Cross-field rules:

- `reexec` uses the `reexecution` or `fallback` tier and requires `result-manifest` evidence.
- `attested` cannot use the `reexecution` tier and requires `attestation` evidence.
- `model-assisted` requires `model-verdict` evidence. A model verdict is evidence for the
  validators' vote, never a settlement decision on its own (architecture decision A-4).

The bounds are those of the deployed contracts (`ARLJobs.MIN_DURATION`/`MAX_DURATION`,
`ARLVerifiedEvaluator.MAX_COMMITTEE`, vote and challenge window bounds and `_checkThreshold`), so a
task that parses can be opened and configured on Base Mainnet.

## Hash

`taskHash = keccak256(utf8(canonical JSON of the task))`. Canonical JSON: object keys sorted, no
whitespace, strings escaped as ECMAScript `JSON.stringify` does, safe integers only (no floats),
the same rules as `arl-reexec/1`. Amounts are decimal strings so they never pass through floats.

## On chain

| Contract call                                     | Value                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ARLJobs.createJob(..., description, ...)`        | `arl-task:<taskHash> <task URI>`, at most 1,024 bytes; anyone can fetch the task and check it against the hash |
| `ARLJobs.createJob(..., expiredAt, ...)`          | chain time + `deadline_hours` × 3,600                                                                           |
| `ARLVerifiedEvaluator.configure(..., specHash, …)` | the `arl-reexec/1` spec hash for a `reexec` task (validators re-run it, unchanged); otherwise `taskHash`        |
| `configure(..., tier, threshold, windows, bond)`  | from `verification`                                                                                             |
| `ARLJobs.setBudget` / `fund`                      | `payment.budget`                                                                                                |

The committee is proposed by the client and must not contain the client or the provider; the
provider approves it (`approveCommittee`), as today.

## Compatibility

An `arl-reexec/1` spec is not replaced: a `reexec` task points to it and commits its hash, so the
reference validator (`arl-verifier`) runs unchanged. The vectors include a task over the
repository's example spec (`packages/verifier/examples/busybox-summary.json`) and check that
`@arl/protocol` and `@arl/verifier` canonicalize it to the same hash.
