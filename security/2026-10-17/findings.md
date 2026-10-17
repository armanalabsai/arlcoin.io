# Findings

Severity: Critical, High, Medium, Low, Informational.

Status values:

- **Fixed:** changed in the repository.
- **Mitigated:** the risk is reduced by a procedure or a configuration.
- **Accepted:** an owner decision, with the reason recorded.

No critical finding, and no vulnerability in contract code that an attacker could exploit.

| ID   | Severity | Title                                                                                               | Location                                                          | Status                                   |
| ---- | -------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------- |
| H-01 | High     | About 79% of the supply is held by Safes that share the same three owners, 2-of-3                   | `contracts/script/ARLDeployer.sol:74-88`, `docs/mainnet-plan.md`  | Mitigated (custody procedure)            |
| M-01 | Medium   | Launch liquidity positions are held by the Safes, not locked on chain                               | `packages/deploy/src/pool.ts` (mint recipient)                    | Accepted (12-month hold policy)          |
| M-02 | Medium   | A 1-of-1 guardian can cancel every treasury operation, including its own removal                    | `contracts/src/ARLTimelock.sol:43`                                | Mitigated (guardian key held offline)    |
| M-03 | Medium   | The Public Launch batch reverts if anyone trades between the two pool batches                       | `packages/deploy/src/pool.ts:349`, runbook step 7                 | Fixed (runbook, PR #55)                  |
| M-04 | Medium   | Founder allocation unlocked at TGE; Team pool not yet in vesting wallets                            | `contracts/src/ARLAllocation.sol:20,23`                           | Accepted (owner decision, public)        |
| L-01 | Low      | The deploy screen checks creation code but not constructor arguments                                | `apps/dapp/lib/deploySteps.ts:154-168`                            | Fixed (runbook check, PR #55)            |
| L-02 | Low      | Push payments in escrows: a blocklisting token could block both parties                             | `contracts/src/ComputePayment.sol:265-266`, `ARLJobs.sol:181,238` | Accepted (ARL only; not deployed at TGE) |
| L-03 | Low      | Signal group roots are set by the group admin and not derived on chain                              | `contracts/src/ARLAnonymousSignal.sol:112-137`                    | Accepted (documented trust model)        |
| I-01 | Info     | ERC-20 `approve` race; `permit` front-running                                                       | OpenZeppelin `ERC20`, `ERC20Permit`                               | Accepted (standard behavior)             |
| I-02 | Info     | Tokens sent to a vesting wallet later vest on its schedule; lost beneficiary keys are unrecoverable | `contracts/src/ARLVestingWallet.sol`                              | Accepted (documented)                    |
| I-03 | Info     | After expiry, a client can refund a submitted but unevaluated job                                   | `contracts/src/ARLJobs.sol:204-214`                               | Accepted (ERC-8183 model)                |
| I-04 | Info     | Staking rounding dust and direct transfers stay in the contract                                     | `contracts/src/ARLStakingRewards.sol`                             | Accepted (documented)                    |

## Details

### H-01 Shared custody of the role Safes

- **What happens.** All eleven role Safes have the same three owners at a 2-of-3 threshold. At TGE they hold 16.5M ARL directly. The 1M ARL treasury sits behind the 48-hour timelock, and the 3.5M ARL in vesting release to Safes with the same owners.
- **Failure path.** Two owner keys are compromised, for example by phishing or a shared backup. The holder of those keys can move every Safe balance and the pool positions at once.
- **Mitigation.**
  - Each owner signs from a separate hardware wallet on a separate device, with an offline seed.
  - No two owners share a device or a backup.
  - After launch, the large Safes (Public Launch, Community & Staking, Ecosystem & Growth) move to 3-of-5 with independent signers.
  - This is a Safe configuration; no contract change is needed.

### M-01 Liquidity positions not locked on chain

- **What happens.** The Uniswap v3 position NFTs are minted to the Liquidity and Public Launch Safes. The 12-month hold is a policy (`docs/launch-route.md`), so 2 of 3 owners can withdraw at any time.
- **Option kept for later.** Transferring the position NFTs to `ARLTimelock` would make every withdrawal visible 48 hours ahead and cancellable by the guardian. No new code is needed. The decision stays with the owners.

### M-02 Guardian can freeze the treasury

- **What happens.** `CANCELLER_ROLE` can cancel any pending operation, including one that revokes the guardian.
- **Failure path.** A hostile or compromised guardian freezes 1M ARL. It cannot move those funds.
- **Mitigation.**
  - The guardian key is held offline by a person who is not a role-Safe owner.
  - The guardian Safe can later be raised to 2-of-3 without a contract change.

### M-03 Public Launch batch ordering

- **What happens.** Each mint requires 99.9% of its ARL amount. Once someone trades, the price is inside the range and an ARL-only mint fails. Nothing is deposited.
- **Fix.** The runbook now requires collecting both owner signatures for the Public Launch batch before the Liquidity batch is executed, and executing it within seconds.

### M-04 Founder and Team unlock

- **What happens.**
  - The Founder Safe receives 2.1M ARL unlocked at TGE.
  - The Team pool, 900k ARL, is assigned per grant into vesting wallets after TGE (`docs/tokenomics-economic-spec.md`).
- **Status.** Both are owner decisions and both are published.

### L-01 Deploy arguments

- **What happens.** A contract address follows from the deployer and nonce alone, so a replaced run file with different constructor arguments would still produce the expected addresses.
- **Fix.** The runbook now requires two checks before signing: the run file's SHA-256, and each displayed argument against `docs/mainnet-plan.md`.
