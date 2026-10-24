# Base Mainnet network services

Status: **step 1 prepared, not deployed.** The ARL token, its Safes, vesting wallets and
timelock are on Base Mainnet ([mainnet-plan.md](mainnet-plan.md)). The network services still
run on the Base Sepolia testnet and move to Base Mainnet one at a time, each after its own
rehearsal, signatures and on-chain check.

| Step | Service                                        | Status                        |
| ---- | ---------------------------------------------- | ----------------------------- |
| 1    | Jobs escrow (ERC-8183) and verified evaluator  | Prepared, rehearsed on a fork |
| 2    | Validators: keys, ETH for gas, staked ARL      | Not started                   |
| 3    | Operator API (x402 per-use payments) on 8453   | Not started                   |
| 4    | Staking rewards contract and its reward budget | Not started                   |
| 5    | App and site switched to Base Mainnet          | Not started                   |

## Step 1: jobs escrow and verified evaluator

Three transactions from the deployer `0xe033104AE32fc7e13263B7AED577Ab20d6E47eAA`, signed on
the app's Deploy screen (`arlcoin.io/app/deploy/?plan=…`):

| Nonce | Plan file                                 | Creates                                              | Expected address                             |
| ----: | ----------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
|    19 | `8453-arbiter-safe` (`CreateArbiterSafe`) | Arbiter Safe, 2 of 3: Hakem 1, Hakem 2, Hakem 3      | `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f` |
|    20 | `8453-verified-jobs`                      | `ARLJobs`, paid in ARL                               | `0x9e647BE305c75e2907aC0a03978261412Ccd31e9` |
|    21 | `8453-verified-jobs`                      | `ARLVerifiedEvaluator` (`DeployMainnetVerifiedJobs`) | `0x6c8A7712010f951f5B03A11C24b46C8b18d5997F` |

The addresses follow from the deployer and its nonce (the Safe from its owners and salt), so any
other transaction from the deployer before these shifts them; the plan files must then be
rebuilt.

Fixed parameters (no owner can change them later):

- Payment and stake token: ARL `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`.
- Shortest challenge window a job may set: 24 hours.
- Smallest validator bond per job: 100 ARL; a job's bond is the larger of this and a tenth of its
  budget.
- Disputes: the arbiter Safe above (three separate signers, two must sign). Slashed bonds go to
  `0x000000000000000000000000000000000000dEaD`.
- ERC-8004 v2.0.0 registries on Base: identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`,
  reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.

Rehearsal (Base Mainnet fork, deployer impersonated, nothing sent): the Safe, the escrow and the
evaluator were created at the addresses above, and
`node packages/deploy/src/jobs-record-cli.ts` passed every check (escrow paid in ARL, evaluator
bound to the escrow, both registries, arbiter 2 of 3).

After signing: `node packages/deploy/src/jobs-record-cli.ts <run.json> https://mainnet.base.org
contracts/deploy/deployments/8453-jobs.json`, then source verification on Basescan.
