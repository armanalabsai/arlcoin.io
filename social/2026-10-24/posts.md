# Base Mainnet launch posts (2026-10-24)

Status: DRAFT until the owner approves each text. Every fact below was read on Base Mainnet on
2026-10-24 (see [mainnet-plan.md](../../docs/mainnet-plan.md)). Image for every channel:
[`arl-mainnet-live-1200x675.png`](arl-mainnet-live-1200x675.png).

## X (@arlprotocol): post

```text
ARL is live on Base Mainnet.

Contract: 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4

21,000,000 fixed supply. No mint, no owner.
Uniswap v3 pools on Base from 0.20 USD per ARL.

Any other address is fake. Verify on arlcoin.io
```

## X: reply to the post

```text
Details:
- 4 Uniswap v3 pools (1% fee): ARL/USDC, ARL/USDT, ARL/WETH, ARL/cbBTC, opened with 5,000,000 ARL
- Token, vesting wallets and timelock source-verified on Basescan: basescan.org/token/0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4
- Security review: arlcoin.io/docs/security-audit

Not investment advice.
```

## Telegram (@arlcoin_community): post and pin

```text
ARL is live on Base Mainnet.

Official contract (the only one):
0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4

- Fixed supply: 21,000,000 ARL. No mint function, no owner, no upgrade proxy.
- Liquidity: four Uniswap v3 pools on Base (ARL/USDC, ARL/USDT, ARL/WETH, ARL/cbBTC, 1% fee), opened with 5,000,000 ARL from 0.20 USD per ARL.
- Allocations are held by 2-of-3 Safes; Investors and Strategic Partnerships vest 12 + 36 months from the TGE.
- Contracts are source-verified on Basescan: https://basescan.org/token/0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4
- Security review: https://arlcoin.io/docs/security-audit

Safety:
- Any other address presented as ARL is fake.
- There is no airdrop or claim at launch.
- The team never sends the first direct message and never asks for a seed phrase.

Buy only through the links on https://arlcoin.io/buy
Not investment advice. Tokens can lose all their value.
```

## Medium: article

Title: ARL is live on Base Mainnet

Subtitle: The token, its Safes and four Uniswap v3 pools are on chain. Here is what was deployed and how to check it.

```text
ARL Protocol is a payment rail for AI and compute services on Base. On 24 October 2026 the ARL token went live on Base Mainnet.

What is on chain

- ARL token: 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4 (block 53,023,206). Fixed supply of 21,000,000 ARL, minted once at deployment. The contract has no mint function, no owner and no upgrade proxy.
- Twelve Safes hold the allocations: eleven role Safes with a 2-of-3 threshold and a separate 1-of-1 guardian Safe.
- Two vesting wallets (Investors, Strategic Partnerships): nothing vests before 23 October 2027, then linear until 23 October 2030.
- A treasury timelock with a 48-hour delay; the guardian can only cancel.
- Four Uniswap v3 pools on Base (1% fee tier): ARL/USDC, ARL/USDT, ARL/WETH and ARL/cbBTC, opened with 5,000,000 ARL from 0.20 USD per ARL. 2,000,000 ARL came from the Liquidity Safe and 3,000,000 ARL from the Public Launch Safe.

Circulating supply is about 7,100,000 ARL: the Founder's 2,100,000 ARL plus the 5,000,000 ARL deposited in the open pools, which the tokenomics specification counts as circulating. The live figure is at https://arlcoin.io/api/supply.

How to check it yourself

- The token, both vesting wallets and the timelock are source-verified on Basescan.
- Every address, threshold and pool is listed in the repository: https://github.com/armanalabsai/arlcoin.io/blob/main/docs/mainnet-plan.md
- The deployment was checked against the plan on chain (VerifyARL, a bytecode comparison with a clean build, and a supply check: 21,000,000 total, 2,100,000 circulating before the pools opened).
- Security review: https://arlcoin.io/docs/security-audit

What is not on Base Mainnet yet

The network contracts (escrowed jobs, the verified evaluator, staking and x402 payments) still run on the Base Sepolia testnet. There is no airdrop at launch; a 500,000 ARL airdrop will be announced later on the official channels.

Safety

The only official contract is 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4. Any other address is fake. The team never sends the first direct message and never asks for a seed phrase.

Website: https://arlcoin.io
Source code: https://github.com/armanalabsai/arlcoin.io

Nothing here is investment advice. Tokens can lose all their value.
```

## dev.to: article

Title: Launching a token on Base: the 16,777,216 gas cap we hit on launch day

Tags: ethereum, base, solidity, web3

