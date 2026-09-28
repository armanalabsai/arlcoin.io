# Phase 1 Security Analysis

Status: internal review and automated testing only. **ARL has not been
audited.** No contract is deployed.

The allocation model changed on 2026-09-27 (11 allocations; the Ecosystem
Reserve was removed). `ARLAllocation`, `ARLToken`, the deployment planner,
deployer, verifier and rehearsal were changed with it. This is a new
security-sensitive revision: evidence gathered for the previous model does not
carry over and must be re-reviewed for this one.

## Scope

`contracts/src/ARLToken.sol` (including `ERC20Permit`), `ARLAllocation.sol`, `ARLVestingWallet.sol`,
`ARLTimelock.sol`, and their use of OpenZeppelin Contracts v5.6.1.

## Assumptions

- OpenZeppelin v5.6.1 `ERC20`, `VestingWallet`, `TimelockController` and their
  dependencies are correct (audited upstream; see `open-source.md`).
- The Safe contract used for the treasury is a correctly configured 3-of-5 Safe.
- The treasury guardian is a separate, correctly configured Safe whose signers
  are disjoint from the treasury Safe's.
- Deployment passes correct, explicit timestamps and the intended holder
  addresses. The contracts validate ordering but cannot validate intent.
- Block timestamps are accurate to within seconds; vesting boundaries are
  not sensitive to small drift.

## Threats and controls

