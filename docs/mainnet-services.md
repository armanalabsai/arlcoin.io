# Base Mainnet network services

Status: **the network services run on Base Mainnet.** Since 2026-11-16 the jobs escrows are
`ARLJobs` v3 with the v5 verified evaluators (nonces 33 to 36); the compute payment contract and
the staking contract run since 2026-11-12 (nonces 31 and 32), and the first staking reward period
is funded. The ARL app at arlcoin.io/app runs on Base
Mainnet. The ARL token, its Safes, vesting wallets and timelock are on Base Mainnet since
2026-10-24 ([mainnet-plan.md](mainnet-plan.md)).

| Step | Service                                          | Status                                                         |
| ---- | ------------------------------------------------ | -------------------------------------------------------------- |
| 1    | Jobs escrows (ARL, USDC) and verified evaluators | Deployed (v3 escrows, v5 evaluators, nonces 33-36, 2026-11-16) |
| 2    | Validators: keys, ETH for gas, staked ARL        | Not started                                                    |
| 3    | x402 per-use payments facilitator on 8453        | Not started                                                    |
| 4    | Staking rewards contract and its reward budget   | Deployed (nonce 32); 300,000 ARL period funded 2026-11-16      |
| 5    | App and site on Base Mainnet                     | Done (2026-11-13)                                              |

## Step 1: jobs escrow and verified evaluator

Decision 2026-11-14 (roadmap D-1): move the jobs escrows to `ARLJobs` v3. Signed on 2026-11-16 at
nonces 33 to 36; `jobs-record-cli.ts` passed all nine checks for each pair on Base Mainnet (record
`contracts/deploy/base-mainnet-jobs.json`), and the app, SDKs, API and site use the new addresses.
The v2 escrows and v4 evaluators are retired; no job was ever created on them.

The evaluators are v5 (bug bounty reports of 2026-11-14 to 2026-11-16): a refund the token
refuses no longer blocks the bond settlement (`RefundDeferred`, the client uses `claimRefundTo`),
`expireDispute` closes a dispute the arbiter has not ruled on in time after the challenge window,
`finalize` settles a decided job after its deadline, the registry calls keep a gas reserve, and
the provider's ERC-8004 agent is bound when it approves the committee (`outcomesOf` counts every
recorded outcome). The plans were regenerated on a Base Mainnet fork; the addresses are
unchanged because they depend only on the deployer and the nonce.

Transactions from the deployer `0xe033104AE32fc7e13263B7AED577Ab20d6E47eAA`, signed on the app's
Deploy screen (`arlcoin.io/app/deploy/?plan=…`):

