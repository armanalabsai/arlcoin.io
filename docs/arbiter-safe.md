# Arbiter Safe

Status: **Script and checks built and tested on a Base Sepolia fork; no arbiter Safe exists yet.**

The arbiter of [`ARLVerifiedEvaluator`](../contracts/src/ARLVerifiedEvaluator.sol) rules on
disputed jobs only ([verifiable-execution.md](verifiable-execution.md)). It is a Safe v1.5.0, not a
single key, so no single compromised or lost key can rule or block a ruling.

## Rules

| Rule                                                                                   | Enforced by                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| At least 3 signers, a majority threshold of at least 2 (2-of-3, 3-of-5)                | `CreateArbiterSafe.checkSigners`                                |
| Canonical Safe v1.5.0 contracts only (factory, `SafeL2`, fallback), by code hash       | `CreateSafes.safeContracts`                                     |
| The evaluator is deployed only with a genuine Safe v1.5.0 proxy of threshold ≥ 2       | `DeploySepoliaEvaluator.checkArbiter` (Base Sepolia)            |
| Each signer is a separate hardware wallet with its own seed, kept in a separate place  | Operational; never stored in the repository                     |
| The arbiter's signers are not validators, clients or providers of the jobs it rules on | Operational; a signer with a conflict does not sign that ruling |

The arbiter cannot receive escrow or slashed bonds and cannot act on undisputed jobs; the evaluator
contract enforces this regardless of who signs.

## Create

```sh
cd contracts
ARL_ARBITER_OWNERS=<signer1>,<signer2>,<signer3> ARL_ARBITER_THRESHOLD=2 \
  forge script script/CreateArbiterSafe.s.sol:CreateArbiterSafe \
  --rpc-url https://sepolia.base.org --broadcast --account <keystore> --slow
```

The script checks the Safe's owners and threshold on chain after creating it. Then deploy the
evaluator with `ARL_ARBITER=<safe>` (`script/DeploySepoliaEvaluator.s.sol`), which refuses any
arbiter that is not such a Safe.

## Ruling on a dispute

1. Read the dispute: `Disputed(jobId, challenger, evidence)`, the job's `specHash`, the submitted
   deliverable and every `Voted` event.
2. Re-run the job from its spec with the reference verifier ([`packages/verifier`](../packages/verifier/src)) on a machine
   none of the involved parties controls, and compare the result hash.
3. Propose `resolve(jobId, approve, reason)` from the Safe, with `reason` = the hash of the written
   ruling (inputs, commands, result hash). Signers check it independently before signing.
4. The ruling must be executed before the job's `expiredAt`; after it, the escrow returns to the
   client and `release` unlocks every bond, with nothing slashed.

## Signer rotation

The evaluator stores the Safe's address, not its signers, so signers change without redeploying
anything.

| Event                              | Action (a Safe transaction, signed at the current threshold)                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Planned rotation (every 12 months) | `swapOwner(prevOwner, oldOwner, newOwner)`, one signer at a time; check `getOwners()` after each               |
| A signer device is lost            | `swapOwner` to a new device right away, using the remaining signers; the lost device's address is retired      |
| A signer key may be compromised    | Same as lost, before anything else; review every Safe transaction since the suspected exposure                 |
| Adding or removing a signer        | `addOwnerWithThreshold` / `removeOwner`, keeping at least 3 signers and a majority threshold of at least 2     |
| Two signers lost at once (2-of-3)  | The Safe can no longer rule; disputes fall back to the deadline refund. Deploy a new evaluator with a new Safe |

After every change: record the date, the transaction hash and the new owner list (addresses only)
in the operations log, and confirm `getThreshold()` and `getOwners()` on chain.

## Migration to the timelock (Phase 2)

`arbiter` is immutable. Moving rulings behind `ARLTimelock` means deploying a new evaluator whose
arbiter is the timelock, for new jobs only. Its jobs then need
`expiredAt ≥ now + voteWindow + 2 × challengeWindow + 48 h`, so that a ruling can pass the timelock
delay before the deadline.
