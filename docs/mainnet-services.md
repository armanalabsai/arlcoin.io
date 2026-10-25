# Base Mainnet network services

Status: **step 1 in progress: the jobs escrow is on Base Mainnet, the evaluator is not yet.** The ARL token, its Safes, vesting wallets and
timelock are on Base Mainnet ([mainnet-plan.md](mainnet-plan.md)). The network services still
run on the Base Sepolia testnet and move to Base Mainnet one at a time, each after its own
rehearsal, signatures and on-chain check.

| Step | Service                                          | Status                              |
| ---- | ------------------------------------------------ | ----------------------------------- |
| 1    | Jobs escrows (ARL, USDC) and verified evaluators | ARL escrow deployed, evaluator next |
| 2    | Validators: keys, ETH for gas, staked ARL        | Not started                         |
| 3    | Operator API (x402 per-use payments) on 8453     | Not started                         |
| 4    | Staking rewards contract and its reward budget   | Not started                         |
| 5    | App and site switched to Base Mainnet            | Not started                         |

## Step 1: jobs escrow and verified evaluator

Transactions from the deployer `0xe033104AE32fc7e13263B7AED577Ab20d6E47eAA`, signed on the app's
Deploy screen (`arlcoin.io/app/deploy/?plan=…`):

| Nonce | Plan file                                 | Creates                                         | Address                                      | Status   |
| ----: | ----------------------------------------- | ----------------------------------------------- | -------------------------------------------- | -------- |
|    19 | `8453-arbiter-safe` (`CreateArbiterSafe`) | Arbiter Safe, 2 of 3: Hakem 1, Hakem 2, Hakem 3 | `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f` | Deployed |
|    20 | none                                      | nothing (a plain ETH transfer by the owner)     |                                              |          |
|    21 | earlier `8453-verified-jobs`              | `ARLJobs`, paid in ARL                          | `0x6c8A7712010f951f5B03A11C24b46C8b18d5997F` | Deployed |
|    22 | `8453-verified-evaluator` (#94)           | `ARLVerifiedEvaluator` for that escrow          | `0x3a5dC803b84D5F150FCd2b070cb9D8a12BC35F34` | Next     |
|    23 | `8453-verified-jobs-usdc`                 | `ARLJobs`, paid in USDC                         | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6` | Planned  |
|    24 | `8453-verified-jobs-usdc`                 | `ARLVerifiedEvaluator` for it, bonds in ARL     | `0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7` | Planned  |

The escrow at nonce 21 runs the same code as the `ARLJobs` of the fork rehearsal (runtime code
hash `0xbdddd7e2…a6f0fb`) and is paid in ARL. The evaluator plan comes from
`DeployMainnetVerifiedJobs` with `ARL_JOBS` set to that escrow: the script checks the escrow's code
and token, then creates only the evaluator. Its address follows from the deployer and nonce 22, so
any other transaction from the deployer before it shifts the address and the plan must be rebuilt.

Jobs are paid in ARL or in USDC, one escrow each; validators stake and bond in ARL for both. The
evaluator for the escrow paid in USDC is deployed with ARL as its stake token: a budget in dollars
cannot be compared with a bond in ARL, so there the bond is the floor the job sets (at least
100 ARL) rather than a tenth of the budget. Its plan is signed after nonce 22, and its run is
recorded in `contracts/deploy/deployments/8453-jobs-usdc.json`.

Fixed parameters (no owner can change them later):

- Payment tokens: ARL `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4` and USDC
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Stake token: ARL.
- Shortest challenge window a job may set: 24 hours.
- Smallest validator bond per job: 100 ARL. For the escrow paid in ARL a job's bond is the larger
  of the job's floor and a tenth of its budget; for the escrow paid in USDC it is the job's floor.
- Disputes: the arbiter Safe above (three separate signers, two must sign). Slashed bonds go to
  `0x000000000000000000000000000000000000dEaD`.
- ERC-8004 v2.0.0 registries on Base: identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`,
  reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.

Rehearsal (Base Mainnet fork at deployer nonce 22, deployer impersonated, nothing sent): the
evaluator was created at the address above for the deployed escrow, and
`node packages/deploy/src/jobs-record-cli.ts` passed every check (escrow paid in ARL, evaluator
bound to the escrow, both registries, arbiter 2 of 3).

After signing: `node packages/deploy/src/jobs-record-cli.ts <run.json> https://mainnet.base.org
contracts/deploy/deployments/8453-jobs.json`, then source verification on Basescan.
