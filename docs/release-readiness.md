# Release readiness

Prepared 2026-10-05. Nothing here has been sent, signed or submitted. **No independent audit has
been performed.** Base Sepolia only; Base Mainnet is locked in the tooling.

## 1. Current state (read-only checks, Base Sepolia block 47,690,188)

| Item                           | Value                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Deployer                       | `0x3c3f71d694f709cBe60f015717c54A795636b165`                                          |
| Deployer code (EIP-7702)       | `0xef0100` + `63c0c19a282a1b52b07dd5a65b58948a07dae32b`: **delegation still active**  |
| Deployer nonce / pending       | 16 / 16 (no pending transaction)                                                      |
| Deployer balance               | 0.000958686738489671 ETH                                                              |
| Investors vesting              | `0x830e35CdF48F8F30F83d1DBE8431f02a7BE9dCcE` (unchanged)                              |
| Strategic Partnerships vesting | `0x02c7692918C98EC710970D390b08f247A76D5A37` (unchanged)                              |
| Treasury timelock              | `0x5B3fd9E574BC07309949CD39161a295E22FbBd3D` (unchanged)                              |
| ARL token                      | `0x244312b619127B6458154F3467eFD7c87CD28500` (unchanged), total supply 21,000,000 ARL |
| Tokenomics / TGE               | Unchanged: 11 allocations, circulating at TGE 2,100,000 ARL, TGE target 2026-12-01    |

