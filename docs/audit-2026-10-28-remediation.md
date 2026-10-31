# Audit of 2026-10-28: remediation

Status of the five findings of the 2026-10-28 audit. The code fixes land in pull request #105
(branch `fix/audit-2026-10-28`). Contracts already deployed cannot change: a fix takes effect only
in a new deployment.

## Finding, fix, test, deployment

| Finding | Contract             | Fix                                                                                                                        | Commit                               | Tests                                                                                                                                  | Deployment                                                                                                                                                        |
| ------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1     | `ARLAnonymousSignal` | Nullifiers are recorded once for the whole contract, not per group                                                         | `b3499c0`                            | `test_clonedGroupsCannotReplayAProof`, `test_proofSpentInACloneIsSpentEverywhere`                                                      | Base Sepolia `0xFa5901E9dfD813b910061F29ef1f65a1faA0b268` runs the old code: redeploy planned. Not on Base Mainnet.                                               |
| F-2     | `ARLJobs`            | From `expiredAt` the evaluator can no longer complete (and, with #101, reject) a funded job; only `claimRefund` settles it | `88283cf`, `45688d0`; #101 on `main` | `test_completeRevertsAtExpiry`, `test_completeOneSecondBeforeExpiryWinsAndBlocksRefund`, `testFuzz_onlyOneSettlementIsValidAtAnyTime`  | Base Mainnet: new pairs `8453-verified-jobs-usdc-v2` and `8453-verified-jobs-arl-v2` (nonces 23 to 26), awaiting signatures. Base Sepolia jobs: redeploy planned. |
| F-3     | `ARLJobs`            | A job's deadline is at most `MAX_DURATION = 365 days` after creation                                                       | `38a3332`                            | `test_longestJobIsStillRefundable`, `testFuzz_expiryWithinBounds`                                                                      | As F-2.                                                                                                                                                           |
| F-4     | `ARLVestingWallet`   | The constructor refuses a schedule whose `cliffEnd` is not in the future                                                   | `2bdb5af`                            | `test_RevertWhen_ScheduleAlreadyElapsed`, `test_StartAtOrBeforeDeploymentIsAllowedWhileTheCliffRuns`, `testFuzz_ConstructorValidation` | The Base Mainnet vesting wallets were deployed with correct parameters; no transaction needed.                                                                    |
| F-5     | `ARLStakingRewards`  | `MAX_REWARDS_DURATION = 365 days` in the constructor and in `setRewardsDuration`                                           | `a60b663`                            | `test_RevertWhen_ConstructorDurationTooLong`, `test_RevertWhen_SetDurationTooLong`, `test_UnallocatedReturnableWithinTheLongestPeriod` | Base Sepolia `0xA78480c1802F5c17B1007c59b7c2CF849549724e` runs the old code: redeploy planned. Not on Base Mainnet.                                               |

Two deliberate departures from the audit's suggestions:

- **F-1:** the nullifier is global rather than keyed by `keccak256(groupId, nullifier)`. The proof
  does not commit to a group, only to a root, and anyone can create a group with any root, so a
  per-group key would still let one proof be replayed into a second group that republishes the
  same root.
- **F-4:** the check is `cliffEnd > block.timestamp`, not `cliffStart > block.timestamp`, so the
  approved TGE deployment, whose cliffs started at deployment, stays valid.

Verification on the branch with the CI tool versions (Foundry 1.8.3): `forge test` 361/361 before
and 371/371 after merging `main`, zk profile 19/19, Halmos 11/11, Slither 0 results, Aderyn within
the triaged baseline (`security/2026-10-28-audit-triage.md`), coverage gate, `check:bytecode`,
`rehearse:local`, dApp unit tests, e2e 14/14.

The auditor's proofs of concept (`poc/ARLPoC.t.sol`, `poc/ARLPoCSignalReplay.t.sol`) are not in
this repository; running them against the fixed code is still to do.

## Retiring the Base Mainnet escrow `0x6c8A…997F`

The escrow `0x6c8A7712010f951f5B03A11C24b46C8b18d5997F` (nonce 21) and its evaluator
`0x3a5dC803b84D5F150FCd2b070cb9D8a12BC35F34` (nonce 22) remain exposed to F-2 and F-3.

- **Open jobs:** none. `jobCounter()` returns 0 and the contract has emitted no event, so no job
  was ever created or funded there (read on 2026-10-30 from `https://mainnet.base.org`).
- **New jobs:** the SDK (`BASE_MAINNET_VERIFIED` in `packages/sdk/src/verified.ts`) already points
  to the ARL pair of the `-v2` plan (`0x4664…98f9`, evaluator `0xa2f8…009E`), and no app, SDK or
  document routes new jobs to the retired pair. The SDK's `requireCode` refuses the new addresses
  until they are deployed.
- **Users and evaluators:** with no jobs there is nothing to settle. Should anyone fund a job on
  the retired escrow, its evaluator must decide before the job's deadline; after it, only
  `claimRefund` returns the escrow to the client.
- **Order of signatures:** `8453-verified-jobs-usdc-v2` (nonces 23 and 24), then
  `8453-verified-jobs-arl-v2` (25 and 26), then `jobs-record-cli.ts` for each pair and the record
  committed, as in [mainnet-services.md](mainnet-services.md).