```text
We launched the ARL token on Base Mainnet on 24 October 2026. The contracts went out as planned. The liquidity step did not, and the reason is worth knowing if you ship on Base.

The setup

Liquidity is opened by two Gnosis Safes (2-of-3). Each Safe runs one Transaction Builder batch through MultiSend: four createAndInitializePoolIfNecessary calls on the Uniswap v3 NonfungiblePositionManager (ARL/USDC, ARL/USDT, ARL/WETH, ARL/cbBTC), one ERC-20 approve and four mint calls for single-sided ARL positions from 0.20 USD.

We rehearsed this on a fork of Base Mainnet. It passed.

What happened

Both batches collected their two signatures. On the execute screen, Safe warned: "This transaction will most likely fail."

eth_call of execTransaction returned success. eth_estimateGas reverted. Binary-searching the gas limit with eth_call showed the batch needs about 21.3M gas: each new Uniswap v3 pool costs roughly 4.9M gas to deploy.

Base enforces a per-transaction gas cap of 16,777,216 (2^24, EIP-7825) since its Azul upgrade. A transaction above it is rejected. Our fork rehearsal ran on Anvil, which does not enforce that cap, so it never showed up.

The fix

We split the Liquidity batch into two Safe transactions with the same calls and amounts:

1. USDC and USDT pools, approve, two mints: 5.7M gas
2. WETH and cbBTC pools, two mints: 10.3M gas

Once the pools existed, the Public Launch batch (pool creation calls become no-ops, then approve and four mints) needed only 1.35M gas and ran unchanged. We replayed the three transactions in order on an Anvil fork before collecting new signatures. On chain, the four pools hold 5,000,000 ARL, the same numbers as the rehearsal.

Takeaways

- Check every planned transaction against the chain's per-transaction gas cap, not only the block gas limit.
- A fork rehearsal does not enforce EIP-7825 unless you check gas used yourself.
- A reverting eth_estimateGas next to a succeeding eth_call is a strong hint that you are above a cap.

Addresses and the full runbook are in the repository: https://github.com/armanalabsai/arlcoin.io/blob/main/docs/mainnet-plan.md

ARL token: 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4 (Base Mainnet)
```

## Farcaster (cast with the image, channel /base)

```text
ARL is live on Base Mainnet.

Contract: 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4

21,000,000 fixed supply, no mint, no owner. Four Uniswap v3 pools on Base (USDC, USDT, WETH, cbBTC) from 0.20 USD per ARL.

Any other address is fake. arlcoin.io
```

## Product Hunt (launch page)

Name: ARL Protocol

Tagline (max 60 characters): Verified payments for AI agents and compute, on Base

Topics: Crypto, Artificial Intelligence, Developer Tools

Description (max 260 characters):

```text
ARL settles AI and compute jobs on Base: the client's payment sits in an on-chain escrow and is released only after a staked validator committee re-runs the job and agrees on the result. The ARL token is live on Base Mainnet.
```

First comment (maker):

```text
Hi Product Hunt, I'm the founder of ARL Protocol.

AI agents can already pay each other. What they cannot do is check that the work was actually done before the money moves. ARL puts the payment in an ERC-8183 escrow, a staked committee re-executes the job from a pinned spec, and the escrow pays out only on agreement, with a challenge window and slashing for dishonest validators.

What you can try today:
- The ARL token on Base Mainnet: 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4
- The verified-job flow, staking and x402 per-use payments on the Base Sepolia testnet: arlcoin.io/app
- A one-command quickstart that runs a full verified job locally: github.com/armanalabsai/arlcoin.io

Everything is open source. Feedback from builders of agents and compute marketplaces is very welcome.
```

Gallery: the launch image above, plus screenshots of arlcoin.io and arlcoin.io/app/verified.

## Visibility in wallets and DEXes

- Uniswap and aggregators (1inch, 0x, KyberSwap, Odos, ParaSwap) read the pools from the chain;
  ARL is tradable there by contract address now. Uniswap shows its "unverified token" warning
  until ARL is on its default list, which follows CoinGecko.
- DexScreener and GeckoTerminal list a pool after its first swap. Their token-profile forms
  (logo, links) need the owner's login; DexScreener's enhanced profile is paid and is not used.
- MetaMask shows the token by import (contract address) until ARL is on at least two token
  lists such as CoinGecko's.
- CoinGecko and CoinMarketCap: apply after trading has started, with the contract, the four pools
  and the Basescan link. The forms need the owner's login and a captcha.
- Token list for wallets that accept a URL: https://arlcoin.io/tokenlist.json
