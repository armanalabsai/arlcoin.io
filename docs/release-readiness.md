# Release readiness

Prepared 2026-10-05. Nothing here has been sent, signed or submitted. Base Sepolia live; Base Mainnet opens only at the TGE (2026-10-23T00:00:00Z).

## 1. Current state (read-only checks, Base Sepolia block 47,690,188)

| Item                           | Value                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Deployer code (EIP-7702)       | None: delegation removed 2026-10-05; `eth_getCode` = `0x` again at block 47,937,338 (2026-10-10) |
| Deployer nonce / pending       | 16 / 16 (no pending transaction)                                                                 |
| Deployer balance               | 0.000958686738489671 ETH                                                                         |
| Investors vesting              | `0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE` (unchanged)                                         |
| Strategic Partnerships vesting | `0x02c7692918C98EC710970D390b08f247A76D5A37` (unchanged)                                         |
| Treasury timelock              | `0x5B3fd9E574BC07309949CD39161a295E22FbBd3D` (unchanged)                                         |
| ARL token                      | `0x244312b619127B6458154F3467eFD7c87CD28500` (unchanged), total supply 21,000,000 ARL            |
| Tokenomics / TGE               | Unchanged: 11 allocations, circulating at TGE 2,100,000 ARL, TGE target 2026-10-23               |

