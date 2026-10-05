# CoinGecko and CoinMarketCap Listing Applications

Status: **prepared; submitted after the TGE (2026-11-01).** Both sites list only tokens that are
live on-chain and trading on a venue they track, so neither application can be accepted before the
Base Mainnet deployment and the Uniswap pools exist. Everything else is ready. Their forms change;
check each form when submitting. Listing is free on both sites: ignore anyone who offers a paid or
guaranteed listing.

## Ready now

| Field                     | Value                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project name / ticker     | ARL / ARL                                                                                                                                        |
| Chain                     | Base (chain ID 8453)                                                                                                                             |
| Decimals / standard       | 18 / ERC-20 with EIP-2612 permit                                                                                                                 |
| Maximum and total supply  | 21,000,000 ARL (fixed; minted once in the constructor; no mint function)                                                                         |
| Circulating supply at TGE | 2,100,000 ARL (the Founder allocation), before Public Launch claims and pool sales                                                               |
| Circulating supply method | Total supply minus the balances of the protocol-controlled and locked addresses in the published manifest                                        |
| Supply API                | `https://arlcoin.io/api/supply/?q=circulating` and `https://arlcoin.io/api/supply/?q=total` (plain number, read from the chain on every request) |
| Launch date               | 2026-11-01 (TGE)                                                                                                                                 |
| Trading venues and pairs  | Uniswap v3 on Base, 1%: ARL/USDC, ARL/USDT, ARL/WETH, ARL/cbBTC (pool addresses after the TGE)                                                   |
| Website                   | https://arlcoin.io                                                                                                                               |
| Source code               | https://gitlab.com/armanalabs-group/arlcoin                                                                                                      |
| Whitepaper / deck         | https://arlcoin.io/arl-pitch-deck.pdf, https://arlcoin.io/docs/tokenomics/                                                                       |
| Audit                     | None. Audit requests sent 2026-10-05 ([independent-audit-plan.md](independent-audit-plan.md)); bug bounty open                                   |
| Logo                      | https://arlcoin.io/arl-token-200.png (200 × 200 PNG), https://arlcoin.io/arl-token-512.png, https://arlcoin.io/arl-token.svg                     |
| Social accounts           | https://x.com/armanalabsai, https://www.instagram.com/armanalabsai                                                                               |
| Contact                   | armanalabsai@gmail.com; Alaz Dağhan Göktürk, Founder and CEO                                                                                     |

### Short description (English, for the form)

> ARL is the utility token of ARL Protocol on Base for AI and compute services: services are paid
> per use over x402, listed on an ERC-8004 registry and hired through an ERC-8183 escrow. The supply
> is fixed at 21,000,000 ARL, minted once, with no owner, mint, pause or upgrade. Investor and
> partnership allocations vest 12 + 36 months, the treasury sits behind a 48-hour timelock, and every
> allocation is held by a dedicated 2-of-3 Safe, a vesting wallet or the timelock.

## Filled in on the day

| Field            | Source                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Contract address | The verified Base Mainnet deployment manifest                                                             |
| Block explorer   | `https://basescan.org/token/<ARL token>`                                                                  |
| Pool links       | `https://app.uniswap.org/explore/pools/base/<pool>` for each of the four pools                            |
| Supply API       | `node packages/deploy/src/supply-config-cli.ts <manifest.json> apps/web/api/supply-config.json`, redeploy |

## Gaps

- **E-mail on the project domain:** done 2026-10-05. Every address at arlcoin.io (team@, info@ ...)
  forwards to armanalabsai@gmail.com through ImprovMX (MX and SPF records on Vercel DNS); tested.
  Receiving only: replying from the domain needs a paid plan, so replies come from Gmail.
- **Trading history.** Both sites look for real trading on the pools before listing; apply a few
  days after the TGE.

## Checklist on submission day

- [ ] Contract verified on Basescan; `VerifyARL` passes against the deployed addresses
- [ ] `supply-config.json` deployed; `/api/supply` returns the on-chain figures
- [ ] Four pools live; pool links collected
- [ ] Every field above checked against the chain