| Threat                                            | Control                                                                                                                                                                                                                                                     | Evidence                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supply above 21M                                  | Mint only in constructor; no mint function; constructor total check                                                                                                                                                                                         | Unit test, ABI allowlist, invariants                                                                                                                                                                                                                                                                             |
| Hidden admin                                      | No `Ownable`/`AccessControl` on the token                                                                                                                                                                                                                   | `test_NoAdminOrMintFunctions`                                                                                                                                                                                                                                                                                    |
| Early vesting release                             | Linear period starts at `cliffEnd`                                                                                                                                                                                                                          | Boundary tests at `cliffEnd − 1`, `cliffEnd`, `cliffEnd + 1`; invariant `NoInvestorsReleaseBeforeCliff`                                                                                                                                                                                                          |
| Over-release                                      | Unmodified OpenZeppelin release accounting                                                                                                                                                                                                                  | Fuzzed repeated releases; invariant `VestingNeverOverReleases`                                                                                                                                                                                                                                                   |
| Beneficiary transfer of unvested tokens           | `transferOwnership`/`renounceOwnership` revert                                                                                                                                                                                                              | Unit, fuzz and invariant tests                                                                                                                                                                                                                                                                                   |
| Founder key loss or theft (M-3)                   | Founder recipient must be a contract (a dedicated Safe) off local Anvil; checked by the plan and by the verifier                                                                                                                                            | `test_RevertWhen_FounderHasNoCodeWhenRequired`, `test_RevertWhen_VerifyFounderHasNoCode`; rehearsal with Safe v1.5.0 on Anvil                                                                                                                                                                                    |
| Allocation drift (M-2 model)                      | 11 constants, one recipient and one `_mint` each; plan and verifier keyed per allocation; every holder distinct                                                                                                                                             | `contract-consistency.test.ts`; `test_RevertWhen_AllocationsSwapped`, `test_RevertWhen_VerifySharedHolder`; rehearsal negatives                                                                                                                                                                                  |
| Unapproved vesting schedule deployed              | Planner, `ARLDeployPlan` and the verifier reject any schedule other than 12 + 36 calendar months; a placeholder vesting start is accepted only on local Anvil and Base Sepolia                                                                              | `test_BaseSepoliaAllowedByGateButNeedsCanonicalSafes`, `test_RevertWhen_ScheduleDurationsNotApproved`, `test_RevertWhen_VerifyPlanScheduleNotApproved`; planner tests; rehearsal                                                                                                                                 |
| Fake Safe at a Safe role                          | Off local Anvil every Safe role must run the Safe v1.5.0 proxy code and point to a canonical singleton (`safe-global/safe-deployments`) with the canonical code hash; checked by the plan and by the verifier                                               | `test_RevertWhen_SafeRoleIsNotASafeProxy`, `test_RevertWhen_SafePointsToUnlistedSingleton`, `test_RevertWhen_VerifySafeRoleIsNotASafeProxy`; rehearsal with Safe v1.5.0 on Anvil                                                                                                                                 |
| Treasury bypass                                   | Timelock holds funds; Safe-only roles; 48-hour delay                                                                                                                                                                                                        | Unit and fuzz tests; invariant `TreasuryOnlyPaysThroughTimelock`                                                                                                                                                                                                                                                 |
| Delay lowered via timelock                        | 48-hour floor in `updateDelay`                                                                                                                                                                                                                              | `test_RevertWhen_DelayLoweredBelowFloorThroughTheTimelock`                                                                                                                                                                                                                                                       |
| Role takeover                                     | No external admin; role changes pass the delay                                                                                                                                                                                                              | `test_RevertWhen_RoleGrantedOutsideTheTimelock`                                                                                                                                                                                                                                                                  |
| Open execution (L-3)                              | Constructor rejects `address(0)` as proposer, executor or guardian; verifier re-checks the zero address holds no role                                                                                                                                       | `test_RevertWhen_ZeroExecutor`, `testFuzz_RevertWhen_ZeroInAnyRoleList`; rehearsal                                                                                                                                                                                                                               |
| Treasury Safe compromise (M-1)                    | Independent guardian Safe can cancel any pending operation within the 48-hour delay                                                                                                                                                                         | `test_GuardianCanCancelPendingOperation`; invariant `GuardianIsCancellerOnly`                                                                                                                                                                                                                                    |
| Guardian overreach                                | Guardian holds only `CANCELLER_ROLE`; must not be a proposer or executor; verifier asserts its exact roles                                                                                                                                                  | `test_RevertWhen_GuardianSchedules`, `test_RevertWhen_GuardianExecutes`, `test_RevertWhen_Verify*Guardian*`                                                                                                                                                                                                      |
| Guardian compromise (griefing)                    | **Accepted.** A hostile guardian can cancel every operation, including its own replacement; it cannot move funds. Recovery is social or legal                                                                                                               | Documented in `token-design.md`                                                                                                                                                                                                                                                                                  |
| Overflow                                          | Solidity 0.8 checked arithmetic; max product 7×10²⁴ × 1.6×10⁸ ≪ 2²⁵⁶                                                                                                                                                                                        | Fuzzing over the full `uint64` time range                                                                                                                                                                                                                                                                        |
| Reentrancy                                        | ARL is a plain ERC-20 with no hooks; `VestingWallet` updates state before transfer                                                                                                                                                                          | Slither `reentrancy-*` clean on ARL code                                                                                                                                                                                                                                                                         |
| Permit replay or forgery                          | OpenZeppelin `ERC20Permit`: EIP-712 domain with chain ID and contract address, sequential nonces, deadline, low-`s` check                                                                                                                                   | `ARLTokenPermit.t.sol` (replay, expiry, wrong signer, other chain, high-`s`, fuzz)                                                                                                                                                                                                                               |
| Permit front-running                              | A consumed permit makes a later identical `permit` call revert; the allowance is unaffected. Integrators must tolerate an already-used permit                                                                                                               | Documented                                                                                                                                                                                                                                                                                                       |
| Claim drained or repeated                         | Merkle proof over `(index, account, amount)` with double-hashed leaves; one `BitMaps` flag per index; tokens go only to the listed account; no owner, admin, pause, upgrade or root change                                                                  | `ARLMerkleDistributor.t.sol` (tampered amount, account, index and proof, double claim, fuzzed two-entry tree); invariants `FundsReconcile`, `EachEntryPaysExactlyOnce`; rehearsal                                                                                                                                |
| Unclaimed launch tokens stuck or diverted         | After `claimEnd`, `sweep` sends the whole balance to the fixed `returnTo` (the Public Launch Safe); callable by anyone                                                                                                                                      | `test_SweepReturnsTheRemainderToTheAllocationSafe`; rehearsal                                                                                                                                                                                                                                                    |
| Launch deployed before its terms are approved     | `DeployDistributor` runs only on local Anvil and Base Sepolia (shared network gate); the list must be a Public Launch list within 5,000,000 ARL                                                                                                             | `DeployDistributor.t.sol`; rehearsal                                                                                                                                                                                                                                                                             |
| Deployment to Base Mainnet or an unapproved chain | `networkGate` (Solidity and planner) refuses Base Mainnet unconditionally and every chain except local Anvil and Base Sepolia; checked at script entry, in `validate` and in `ARLDeployer.deploy`; no flag, environment variable or config field affects it | `test_NetworkGate`, `testFuzz_NetworkGateOpensOnlyLocalAndBaseSepolia`, `test_RevertWhen_BaseMainnetFullyConfigured`, `test_RevertWhen_BaseMainnetPlanFile`, `test_RevertWhen_DeployerCalledWithoutValidation`, `test_RevertWhen_RunOnBaseMainnet`; planner tests; rehearsal on chain-8453 and chain-84532 Anvil |
| Double initialization                             | No initializers; constructors only                                                                                                                                                                                                                          | Design                                                                                                                                                                                                                                                                                                           |

