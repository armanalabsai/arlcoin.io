# Deployment Tooling

Status: **local rehearsal only.** Nothing has been deployed to any public network. No production
address, key or RPC endpoint exists in this repository.

## Pipeline

```
contracts/deploy/config/<network>.json      public, source-controlled inputs
        │  node packages/deploy/src/cli.ts   validates, applies UTC calendar arithmetic
        ▼
contracts/deploy/plans/<network>.json       generated plan (git-ignored)
        │  forge script DeployARL            re-validates, deploys, verifies, records
        ▼
contracts/deploy/deployments/<chain>.json   deployed addresses (git-ignored)
        │  forge script VerifyARL            read-only verification, any time after
        ▼
      pass / fail with the name of the failed check
```

Values come from their single sources:

| Value                            | Source                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Allocation amounts, max supply   | `packages/tokenomics` (planner) and `ARLAllocation.sol` (cross-checked)                                           |
| Founder 24 + 36 months           | `packages/tokenomics` founder release                                                                             |
| Ecosystem Reserve 1,830 days     | `ARLAllocation.ECOSYSTEM_RESERVE_DURATION`; the verifier also checks the approved value                           |
| 48-hour timelock floor           | `packages/tokenomics` (planner); `ARLTimelock.MIN_DELAY_FLOOR` (constructor; a test pins the script's copy to it) |
| Addresses, launch date, chain ID | The deployment config                                                                                             |

## Configuration

`contracts/deploy/config/local.json` is the only config. Its addresses are
`keccak256("arl.local.<name>")` placeholders: nobody holds their keys and they are valid only on
a local Anvil chain.

| Field                         | Rule                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `chainId`                     | Required; must equal the chain the script runs on                                                                   |
| `launchDate`                  | `YYYY-MM-DDTHH:MM:SSZ`, UTC, day of month 1-28 (so month arithmetic is exact)                                       |
| `requireRecipientCode`        | Must be `true` on every chain except local Anvil (31337); then every multisig recipient must be a deployed contract |
| `founderBeneficiary`          | Non-zero; a dedicated founder Safe, so it must have contract code wherever `requireRecipientCode` is true           |
| `ecosystemReserveBeneficiary` | Non-zero                                                                                                            |
| `treasury.safe`               | Non-zero; becomes the timelock's only proposer and executor, and a canceller                                        |
| `treasury.guardian`           | Non-zero and different from `treasury.safe`; a separate Safe that receives only the canceller role                  |
| `treasury.minDelayHours`      | Integer, at least 48                                                                                                |
| `recipients.*`                | Seven non-zero addresses; the team pool is the multisig-controlled `team` recipient                                 |

## Fail-closed checks

The planner (`packages/deploy`) and `ARLDeployPlan.validate` (run by `DeployARL` before any
broadcast) each reject:

- allocations that differ from the approved table or do not total exactly 21,000,000 ARL;
- a zero address anywhere;
- a treasury guardian equal to the treasury Safe;
- a founder cliff that is not 24 calendar months, or linear vesting that is not 36 calendar months
  (730-731 and 1,095-1,096 days; 24 × 30 days is rejected);
- invalid timestamp ordering or a zero start;
- a timelock delay below 48 hours;
- a missing chain ID, a chain ID that differs from the connected chain, or disabled code checks
  off local Anvil;
- recipients without code where code is required.

`ARLVerify` (run inside `DeployARL` and by `VerifyARL`) checks: code at every deployed contract;
total supply and `MAX_SUPPLY` equal 21,000,000 ARL; every holder's balance, aggregated per
address, and that planned holders account for the whole supply; zero deployer balance; code at
the founder beneficiary where code is required; founder and reserve beneficiaries, cliff start, cliff end, vesting end and durations; reserve duration
exactly 1,830 days; timelock delay; the Safe holds proposer, canceller and executor; the guardian
differs from the Safe and holds the canceller role and no other; the timelock is its own admin;
neither the zero address nor the deployer holds any role.

The verifier asserts the genesis distribution, so it must run before any token moves.

## Local rehearsal

```
npm ci
npm run rehearse:local
```

Starts a fresh Anvil chain, builds the plan, deploys, verifies, cross-checks key values with
`cast` (including the guardian's roles), and runs the negative cases. It then deploys Safe
v1.5.0 (singleton, proxy factory and one 2-of-3 Safe per Safe role, owned by Anvil development
accounts) from the published `@safe-global/safe-smart-account` build, redeploys the system with
code checks enforced, and confirms that a founder beneficiary without code is rejected by both
the plan and the verifier. 23 negative cases in total. Each must fail with its specific error, and rejected
deployments must leave the deployer nonce unchanged. CI runs the rehearsal on every pull request.

## Before any public network

See the pre-testnet requirements in the Phase 2 security scope report. In particular: a
testnet-only config with `requireRecipientCode: true` and real test Safes, a free public RPC, and
a second test Safe for the treasury guardian, a dedicated test Safe for the founder
beneficiary, and the decision still open (M-2 custody of unlocked allocations). Private keys are never placed in config files; use a hardware wallet or Foundry keystore
outside the repository.
