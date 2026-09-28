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

| Value                          | Source                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Allocation amounts, max supply | `packages/tokenomics` (planner) and `ARLAllocation.sol` (cross-checked)                                           |
| Vesting schedules (TBD)        | The deployment config; refused off local Anvil until approved (`VESTING_SCHEDULES_APPROVED`)                      |
| 48-hour timelock floor         | `packages/tokenomics` (planner); `ARLTimelock.MIN_DELAY_FLOOR` (constructor; a test pins the script's copy to it) |
| Addresses, chain ID            | The deployment config                                                                                             |

## Configuration

`contracts/deploy/config/local.json` is the only config. Its addresses are
`keccak256("arl.local.<name>")` placeholders: nobody holds their keys and they are valid only on
a local Anvil chain.

| Field                                        | Rule                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chainId`                                    | Required; must equal the chain the script runs on                                                                                                                                                                                                    |
| `requireRecipientCode`                       | Must be `true` on every chain except local Anvil (31337); then every Safe must be a genuine Safe v1.5.0 proxy (see below)                                                                                                                            |
| `safe.singletons`                            | Local Anvil only: the Safe singletons a rehearsal deployed. Every other chain uses the canonical Safe v1.5.0 singletons from `@safe-global/safe-deployments` and cannot override them                                                                |
| `vesting.<investors, strategicPartnerships>` | `beneficiary` (dedicated Safe), `start` (`YYYY-MM-DDTHH:MM:SSZ`, UTC, day 1-28), `cliffMonths`, `vestingMonths`. Schedules are TBD: accepted only on local Anvil. `vesting.founder` is rejected                                                      |
| `treasury.safe`                              | Non-zero; becomes the timelock's only proposer and executor, and a canceller                                                                                                                                                                         |
| `treasury.guardian`                          | Non-zero and different from `treasury.safe`; a separate Safe that receives only the canceller role                                                                                                                                                   |
| `treasury.minDelayHours`                     | Integer, at least 48                                                                                                                                                                                                                                 |
| `recipients.*`                               | Exactly nine: seven dedicated Safes (publicLaunch, communityStaking, ecosystemGrowth, liquidity, team (pool), earlyUsers, grantsBugBounty), `founderUnrestricted` (dedicated Safe) and `founderReserved` (custody TBD: accepted only on local Anvil) |

## Fail-closed checks

The planner (`packages/deploy`) and `ARLDeployPlan.validate` (run by `DeployARL` before any
broadcast) each reject:

- allocations that differ from the approved 11-allocation table, are missing or extra, or do not
  total exactly 21,000,000 ARL;
- the legacy Ecosystem Reserve in any form, and unknown config keys;
- a zero address anywhere, and any address used for two roles (every Safe is dedicated);
- a treasury guardian equal to the treasury Safe;
- invalid schedule ordering or a zero start;
- any chain other than local Anvil while the vesting schedules are TBD;
- a timelock delay below 48 hours;
- a missing chain ID, a chain ID that differs from the connected chain, or disabled code checks
  off local Anvil;
- recipients without code where code is required.

`ARLVerify` (run inside `DeployARL` and by `VerifyARL`) checks: code at every deployed contract;
total supply and `MAX_SUPPLY` equal 21,000,000 ARL; the Founder tranches add up to the Founder
allocation; the twelve genesis holders are distinct, each holds exactly its amount, and together
they hold the whole supply; zero deployer balance; code at
every Safe where code is required, and that each such Safe runs the Safe v1.5.0 proxy code and
points to a listed singleton (off local Anvil, only the canonical singletons with the canonical code
hash); each vesting wallet's beneficiary, cliff start, cliff end,
vesting end and duration; timelock delay; the Safe holds proposer, canceller and executor; the guardian
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
code checks enforced, and confirms that a Founder Unrestricted recipient without code is rejected
by both the plan and the verifier, as are a contract that is not a Safe proxy, a missing singleton
list and Safes that point to an unlisted singleton. The rehearsal also checks that the singleton
built from the official Safe artifact has the canonical v1.5.0 code hash. 45 negative cases in
total, including plans of the old `arl-deploy-plan/3` schema and of the old
`arl-deploy-plan/2` schema, a plan or config with `vesting.founder`, and a deployment record with a
founder vesting wallet. Each must fail with its specific error, and rejected
deployments must leave the deployer nonce unchanged. CI runs the rehearsal on every pull request.

## Before any public network

See the pre-testnet requirements in the Phase 2 security scope report. In particular: a
testnet-only config with `requireRecipientCode: true` and real test Safes, a free public RPC, and
a dedicated test Safe for every role, approved vesting schedules for the investor and strategic
partnership wallets, and an approved custody for the Founder Reserved tranche (until then the
tooling refuses every public network). Private keys are never placed in config files; use a hardware wallet or Foundry keystore
outside the repository.
