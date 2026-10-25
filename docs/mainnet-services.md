# Base Mainnet network services

Status: **step 1 done: the jobs escrow and the verified evaluator are on Base Mainnet.** The ARL token, its Safes, vesting wallets and
timelock are on Base Mainnet ([mainnet-plan.md](mainnet-plan.md)). The network services still
run on the Base Sepolia testnet and move to Base Mainnet one at a time, each after its own
rehearsal, signatures and on-chain check.

| Step | Service                                        | Status                    |
| ---- | ---------------------------------------------- | ------------------------- |
| 1    | Jobs escrow (ERC-8183) and verified evaluator  | Deployed, source-verified |
| 2    | Validators: keys, ETH for gas, staked ARL      | Not started               |
| 3    | Operator API (x402 per-use payments) on 8453   | Not started               |
| 4    | Staking rewards contract and its reward budget | Not started               |
| 5    | App and site switched to Base Mainnet          | Not started               |

## Step 1: jobs escrow and verified evaluator

Transactions from the deployer `0xe033104AE32fc7e13263B7AED577Ab20d6E47eAA`, signed on the app's
Deploy screen (`arlcoin.io/app/deploy/?plan=…`):

| Nonce | Plan file                                 | Creates                                         | Address                                      | Status   |
| ----: | ----------------------------------------- | ----------------------------------------------- | -------------------------------------------- | -------- |
|    19 | `8453-arbiter-safe` (`CreateArbiterSafe`) | Arbiter Safe, 2 of 3: Hakem 1, Hakem 2, Hakem 3 | `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f` | Deployed |
|    20 | none                                      | nothing (a plain ETH transfer by the owner)     |                                              |          |
|    21 | earlier `8453-verified-jobs`              | `ARLJobs`, paid in ARL                          | `0x6c8A7712010f951f5B03A11C24b46C8b18d5997F` | Deployed |
|    22 | `8453-verified-evaluator`                 | `ARLVerifiedEvaluator` for that escrow          | `0x3a5dC803b84D5F150FCd2b070cb9D8a12BC35F34` | Deployed |

The escrow at nonce 21 runs the same code as the `ARLJobs` of the fork rehearsal (runtime code
hash `0xbdddd7e2…a6f0fb`) and is paid in ARL. The evaluator plan comes from
`DeployMainnetVerifiedJobs` with `ARL_JOBS` set to that escrow: the script checks the escrow's code
and token, then creates only the evaluator. Its address follows from the deployer and nonce 22, so
any other transaction from the deployer before it shifts the address and the plan must be rebuilt.

Fixed parameters (no owner can change them later):

- Payment and stake token: ARL `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`.
- Shortest challenge window a job may set: 24 hours.
- Smallest validator bond per job: 100 ARL; a job's bond is the larger of this and a tenth of its
  budget.
- Disputes: the arbiter Safe above (three separate signers, two must sign). Slashed bonds go to
  `0x000000000000000000000000000000000000dEaD`.
- ERC-8004 v2.0.0 registries on Base: identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`,
  reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.

Rehearsal (Base Mainnet fork at deployer nonce 22, deployer impersonated, nothing sent): the
evaluator was created at the address above for the deployed escrow, and
`node packages/deploy/src/jobs-record-cli.ts` passed every check (escrow paid in ARL, evaluator
bound to the escrow, both registries, arbiter 2 of 3).

Signed on 25 October 2026 at deployer nonce 22 (the deployer's nonce is now 23). Checks after
signing:

```sh
node packages/deploy/src/jobs-record-cli.ts apps/dapp/public/plans/8453-verified-evaluator.json \
  https://mainnet.base.org contracts/deploy/deployments/8453-jobs.json
```

passed every check on chain: the escrow is paid in ARL, the evaluator belongs to the escrow and
stakes in ARL, it writes to both ERC-8004 registries, and the arbiter Safe is 2 of 3. Challenge
window 86,400 seconds, minimum bond 100 ARL. Like every deployment record, `8453-jobs.json` stays
out of git (`contracts/deploy/deployments/` is ignored); anyone can rebuild it with the command
above.

Both contracts are source-verified on Basescan:
[ARLJobs](https://basescan.org/address/0x6c8A7712010f951f5B03A11C24b46C8b18d5997F#code),
[ARLVerifiedEvaluator](https://basescan.org/address/0x3a5dC803b84D5F150FCd2b070cb9D8a12BC35F34#code).
