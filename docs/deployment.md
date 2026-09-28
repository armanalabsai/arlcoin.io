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

| Value                          | Source                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Allocation amounts, max supply | `packages/tokenomics` (planner) and `ARLAllocation.sol` (cross-checked)                                                                      |
| Vesting start (TBD)            | The deployment config; durations must be 12 + 36 months; refused off local Anvil until the start is confirmed (`VESTING_SCHEDULES_APPROVED`) |
| 48-hour timelock floor         | `packages/tokenomics` (planner); `ARLTimelock.MIN_DELAY_FLOOR` (constructor; a test pins the script's copy to it)                            |
| Addresses, chain ID            | The deployment config                                                                                                                        |

## Configuration

`contracts/deploy/config/local.json` is the only config. Its addresses are
`keccak256("arl.local.<name>")` placeholders: nobody holds their keys and they are valid only on
a local Anvil chain.

| Field                                        | Rule                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chainId`                                    | Required; must equal the chain the script runs on                                                                                                                                                                        |
| `requireRecipientCode`                       | Must be `true` on every chain except local Anvil (31337); then every Safe must be a genuine Safe v1.5.0 proxy (see below)                                                                                                |
| `safe.singletons`                            | Local Anvil only: the Safe singletons a rehearsal deployed. Every other chain uses the canonical Safe v1.5.0 singletons from `@safe-global/safe-deployments` and cannot override them                                    |
| `vesting.<investors, strategicPartnerships>` | `beneficiary` (dedicated Safe), `start` (`YYYY-MM-DDTHH:MM:SSZ`, UTC, day 1-28), `cliffMonths` (must be 12), `vestingMonths` (must be 36). The start is TBD: accepted only on local Anvil. `vesting.founder` is rejected |
| `treasury.safe`                              | Non-zero; becomes the timelock's only proposer and executor, and a canceller                                                                                                                                             |
| `treasury.guardian`                          | Non-zero and different from `treasury.safe`; a separate Safe that receives only the canceller role                                                                                                                       |
| `treasury.minDelayHours`                     | Integer, at least 48                                                                                                                                                                                                     |
| `recipients.*`                               | Exactly eight dedicated Safes: publicLaunch, communityStaking, ecosystemGrowth, liquidity, `founder` (receives the whole 2,100,000 ARL Founder allocation, unlocked), team (pool), earlyUsers, grantsBugBounty           |

## Fail-closed checks

The planner (`packages/deploy`) and `ARLDeployPlan.validate` (run by `DeployARL` before any
broadcast) each reject:

- allocations that differ from the approved 11-allocation table, are missing or extra, or do not
  total exactly 21,000,000 ARL;
- the legacy Ecosystem Reserve in any form, and unknown config keys;
- a zero address anywhere, and any address used for two roles (every Safe is dedicated);
- a treasury guardian equal to the treasury Safe;
- invalid schedule ordering or a zero start;
- any chain other than local Anvil while the vesting start is TBD;
- a vesting schedule whose cliff is not 12 calendar months or whose linear period is not 36
  calendar months;
- a timelock delay below 48 hours;
- a missing chain ID, a chain ID that differs from the connected chain, or disabled code checks
  off local Anvil;
- recipients without code where code is required.

`ARLVerify` (run inside `DeployARL` and by `VerifyARL`) checks: code at every deployed contract;
total supply and `MAX_SUPPLY` equal 21,000,000 ARL; the eleven genesis holders are distinct, each holds exactly its amount, and together
they hold the whole supply; zero deployer balance; code at
every Safe where code is required, and that each such Safe runs the Safe v1.5.0 proxy code and
points to a listed singleton (off local Anvil, only the canonical singletons with the canonical code
hash); each vesting wallet's beneficiary, cliff start, cliff end,
vesting end and duration; timelock delay; the Safe holds proposer, canceller and executor; the guardian
differs from the Safe and holds the canceller role and no other; the timelock is its own admin;
neither the zero address nor the deployer holds any role.

The verifier asserts the genesis distribution, so it must run before any token moves.

## Deployment manifest and circulating supply

After a deployment, `packages/deploy/src/manifest-cli.ts <plan.json> <deployment.json>
<manifest.json>` writes the official deployment manifest: every genesis and protocol-controlled
address, and whether its balance counts as circulating (economic specification section 5). Only
the Founder Safe is circulating.

`packages/deploy/src/supply-cli.ts <manifest.json> <rpc-url>` reads `totalSupply` and every
manifest balance at one block (viem, MIT) and prints total, locked and circulating supply as exact
base-unit and ARL strings. Circulating supply is never estimated or hard-coded.

## Public Launch claim distributor

The approved Public Launch mechanism is a Merkle claim (economic specification section 7).

1. Build the list: `node packages/deploy/src/distribution-cli.ts <input.json> <distribution.json>`.
   The input (`arl-distribution-input/1`) names the funding allocation (`publicLaunch` only), a
   budget and an optional per-address limit in base units, and the `{account, amount}` entries.
   The output (`arl-distribution/1`) holds the Merkle root, the total to fund, and every account's
   index, amount and proof; it is re-verified from its own claims before it is written.
2. Deploy: `DeployDistributor` (`ARL_PLAN`, `ARL_DEPLOYMENT`, `ARL_DISTRIBUTION`, `ARL_CLAIM_END`,
   `ARL_DISTRIBUTOR`). It checks the list's schema, allocation and total, and fixes `returnTo` to
   the plan's Public Launch Safe. Off local Anvil it refuses to run until the launch parameters
   are approved (`LAUNCH_PARAMETERS_APPROVED = false`).
3. Fund: the Public Launch Safe transfers the list total to the distributor.
4. Publish the list and add the distributor record to the manifest
   (`manifest-cli.ts <plan> <deployment> <manifest> <distributor.json>`); its unclaimed balance
   is not circulating.

## Local rehearsal

```
npm ci
npm run rehearse:local
```

Starts a fresh Anvil chain, builds the plan, deploys, verifies, cross-checks key values with
`cast` (including the guardian's roles), and runs the negative cases. It then deploys Safe
v1.5.0 (singleton, proxy factory and one 2-of-3 Safe per Safe role, owned by Anvil development
accounts) from the published `@safe-global/safe-smart-account` build, redeploys the system with
code checks enforced, and confirms that a Founder recipient without code is rejected
by both the plan and the verifier, as are a contract that is not a Safe proxy, a missing singleton
list and Safes that point to an unlisted singleton. The rehearsal also checks that the singleton
built from the official Safe artifact has the canonical v1.5.0 code hash. It builds the deployment
manifest, checks that circulating supply is exactly 2,100,000 ARL at TGE, and that it changes
only when tokens leave a locked address (not when the Founder sells). It then deploys a Public
Launch claim distributor from the test list, funds it, claims one entry and sweeps the rest
back after the window, checking circulating supply at each step. 48 negative cases in
total, including a plan that still splits the Founder allocation, plans of the old
`arl-deploy-plan/4` and `arl-deploy-plan/3` schemas and of the old
`arl-deploy-plan/2` schema, a plan or config with `vesting.founder`, and a deployment record with a
founder vesting wallet. Each must fail with its specific error, and rejected
deployments must leave the deployer nonce unchanged. CI runs the rehearsal on every pull request.

## Before any public network

Required before any testnet: a
testnet-only config with `requireRecipientCode: true` and real test Safes, a free public RPC, and
a dedicated test Safe for every role, a confirmed vesting start for the investor and strategic
partnership wallets (until then the tooling refuses every public network). Private keys are never placed in config files; use a hardware wallet or Foundry keystore
outside the repository.
