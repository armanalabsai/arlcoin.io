# Owner inputs

Everything in the repository that can be built without the owner is built. The items below
need a decision, an account or a public address that only the owner can give. Each entry
says where the input plugs in and what is done once it arrives.

Never send a seed phrase, private key or wallet password. Only public addresses are used. Keys
(API keys, signer keys) go into environment variables or the owner's own tools, never into the
repository or a message.

## Approved decisions (owner-input review, 2026-10-03)

| Decision                                                                                                                   | Where it is enforced                                                                                                           | State in the repository                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VESTING_START = TGE_TIMESTAMP`                                                                                            | `packages/deploy/src/plan.ts`, `ARLDeployPlan`, the verifier                                                                   | In sync. Every vesting schedule starts at the config's `tge`                                                                                                                                                                                                                                                           |
| TGE is when ARL first enters real economic circulation on Base Mainnet. A Base Sepolia deployment is not TGE               | Base Mainnet is hard-locked in every tool; a Base Sepolia `tge` is a test placeholder only                                     | **Conflict, owner call needed.** `docs/tokenomics-economic-spec.md` section 6 (LOCKED) says TGE is "the block in which the ARL token contract is deployed". Not changed in this review (tokenomics document)                                                                                                           |
| Investors and Strategic Partnerships: 12-month cliff, then 36 months linear, from TGE                                      | `VESTING_12_36` in `packages/tokenomics`, the planner, `ARLDeployPlan` and the verifier reject any other schedule              | In sync                                                                                                                                                                                                                                                                                                                |
| Founder: 2,000,000 ARL Founder Unrestricted, 100,000 ARL Founder Reserved, no Founder vesting wallet; Reserved custody TBD | `packages/tokenomics` (Source of Truth), `ARLAllocation.FOUNDER`, `ARLToken` recipients, deploy plan, circulating supply, site | **Conflict, owner call needed.** The repository has one Founder allocation of 2,100,000 ARL, fully unlocked at TGE, minted to one Founder recipient (decision of 2026-09-28, PR #21). No Founder vesting wallet exists (in sync). Splitting it needs a tokenomics and contract change, which this review does not make |

## Decisions

| Input                              | Plugs into                                                                                    | Status                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Presale parameters                 | `packages/tokenomics` (Source of Truth), then contracts, deploy plan, site and launchpad pack | Proposed values recorded; not applied until explicitly approved |
| Founder Reserved (100,000 ARL)     | Custody and the Founder split above                                                           | Custody unapproved / TBD                                        |
| Founder Unrestricted recipient     | Founder recipient in the deployment config                                                    | Address TBD                                                     |
| TGE date                           | `tge` in the deployment config; every vesting schedule starts at it                           | Placeholder `2027-01-01` in the local config; not confirmed     |
| Public Launch claim parameters     | `ARLMerkleDistributor` via `DeployDistributor` (`LAUNCH_PARAMETERS_APPROVED = false`)         | Eligibility, claim duration and per-address cap TBD             |
| Listing price and liquidity size   | Liquidity allocation use; launchpad pack "Sale parameters"                                    | Not locked                                                      |
| Staking reward amount and duration | Funding calls from the Community & Staking holder to `ARLStakingRewards`                      | Not decided                                                     |
| Audit firm                         | `docs/audit-scope.md` is the package to send                                                  | Not selected; no firm is contacted on the owner's behalf        |
| Bug bounty terms                   | `SECURITY.md`                                                                                 | Published before mainnet                                        |
| Legal opinion, KYC provider        | Launchpad pack                                                                                | Not started                                                     |

## Base Sepolia deployment

| Input                                                   | Plugs into                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Public address of the deployer wallet                   | `--sender` of the dry run; the `/deploy` screen checks the connected wallet against it |
| Public addresses of the Safe owners and the threshold   | `CreateSafes` (Safe v1.5.0)                                                            |
| Public addresses of the allocation holders and guardian | A Base Sepolia config next to `contracts/deploy/config/local.json`                     |

The Base Sepolia deployment is a test deployment, not TGE. Its `tge` value is a placeholder.
| At least 0.01 Base Sepolia ETH on the deployer | Gas for the Safe and contract creations |
| A Basescan API key, as `ETHERSCAN_API_KEY` in the shell | `npm run verify:explorer -- --run`; the key is never printed |

Once these arrive, the runbook in [deployment.md](deployment.md) is followed step by step. Each
transaction is explained before it is signed on the phone.

## Hosting and accounts

| Input                                                              | Plugs into                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Hosting for `apps/dapp` (for example a Vercel project)             | The `/deploy` screen on the phone and the public app                             |
| A Base Sepolia RPC URL for the app                                 | `NEXT_PUBLIC_ARL_RPC_URL`                                                        |
| Own Web3Forms access key (optional)                                | `NEXT_PUBLIC_WEB3FORMS_KEY`; a key is already set for the site's forms           |
| Social accounts                                                    | Site footer and launchpad pack                                                   |
| A facilitator operator and its settlement address (funded for gas) | `@arl/payments` facilitator and `@arl/provider`; its key stays with the operator |