The delegation is absent on Base Mainnet, Ethereum and Ethereum Sepolia (`code = 0x`, nonce 0),
so the clean-up has not reached Base Sepolia. Procedure: [audit-evidence.md](audit-evidence.md#eip-7702-clean-up-f-2).
In MetaMask the smart-account switch is per network: select **Base Sepolia** before switching back.

## 2. Application drafts (not submitted)

### Runtime Verification: free audit-readiness assessment

Offer (docs.base.org/base-services-hub, 2026-10-05): "FREE Audit Readiness assessment and
consultation; 10% off all formal verification and security services". Claim by choosing "Base" as
ecosystem on `amp.runtimeverification.com` (unreachable from this machine on 2026-10-05), or by
writing to `gregory.makodzeba@runtimeverification.com` mentioning Base.

Form at `runtimeverification.com/contact`, step 1 (steps 2 "Scope" and 3 "Contact" not opened):

| Field                        | Draft value                                                                |
| ---------------------------- | -------------------------------------------------------------------------- |
| Project name \*              | ARL Protocol                                                               |
| Project website              | https://arlcoin.io                                                         |
| Services \*                  | Not sure yet (requesting the free Base audit-readiness assessment)         |
| How did you hear about us \* | Other: Base Services Hub                                                   |
| How soon                     | Planning ahead 1-3 months                                                  |
| Project description          | See text below                                                             |
| Scope (step 2)               | 6 contracts, 368 nSLOC (`docs/audit-scope.md`); 4 deployed on Base Sepolia |
| Contact (step 3)             | Owner's name and a project email (needed; not yet available)               |

Description / email text:

> We are building ARL Protocol on Base and would like the free audit-readiness assessment offered
> to Base builders through the Base Services Hub. ARL is a fixed-supply ERC-20 (21,000,000 ARL,
> minted once, no owner, mint, pause or upgrade) with OpenZeppelin-based vesting wallets, a treasury
> TimelockController with a 48-hour floor and a cancel-only guardian, a Merkle claim distributor and
> a Synthetix-style staking contract. In scope: 6 contracts, 368 nSLOC, solc 0.8.36, OpenZeppelin
> v5.6.1 unmodified. The system is deployed and source-verified on Base Sepolia (token
> 0x244312b619127B6458154F3467eFD7c87CD28500). No independent audit has been done. Existing
> evidence: 247 Foundry tests with fuzzing and invariants, Slither with 0 results, Halmos symbolic
> checks, reproducible bytecode and deployment rehearsals. We target a mainnet launch around
> 2026-12-01, subject to the security work.

Would be shared: the text above, project name and website, the Base Sepolia addresses, and (on
request) the code. **Blockers:** a contact email; read access to the code (GitHub is suspended).

### Security.xyz: audit request (discounted, not free)

Offer (docs.base.org/base-services-hub, 2026-10-05): a free marketplace; "Each auditor on
base.security.xyz is offering up to $100,000 in security grants for base builders." Submitting an
audit request returns proposals "with discounts applied". **It does not provide a free audit**; any
accepted proposal is a paid engagement. `security.xyz` and `base.security.xyz` did not load from
this machine or browser on 2026-10-05, so the form fields could not be confirmed.

Likely request content (to confirm when the site loads):

| Item          | Draft                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Project       | ARL Protocol, https://arlcoin.io, building on Base                                                                           |
| Scope         | `contracts/src`: ARLToken, ARLAllocation, ARLVestingWallet, ARLTimelock, ARLMerkleDistributor, ARLStakingRewards (368 nSLOC) |
| Out of scope  | Deployment tooling, front ends, ARLJobs, ARLAnonymousSignal (not in the launch)                                              |
| Code access   | Repository link at a fixed commit (needed; GitHub suspended)                                                                 |
| Documentation | `docs/audit-scope.md`, `docs/token-design.md`, `docs/audit-evidence.md`                                                      |
| Timeline      | Before 2026-11-20, for a 2026-12-01 TGE target                                                                               |
| Budget        | Owner decision; paid engagement                                                                                              |
| Contact       | Project email (needed)                                                                                                       |

## 3. Remaining items by type

| Item (launchpad-readiness #)                | Type                 | Minimum action                                                                                               |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| EIP-7702 delegation on the deployer (8)     | TECHNICAL BLOCKER    | Switch back to a standard account on Base Sepolia; or use a fresh Ledger for mainnet                         |
| Mainnet Safe signers and threshold (7)      | TECHNICAL BLOCKER    | Provide signer addresses (section 4)                                                                         |
| Aderyn, Halmos, Mythril re-run on Linux (5) | OPTIONAL             | Supplementary (owner decision 2026-10-05); tests, fuzz, invariants, Slither and reproducibility already pass |
| Basescan verification (2)                   | TECHNICAL BLOCKER    | Set `ETHERSCAN_API_KEY` (section 5)                                                                          |
| Public source repository (16)               | TECHNICAL BLOCKER    | Restore GitHub (ticket 4818868) or publish to another owned host                                             |
| Liquidity plan (13)                         | ADMIN/LEGAL          | Pool size, pair, venue, LP custody                                                                           |
| Sale parameters (14)                        | ADMIN/LEGAL          | Tokens offered, raise, currency, buyer unlock                                                                |
| Security contact (18)                       | ADMIN/LEGAL          | Choose an address: the site already lists `armanalabsai@gmail.com`; a project-domain address is preferred    |
| Legal opinion, KYC (19)                     | ADMIN/LEGAL          | Counsel and provider, if the launchpad requires them                                                         |
| Independent audit (3)                       | ADMIN/LEGAL          | Decide: paid audit, or disclose "not audited"                                                                |
| Social channels (20)                        | OPTIONAL             | Required by most launchpads in practice                                                                      |
| Public test period and bug bounty (21)      | OPTIONAL             | Needs items 16 and 18                                                                                        |
| Runtime Verification readiness assessment   | OPTIONAL             | Free; needs items 16 and 18                                                                                  |
| Mainnet deployment (22)                     | Follows the blockers | After all technical blockers and an approved TGE                                                             |

## 4. Base Mainnet security architecture (proposal; nothing created)

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

## 5. Basescan verification procedure

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

## 6. Public repository

### What the reviewers need

| Reviewer                | Need                                                                                                              | Source                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Runtime Verification    | Code access for the readiness assessment: a public repository, or read access to a private one, at a fixed commit | Inferred from their audit process; not stated on the Base offer |
| Security.xyz auditors   | Code to scope a proposal: repository link and commit                                                              | Inferred; site unreachable on 2026-10-05                        |
| Launchpads and listings | A public repository link next to the verified contracts                                                           | `docs/listing-applications.md`                                  |

A private repository with read access for one reviewer is enough for Runtime Verification. A
public one is needed for launchpads.

### Checklist before publishing (nothing published)

| Check                                                   | Result (2026-10-05)                                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| No private keys, seeds or API keys in tracked files     | PASS: pattern scan of every tracked file found none                                                                            |
| Signer configuration not committed                      | PASS: `contracts/deploy/deployments/` and `deploy/plans/` are git-ignored                                                      |
| Web3Forms access key in `apps/web/src/content/forms.ts` | Accepted: a Web3Forms access key is a public, client-side key by design; it only lets forms post to the team inbox             |
| Contact email in the site and docs                      | `armanalabsai@gmail.com` is public by intent (contact form)                                                                    |
| Author emails in Git history                            | 4 author names, all with `gokturkalazdaghan@gmail.com`. Publishing shows this address. History is not rewritten; owner decides |
| Licences                                                | PASS: `LICENSE` (Apache-2.0), `NOTICE`, `THIRD_PARTY_LICENSES.md`                                                              |
| Security policy and contact                             | `SECURITY.md` present; the reporting link must be updated to the new host                                                      |
| Submodules                                              | OpenZeppelin, forge-std, solidity-datetime from their public upstreams (pinned commits)                                        |
| Branches                                                | 53 local branches; publish `main` (others are merged or superseded)                                                            |
| README, docs, deployment addresses                      | Present; Base Sepolia addresses in `docs/audit-evidence.md`                                                                    |
| Repository URL in docs                                  | `gokturkalazdaghan-dot/ARLCOIN` appears in docs; update if the host changes                                                    |

To publish (owner action): restore the GitHub account (ticket 4818868) and push `main` from the
local repository, or create a repository on another host the owner controls and push `main` there.
