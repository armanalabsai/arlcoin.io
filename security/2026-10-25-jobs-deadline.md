# Jobs deadline: two external reports (2026-10-25)

Two independent researchers reported how `ARLJobs` and `ARLVerifiedEvaluator` behave around a
job's deadline. Both were reproduced on `main` at `f12604c` (and, for `ARLJobs`, at the bounty
scope commit `00d9056`, where the contract is identical), and against the runtime code of the
Base Mainnet and Base Sepolia deployments, which matches those sources byte for byte outside the
immutable slots. Severity follows [docs/bug-bounty.md](../docs/bug-bounty.md).

| ID  | Severity | Title                                                                    | Location                                                            | Status |
| --- | -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------ |
| B-1 | Low      | The evaluator could complete or reject a funded job after its deadline   | `contracts/src/ARLJobs.sol` (`complete`, `reject`)                  | Fixed  |
| B-2 | Low      | A late-funded or late-submitted job could be refunded after its approval | `contracts/src/ARLVerifiedEvaluator.sol` (`accept`, `_startVoting`) | Fixed  |

## B-1: evaluator actions after the deadline

`fund` and `submit` refused to run at or after `expiredAt`, but `complete` and `reject` did not.
After the deadline the escrow of a submitted job went to whoever transacted first: the evaluator
(paying the provider) or anyone calling `claimRefund` (refunding the client). No funds were lost
or locked; the outcome departed from the documented rule that the deadline returns the escrow.

Fix: `complete`, and `reject` of a funded job, revert with `JobExpiredAlready` from `expiredAt`
on. After the deadline a funded job only leaves through `claimRefund`. The client can still cancel
an Open job at any time.

## B-2: refund of an approved job

`ARLVerifiedEvaluator` checked at `configure` that the vote window and two challenge windows fit
before the deadline, but voting starts when the provider submits, which can be much later (the
client may fund late). A committee could then approve the work and the deadline pass during the
challenge window; `claimRefund` returned the escrow to the client and `finalize` could no longer
pay the provider. No funds were lost or locked (the escrow returned to its depositor), but the
provider went unpaid for approved work, against `docs/jobs.md`.

Fix: members can only `accept`, and voting can only start, while the vote window and two
challenge windows still end before the deadline (`ExpiryTooSoon` otherwise). Every decision ends
its challenge window at least one challenge window before the deadline, and anyone can finalize it
in that time. `closeUndecided` also works after the deadline (it refunds through `claimRefund`),
so members who accepted and did not vote are still slashed.

## Deployments

Contracts cannot be upgraded. The pair deployed at deployer nonces 21 and 22 on Base Mainnet
(`0x6c8A…997F`, `0x3a5d…5F34`) holds no jobs and is retired: the SDK now names the fixed pair
planned at nonces 25 and 26, and the escrow paid in USDC (nonces 23 and 24) is built from the fixed
code ([docs/mainnet-services.md](../docs/mainnet-services.md)). For jobs on evaluators deployed
before the fix (including Base Sepolia), the SDK refuses to fund, and a provider refuses to work
on, a job whose evaluation no longer fits before its deadline (`checkEvaluationFits`).

## Tests

- `contracts/test/ARLJobs.t.sol`: `test_RevertWhen_EvaluatorActsAtOrAfterExpiry`,
  `test_evaluatorActsUntilTheSecondBeforeExpiry`, `test_clientRejectsOpenJobAfterExpiry`.
- `contracts/test/ARLVerifiedEvaluator.t.sol`: late accept and late voting refused, an evaluation
  that just fits pays the provider, the reported attack with the SDK defaults, `closeUndecided`
  after the deadline, `resolve` after the deadline.
- `contracts/test/invariant/ARLVerifiedEvaluatorInvariant.t.sol`:
  `invariant_decisionsSettleBeforeTheDeadline`.
- The researchers' proofs of concept fail against the fixed contracts at the new checks; their
  control cases still pass.
