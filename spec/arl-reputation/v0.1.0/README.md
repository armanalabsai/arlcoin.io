# arl-reputation/1 (v0.1.0)

Status: **v0.1.0**, 14 November 2026. Phase 2D of the
[master architecture and roadmap](../../../docs/architecture/MASTER-ARCHITECTURE-ROADMAP.md).
Reference implementation: [`@arl/protocol`](../../../packages/protocol/src/reputation.ts). Test
vectors: [`vectors.json`](vectors.json).

An agent's ARL score comes only from **verified outcomes**. No contract changes: the deployed
`ARLVerifiedEvaluator` already writes every finalized job to the canonical ERC-8004
ReputationRegistry.

## Write path (on chain, live)

On `finalize` the evaluator calls `giveFeedback(providerAgentId, value, 0, "arl-verified",
<tier name>, "", "", voteHash)`: value **100** for an approved job, **0** for a rejected one. It
writes only when the job's provider owns `providerAgentId` in the IdentityRegistry, and a failing
registry never blocks settlement.

## Read path (off chain)

1. Read feedback with the deployed evaluators as the **only allowed clients**
   (`getSummary(agentId, [evaluator], "arl-verified", "")` and the individual records). Feedback
   anyone else writes is never counted (tested on a fork in `docs/verifiable-execution.md`).
2. Join each record with its `ARLJobs` job through the vote hash and job events: client, budget,
   token, final time, whether a dispute was raised.
3. Add **expired** outcomes: funded jobs refunded after their deadline (`claimRefund`), which the
   evaluator does not write; the provider took the job and did not deliver.
4. Compute the score with `reputationScore`.

## Score

| Outcome     | Value | Note                                                         |
| ----------- | ----- | ------------------------------------------------------------ |
| `completed` | 100   | approved and paid                                            |
| `rejected`  | 0     | rejected by the committee or by a dispute ruling             |
| `expired`   | 0     | funded, not delivered before the deadline                    |
| `failed`    | —     | the committee did not decide: not the provider's doing, excluded |

- **Weight per outcome:** `(1 + log10(1 + whole token units of the budget)) × 0.5^(age / 180 days)`.
  Budgets in different tokens are not priced against each other; the logarithm keeps one large job
  from dominating.
- **Per-client cap:** no client may contribute more than 25 % of the weight (scaled down against
  everyone else's weight, keeping its own success ratio). One counterparty cannot buy a reputation
  with self-dealing jobs: in the vectors, 20 large approved jobs from one client and three
  rejections from three others give 25 %, not ~100 %.
- **Minimum history:** no score is published below 3 counted outcomes from 2 distinct clients
  (`score_bps` is `null`).
- **Result:** `score_bps` from 0 to 10,000, plus the counts of outcomes, clients, completed,
  rejected, expired and disputed jobs.

Wash trading still costs real money: every counted outcome is a funded escrow whose committee
locked bonds, and the cap limits what one client can add. Validators' own reputation (votes on
the winning side, absences, slashes) follows the same rules in a later version.
