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

| Value                          | Source                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Allocation amounts, max supply | `packages/tokenomics` (planner) and `ARLAllocation.sol` (cross-checked)                                                       |
| Vesting start (TBD)            | The deployment config; durations must be 12 + 36 months; a placeholder start is accepted on local Anvil and Base Sepolia only |
| 48-hour timelock floor         | `packages/tokenomics` (planner); `ARLTimelock.MIN_DELAY_FLOOR` (constructor; a test pins the script's copy to it)             |
| Addresses, chain ID            | The deployment config                                                                                                         |

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

## Monitoring

`VerifyARL` checks the exact genesis state and only applies before any token moves. For the life
of the deployment, `npm run monitor -- <plan.json> <deployment.json> <rpc-url> <from-block>`
(`packages/deploy/src/monitor.ts`, viem, MIT) reads the chain at one block, never signs or sends
anything, and prints a JSON report.

| Severity | Findings                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| critical | total supply is not 21,000,000 ARL; timelock delay differs from the plan or is below 48 hours; any timelock role differs from the `ARLVerify` role table; a vesting wallet's beneficiary or schedule differs from the plan, it holds less than its allocation (balance + released), it released more than vested, or its vested amount does not follow the schedule |
| notice   | a timelock operation is waiting for its delay or is ready to execute (id, ready time, target, value, selector); a role was granted by the timelock, a role was revoked, or the delay changed after deployment                                                                                                                                                       |

Exit codes: `0` healthy (notices may still need review), `3` a critical finding, `1` the check
could not run, `2` wrong usage. Timelock events are read from `<from-block>` in ranges of 9,000
blocks, so public RPC limits are respected; pass the deployment block on the first run and the
previous report's `blockNumber` afterwards. Tokens sent to a vesting wallet by anyone are accepted
(they vest with the rest). The local rehearsal runs the monitor on a deployment after tokens have
moved, schedules a treasury transfer through the timelock, and checks that it is reported while
waiting, again when it is ready after 48 hours, and that a plan which disagrees with the chain
exits with code 3.

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
   are approved (`LAUNCH_PARAMETERS_APPROVED = false`); it runs only where the network gate allows.
3. Fund: the Public Launch Safe transfers the list total to the distributor.
4. Publish the list and add the distributor record to the manifest
   (`manifest-cli.ts <plan> <deployment> <manifest> <distributor.json>`); its unclaimed balance
   is not circulating.

## Staking rewards

`ARLStakingRewards` is not part of `DeployARL`, and no deployment script exists for it yet: reward
amounts and period lengths are not decided. Whenever it is deployed:

- `rewardsDistribution` must be the plan's Community & Staking holder
  (`recipients.communityStaking`), the address the 3,000,000 ARL allocation is minted to. The
  contract cannot check where reward tokens come from, so this binding is enforced here.
- Verify with `VerifyStaking` (`ARL_PLAN`, `ARL_DEPLOYMENT`, `ARL_STAKING`, optional
  `ARL_STAKING_FRESH`, default true), read-only. It fails unless ARL is both the staking and the
  reward token and the distributor is that holder; when fresh, nothing may be staked, funded or
  returned yet.

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

## Network gate

Approved network decision: **Base Sepolia (84532) is the only deployable public network. Base
Mainnet (8453) is hard-locked.**

| Chain                | Gate       | Notes                                                                                                                   |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Local Anvil (31337)  | open       | Rehearsals; recipients may lack code                                                                                    |
| Base Sepolia (84532) | open       | `requireRecipientCode: true`; every Safe role must be a canonical Safe v1.5.0 proxy; placeholder vesting start accepted |
| Base Mainnet (8453)  | **locked** | Always refused (`PlanProductionLocked`)                                                                                 |
| Any other chain      | refused    | `PlanChainNotSupported`                                                                                                 |

One gate, `ARLDeployPlan.networkGate`, is checked by `DeployARL` and `DeployDistributor` before they
read any input, by `ARLDeployPlan.validate`, and by `ARLDeployer.deploy` itself, so a script that
skips validation is refused too. The planner applies the same rule (`networkGate` in
`packages/deploy/src/plan.ts`). The gate takes no flag, reads no environment variable and no
config field, and has no override: `block.chainid` alone decides. Opening Base Mainnet requires
changing `networkGate` in both places in a reviewed change. No CI workflow deploys or holds a
deployment key.

Before a Base Sepolia deployment: a config with `requireRecipientCode: true` and a dedicated test
Safe for every role, and a funded deployer key. Private keys are never placed in config files; use
a hardware wallet or Foundry keystore outside the repository.

## Base Sepolia runbook

Status: **not deployed.** Dry run: `npm run rehearse:base-sepolia-fork` runs every step below on a
local Anvil fork of Base Sepolia (real canonical Safe contracts, Anvil development accounts, no
key); nothing is sent to Base Sepolia.

1. **Safes.** `CreateSafes` creates the 12 role Safes with the canonical Safe v1.5.0
   `SafeProxyFactory`, `SafeL2` singleton and `CompatibilityFallbackHandler`, after checking their
   code hashes. Environment overrides of those contracts are refused off local Anvil; Base Mainnet
   is refused by the network gate. Give the guardian its own signers (`ARL_GUARDIAN_OWNERS`,
   disjoint from `ARL_SAFE_OWNERS`, M-1).

   ```
   cd contracts
   ARL_SAFE_OWNERS=<a>,<b>,<c> ARL_SAFE_THRESHOLD=2 \
   ARL_GUARDIAN_OWNERS=<d>,<e> ARL_GUARDIAN_THRESHOLD=2 \
   ARL_SAFES_OUT=deploy/deployments/84532-safes.json \
   forge script script/CreateSafes.s.sol:CreateSafes --rpc-url https://sepolia.base.org \
     --broadcast --account <keystore-name> --slow
   ```

2. **Config and plan.** `safes-config-cli.ts <safes.json> <placeholder-vesting-start> <config.json>`
   writes the config (code checks on, 12 + 36 months, 48-hour delay); `cli.ts` builds the plan.
3. **Deploy and verify.** `DeployARL` with `ARL_PLAN` and `ARL_DEPLOYMENT`, then `VerifyARL`.
4. **Manifest.** `manifest-cli.ts`, then `supply-cli.ts` (circulating supply at TGE is 2,100,000 ARL).
5. **Monitoring.** Run `monitor-cli.ts` on a schedule from the deployment block (see Monitoring)
   and have the guardian's signers review every notice.
