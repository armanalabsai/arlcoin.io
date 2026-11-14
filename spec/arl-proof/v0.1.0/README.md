# arl-proof/1 (v0.1.0)

Status: **v0.1.0**, 14 November 2026. Phase 2B of the
[master architecture and roadmap](../../../docs/architecture/MASTER-ARCHITECTURE-ROADMAP.md).
Reference implementation: [`@arl/protocol`](../../../packages/protocol/src/proof.ts)
(TypeScript) and [`arl_protocol.proof`](../../../packages/python-sdk/src/arl_protocol/proof.py)
(hashing, Python). Test vectors: [`vectors.json`](vectors.json), built on the
[`arl-task/1` vectors](../../arl-task/v0.1.0/vectors.json).

`arl-proof/1` is the envelope a provider publishes for one job. It binds the delivered result and
its evidence to the task (by task hash) and to the on-chain job (chain, escrow, job id). Only one
hash goes on chain, through the unchanged `ARLJobs.submit(jobId, deliverable, "")`.

**A proof is a claim.** Submitting it is not verification and payment is not proof of execution
(architecture principles). Validators check a proof under the task's verification policy
(`arl-policy/1`, Phase 2C) and vote; settlement follows only after the challenge window.

## Document

A JSON object with exactly these fields; unknown fields are refused.

| Field             | Type                                                         | Rule                                                                                         |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `version`         | `"arl-proof/1"`                                              | exact                                                                                        |
| `task_hash`       | `0x` + 64 lowercase hex                                      | the `arl-task/1` hash of the task this proof answers                                         |
| `chain_id`        | integer                                                      | `8453` on Base Mainnet                                                                       |
| `jobs`            | address                                                      | the `ARLJobs` escrow that holds the job                                                      |
| `job_id`          | decimal string                                               | the ARLJobs job id, > 0                                                                      |
| `deliverable`     | `{ uri, sha256, media_type, bytes }`                         | `https://` or `ipfs://`; SHA-256 of the bytes (64 lowercase hex); size in bytes               |
| `result_manifest` | `arl-reexec-result/1`                                        | required for `reexec` tasks, forbidden otherwise                                             |
| `evidence[]`      | `{ kind, uri, sha256, media_type, model? }`                  | at most 32 items; kinds from `arl-task/1`                                                    |
| `evidence[].model` | `{ name, weights_sha256, runtime }`                         | required for `model-verdict` evidence, forbidden for every other kind                        |

`model-verdict` evidence names the model (for example a pinned open NVIDIA Nemotron checkpoint),
the SHA-256 of the exact weights and the inference runtime, so any validator can re-run the same
model. A model verdict is evidence for a vote, never a decision (architecture decision A-4).

## Binding to the task

`checkProofAgainstTask(task, proof)` is the precondition for verification, checked without network
or chain access:

- `task_hash` equals the task's hash;
- the deliverable's media type equals the task's and its size is within `deliverable.max_bytes`;
- every evidence kind the task requires is present (`result_manifest` counts as
  `result-manifest`);
- a `reexec` task carries the `arl-reexec-result/1` manifest and its `spec_hash` equals the task's
  workload spec hash; other tasks carry none.

Validators additionally fetch every URI and check its SHA-256 before using it.

## Hashes

| Name                   | Value                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `proofHash`            | keccak256 of the canonical proof (same canonical JSON as `arl-task/1`)                                                         |
| submitted deliverable  | for a `reexec` task: keccak256 of the canonical `result_manifest` (what `arl-verifier` recomputes, unchanged); otherwise `proofHash` |

The vectors check that the `reexec` deliverable equals `resultHash` from `@arl/verifier`, so the
running reference validator needs no change.