The delegation is absent on Base Mainnet, Ethereum and Ethereum Sepolia (`code = 0x`, nonce 0),
and since 2026-10-05 on Base Sepolia too (`eth_getCode` returns `0x`): F-2 is resolved. Procedure: [verification-evidence.md](verification-evidence.md#eip-7702-clean-up-f-2).
In MetaMask the smart-account switch is per network: select **Base Sepolia** before switching back.

## 2. Remaining items by type

| Item (launchpad-readiness #)                | Type                 | Minimum action                                                                                                       |
| ------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| EIP-7702 delegation on the deployer (8)     | DONE                 | Removed on Base Sepolia (`eth_getCode` = `0x`, rechecked 2026-10-10); mainnet uses a fresh, never-delegated deployer |
| Mainnet Safe signers and threshold (7)      | DONE                 | Provided 2026-10-10; mainnet fork rehearsal passes ([mainnet-plan.md](mainnet-plan.md))                              |
| Aderyn, Halmos, Mythril re-run on Linux (5) | DONE                 | Re-run on Linux 2026-10-10 ([verification-evidence.md](verification-evidence.md))                                    |
| Basescan verification (2)                   | DONE                 | All four Base Sepolia contracts verified on Basescan (owner check 2026-10-10)                                        |
| Public source repository (16)               | DONE                 | https://github.com/armanalabsai/arlcoin.io                                                                           |
| Liquidity plan (13)                         | ADMIN/LEGAL          | Pool size, pair, venue, LP custody                                                                                   |
| Sale parameters (14)                        | DONE                 | Decided (launchpad-readiness #14)                                                                                    |
| Security contact (18)                       | DONE                 | `team@arlcoin.io` (owner decision 2026-10-05)                                                                        |
| Legal opinion, KYC (19)                     | ADMIN/LEGAL          | Legal opinion done; KYC provider if the launchpad requires one                                                       |
| Social channels (20)                        | OPTIONAL             | Required by most launchpads in practice                                                                              |
| Public test period and bug bounty (21)      | OPTIONAL             | Needs items 16 and 18                                                                                                |
| Mainnet deployment (22)                     | Follows the blockers | After all technical blockers and an approved TGE                                                                     |

## 3. Base Mainnet security architecture (proposal; nothing created)

The tooling creates 11 role Safes with one signer set (`ARL_SAFE_OWNERS`, `ARL_SAFE_THRESHOLD`)
and a guardian Safe with a separate, disjoint set (`ARL_GUARDIAN_OWNERS`, `ARL_GUARDIAN_THRESHOLD`).
Different thresholds per role would need a tooling change, so the proposal works within it.
`CreateSafes` and `DeployARL` refuse Base Mainnet today (network gate); opening it is a separate,
reviewed change made only after the blockers below are closed.

| Role                                                                                     | Signers                                                                            | Threshold                | Devices    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------ | ---------- |
| Deployer                                                                                 | 1 fresh EOA, never delegated, used only to deploy; holds no role                   | n/a                      | Ledger     |
| 11 role Safes (incl. Founder, Treasury, Liquidity, Public Launch, vesting beneficiaries) | 3 signers: Founder + 2 trusted signers in different locations                      | **2-of-3**               | 3 Ledgers  |
| Guardian Safe                                                                            | 2 signers (minimum 1), disjoint from the role-Safe signers                         | **1-of-2** (fast cancel) | 2 Ledgers  |
| Treasury timelock                                                                        | Proposer and executor: Treasury Safe; canceller: Guardian Safe; delay 48 h (floor) | n/a                      | (contract) |

- Guardian 1-of-2 is safe because the guardian can only cancel; it cannot propose, execute or move
  funds. A higher threshold would slow an emergency cancel.
- Founder Safe: under the approved 2-of-3 architecture (owner decision 2026-10-05), like every
  role Safe. It holds the 2,100,000 ARL Founder allocation, unlocked at TGE; moving it needs two of
  the three signers. No tooling change.
- Ledger: each signer connects the Ledger to the Safe{Wallet} web app (directly or through
  MetaMask). Keep MetaMask's smart-account and gas-sponsorship off for every signer and the
  deployer. Verify every transaction hash on the Ledger screen.
- Larger setups (for example 3-of-5 for the role Safes, as the timelock NatSpec assumes) need two
  more signers.

## 4. Basescan verification procedure

Foundry 1.8.3 uses the Etherscan V2 API, so one free Etherscan key covers Base Sepolia and Base.

1. The owner creates a free key at etherscan.io (account, **API Keys**).
2. The owner stores it as a user environment variable without showing it on screen, in PowerShell:

   ```powershell
   $k = Read-Host "Etherscan API key" -AsSecureString
   [Environment]::SetEnvironmentVariable("ETHERSCAN_API_KEY", [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($k)), "User")
   ```

   Then opens a new terminal. The key never goes into the repository, a config file or a message.

3. On this machine, where the git-ignored plan and deployment records are kept, verify (checks the constructor arguments against the signed transactions first):

   ```
   cd contracts
   node ../packages/deploy/src/explorer-cli.ts deploy/deployments/84532-plan.json deploy/deployments/84532-deployment.json --check-broadcast ../apps/dapp/public/plans/84532-deploy.json --run
   ```

4. Confirm on `sepolia.basescan.org` that each of the four addresses shows "Contract Source Code
   Verified".

## 5. Public repository

### What the reviewers need

| Reviewer                | Need                                                    | Source                         |
| ----------------------- | ------------------------------------------------------- | ------------------------------ |
| Launchpads and listings | A public repository link next to the verified contracts | `docs/listing-applications.md` |

A public repository is needed for launchpads.

### Checklist before publishing (nothing published)

| Check                                                   | Result (2026-10-05)                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| No private keys, seeds or API keys in tracked files     | PASS: pattern scan of every tracked file found none                                                                |
| Signer configuration not committed                      | PASS: `contracts/deploy/deployments/` and `deploy/plans/` are git-ignored                                          |
| Web3Forms access key in `apps/web/src/content/forms.ts` | Accepted: a Web3Forms access key is a public, client-side key by design; it only lets forms post to the team inbox |
| Contact email in the site and docs                      | `team@arlcoin.io` is public by intent (contact form)                                                               |
| Author emails in Git history                            | Every commit is authored with `team@arlcoin.io` (history rewritten by owner decision on 2026-10-06)                |
| Licences                                                | PASS: `LICENSE` (Apache-2.0), `NOTICE`, `THIRD_PARTY_LICENSES.md`                                                  |
| Security policy and contact                             | `SECURITY.md` present; the reporting link must be updated to the new host                                          |
| Submodules                                              | OpenZeppelin, forge-std, solidity-datetime from their public upstreams (pinned commits)                            |
| Branches                                                | 53 local branches; publish `main` (others are merged or superseded)                                                |
| README, docs, deployment addresses                      | Present; Base Sepolia addresses in `docs/verification-evidence.md`                                                 |
| Repository URL in docs                                  | https://github.com/armanalabsai/arlcoin.io appears in docs; update if the host changes                             |

To publish (owner action): restore the GitHub account (ticket 4818868) and push `main` from the
local repository, or create a repository on another host the owner controls and push `main` there.

## 6. Remaining release checklist (CTO decision 2026-10-05: no mainnet yet)

| #   | Item                                                                              | Owner action                        | Status                                                          |
| --- | --------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| 1   | EIP-7702 delegation removed on Base Sepolia                                       | MetaMask clean-up on Base Sepolia   | Done; `cast code` = `0x` (2026-10-10)                           |
| 2   | Public repository https://github.com/armanalabsai/arlcoin.io                      | Push `main` (owner runs the push)   | Done; public, `main` (checked 2026-10-10)                       |
| 3   | Basescan verification                                                             | Set `ETHERSCAN_API_KEY` (section 4) | Done 2026-10-10 (Base Sepolia, 4/4)                             |
| 4   | Mainnet signers: 3 Ledger role signers, guardian signer(s), clean Ledger deployer | Provide public addresses            | Done 2026-10-10; fork rehearsal passes (`docs/mainnet-plan.md`) |
| 5   | Liquidity plan and sale parameters                                                | Decide                              | Sale parameters decided (launchpad-readiness #14)               |
| 6   | Legal opinion / KYC, social channels                                              | Decide                              | Open                                                            |
| 7   | Mainnet network gate                                                              | Separate reviewed change after 1-6  | Locked                                                          |

Supplementary: Aderyn, Halmos and Mythril re-run on Linux on 2026-10-10 (done).
