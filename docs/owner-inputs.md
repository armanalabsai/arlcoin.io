# Owner inputs

Everything in the repository that can be built without the owner is built. The items below
need a decision, an account or a public address that only the owner can give. Each entry
says where the input plugs in and what is done once it arrives.

Never send a seed phrase, private key or wallet password. Only public addresses are used. Keys
(API keys, signer keys) go into environment variables or the owner's own tools, never into the
repository or a message.

## Decisions

| Input                              | Plugs into                                                                                    | Status                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Presale parameters                 | `packages/tokenomics` (Source of Truth), then contracts, deploy plan, site and launchpad pack | Proposed values recorded; not applied until explicitly approved |
| Founder vesting                    | Same chain as above                                                                           | To be reviewed separately                                       |
| TGE date                           | `tge` in the deployment config; every vesting schedule starts at it                           | Placeholder `2027-01-01` in the local config; not confirmed     |
| Listing price and liquidity plan   | Liquidity allocation use; launchpad pack "Sale parameters"                                    | Not locked                                                      |
| Staking reward amounts and periods | Funding calls from the Community & Staking holder to `ARLStakingRewards`                      | Not decided                                                     |
| Audit firm                         | `docs/audit-scope.md` is the package to send                                                  | Not selected; no firm is contacted on the owner's behalf        |
| Bug bounty terms                   | `SECURITY.md`                                                                                 | Published before mainnet                                        |
| Legal opinion, KYC provider        | Launchpad pack                                                                                | Not started                                                     |

## Base Sepolia deployment

| Input                                                   | Plugs into                                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Public address of the deployer wallet                   | `--sender` of the dry run; the `/deploy` screen checks the connected wallet against it |
| Public addresses of the Safe owners and the threshold   | `CreateSafes` (Safe v1.5.0)                                                            |
| Public addresses of the allocation holders and guardian | A Base Sepolia config next to `contracts/deploy/config/local.json`                     |
| At least 0.01 Base Sepolia ETH on the deployer          | Gas for the Safe and contract creations                                                |
| A Basescan API key, as `ETHERSCAN_API_KEY` in the shell | `npm run verify:explorer -- --run`; the key is never printed                           |

Once these arrive, the runbook in [deployment.md](deployment.md) is followed step by step. Each
transaction is explained before it is signed on the phone.

## Hosting and accounts

| Input                                                    | Plugs into                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hosting for `apps/dapp` (for example a Vercel project)   | The `/deploy` screen on the phone and the public app                             |
| A Base Sepolia RPC URL for the app                       | `NEXT_PUBLIC_ARL_RPC_URL`                                                        |
| Own Web3Forms access key (optional)                      | `NEXT_PUBLIC_WEB3FORMS_KEY`; a key is already set for the site's forms           |
| Social accounts                                          | Site footer and launchpad pack                                                   |
| A facilitator operator and its funded settlement account | `@arl/payments` facilitator and `@arl/provider`; its key stays with the operator |
