# Phase 1 Security Analysis

Status: internal review and automated testing only. **ARL has not been
audited.** No contract is deployed.

## Scope

`contracts/src/ARLToken.sol`, `ARLAllocation.sol`, `ARLVestingWallet.sol`,
`ARLTimelock.sol`, and their use of OpenZeppelin Contracts v5.6.1.

## Assumptions

- OpenZeppelin v5.6.1 `ERC20`, `VestingWallet`, `TimelockController` and their
  dependencies are correct (audited upstream; see `open-source.md`).
- The Safe contract used for the treasury is a correctly configured 3-of-5 Safe.
- Deployment passes correct, explicit timestamps and the intended holder
  addresses. The contracts validate ordering but cannot validate intent.
- Block timestamps are accurate to within seconds; vesting boundaries are
  not sensitive to small drift.

## Threats and controls

| Threat                                  | Control                                                                            | Evidence                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Supply above 21M                        | Mint only in constructor; no mint function; constructor total check                | Unit test, ABI allowlist, invariants                                                                  |
| Hidden admin                            | No `Ownable`/`AccessControl` on the token                                          | `test_NoAdminOrMintFunctions`                                                                         |
| Early vesting release                   | Linear period starts at `cliffEnd`                                                 | Boundary tests at `cliffEnd − 1`, `cliffEnd`, `cliffEnd + 1`; invariant `NoFounderReleaseBeforeCliff` |
| Over-release                            | Unmodified OpenZeppelin release accounting                                         | Fuzzed repeated releases; invariant `VestingNeverOverReleases`                                        |
| Beneficiary transfer of unvested tokens | `transferOwnership`/`renounceOwnership` revert                                     | Unit, fuzz and invariant tests                                                                        |
| Reserve over the annual cap             | 1,830-day linear duration                                                          | Calendar-year test; fuzzed 366-day windows                                                            |
| Treasury bypass                         | Timelock holds funds; Safe-only roles; 48-hour delay                               | Unit and fuzz tests; invariant `TreasuryOnlyPaysThroughTimelock`                                      |
| Delay lowered via timelock              | 48-hour floor in `updateDelay`                                                     | `test_RevertWhen_DelayLoweredBelowFloorThroughTheTimelock`                                            |
| Role takeover                           | No external admin; role changes pass the delay                                     | `test_RevertWhen_RoleGrantedOutsideTheTimelock`                                                       |
| Overflow                                | Solidity 0.8 checked arithmetic; max product 7×10²⁴ × 1.6×10⁸ ≪ 2²⁵⁶               | Fuzzing over the full `uint64` time range                                                             |
| Reentrancy                              | ARL is a plain ERC-20 with no hooks; `VestingWallet` updates state before transfer | Slither `reentrancy-*` clean on ARL code                                                              |
| Double initialization                   | No initializers; constructors only                                                 | Design                                                                                                |

## Mutation checks

Each deliberate defect was introduced, the suite run, and the defect reverted:

| Mutant                                          | Caught by                                                  |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Vesting beneficiary can be transferred          | 2 unit/fuzz tests and 6 invariants                         |
| Public `mint` added to the token                | `test_NoAdminOrMintFunctions`, ABI allowlist               |
| Timelock delay floor removed from `updateDelay` | `test_RevertWhen_DelayLoweredBelowFloorThroughTheTimelock` |

## Slither 0.11.6

- ARL code (`--filter-paths "lib/|test/" --exclude-dependencies`): **0
  findings**, 102 detectors. CI fails on any low-or-higher finding.
- Including OpenZeppelin: 29 findings, all in upstream code and expected by
  design:

| Detector                                       | Location                              | Triage                                                       |
| ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| arbitrary-send-eth (High)                      | `TimelockController._execute`         | The timelock's purpose; gated by the executor role and delay |
| incorrect-equality, unused-return (Medium)     | `TimelockController`                  | Intentional state comparisons                                |
| timestamp, reentrancy-events, calls-loop (Low) | `VestingWallet`, `TimelockController` | Time-based by design; batch execution loop                   |
| assembly, low-level-calls, solc-version (Info) | OpenZeppelin utilities                | Upstream implementation detail                               |
| pragma (Info)                                  | ARL files                             | ARL pins `0.8.36`; OpenZeppelin uses `^0.8.20`               |

## Compiler

solc 0.8.36. Its three known bugs (`MisorderedNamedParametersInRequireWithCustomErrors`,
`MemoryByteArrayElementDeleteClearsWholeWord`, `SpillSlotCollisionAcrossMutualRecursion`)
do not apply: no named arguments in `require` with custom errors, no `delete`
on memory byte arrays, no via-IR. 0.8.37 (released 2026-09-10) was not chosen
because it is too new to have a track record.

## Known limitations

- Lost beneficiary keys cannot be recovered.
- The Safe's threshold is not enforced by ARL contracts.
- Deployment parameters (timestamps, holder addresses) are not yet reviewed —
  no deployment script exists.
- No external audit. No formal verification.
