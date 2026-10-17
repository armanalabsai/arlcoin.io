# Triage notes

Every tool result was checked by hand against the code, with AI-assisted analysis. A
result counts as a finding only if a realistic caller or input reaches it and it causes a loss or
an operational failure. Everything else is a false positive or by design, and the reason is
recorded here.

## Slither 0.11.6 (`static/slither.json`, `static/slither.sarif`)

0 results with 102 detectors on 126 contracts (ARL code and deployment scripts; `lib/` and `test/`
excluded). Twelve detectors are silenced inline with `slither-disable-next-line`, each with a
reason next to it:

- **`timestamp`.** Reward periods, vesting and claim windows run for days. Drift of a few seconds does not change any outcome.
- **`incorrect-equality`.** These compare computed rates or amounts, never balances.
- **`reentrancy-benign` in `stakeWithPermit`.** The permit call goes to the immutable ARL token, which has no hooks, and the function is `nonReentrant`.

## Aderyn 0.6.8 (`static/aderyn.json`, `static/aderyn.sarif`, `static/aderyn.md`)

| Aderyn result                                                 | Verdict        | Reason                                                                                                                                                           |
| ------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H `contract-locks-ether`, `ARLVestingWallet.sol:22`           | False positive | The inherited OpenZeppelin `VestingWallet.release()` sends ETH to the beneficiary. Aderyn does not follow the inherited function.                                |
| H `reentrancy-state-change`, `ARLAnonymousSignal.sol:175`     | False positive | `verifier.verify` is declared `view`, so the compiler issues a STATICCALL that cannot change state. The verifier address is immutable.                           |
| L `large-numeric-literal`, `ARLAllocation.sol` (12 instances) | Accepted       | Allocation constants written as whole-token amounts times `UNIT`. A test in `packages/tokenomics` checks them against the TypeScript table.                      |
| L `require-revert-in-loop`, `ARLAnonymousSignal.sol:201`      | By design      | One invalid commitment must revert the whole call.                                                                                                               |
| L `unchecked-return`, `ARLTimelock.sol:43`                    | False positive | `_grantRole` returns false only if the role is already held. The constructor rejects a guardian that is also a proposer or executor, so the grant is always new. |

## Foundry fuzz and invariant (`dynamic/forge-test.json.gz`)

271 of 271 tests pass.

- **Fuzz.** 29 fuzz tests at 10,000 runs each (seed `0xa121`).
- **Invariant.** 5 invariant suites, each 256 runs × 128 depth = 32,768 calls, 0 reverts:
  - allocations reconcile;
  - each distributor entry pays exactly once;
  - the jobs balance equals the open escrow;
  - the staking accounting identity holds;
  - the compute balance equals the live escrow.

The long campaign (`FOUNDRY_PROFILE=deep`) also passed 271 of 271: 200,000 runs per fuzz test and
2,000 × 256 invariant runs (512,000 calls per suite). Result in
`dynamic/forge-test-deep.json.gz`.

## Halmos 0.3.3 (`symbolic/halmos.json`)

11 of 11 properties proved within bounds:

- no call changes the supply;
- `transfer` conserves supply and balances;
- `transferFrom` never exceeds the allowance;
- the vesting beneficiary is immutable;
- nothing vests before the cliff end;
- vesting is monotonic, never exceeds the allocation, and is complete at the end;
- the timelock delay floor holds;
- distributor claims pay only listed entries, once;
- sweeps go only to the return address, and only after the end.

## Mythril 0.24.8 (`symbolic/mythril-*.json.gz`)

Mythril runs symbolic execution on the runtime bytecode of the three contracts deployed at TGE, with 2 transactions deep.

| Contract           | Mythril result                                                     | Verdict        | Reason                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ARLVestingWallet` | SWC-107 external call to user-supplied address (`release(token)`)  | False positive | OpenZeppelin updates `_erc20Released[token]` before the transfer. A caller-chosen token can only affect its own entry, and the payout always goes to the fixed beneficiary.                                                                                                                                                               |
| `ARLVestingWallet` | SWC-113 DoS with failed call                                       | Accepted       | ETH release reverts only if the beneficiary cannot receive ETH. The beneficiary is a Safe, which can, and ARL releases are unaffected.                                                                                                                                                                                                    |
| `ARLVestingWallet` | SWC-116 timestamp dependence (×2)                                  | By design      | The vesting schedule is time-based by definition.                                                                                                                                                                                                                                                                                         |
| `ARLToken`         | SWC-116 timestamp dependence in `permit` (`0xd505accf`)            | By design      | EIP-2612 requires the signature deadline to be compared with `block.timestamp`.                                                                                                                                                                                                                                                           |
| `ARLTimelock`      | SWC-101 High, underflow in `onERC1155BatchReceived` (`0xbc197c81`) | False positive | This is the same result as in the earlier internal review (`docs/review-scope.md`): an artefact of the ABI decoder on malformed calldata. The call only returns the selector and changes no state. A test (`test_MythrilSwc101CalldataChangesNothing`) replays Mythril's transaction and a fuzz test sends arbitrary calldata; both pass. |

## Manual audit

The manual audit covered access control, supply, external calls, arithmetic, visibility,
events, gas and DoS, bridge exposure (none: ARL is native to Base) and proxies (none). The
results are in `findings.md`.

Two hypotheses were checked and rejected:

- **Nullifier aliasing (`n` and `n + p`) in `ARLAnonymousSignal`.** The verifier rejects public inputs at or above the field modulus (`zk/ARLSemaphoreVerifier.sol:577`).
- **Pool front-running at initialisation.** A pre-created pool above 0.20 USD makes the batch revert with nothing deposited (fork-tested). A pre-created pool below 0.20 USD is harmless, because the ARL-only range sits above the price.