| Nonce | Plan file                                 | Creates                                                          | Address                                      | Status                     |
| ----: | ----------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- | -------------------------- |
|    19 | `8453-arbiter-safe` (`CreateArbiterSafe`) | Arbiter Safe, 2 of 3: Hakem 1, Hakem 2, Hakem 3                  | `0x8FF6c3aD0991Ac848BFf5d0acD78BBc5e190466f` | Deployed                   |
|    20 | none                                      | nothing (a plain ETH transfer by the owner)                      |                                              |                            |
|    21 | earlier `8453-verified-jobs`              | `ARLJobs`, paid in ARL (before the fix)                          | `0x6c8A7712010f951f5B03A11C24b46C8b18d5997F` | Retired: audit F-2/F-3     |
|    22 | `8453-verified-evaluator` (#94)           | `ARLVerifiedEvaluator` for it (before the fix)                   | `0x3a5dC803b84D5F150FCd2b070cb9D8a12BC35F34` | Retired: audit F-2/F-3     |
|    23 | `8453-verified-jobs-usdc`                 | `ARLJobs`, paid in USDC                                          | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6` | Invalid                    |
|    24 | `8453-verified-jobs-usdc`                 | `ARLVerifiedEvaluator` for it, bonds in ARL                      | `0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7` | Invalid                    |
|    25 | `8453-verified-jobs-arl`                  | `ARLJobs`, paid in ARL                                           | `0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9` | Invalid                    |
|    26 | `8453-verified-jobs-arl`                  | `ARLVerifiedEvaluator` for it, bonds in ARL                      | `0xa2f8945f301C46f2649b79Cd42A7eb1102e9009E` | Invalid                    |
|    23 | `8453-verified-jobs-usdc-v2`              | `ARLJobs`, paid in USDC (audit fixes)                            | `0xc833140D2eE8607fd41662cffFAc557f3D535bE6` | Retired: v3 2026-11-16     |
|    24 | `8453-verified-jobs-usdc-v2`              | `ARLVerifiedEvaluator` for it, bonds in ARL                      | `0x4f7f61916d65ff9E7C5F62468a18E37d4Fb07FA7` | Retired: report 2026-10-31 |
|    25 | `8453-verified-jobs-arl-v2`               | `ARLJobs`, paid in ARL (audit fixes)                             | `0x4664d58FAFFb6ab1cf36717c70058a323E2A98f9` | Retired: v3 2026-11-16     |
|    26 | `8453-verified-jobs-arl-v2`               | `ARLVerifiedEvaluator` for it, bonds in ARL                      | `0xa2f8945f301C46f2649b79Cd42A7eb1102e9009E` | Retired: report 2026-10-31 |
|    27 | `8453-verified-evaluator-arl-v3`          | `ARLVerifiedEvaluator` for the ARL escrow (acceptance fix)       | `0x817E13e512fF810B0ECe0EE278bf112a3947DAd6` | Retired: v4 2026-11-12     |
|    28 | `8453-verified-evaluator-usdc-v3`         | `ARLVerifiedEvaluator` for the USDC escrow (acceptance fix)      | `0x3F4EA7f388bcFf00267aEB21446ef005Fea784c9` | Retired: v4 2026-11-12     |
|    29 | `8453-verified-evaluator-arl-v4`          | `ARLVerifiedEvaluator` v4 for the ARL escrow                     | `0x5cA6dab18E6b9a5Cd44a4FfFBdf2c5BA3Cd87DfF` | Retired: v5 2026-11-16     |
|    30 | `8453-verified-evaluator-usdc-v4`         | `ARLVerifiedEvaluator` v4 for the USDC escrow                    | `0x8C017f24615AC749Ec7297FB07b14E558B670CFC` | Retired: v5 2026-11-16     |
|    31 | `8453-services`                           | `ComputePayment`, paid in ARL                                    | `0x1bFE932896fdd32175836a7364dcaf53d49EE464` | Deployed                   |
|    32 | `8453-services`                           | `ARLStakingRewards`, ARL, 180-day periods                        | `0x15e257009BE9B1875fbfa69D291320aaFE3fa102` | Deployed                   |
|    33 | `8453-verified-jobs-arl-v3`               | `ARLJobs` v3, paid in ARL (fund balance check, `claimRefundTo`)  | `0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC` | Deployed 2026-11-16        |
|    34 | `8453-verified-jobs-arl-v3`               | `ARLVerifiedEvaluator` v5 for it, bonds in ARL                   | `0x6648e141cb7473822ddBd8bC039b91e5af3259B4` | Deployed 2026-11-16        |
|    35 | `8453-verified-jobs-usdc-v3`              | `ARLJobs` v3, paid in USDC                                       | `0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04` | Deployed 2026-11-16        |
|    36 | `8453-verified-jobs-usdc-v3`              | `ARLVerifiedEvaluator` v5 for it, bonds in ARL                   | `0x6bFfdEace7d0B2F7711f604F0A5D2545be2961AF` | Deployed 2026-11-16        |
|    37 | none                                      | nothing from a plan (the deployer's nonce read 38 on 2026-11-19) |                                              |                            |
|    38 | `8453-verified-evaluator-arl-v6`          | `ARLVerifiedEvaluator` v6 for the ARL escrow at nonce 33         | `0xcF87CF8751648919b5A7F3b45795999dFDeE5861` | Deployed 2026-11-19        |
|    39 | `8453-verified-evaluator-usdc-v6`         | `ARLVerifiedEvaluator` v6 for the USDC escrow at nonce 35        | `0xc121c4fE9460c55d85dE0175C1C7045235f94c07` | Deployed 2026-11-19        |
|    40 | `8453-verified-evaluator-arl-v7`          | `ARLVerifiedEvaluator` v7 for the ARL escrow at nonce 33         | `0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28` | Planned                    |
|    41 | `8453-verified-evaluator-usdc-v7`         | `ARLVerifiedEvaluator` v7 for the USDC escrow at nonce 35        | `0x7A00D45598Da7C13feEA8962fc1110FC4Db4D850` | Planned                    |

`8453-verified-jobs-usdc` and `8453-verified-jobs-arl` are invalid, do not use: they hold pre-audit
bytecode (before the audit fixes of 2026-10-28) and the deploy screen refuses them. Their `-v2`
replacements are built from the fixed code at the same nonces, so they create contracts at the same
addresses. Both `-v2` pairs were signed on 2026-10-31 and `jobs-record-cli.ts` passed all nine checks for each
on Base Mainnet; the record is `contracts/deploy/base-mainnet-jobs.json`. Rehearsal of the `-v2` plans (Base Mainnet fork, deployer
impersonated at nonce 23, nothing sent): every contract was created at the address above and
`jobs-record-cli.ts` passed all nine checks for each pair.
Every address follows from the deployer and its nonce: any other transaction from the deployer
before them shifts the addresses, and the Deploy screen then refuses the plan.

### Compute payment and staking

`8453-services` (`DeployMainnetServices`, nonces 31 and 32, after the v4 evaluators) creates
`ComputePayment` (per-second streams in ARL) and `ARLStakingRewards` (stake ARL, rewards in ARL,
180-day periods). Neither has an owner. Only the Community & Staking Safe
`0xfF12597A671ebAF0cAe37999EE659e03c4f444B5` (2 of 3) can fund a reward period; the first period
is 300,000 ARL (owner decision of 2026-11-01), funded by the Safe afterwards with `approve` and
`notifyRewardAmount`. Signed on 2026-11-12; `services-record-cli.ts` passed all ten checks on Base
Mainnet (record `contracts/deploy/base-mainnet-services.json`). The first reward period was funded by the Safe on 2026-11-16 (300,000 ARL, 0.01929 ARL per second, ends 2027-05-15). The funding batch is published for the Safe Transaction Builder at
[`arlcoin.io/app/safe-batches/8453-staking-fund-300k.safe-batch.json`](../apps/dapp/public/safe-batches/8453-staking-fund-300k.safe-batch.json)
(approve exactly 300,000 ARL, then `notifyRewardAmount`; checked by `safeBatches.test.ts` and
rehearsed on a Base Mainnet fork on 2026-11-14: rate 0.01929 ARL per second for 180 days). Rehearsal (Base Mainnet fork, v4 evaluators applied first, deployer
impersonated, nothing sent): both contracts were created at the addresses above,
`services-record-cli.ts` passed all ten checks, and the Safe funded 300,000 ARL (reward rate
0.01929 ARL per second for 180 days). After signing:

```sh
node packages/deploy/src/services-record-cli.ts <run.json> https://mainnet.base.org   contracts/deploy/deployments/8453-services.json
```

### Evaluator v6

`8453-verified-evaluator-arl-v6` (nonce 38) and `8453-verified-evaluator-usdc-v6` (nonce 39)
replace the v5 evaluators at nonces 34 and 36 for the `ARLJobs` v3 escrows already on chain, with
the same parameters. They carry four fixes from the bug bounty reports of 2026-11-16 to
2026-11-18:

- the arbiter cannot open a dispute it would then rule on (`ConflictOfInterest`);
- a rejection that is settled late (`finalize`, `resolve` or `expireDispute` after the deadline)
  still reaches the provider's ERC-8004 record;
- a provider that does not own the agent the client named cannot approve the committee, so it
  cannot hand the agent away first and keep the outcome off its record;
- when the arbiter overturns a rejection it names the deliverable it upheld, and members who
  approved any other hash lose their bonds, so approvals split across hashes no longer reject
  good work without risk.

Rehearsal (Base Mainnet fork at block 59,370,177, deployer impersonated at nonce 38, nothing
sent): both evaluators were created at the addresses above and `jobs-record-cli.ts` passed all
nine checks for each. Sign the ARL plan first, then the USDC plan; any other transaction from the
deployer before them shifts the addresses, and the Deploy screen then refuses the plans. No job
was ever created on the v5 evaluators (`jobCounter() == 0` on both escrows, read on 2026-11-19),
so no job migrates; the three pilot validators unstake from v5 and stake on v6 after the
deployment, and the app, SDKs and API move to the new addresses in a follow-up change.

Deployed on 2026-11-19 from the deployer at nonces 38 and 39, at the planned addresses (creation
blocks 59,461,386 and 59,461,475). `jobs-record-cli.ts` passed all nine checks for each on Base
Mainnet, and the app, SDKs, API and record point at v6 from this change on. The v5 evaluators stay
on the event watch list until the pilot validators have withdrawn their stakes from them.

### Evaluator v7

`8453-verified-evaluator-arl-v7` (nonce 40) and `8453-verified-evaluator-usdc-v7` (nonce 41)
replace the v6 evaluators for the same `ARLJobs` v3 escrows, with the same parameters. They carry
three fixes from the bug bounty reports of 2026-11-19:

- a rejection that is refunded with `claimRefund` and closed with `release`, instead of
  `finalize`, still reaches the provider's ERC-8004 record;
- `configure` needs the job's provider to be named, so a committee member or the arbiter cannot
  be named provider afterwards and leave the job without a way to be evaluated;
- `configure` refuses an ERC-8004 agent id the provider does not own (when the registry answers),
  so a mistyped id is caught while the client can still correct it, instead of `approveCommittee`
  refusing it after the job is funded.

Rehearsal (Base Mainnet fork at block 59,562,506, deployer impersonated at nonce 40, nothing
sent): both evaluators were created at the addresses above and `jobs-record-cli.ts` passed all
nine checks for each. Sign the ARL plan first, then the USDC plan; any other transaction from the
deployer before them shifts the addresses, and the Deploy screen then refuses the plans. No job
was ever created on the v6 evaluators (`jobCounter() == 0` on both escrows, read on 2026-11-19),
so no job migrates; the pilot validators stake on v7 after the deployment, and the app, SDKs and
API move to the new addresses in a follow-up change.

### Evaluator v4

`8453-verified-evaluator-arl-v4` (nonce 29) and `8453-verified-evaluator-usdc-v4` (nonce 30) replace
the evaluators at nonces 27 and 28 for the escrows already on chain, with the same parameters.
Rehearsal (Base Mainnet fork, deployer impersonated at nonce 29, nothing sent): both evaluators
were created at the addresses above and `jobs-record-cli.ts` passed all nine checks for each. Sign
the ARL plan first, then the USDC plan; any other transaction from the deployer before them shifts
the addresses, and the Deploy screen then refuses the plans. Both were signed on 2026-11-12 and `jobs-record-cli.ts` passed all nine checks for each on Base
Mainnet; the evaluators at nonces 27 and 28 are retired.

### Acceptance fix (security report 2026-10-31)

The `-v3` evaluators were signed on 2026-11-01 at nonces 27 and 28, `jobs-record-cli.ts` passed all
nine checks for each on Base Mainnet, and both are source-verified on Basescan. The record is
`contracts/deploy/base-mainnet-jobs.json`.

The `-v2` plans were signed and executed: the escrows at nonces 23 and 25 carry the audit fixes
and stay in service. Their evaluators (nonces 24 and 26) closed acceptance as soon as voting
started, and anyone can start it once a job is submitted (`startVoting`, or the first vote). With
fewer than `threshold` members accepted by then, no decision could be reached: the client was
refunded after one vote window and the provider, who had delivered, was not paid. Read on
2026-10-31 from `https://mainnet.base.org`: both escrows have `jobCounter() == 0` and no token
balance, and both evaluators hold no stake, so nothing is at risk and nothing has to migrate.

- `ARLVerifiedEvaluator`: a member can accept until the vote window ends (and before a decision);
  before the vote starts the deadline check still applies. A member who accepts late and does not
  vote is slashed like any absent member.
- Validators (`packages/verifier`): the watch pass also accepts a job that is already Submitted,
  and a reverted transaction is never logged as accepted or voted.
- SDK: `submitDeliverable` refuses until `threshold` members have accepted (`waitForAcceptance`,
  `acceptedCount`); `BASE_MAINNET_VERIFIED` points to the new evaluator at nonce 27.

Escrows are independent of evaluators (each job names its own), so only the two evaluators are
replaced, for the escrows already on chain (`DeployMainnetVerifiedJobs` with `ARL_JOBS`). Sign
`8453-verified-evaluator-arl-v3` (nonce 27) first, then `8453-verified-evaluator-usdc-v3`
(nonce 28); any other transaction from the deployer before them shifts the addresses, and the
Deploy screen then refuses the plans. Rehearsal (Base Mainnet fork at block 53,323,835, deployer
impersonated, nothing sent): both evaluators were created at the addresses above with the same
parameters as the ones they replace, and `jobs-record-cli.ts` passed all nine checks for each.
Then run `jobs-record-cli.ts` for each plan as below (record files `8453-jobs.json` and
`8453-jobs-usdc.json`) and verify the source on Basescan.

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
