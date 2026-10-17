# Changelog

Notable changes to ARL Protocol, newest first. Dates are UTC. Every entry links to the code and
documents that back it; nothing here is deployed on Base Mainnet.

## 2026-10-17

- Launch prepared for the TGE, 2026-10-23 00:00 UTC: the mainnet fork rehearsal passes with the
  real signers; the contract run is published for the deploy screen; the pool batches are built
  from Chainlink prices by [`launch-day-pools.sh`](scripts/launch-day-pools.sh)
  ([mainnet-runbook.md](docs/mainnet-runbook.md)).
- Pools at TGE: 5,000,000 ARL (2,000,000 Liquidity, 3,000,000 Public Launch) from 0.20 USD; the
  launchpad reserve is 1,500,000 ARL (owner decision).
- Telegram community bot live (@Arlprotocol_bot) with `/status`, `/launch` and link commands;
  uptime workflow every 10 minutes; "Live on Base Sepolia" badge in the site header.
- FAQ entry that tells ARL Protocol apart from other tokens using the ARL ticker.

## 2026-10-16

- Website: official channels (X @arlprotocol, Telegram t.me/arlcoin_community, team@arlcoin.io),
  structured data, web app manifest, `/.well-known/security.txt`, HSTS with subdomains, FAQ on
  testnet value, official channels and data deletion; background music removed.
- Documents state the Base Sepolia deployment everywhere; new
  [operator API security model](docs/operator-api.md) and [incident response](docs/incident-response.md).
- Repository links point to https://github.com/armanalabsai/arlcoin.io.

## 2026-10-11

- Base Sepolia ecosystem deployed and source-verified: staking, ERC-8183 jobs escrow, zero-knowledge
  verifier and anonymous-signal contract ([verification-evidence.md](docs/verification-evidence.md#explorer-verification-base-sepolia)).
- The ARL app on Base Sepolia at https://arlcoin.io/app/ with the testnet operator at
  https://app.arlcoin.io (faucet, poll joins, vote relay, x402 settlement).
- Mainnet signer addresses checked read-only on Base Mainnet ([mainnet-plan.md](docs/mainnet-plan.md)).

## 2026-10-04

- Base Sepolia deployment of 12 Safes, the ARL token, two vesting wallets and the treasury
  timelock, source-verified on Basescan, Blockscout and Sourcify.
