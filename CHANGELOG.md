# Changelog

Notable changes to ARL Protocol, newest first. Dates are UTC. Every entry links to the code and
documents that back it; nothing here is deployed on Base Mainnet.

## 2026-10-16

- Website: official channels (X @arlprotocol, Telegram t.me/arlcoin_community, team@arlcoin.io),
  structured data, web app manifest, `/.well-known/security.txt`, HSTS with subdomains, FAQ on
  audit status, testnet value, official channels and data deletion; background music removed.
- Documents state the Base Sepolia deployment everywhere; new
  [operator API security model](docs/operator-api.md) and [incident response](docs/incident-response.md).
- Repository links point to https://github.com/armanalabsai/arlcoin.io.

## 2026-10-11

- Base Sepolia ecosystem deployed and source-verified: staking, ERC-8183 jobs escrow, zero-knowledge
  verifier and anonymous-signal contract ([audit-evidence.md](docs/audit-evidence.md#explorer-verification-base-sepolia)).
- The ARL app on Base Sepolia at https://arlcoin.io/app/ with the testnet operator at
  https://app.arlcoin.io (faucet, poll joins, vote relay, x402 settlement).
- Mainnet signer addresses checked read-only on Base Mainnet ([mainnet-plan.md](docs/mainnet-plan.md)).

## 2026-10-04

- Base Sepolia deployment of 12 Safes, the ARL token, two vesting wallets and the treasury
  timelock, source-verified on Basescan, Blockscout and Sourcify.