## Mutation checks

Each deliberate defect was introduced, the suite run, and the defect reverted:

| Mutant                                          | Caught by                                                  |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Vesting beneficiary can be transferred          | 2 unit/fuzz tests and 6 invariants                         |
| Public `mint` added to the token                | `test_NoAdminOrMintFunctions`, ABI allowlist               |
| Timelock delay floor removed from `updateDelay` | `test_RevertWhen_DelayLoweredBelowFloorThroughTheTimelock` |
| Zero-address check on role lists removed        | 4 tests (zero proposer, zero executor, fuzz, deploy)       |
| Zero guardian allowed                           | `test_RevertWhen_ZeroGuardian`                             |
| Guardian may also be proposer or executor       | `test_RevertWhen_GuardianIsProposerOrExecutor`             |
| Executor list not checked                       | 3 tests                                                    |
| Guardian not granted the canceller role         | 3 tests, invariant `GuardianIsCancellerOnly`               |
| Guardian also granted proposer or executor      | 3-4 tests each, invariant `GuardianIsCancellerOnly`        |
| Founder code check removed from the plan        | `test_RevertWhen_FounderHasNoCodeWhenRequired`             |
| Founder code check removed from the verifier    | `test_RevertWhen_VerifyFounderHasNoCode`                   |
| Split Founder plan accepted                     | `test_RevertWhen_PlanHasFounderTranches`                   |

## Slither 0.11.6

- ARL code (`--filter-paths "lib/|test/" --exclude-dependencies`): **0
  findings**, 102 detectors. CI fails on any low-or-higher finding. The three
  `timestamp` comparisons in `ARLMerkleDistributor` (claim window open or
  closed) are suppressed inline: the window is days long, so block-timestamp
  drift of seconds cannot change an outcome that matters. The `calls-loop` findings in the `CreateSafes`
  deployment script (one Safe created and checked per role, 12 in total) are
  suppressed inline: it is a script, not a deployed contract.
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

- Lost beneficiary keys cannot be recovered by the vesting wallet. Recovery
  depends on the beneficiary being a Safe and on its owners keeping a signing quorum.
- The Safe's threshold is not enforced by ARL contracts.
- Production deployment parameters (vesting start, holder Safe addresses, launch parameters) are
  not decided; Base Mainnet is hard-locked in the deployment tooling until they are.
- `ERC20Permit` accepts EOA signatures only; smart-contract wallets use `approve` or Permit2.
- Compiler warnings from `contracts/lib/` are silenced (`ignored_warnings_from`): upstream OpenZeppelin `ECDSA` uses `error` as an identifier, which solc 0.8.36 flags as a future keyword. ARL code still reports all warnings.
- No external audit. Symbolic checks (Halmos) prove ten properties within bounded inputs; this
  is not full formal verification. Scope for the audit: `docs/audit-scope.md`.
