# arl-evidence/2 (v0.2.0)

Status: **v0.2.0**, 14 November 2026. Phase 5 of the
[master architecture and roadmap](../../../docs/architecture/MASTER-ARCHITECTURE-ROADMAP.md).
Reference implementation: [`@arl/protocol`](../../../packages/protocol/src/evidence.ts)
(`checkEvidence`). Test vectors: [`vectors.json`](vectors.json).

One JSON file that lets anyone check, with only that file and a Base RPC, what was asked, what was
delivered, how it was judged and how the money moved.

```json
{
  "version": "arl-evidence/2",
  "settlement": { "version": "arl-evidence/1", "…": "on-chain record from arl-verifier bundle" },
  "task": { "version": "arl-task/1", "…": "…" },
  "proof": { "version": "arl-proof/1", "…": "…" },
  "policy": { "version": "arl-policy/1", "…": "…" },
  "policy_hash": "0x…"
}
```

## Checking a bundle

1. **On chain** (unchanged, existing tool): `arl-verifier verify-bundle <rpc> settlement.json
   <fromBlock>` re-reads every record of `settlement` (job, configuration, submission, votes,
   decision, finalization, escrow settlement) and exits 1 on any mismatch.
2. **Offline** (`checkEvidence`), that the four documents agree:
   - the task, proof and policy each parse under their spec; `policy_hash` matches the policy;
   - the task follows its policy (`checkTaskAgainstPolicy`) and the proof fits the task
     (`checkProofAgainstTask`);
   - the proof names this chain, escrow and job id;
   - the job's on-chain description is `arl-task:<task hash> <uri>`, its budget is the task's, and
     its `specHash`, tier, threshold and committee size are the task's;
   - the submitted deliverable is the proof's (`submittedDeliverable`);
   - votes come only from the committee, once each, and every approval names the submitted
     deliverable; a committee approval has at least the threshold of approvals;
   - finalization and escrow settlement agree.

The result is the outcome (`completed`, `rejected` or `pending`), the number of approvals and
rejections, and `overturned`: whether the settlement differs from the committee's decision, which
only a ruled dispute can cause.

## What a valid bundle shows

That a funded job was opened for exactly this task, the provider submitted exactly this proof, the
committee judged it under exactly this policy, and the escrow paid or refunded accordingly. For a
`reexec` task the approvals are re-executions of a pinned spec; for other classes they are bonded
judgments under the policy's rules. It does not prove that a non-deterministic result is
semantically correct; that is what the policy, bonds and the challenge window are for.

## Storage

Bundles are content: store them where tasks and proofs live (IPFS or HTTPS) and reference them by
SHA-256. The storage service itself is decision D-7 of the roadmap.
