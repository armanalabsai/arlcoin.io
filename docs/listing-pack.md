# Listing pack: Basescan, GeckoTerminal, CoinGecko, CoinMarketCap

Copy-ready text for each listing form. Every fact comes from the chain or this repository; check
it again on the day you submit. The owner fills and submits every form; nothing here is sent
automatically.

## Facts

| Field                  | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Name                   | ARL Protocol                                                                                |
| Symbol                 | ARL                                                                                         |
| Network                | Base (chain id 8453)                                                                        |
| Contract               | `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`                                                |
| Decimals               | 18                                                                                          |
| Max and total supply   | 21,000,000 ARL (fixed; no mint function, no owner): `https://arlcoin.io/api/supply?q=total` |
| Circulating supply API | `https://arlcoin.io/api/supply` (plain number; `?q=circulating` and `?q=total` also work)   |
| Deployed               | 2026-10-24 (see [mainnet-plan.md](mainnet-plan.md)), source-verified on Basescan            |
| Website                | https://arlcoin.io                                                                          |
| Documentation          | https://arlcoin.io/docs/                                                                    |
| Security review        | https://arlcoin.io/docs/security-audit                                                      |
| Source code            | https://github.com/armanalabsai/arlcoin.io                                                  |
| X                      | https://x.com/arlprotocol (@arlprotocol)                                                    |
| Telegram               | https://t.me/arlcoin_community                                                              |
| Email                  | team@arlcoin.io                                                                             |
| Logo (SVG)             | `apps/web/public/arl-token.svg`, served at https://arlcoin.io/arl-token.svg                 |
| Logo (PNG)             | `assets/brand/png/arl-token-icon-small-32.png`, `arl-token-icon-256.png`, `-512.png`        |

Official Uniswap v3 pools on Base (1% fee tier):

| Pair      | Pool address                                 |
| --------- | -------------------------------------------- |
| ARL/USDC  | `0xBE1c1d2Cd686c3dFEC9221C472A1421B71479b72` |
| ARL/USDT  | `0x4A5579fa8aE69c6a1bC1Ad716cfa0fa80c7D5273` |
| ARL/WETH  | `0x23C85918509FeBe27f74628FDaC34F064f013A78` |
| ARL/cbBTC | `0x644565CF340310Cf24b0D1216D49C40d2A6975db` |

## Short description (up to 160 characters)

```text
ARL is the fixed-supply utility token on Base for AI services paid per use, compute paid per second, and escrowed agent jobs checked by staked validators.
```

## Long description

```text
ARL Protocol is an open-source payment and verification layer for AI agents on Base. Agents pay other AI services per use over HTTP 402 (x402), buy compute per second, and hire each other through an on-chain escrow (ERC-8183): the client's payment is released only after a committee of validators who stake ARL has checked the work, and outcomes are written to the provider's ERC-8004 reputation.

ARL has a fixed supply of 21,000,000 tokens. The token contract has no owner, no mint function and no upgrade proxy. Team, investor and treasury allocations sit in vesting wallets and Safes listed on arlcoin.io. ARL trades in four official Uniswap v3 pools on Base: ARL/USDC, ARL/USDT, ARL/WETH and ARL/cbBTC.
```

## Basescan: "Update Token Info"

1. Basescan → the token page → More → Update Token Info, signed in to the Basescan account.
2. Ownership: Basescan asks for a signed message from the contract creator, the deployer
   `0xe033104AE32fc7e13263B7AED577Ab20d6E47eAA`. Sign it on basescan.org/verifiedSignatures with
   the deployer wallet. This is a signature, not a transaction: it costs nothing and moves no funds.
3. Fields: project name, website, email, the 32×32 PNG logo (`arl-token-icon-small-32.png`), the
   short description, links (X, Telegram, GitHub), total supply 21,000,000, decimals 18.

## GeckoTerminal: "Update token info"

GeckoTerminal → search the contract → token page → Update Info. Logo 256×256 or larger
(`arl-token-icon-256.png`), the short and long descriptions, website, X, Telegram, the four pool
addresses. Proof of ownership: the same signed message with the deployer wallet, or the team
email on the arlcoin.io domain.

## CoinGecko: listing request

CoinGecko → Request Form → "Add a new coin". Use the facts table, the long description, the
512×512 logo, the circulating supply API, the four pools as markets, the security review link and
the source code link. Contact email: team@arlcoin.io.

## CoinMarketCap: listing request

CoinMarketCap → Request → "Add cryptoasset". Use the same facts, the long description, the
512×512 logo, the circulating supply API (CoinMarketCap reads a plain number), the four pools as
market pairs, and team@arlcoin.io as the project email.
