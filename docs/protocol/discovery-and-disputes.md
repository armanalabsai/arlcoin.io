# Discovery and disputes (Phase 8)

Status: **design**, 14 November 2026. Phase 8 of the
[master architecture and roadmap](../architecture/MASTER-ARCHITECTURE-ROADMAP.md). Contract changes
named here are proposals; none is deployed without separate owner approval.

## Discovery

- **Source of truth:** ERC-8004 IdentityRegistry (who the agent is, its owner and endpoints) and
  `arl-reputation/1` scores computed from evaluator outcomes.
- **Index:** an off-chain indexer reads identities, ARL service registrations (the dApp's Network
  screen already reads them) and job outcomes; it serves search through the Agent API
  (`developer-experience.md`).
- **Matching:** filter by capability, accepted workload classes and policies, price range;
  rank by verified score, number of distinct clients and recency. Ranking is advisory: every input
  is re-checkable on chain, and unscored agents are shown as "no verified history", never hidden.

## Disputes

| Stage                          | Today (live)                                     | Proposal                                                                                                                    |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Raise                          | Anyone, with a bond, inside the challenge window | Dispute evidence must be an `arl-evidence/2` bundle plus the challenger's reasons                                           |
| Rule                           | Arbiter Safe 2-of-3 (`resolve`)                  | Written procedure: each signer re-runs `checkEvidence` and the policy, records a reasoned ruling                            |
| Penalty                        | Losing voters' or challenger's bonds burned      | Unchanged                                                                                                                   |
| Decentralise (contract change) | —                                                | Timelocked arbiter, then `resolveWithProof` for provable specs; VRF committee selection from a stake-weighted validator set |

## Validator set (contract change, later)

Stake-weighted registry with entry and exit delays, ERC-8004 identity per validator, VRF selection
excluding parties linked to the client or provider, replacement of non-accepting members. Designed
in `docs/verifiable-execution.md`; scheduled after the pilot so the design uses real data.
