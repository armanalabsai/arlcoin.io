# CoinGecko and CoinMarketCap Listing Applications

Status: **draft; not submitted.** ARL is not deployed and not traded, so no application can be
made yet. Both sites list only tokens that are live on-chain and trading on at least one venue
they track. Their forms and rules change; check each form when submitting.

Every value below is either a fact from this repository or marked `TBD`. Nothing marked `TBD`
may be filled in until it exists and can be verified (`docs/content-standard.md`).

## Preconditions

1. Base Mainnet deployment, verified by `VerifyARL`, with the contract source verified on
   Basescan.
2. At least one active trading venue with real liquidity (for example a DEX pool on Base).
3. The deployment manifest published and a public supply endpoint (see below).
4. Official social accounts that link back to the website.

Listing is free on both sites. Ignore anyone who offers a paid or guaranteed listing.

## Application data

| Field                     | Value                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Project name              | ARL                                                                                                       |
| Ticker                    | ARL                                                                                                       |
| Chain                     | Base (chain ID 8453)                                                                                      |
| Contract address          | `TBD` (after deployment)                                                                                  |
| Decimals                  | 18                                                                                                        |
| Token standard            | ERC-20 with EIP-2612 permit                                                                               |
| Maximum supply            | 21,000,000 ARL (fixed; minted once in the constructor; no mint function)                                  |
| Total supply              | 21,000,000 ARL                                                                                            |
| Circulating supply at TGE | 2,100,000 ARL (the Founder allocation, unlocked at TGE; economic specification sections 5 and 6)          |
| Circulating supply method | Total supply minus the balances of the protocol-controlled and locked addresses in the published manifest |
| Launch date               | `TBD`                                                                                                     |
| Trading venues and pairs  | `TBD`                                                                                                     |
| Website                   | https://arlcoin.io                                                                                        |
| Source code               | https://github.com/gokturkalazdaghan-dot/ARLCOIN                                                          |
| Block explorer            | `TBD` (Basescan token page after deployment)                                                              |
| Audit report              | `TBD` (no audit yet; scope in `docs/audit-scope.md`)                                                      |
| Logo                      | `assets/brand/png/arl-token-icon-200.png` (200 × 200, transparent); SVG `assets/brand/arl-token-icon.svg` |
| Social accounts           | `TBD`                                                                                                     |
| Contact email             | `TBD` (an address on the project domain)                                                                  |

### Short description (English, for the form)

> ARL is the native utility token planned for decentralized AI and compute services, with a fixed
> maximum supply of 21,000,000 ARL minted once at deployment. Allocations are held by vesting
> wallets, a 48-hour treasury timelock and dedicated Safe multisigs. The Public Launch uses a
> Merkle claim from a published list.

Update the description to present tense only for what is live when the form is submitted.

### Allocation table (for the tokenomics field)

Taken from `packages/tokenomics`, the single source of truth; see `docs/tokenomics.md`.

## Supply endpoint

Both sites prefer a URL that returns the current circulating and total supply as plain numbers.
The data comes from `packages/deploy/src/supply-cli.ts`, which reads every manifest balance at
one block. The endpoint is added to the website together with the deployment, once the manifest
exists; it must never return a hard-coded number.

## Checklist on submission day

- [ ] Contract verified on Basescan; `VerifyARL` passes against the deployed addresses
- [ ] Manifest published; supply endpoint returns the on-chain figures
- [ ] Liquidity live; trading pair links collected
- [ ] Social accounts created and linked from https://arlcoin.io
- [ ] Every `TBD` above replaced with a verified value
