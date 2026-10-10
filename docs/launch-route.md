# Launch route (approved 2026-10-05)

**Owner decision:** launch ARL ourselves with no project cash; also apply to launchpads, but only
where applying and launching cost nothing up front. Nothing has been submitted or deployed.

## 1. Own launch (primary)

Everything uses contracts and tooling already in this repository; only Base gas is spent
(about 0.00005 ETH for the deployment, see [mainnet-plan.md](mainnet-plan.md)).

1. **Deploy** the 12 Safes and the 4 contracts on Base Mainnet from the clean deployer, after the
   reviewed `networkGate` change. The token mints 5,000,000 ARL to the Public Launch Safe and
   2,000,000 ARL to the Liquidity Safe.
2. **Pools, single-sided:** the Liquidity Safe (2-of-3) opens ARL/USDC, ARL/USDT, ARL/WETH and
   ARL/cbBTC pools (owner decision 2026-10-05); each is an ARL-only concentrated-liquidity
   position on Uniswap on Base, initialised at 0.20 USD per ARL, with a price range that starts
   at 0.20 USD and lies entirely above the current price, so it holds only ARL. Buyers pay the
   quote token into the pool; nothing is sold below the floor and no quote token is needed to
   open it. The WETH and cbBTC floors are fixed in ETH and BTC at the ETH and BTC prices when the
   batch is built. The position NFTs stay in the Liquidity Safe for at least 12 months. The ARL amount in the range is a Safe
   decision at the time (not set here).
3. **Public Launch claim:** the Public Launch Safe funds `ARLMerkleDistributor` with at most
   500,000 ARL for whitelist sign-ups, at most 10,000 ARL each,
   claimable for 60 days (`DeployDistributor` enforces the tranche and the window). Once the
   distributor is funded, `claim-list-cli.ts` reads it on chain (code, root, token, open window,
   balance covering the list total) and only then writes `apps/dapp/public/claims/<chainId>.json`;
   the app's Claim screen (`/app/claim/`) serves that list, checks every proof and the
   distributor's root again, and offers the claim. Until the file exists the screen says nothing
   can be claimed.
4. **Monitoring:** `monitor-cli.ts` from the deployment block; the guardian reviews every
   timelock notice.

Each Safe transaction is prepared as a file, simulated on a fork and signed by two of the three
owners in the Safe app. Legal compliance of selling to the public in the owner's jurisdiction is
the owner's responsibility.

## 2. Launchpad applications (secondary, free only)

Checked 2026-10-05. Application fees are not published by either platform; the sources describe
free application and curated selection. Any fee or token allocation asked later is decided by
the owner before accepting.

| Platform     | How to apply                                                                                                                                                   | What the form asks | Gaps for ARL           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------- |
| Seedify      | Not available: on 2026-10-05 seedify.fund redirects to an unrelated token-creating testnet launchpad (vibevibe.fun)                                            | -                  | Excluded               |
| Polkastarter | Applied 2026-10-05 (forms.polkastarter.com/apply; answers in [polkastarter-application.md](polkastarter-application.md)); research review, then a council vote | -                  | Waiting for the review |
| TrustSwap    | Curated, "by arrangement"                                                                                                                                      | Not published      | Unknown terms          |

Excluded: PinkSale (0.2 ETH upfront), and token-creating launchpads (Clanker, Zora, Flaunch, Mint
Club, Virtuals), which deploy their own token instead of selling ARL.

### Draft application text (not sent)

> **ARL Protocol** (arlcoin.io) is an application protocol on Base that brings open standards
> together around one fixed-supply token: x402 usage-based payments, ERC-8004 service identity
> and reputation, ERC-8183 job escrow and Semaphore anonymous signals. ARL: 21,000,000 supply,
> minted once, no owner, mint, pause or upgrade; investors and partners vest 12 + 36 months; the
> treasury sits behind a 48-hour timelock with a cancel-only guardian; the allocations are held in 2-of-3
> Safes. Deployed and source-verified on Base Sepolia (token
> 0x244312b619127B6458154F3467eFD7c87CD28500); 251 contract tests, fuzzing, invariants, Slither
> with no findings and reproducible bytecode. No independent audit has been performed. TGE
> target 2026-11-01 at 0.20 USD. Contact: team@arlcoin.io.

Shared on submission: the text above, the website, the Base Sepolia addresses, the docs listed in
[launchpad-application.md](launchpad-application.md), the owner's name, email and Telegram ID.
