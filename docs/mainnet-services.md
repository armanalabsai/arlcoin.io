# Base Mainnet network services

Status: **step 1 done: the jobs escrows (ARL, USDC) and their evaluators with the audit fixes are on Base Mainnet (nonces 23 to 26).** The ARL token, its Safes, vesting wallets and
timelock are on Base Mainnet ([mainnet-plan.md](mainnet-plan.md)). The network services still
run on the Base Sepolia testnet and move to Base Mainnet one at a time, each after its own
rehearsal, signatures and on-chain check.

| Step | Service                                          | Status                     |
| ---- | ------------------------------------------------ | -------------------------- |
| 1    | Jobs escrows (ARL, USDC) and verified evaluators | Deployed (nonces 23 to 26) |
| 2    | Validators: keys, ETH for gas, staked ARL        | Not started                |
| 3    | Operator API (x402 per-use payments) on 8453     | Not started                |
| 4    | Staking rewards contract and its reward budget   | Not started                |
| 5    | App and site switched to Base Mainnet            | Not started                |

## Step 1: jobs escrow and verified evaluator

Transactions from the deployer `0xe033104AE32fc7e13263B7AED577Ab20d6E47eAA`, signed on the app's
Deploy screen (`arlcoin.io/app/deploy/?plan=…`):

| Nonce | Plan file                                 | Creates                                         | Address                                      | Status                 |
| ----: | ----------------------------------------- | ----------------------------------------------- | -------------------------------------------- | ---------------------- |
|    19 | `8453-arbiter-safe` (`CreateArbiterSafe`) | Arbiter Safe, 2 of 3: Hakem 1, Hakem 2, Hakem 3 | `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f` | Deployed               |
|    20 | none                                      | nothing (a plain ETH transfer by the owner)     |                                              |                        |
|    21 | earlier `8453-verified-jobs`              | `ARLJobs`, paid in ARL (before the fix)         | `0x6c8A7712010f951f5B03A11C24b46C8b18d5997F` | Retired: audit F-2/F-3 |
|    22 | `8453-verified-evaluator` (#94)           | `ARLVerifiedEvaluator` for it (before the fix)  | `0x3a5dC803b84D5F150FCd2b070cb9D8a12BC35F34` | Retired: audit F-2/F-3 |
|    23 | `8453-verified-jobs-usdc`                 | `ARLJobs`, paid in USDC                         | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6` | Invalid                |
|    24 | `8453-verified-jobs-usdc`                 | `ARLVerifiedEvaluator` for it, bonds in ARL     | `0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7` | Invalid                |
|    25 | `8453-verified-jobs-arl`                  | `ARLJobs`, paid in ARL                          | `0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9` | Invalid                |
|    26 | `8453-verified-jobs-arl`                  | `ARLVerifiedEvaluator` for it, bonds in ARL     | `0xa2f8945f301C46f2649b79Cd42A7eb1102e9009E` | Invalid                |
|    23 | `8453-verified-jobs-usdc-v2`              | `ARLJobs`, paid in USDC (audit fixes)           | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6` | Deployed               |
|    24 | `8453-verified-jobs-usdc-v2`              | `ARLVerifiedEvaluator` for it, bonds in ARL     | `0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7` | Deployed               |
|    25 | `8453-verified-jobs-arl-v2`               | `ARLJobs`, paid in ARL (audit fixes)            | `0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9` | Deployed               |
|    26 | `8453-verified-jobs-arl-v2`               | `ARLVerifiedEvaluator` for it, bonds in ARL     | `0xa2f8945f301C46f2649b79Cd42A7eb1102e9009E` | Deployed               |

`8453-verified-jobs-usdc` and `8453-verified-jobs-arl` are invalid, do not use: they hold pre-audit
bytecode (before the audit fixes of 2026-10-28) and the deploy screen refuses them. Their `-v2`
replacements are built from the fixed code at the same nonces, so they create contracts at the same
addresses. Both `-v2` pairs were signed on 2026-10-31 and `jobs-record-cli.ts` passed all nine checks for each
on Base Mainnet; the record is `contracts/deploy/base-mainnet-jobs.json`. Rehearsal of the `-v2` plans (Base Mainnet fork, deployer
impersonated at nonce 23, nothing sent): every contract was created at the address above and
`jobs-record-cli.ts` passed all nine checks for each pair.
Every address follows from the deployer and its nonce: any other transaction from the deployer
before them shifts the addresses, and the Deploy screen then refuses the plan.

### Deadline fix (security report 2026-10-25)

The pair at nonces 21 and 22 was built before two reports on the job deadline. Contracts cannot be
upgraded, so the fix ships as new contracts; the retired pair holds no jobs and no app, SDK or
document points to it any more.

- `ARLJobs`: from `expiredAt` on the evaluator can no longer complete or reject a funded job, so
  after the deadline the escrow can only go back to the client (`claimRefund`). The outcome no
  longer depends on which transaction lands first.
- `ARLVerifiedEvaluator`: members can only accept, and voting can only start, while the vote
  window and two challenge windows still end before the deadline. A decision therefore always
  ends its challenge window at least one challenge window before the deadline, and anyone can
  finalize it in that time; a client who funds late cannot void an approved job. An undecided
  vote can be closed after the deadline too, and absent members are still slashed.
- SDK: `fundVerifiedJob` and `checkFundedJob` refuse a job whose evaluation no longer fits before
  its deadline (`checkEvaluationFits`).

Rehearsal (Base Mainnet fork at block 53,295,431, deployer impersonated, nothing sent): both plans
created their contracts at the addresses above, the code matches the plan files byte for byte, and
`jobs-record-cli.ts` passed all nine checks for each pair.

Jobs are paid in ARL or in USDC, one escrow each; validators stake and bond in ARL for both. The
evaluator for the escrow paid in USDC is deployed with ARL as its stake token: a budget in dollars
cannot be compared with a bond in ARL, so there the bond is the floor the job sets (at least
100 ARL) rather than a tenth of the budget. The runs are recorded in
`contracts/deploy/deployments/8453-jobs-usdc.json` and `8453-jobs.json`.

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

After signing, for each plan:

```sh
node packages/deploy/src/jobs-record-cli.ts <run.json> https://mainnet.base.org \
  contracts/deploy/deployments/8453-jobs-usdc.json   # 8453-jobs.json for the ARL pair
```

then source verification of both contracts on Basescan. Like every deployment record, these files
stay out of git (`contracts/deploy/deployments/` is ignored).
