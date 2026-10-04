# Launchpad readiness

Status as of 2026-10-05. ARL is deployed on **Base Sepolia only**; nothing is on Base Mainnet.
**No independent audit has been performed.** Evidence: [audit-evidence.md](audit-evidence.md).

| #   | Requirement                       | Status   | Evidence / minimum action                                                                                                                                                            |
| --- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Verified contracts (testnet)      | PASS     | All four verified on Sourcify and Blockscout (base-sepolia.blockscout.com).                                                                                                          |
| 2   | Verified contracts on Basescan    | BLOCKED  | Owner sets a free Basescan/Etherscan API key as `ETHERSCAN_API_KEY`, then `npm run verify:explorer -- <plan> <deployment> --check-broadcast <run.json> --run`.                       |
| 3   | Independent audit report          | FAIL     | None exists. Apply to a free or subsidised route (see below) or disclose "not audited" on every application. Do not describe the project as audited.                                 |
| 4   | Security evidence                 | PASS     | Tests 247/247, deep fuzz, Slither 0 results, reproducible build, deployment rehearsals, on-chain verification.                                                                       |
| 5   | Security tools re-run on Linux    | OPTIONAL | Aderyn, Halmos and Mythril are supplementary (owner decision 2026-10-05); the Foundry, fuzz, invariant, Slither and reproducibility evidence passes.                                 |
| 6   | Ownership / admin disclosure      | PASS     | Token has no owner, admin, mint, pause or upgrade. Vesting beneficiaries fixed. Timelock: no external admin, 48 h floor, cancel-only guardian. Documented in `docs/token-design.md`. |
| 7   | Multisig custody for mainnet      | FAIL     | Testnet Safes are 1-of-1 (F-1). Owner provides at least 3 signer addresses (2 more) and a threshold of 2 or more for the mainnet Safes.                                              |
| 8   | Clean deployer key                | FAIL     | Deployer EOA has an EIP-7702 delegation (F-2). Owner switches it back in MetaMask, or uses a never-delegated hardware wallet for mainnet.                                            |
| 9   | Tokenomics consistency            | PASS     | 21,000,000 ARL; on-chain balances equal `packages/tokenomics` and `ARLAllocation`; circulating at TGE 2,100,000 ARL.                                                                 |
| 10  | Vesting                           | PASS     | Investors 1.5M and Strategic Partnerships 2M: 12-month cliff then 36 months linear, verified on chain.                                                                               |
| 11  | Timelock                          | PASS     | 1M ARL in the timelock; 48-hour minimum delay, verified on chain.                                                                                                                    |
| 12  | Treasury / guardian controls      | PASS     | Treasury Safe proposes and executes; separate guardian Safe (different owner) can only cancel.                                                                                       |
| 13  | Liquidity plan                    | FAIL     | Owner decides pool size, pair, venue (e.g. Uniswap or Aerodrome on Base) and LP-token custody (locked or held by the Liquidity Safe). Listing price 0.20 USD is decided.             |
| 14  | Sale parameters                   | FAIL     | Owner decides tokens offered, raise, accepted currency and buyer unlock/vesting.                                                                                                     |
| 15  | Source-code reproducibility       | PASS     | `npm run check:bytecode` reproduces the committed bytecode; deployment proof matches the chain.                                                                                      |
| 16  | Public source repository          | BLOCKED  | GitHub account suspended (ticket 4818868). Most launchpads require a public repo link. Restore GitHub, or publish the backup bundle to another host the owner controls.              |
| 17  | Project documentation             | PASS     | Whitepaper-level docs in `docs/` (tokenomics, token design, deployment, security).                                                                                                   |
| 18  | Security contact                  | FAIL     | `SECURITY.md` points to GitHub private reporting, which is unavailable. Owner provides an email on the project domain.                                                               |
| 19  | Legal opinion / KYC               | FAIL     | Not started. Owner chooses counsel and a KYC provider if the launchpad requires them.                                                                                                |
| 20  | Social and community channels     | FAIL     | Owner creates the accounts and gives the links.                                                                                                                                      |
| 21  | Public test period and bug bounty | BLOCKED  | Proposed in [bug-bounty.md](bug-bounty.md); needs the security contact (18) and a public repo (16).                                                                                  |
| 22  | Mainnet deployment                | BLOCKED  | Requires items 7, 8, 13 and 14, and an approved TGE; Base Mainnet stays locked in the tooling until then.                                                                            |

## Free or subsidised audit routes (checked 2026-10-05)

| Route                                   | What it offers                                                                                                                                   | Fit for ARL                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Base Services Hub: Security.xyz         | Marketplace: an audit request returns proposals from auditors, each offering up to 100,000 USD of discount ("security grants") for Base builders | Not free: it lowers a paid audit's price. Site unreachable on 2026-10-05; terms from docs.base.org/base-services-hub |
| Base Services Hub: Runtime Verification | Free audit-readiness assessment and consultation, for Base builders who select "Base" or mention Base when contacting                            | The only genuinely free item found; an assessment, not an audit                                                      |
| Sherlock, Code4rena, CodeHawks contests | Paid by the project (prize pool)                                                                                                                 | No free route found for project audits                                                                               |
| CodeHawks First Flights                 | Practice contests on codebases chosen by Cyfrin                                                                                                  | Not an application route for projects; no claim can be made from it                                                  |
| Superchain / Hacken audit grants        | Subsidised audits for OP Stack projects                                                                                                          | Possible; eligibility not confirmed                                                                                  |

No application has been submitted. Each needs the owner's approval because it sends project
information to a third party.
