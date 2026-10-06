# Owner inputs

Everything in the repository that can be built without the owner is built. The items below
need a decision, an account or a public address that only the owner can give. Each entry
says where the input plugs in and what is done once it arrives.

Never send a seed phrase, private key or wallet password. Only public addresses are used. Keys
(API keys, signer keys) go into environment variables or the owner's own tools, never into the
repository or a message.

## Settled decisions (owner decision, 2026-10-03)

These are the repository's existing decisions, confirmed by the owner. Nothing in the
contracts, tokenomics Source of Truth, deployment logic or vesting changes.

| Decision                                                                                                               | Where it is enforced                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| TGE is the block in which the ARL token contract is deployed (`docs/tokenomics-economic-spec.md` section 6, unchanged) | The deployment tooling; Base Mainnet opens only at the TGE (2026-11-01T00:00:00Z) in every tool       |
| A Base Sepolia deployment is a testnet deployment and is not the economic TGE                                          | Its `tge` config value is a test placeholder                                                          |
| The Base Mainnet token deployment is the TGE                                                                           | The TGE date and block are TBD until a Mainnet launch is approved                                     |
| `VESTING_START = TGE_TIMESTAMP`                                                                                        | `packages/deploy/src/plan.ts`, `ARLDeployPlan`, the verifier                                          |
| Investors and Strategic Partnerships: 12-month cliff, then 36 months linear, from TGE                                  | `VESTING_12_36` in `packages/tokenomics`; the planner, `ARLDeployPlan` and the verifier refuse others |
| Founder: one allocation of 2,100,000 ARL, fully unlocked at TGE, no Founder vesting wallet                             | `packages/tokenomics`, `ARLAllocation.FOUNDER`; minted once to the Founder recipient                  |

## Launch targets (owner decision, 2026-10-03)

| Decision                                                                                                                                                          | Status                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Listing price: 0.20 USD per ARL (FDV 4,200,000 USD at the 21,000,000 ARL supply)                                                                                  | Decided; raise, accepted currency and liquidity size still TBD                       |
| Target TGE: 2026-11-01, if the public Base Sepolia test period (about 4 weeks) ends with no open Critical or High finding; otherwise moved                        | The tooling opens Base Mainnet at 2026-11-01T00:00:00Z                               |
| No paid audit (owner decision, 2026-10-04): free checks, a public test period and a bounty paid in ARL only for accepted reports ([bug-bounty.md](bug-bounty.md)) | Decided; listings and launchpads are told plainly that no independent audit was done |

A split of the Founder allocation into 2,000,000 ARL unrestricted and 100,000 ARL reserved is
**not** adopted. It remains a possible future owner decision and is not implemented.

## Decisions

| Input                              | Plugs into                                                                                          | Status                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presale parameters                 | `packages/tokenomics` (Source of Truth), then contracts, deploy plan, site and launchpad pack       | Proposed values recorded; not applied until explicitly approved                                                                                     |
| Founder recipient                  | The Founder Safe in the deployment config (receives the 2,100,000 ARL)                              | Address TBD                                                                                                                                         |
| TGE date                           | `TGE_DATE` in `packages/tokenomics`; required by the planner off local Anvil and Base Sepolia       | **2026-11-01** (owner decision 2026-10-05)                                                                                                          |
| Public Launch claim parameters     | `PUBLIC_LAUNCH` in `packages/tokenomics`; `DeployDistributor` (`LAUNCH_PARAMETERS_APPROVED = true`) | **500,000 ARL at TGE, 10,000 per address, 60 days** (owner decision 2026-10-05)                                                                     |
| Liquidity                          | Liquidity Safe; spec section 13                                                                     | **No project cash:** launch proceeds, or single-sided ARL at or above 0.20 USD; LP in the Liquidity Safe, 12-month lock (owner decision 2026-10-05) |
| Staking reward amount and duration | Funding calls from the Community & Staking holder to `ARLStakingRewards`                            | Not decided                                                                                                                                         |
| Bug bounty terms                   | [bug-bounty.md](bug-bounty.md)                                                                      | **Approved 2026-10-05:** 40,000 / 15,000 / 4,000 / 500 ARL, 200,000 ARL per period, paid in ARL only for accepted reports                           |
| Legal opinion, KYC provider        | Launchpad pack                                                                                      | Not started                                                                                                                                         |

