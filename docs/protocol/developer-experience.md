# Developer experience (Phase 6)

Status: **plan**, 14 November 2026. Phase 6 of the
[master architecture and roadmap](../architecture/MASTER-ARCHITECTURE-ROADMAP.md).

## What developers have today

| Path       | Package                          | State                                                    |
| ---------- | -------------------------------- | -------------------------------------------------------- |
| No code    | `n8n-nodes-arl` (npm)            | Live; n8n Cloud verification pending                     |
| TypeScript | `arl-protocol-sdk` (npm)         | Live: jobs, verified jobs, compute streams, ARL purchase |
| Python     | `arl_protocol` (GitHub install)  | Live; PyPI release needs an account                      |
| Protocol   | `@arl/protocol` (repository)     | Task, proof, policy, reputation, evidence (Phases 2–5)   |
| Validator  | `arl-verifier` (repository CLI)  | Re-execution, watch, evidence bundles                    |
| Guide      | arlcoin.io/build, dev.to article | Live                                                     |

## Deliverables

### 6.1 SDK support for the protocol documents

- `arl-protocol-sdk`: re-export `@arl/protocol` and add `openTask(clients, task, opts)` that
  validates the task, checks it against its policy and performs `createJob`, `configure`,
  `setBudget` and `fund` from `onchainTerms`; `submitProof(clients, proof)`; `getEvidence(jobId)`.
  Semver: new minor version (0.2.0), no breaking change to 0.1.0 functions.
- `arl_protocol` (Python): `task_hash` and `proof_hash` exist; add `open_task` mirroring the
  TypeScript flow; publish to PyPI as `arl-protocol` once the owner creates the account.
- `n8n-nodes-arl`: an "Open Task" operation taking an `arl-task/1` document.

### 6.2 Read API (Agent API v1)

Stateless, read-only HTTP JSON served by a Cloudflare Pages Function next to the existing supply
API, backed by an indexer of `ARLJobs` and evaluator events (no private keys anywhere):

| Method and path                           | Returns                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/jobs/{escrow}/{id}`          | Job state, configuration, verdict, settlement                           |
| `GET /api/v1/evidence/{escrow}/{id}`      | `arl-evidence/1` settlement record (task, proof, policy when published) |
| `GET /api/v1/agents/{agentId}/reputation` | `arl-reputation/1` score and counts                                     |
| `GET /api/v1/policies`                    | Built-in `arl-policy/1` documents and hashes                            |
| `POST /api/v1/tasks/check`                | Validation result and task hash for an `arl-task/1` document (no state) |

Every answer carries the block number it was read at, so clients can re-check it on chain.

### 6.3 Agent integrations

- **MCP server** (`@arl/mcp`): tools `arl_check_task`, `arl_task_hash`, `arl_get_job`,
  `arl_get_reputation`, `arl_check_evidence`, and `arl_prepare_job`, which returns unsigned
  transactions for the user's own wallet to sign. The server never holds a key.
- **Coinbase AgentKit action provider**: the same actions for AgentKit agents.
- **x402**: release `arl-escrow` v0.2.0 after decision D-4.

### 6.4 Onboarding

- arlcoin.io/build gains a "Verified task" section with one runnable example per language.
- A fork quickstart (`anvil --fork-url`) that completes one verified job end to end.

## Acceptance

A new developer, using only the documentation, completes a verified job on a Base fork in under
30 minutes, in TypeScript and in Python; every API answer can be re-checked on chain.
