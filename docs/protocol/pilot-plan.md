# Pilot plan (Phase 9)

Status: **plan**, 14 November 2026. Phase 9 of the
[master architecture and roadmap](../architecture/MASTER-ARCHITECTURE-ROADMAP.md).

## Entry conditions

- Phase 4 acceptance met (decision D-1 made, alerts live, no open High or Medium report).
- Operator-run committee of 3 validators staked on the mainnet evaluator (decision D-2), each with
  at least 3 × 100 ARL free stake and ETH for gas, keys held by the owner's team.
- `@arl/protocol` specs released (done: arl-task/1, arl-proof/1, arl-policy/1, arl-reputation/1,
  arl-evidence/2).

## Scope

| Item        | Pilot setting                                                           |
| ----------- | ----------------------------------------------------------------------- |
| Partners    | 2–3 teams (integrators who answered the outreach, n8n builders)         |
| Workloads   | `reexec` (deterministic code and tests) first; `model-assisted` second  |
| Policies    | `reexec-standard`, then `model-assisted-review`                         |
| Budget caps | ≤ 100 ARL or ≤ 100 USDC per job; ≤ 5,000 ARL total escrowed at any time |
| Duration    | 30 days                                                                 |
| Disclosure  | Pilot page states the operator-run committee and the arbiter Safe       |

## KPIs

| KPI                                      | Target                                    |
| ---------------------------------------- | ----------------------------------------- |
| Paid jobs completed                      | ≥ 100                                     |
| Distinct clients                         | ≥ 5                                       |
| Jobs settled without dispute             | ≥ 95 %                                    |
| Disputes resolved within policy windows  | 100 %                                     |
| Median time from submit to settlement    | ≤ vote window + challenge window + 1 hour |
| Validator vote participation             | 100 % (no absence burns)                  |
| Loss of funds                            | 0                                         |
| Evidence bundles passing `checkEvidence` | 100 %                                     |
| Developer time to first verified job     | ≤ 30 minutes                              |

## Evaluation

Weekly report from evidence bundles and the indexer: jobs, outcomes, disputes, timings, incidents.
After 30 days a post-pilot report decides: public launch of the verified flow, a second pilot, or
fixes first. Every number in the report links to its on-chain evidence.