## Base Sepolia deployment checklist

A testnet deployment; it is not the TGE. Nothing is deployed until every item below is provided
and the owner gives the go-ahead. Only **public** addresses are recorded. No private key, seed
phrase, password or API key value is ever sent, written to this repository or put in a config
file.

| #   | Owner input                                                                                         | Used by                                                                                                                                                                                                                       | Status                |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Deployer public address                                                                             | `--sender` of the dry run; the `/deploy` screen checks the connected wallet against it                                                                                                                                        | Required              |
| 2   | Deployer balance of at least 0.01 Base Sepolia ETH                                                  | Gas for the Safe and contract creations                                                                                                                                                                                       | Required              |
| 3   | Safe owner public addresses                                                                         | `ARL_SAFE_OWNERS` for `CreateSafes`: the signers of the 11 role Safes other than the guardian                                                                                                                                 | Required              |
| 4   | Safe threshold                                                                                      | `ARL_SAFE_THRESHOLD`: signatures required on those Safes                                                                                                                                                                      | Required              |
| 5   | Guardian Safe owner public addresses, disjoint from item 3                                          | `ARL_GUARDIAN_OWNERS`; the guardian is the treasury timelock's cancel-only role and is required                                                                                                                               | Required              |
| 6   | Guardian Safe threshold                                                                             | `ARL_GUARDIAN_THRESHOLD`                                                                                                                                                                                                      | Required              |
| 7   | Distribution recipients                                                                             | Every recipient must be a dedicated Safe v1.5.0 proxy. `CreateSafes` creates the 12 role Safes from items 3–6 and writes their addresses. Alternatively the owner gives 12 existing Safe v1.5.0 proxy addresses, one per role | Required              |
| 8   | Basescan API key, set by the owner as `ETHERSCAN_API_KEY` on the machine that runs the verification | `npm run verify:explorer -- --run`; the value is never printed or shared                                                                                                                                                      | Required              |
| 9   | App hosting (for example a Vercel project) and a Base Sepolia RPC URL                               | Serves `apps/dapp`, including the `/deploy` screen used to sign from a phone; `NEXT_PUBLIC_ARL_RPC_URL`                                                                                                                       | Required              |
| 10  | Facilitator settlement public address                                                               | Pays the gas of payment settlements in `@arl/payments`; its key stays with the operator                                                                                                                                       | Required for payments |
| 11  | Base Sepolia ETH on the settlement address                                                          | Gas for settlements                                                                                                                                                                                                           | Required for payments |

The 12 roles of item 7: Founder, Investors, Strategic Partnerships, Treasury, Guardian, Public
Launch, Community & Staking, Ecosystem & Growth, Liquidity, Team, Early Users, Grants & Bug
Bounty. The Investors and Strategic Partnerships Safes are the vesting wallets' beneficiaries.

Not needed for the Base Sepolia deployment and not chosen here: the TGE date (a test placeholder
is used), staking reward amount and duration, Public Launch eligibility, claim duration and
per-address cap, liquidity size and listing price.

Once items 1–9 arrive, the runbook in [deployment.md](deployment.md#base-sepolia-runbook) is
followed step by step. Each transaction is explained before it is signed.

## Hosting and accounts

| Input                               | Plugs into                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Own Web3Forms access key (optional) | `NEXT_PUBLIC_WEB3FORMS_KEY`; a key is already set for the site's forms           |
| Social accounts                     | Site footer and launchpad pack                                                   |
| A facilitator operator              | Runs `@arl/payments`' facilitator service; uses the settlement address (item 10) |
