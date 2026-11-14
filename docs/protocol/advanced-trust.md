# Advanced trust (Phase 7)

Status: **evaluation plan**, 14 November 2026. Phase 7 of the
[master architecture and roadmap](../architecture/MASTER-ARCHITECTURE-ROADMAP.md). Each item ends
in a measured prototype or a documented "no"; none is adopted without owner approval.

| Item                                           | Question                                                                                   | Builds on                                               | Measure                                                                   | Go criterion                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Model-assisted verification                    | Can validators check non-deterministic work with an open model (NVIDIA Nemotron first)?    | `arl-policy/1` model allowance, `arl-proof/1` model ref | Agreement with human review on a labelled set; cost and latency per check | ≥ 95 % agreement on accepted cases at pilot budgets, cost below 5 % of budget |
| TEE attestation (`Attested` tier)              | Which quote format do validators accept (Intel TDX, AMD SEV-SNP, NVIDIA confidential GPU)? | Evaluator `Attested` tier (live)                        | Quote verification time, allowlist maintenance effort                     | One vendor verifiable by the reference validator                              |
| ZK-assisted reputation                         | Can an agent prove "score ≥ X from ≥ N clients" without revealing its history?             | Noir/UltraHonk and Semaphore stack in `zk/`             | Proof time in the browser, verifier gas                                   | Proof under 10 s, verification under 500k gas                                 |
| Proof-resolved disputes (`IExecutionVerifier`) | Which provable specs can replace the arbiter?                                              | Designed interface                                      | Proving cost for the `reexec` example spec                                | Cost below the job's bond                                                     |
| Encrypted evidence                             | Can private task inputs and outputs stay encrypted while validators still check them?      | Evidence store (D-7), TEE                               | Key handling model, failure modes                                         | A design that never puts plaintext on public storage                          |

The model-assisted evaluation uses a pinned open checkpoint, its weights hash recorded as in
`arl-proof/1`; the exact Nemotron model, license terms and hardware are decision D-6.
