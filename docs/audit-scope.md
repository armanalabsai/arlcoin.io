# External Audit Scope

Status: **prepared for an external audit; no audit has been performed.** Nothing is deployed.
Base Mainnet is hard-locked in the deployment tooling (see
[`deployment.md`](deployment.md#network-gate)).

This document is the hand-over for the audit firm. It lists what is in scope, what the
contracts are meant to guarantee, how that is already tested, and what is deliberately out of
scope.

## Code under review

Repository: `gokturkalazdaghan-dot/ARLCOIN`, branch `main`. The audited commit is fixed when the
engagement starts.

Compiler: solc 0.8.36, optimizer on (200 runs), EVM `cancun`, no via-IR. Dependencies (pinned
submodules): OpenZeppelin Contracts v5.6.1 (unmodified), solidity-datetime v2.2.0 (deployment
tooling only).

### Contracts (deployed on-chain)

| File                                     |   nSLOC | Purpose                                                                                                                 |
| ---------------------------------------- | ------: | ----------------------------------------------------------------------------------------------------------------------- |
| `contracts/src/ARLToken.sol`             |      35 | ERC-20 + ERC20Permit; mints the fixed 21,000,000 ARL to 11 holders in the constructor; no mint, burn, admin, pause      |
| `contracts/src/ARLAllocation.sol`        |      16 | The 11 allocation constants                                                                                             |
| `contracts/src/ARLVestingWallet.sol`     |      34 | OpenZeppelin `VestingWallet` with a cliff and an immutable beneficiary                                                  |
| `contracts/src/ARLTimelock.sol`          |      36 | OpenZeppelin `TimelockController` with a 48-hour floor, no external admin and a cancel-only guardian                    |
| `contracts/src/ARLMerkleDistributor.sol` |      56 | Public Launch Merkle claim with a fixed root, claim window and return address; no owner                                 |
| `contracts/src/ARLStakingRewards.sol`    |     186 | Stake ARL, earn ARL from a funded pool (Synthetix `StakingRewards` via curvefi/unipool-fork, MIT); no owner, no minting |
| **Total**                                | **363** |                                                                                                                         |

### Deployment tooling (runs off-chain, decides what is deployed)

| File                                       | nSLOC | Purpose                                                                                        |
| ------------------------------------------ | ----: | ---------------------------------------------------------------------------------------------- |
| `contracts/script/ARLDeployPlan.sol`       |   330 | Loads and validates a deployment plan; network gate; Safe v1.5.0 proxy and singleton checks    |
| `contracts/script/ARLDeployer.sol`         |    41 | Deploys the system from a validated plan                                                       |
| `contracts/script/ARLVerify.sol`           |   167 | Post-deployment verification of every holder, balance, schedule and role                       |
| `contracts/script/DeployARL.s.sol`         |    36 | Entry point: gate, validate, deploy, verify                                                    |
| `contracts/script/VerifyARL.s.sol`         |    34 | Read-only re-verification                                                                      |
| `contracts/script/DeployDistributor.s.sol` |    74 | Deploys a Public Launch distributor from a checked claim list                                  |
| `contracts/script/CreateSafes.s.sol`       |   208 | Creates the 12 role Safes with the canonical Safe v1.5.0 contracts                             |
| `packages/deploy/src/*.ts`                 |     — | Planner, claim-list builder, config builder, deployment manifest and circulating-supply reader |

## Intended properties

1. Total supply is exactly 21,000,000 ARL forever: minted once in the constructor, no mint or
   burn path, no admin.
2. The 11 allocations go to 11 distinct holders in the exact approved amounts.
3. Vesting wallets release nothing before the cliff end, then linearly to the vesting end; the
   beneficiary can never change.
4. Every treasury operation waits at least 48 hours; the delay can never go below 48 hours;
   the guardian can only cancel.
5. The Merkle distributor pays each listed entry once, only to its listed account, only before
   `claimEnd`; after `claimEnd` the whole balance can only go to the fixed `returnTo`.
6. The deployment tooling refuses Base Mainnet and every chain other than local Anvil and Base
   Sepolia, and refuses any Safe role that is not a genuine Safe v1.5.0 proxy of a canonical
   singleton.
7. Staking never pays rewards that were not funded, never touches staked principal to pay
   rewards, and returns only unallocated rewards to the distributor, between periods.

## Existing verification

| Method               | Scope                                                                                             | Result                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Unit and fuzz tests  | Foundry, 10,000 fuzz runs per test                                                                | 185 tests pass                                  |
| Invariant tests      | Supply, allocations, vesting, timelock roles, distributor funds (256 runs × depth 128)            | pass                                            |
| Deployment rehearsal | Real Safe v1.5.0 on Anvil; 55 negative cases; Base Sepolia fork with the canonical Safe contracts | pass                                            |
| Slither 0.11.6       | `src/` and `script/`, 102 detectors, CI fails on Low or higher                                    | 0 findings                                      |
| Aderyn 0.6.8         | `src/`                                                                                            | 3 reported; triage below                        |
| Halmos 0.3.3         | Symbolic checks in `contracts/test/symbolic/ARLSymbolic.t.sol`, run in CI                         | 10 of 11 proven; 1 solver timeout               |
| Mythril 0.24.8       | Runtime bytecode of the four deployed contracts, 900 s each                                       | 9 reported, all triaged below; none exploitable |

### Aderyn triage

| Finding                                              | Location              | Assessment                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1 Contract locks Ether without a withdraw function | `ARLVestingWallet`    | False positive. The inherited OpenZeppelin `VestingWallet.release()` releases ETH to the beneficiary on the same schedule; nothing is locked.                                           |
| L-1 Large numeric literal                            | `ARLAllocation` (12×) | Style. Underscore-grouped whole-token amounts are intentional and are parsed by a consistency test against `packages/tokenomics`. No change.                                            |
| L-2 Unchecked return                                 | `ARLTimelock` line 43 | Informational. `_grantRole(CANCELLER_ROLE, guardian)` always returns true there: the constructor rejects a guardian that is a proposer or executor, so the role cannot already be held. |

### Mythril triage

Mythril analysed runtime bytecode only, so immutables (token, claim end, beneficiary) are zero
in its model. Findings:

| Finding                                         | Contract, function                                                                  | Triage                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SWC-101 integer underflow (High)                | `ARLTimelock.onERC1155BatchReceived`                                                | False positive. Raised in the ABI decoder of OpenZeppelin's `ERC1155Holder` on malformed calldata; the function only returns its selector. The exact reported transaction and a 10,000-run fuzz of arbitrary calldata change no state (`test_MythrilSwc101CalldataChangesNothing`, `testFuzz_ERC1155BatchReceivedChangesNothing`). |
| SWC-123 requirement violation (Medium)          | `ARLMerkleDistributor.sweep`                                                        | Artefact of the runtime-only model: the token immutable is zero, so the nested call reverts. On chain `sweep` is callable only after the claim window and sends only to `returnTo` (tests and Halmos `check_SweepOnlyToReturnAddressAfterEnd`).                                                                                    |
| SWC-116 block timestamp (Low) ×5                | `ARLToken.permit`, `ARLMerkleDistributor.claim`/`sweep`, `ARLVestingWallet.release` | By design: permit deadline, claim window and vesting schedule are time-based; validator timestamp drift of seconds does not change an outcome that matters.                                                                                                                                                                        |
| SWC-107 call to user-supplied address (Low)     | `ARLVestingWallet.release(address)`                                                 | Upstream OpenZeppelin `VestingWallet`: releases any ERC-20 to the fixed beneficiary; accounting is updated before the transfer.                                                                                                                                                                                                    |
| SWC-113 multiple calls in one transaction (Low) | `ARLVestingWallet.release`                                                          | Same upstream function; expected.                                                                                                                                                                                                                                                                                                  |

### Halmos (symbolic)

Every argument of a `check_` function is symbolic, so a pass holds for all values, within
Halmos' bounds (loops unrolled twice; `bytes` calldata up to 1,024 bytes). CI runs every check
except `check_VestedIsMonotonic`.

| Check                                      | Property                                                                                    | Result         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------- |
| `check_NoCallChangesSupply`                | No call, from any caller with any calldata, changes total supply                            | pass           |
| `check_TransferConservesSupplyAndBalances` | A transfer of any amount moves exactly that amount and keeps supply at 21,000,000 ARL       | pass           |
| `check_TransferFromNeverExceedsAllowance`  | `transferFrom` never moves more than the allowance                                          | pass           |
| `check_NothingVestsBeforeCliffEnd`         | Nothing vests before the cliff end                                                          | pass           |
| `check_VestedNeverExceedsAllocation`       | The vested amount never exceeds the allocation                                              | pass           |
| `check_EverythingVestedAtEnd`              | Everything is vested from the vesting end                                                   | pass           |
| `check_BeneficiaryIsImmutable`             | No caller can change the beneficiary                                                        | pass           |
| `check_DelayFloorHolds`                    | Even through the timelock itself, the delay never goes below 48 hours                       | pass           |
| `check_ClaimPaysOnlyListedEntriesOnce`     | A claim succeeds only for a listed entry, pays exactly its amount to its account, only once | pass           |
| `check_SweepOnlyToReturnAddressAfterEnd`   | No sweep before `claimEnd`; after it the whole balance goes to `returnTo` only              | pass           |
| `check_VestedIsMonotonic`                  | The vested amount never decreases                                                           | solver timeout |

The monotonicity check divides a product of symbolic timestamps, which the SMT solver does not
finish within 120 s. The same property is covered by fuzz tests and the
`VestingNeverOverReleases` invariant, and the vesting math is unmodified OpenZeppelin code.

## Out of scope

- OpenZeppelin Contracts v5.6.1 and Safe v1.5.0 themselves (audited upstream; used unmodified).
- The website (`apps/web`) and documentation.
- Economic parameters that are not yet decided: vesting start, launch amount, claim window,
  per-address limits, liquidity parameters.

## Known limitations

See [`security-analysis.md`](security-analysis.md#known-limitations).

## Questions for the auditors

1. Is any path able to change total supply or move a holder's tokens without its consent?
2. Can a Merkle claim be replayed, redirected or forged, including via second-preimage tricks?
3. Can the treasury delay be bypassed or the guardian gain any power beyond cancelling?
4. Can the deployment tooling be driven to deploy to Base Mainnet or to accept a fake Safe?
