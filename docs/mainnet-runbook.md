# Base Mainnet runbook (not run)

The exact order for launch day. **Nothing here has been run.** Every on-chain step is signed by
the owners in their own wallets; no private key is handled by the tooling. Custody, addresses and
the simulation are in [mainnet-plan.md](mainnet-plan.md); the testnet run of the same steps is in
[deployment.md](deployment.md).

## Before the day

| #   | Item                                                                      | Check                                |
| --- | ------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `networkGate` opens 8453 at 2026-11-01T00:00:00Z (done 2026-10-05, tests) | run on or after 2026-11-01 00:00 UTC |
| 2   | Deployer has never sent a transaction and has no code                     | `cast nonce` = 0, `cast code` = `0x` |
| 3   | Deployer funded with at least 0.001 ETH on Base                           | `cast balance`                       |
| 4   | Whitelist and launchpad buyers collected as `address,amount` (whole ARL)  | CSV ready                            |
| 5   | Signer config `contracts/deploy/deployments/8453-signers.env` unchanged   | SHA-256 in mainnet-plan.md           |

## Steps

1. **Safes.** Dry-run `CreateSafes` against Base Mainnet with `--sender` = deployer, publish the
   plan to the deploy screen, sign the 12 transactions. Check each Safe address against
   [mainnet-plan.md](mainnet-plan.md) and its owners and threshold on chain.
2. **Config and plan.** `safes-config-cli.ts` with `2026-11-01T00:00:00Z` (the planner refuses any
   other TGE off testnet), then `cli.ts`.
3. **Contracts.** Dry-run `DeployARL`, sign nonces 12-15 on the deploy screen; each created
   address must match the plan.
4. **Verify.** `VerifyARL`, `bytecode-cli.ts verify`, `supply-cli.ts` (total 21,000,000, circulating
   2,100,000), then `explorer-cli.ts --check-broadcast --run` with `ETHERSCAN_API_KEY` set.
5. **Claim list.** `launch-list-cli.ts whitelist.csv input.json` (applies the 1,000,000 ARL tranche
   and the 10,000 ARL cap), then `distribution-cli.ts input.json distribution.json`.
6. **Distributor.** `DeployDistributor` with a claim end at most 60 days ahead (enforced); the
   Public Launch Safe (2-of-3) funds it with exactly the list total.
7. **Pool.** The Liquidity Safe opens the single-sided ARL position at and above 0.20 USD
   ([launch-route.md](launch-route.md)); the position stays in the Safe for 12 months.
   - Check that no ARL/USDC, ARL/USDT, ARL/WETH or ARL/cbBTC 1% pool exists yet (`getPool` on the Uniswap v3 factory
     `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` returns zero). If one exists, its price must be
     at or below 0.20 USD; otherwise the batch reverts and nothing is deposited (fork-tested).
   - Write `pools.json` (example: `contracts/test-fork/fixtures/pools.json`) with the ARL amount
     per pool and the ETH and BTC prices in USD at that moment, then
     `node packages/deploy/src/pool-cli.ts pools.json pool.json`
     writes `pool.json` (Safe Transaction Builder batch: create the four pools, approve exactly
     the total, mint the ARL-only positions to the Safe) and `pool.plan.json` (ticks, prices).
   - Rehearse on a fork with the real addresses: copy both files to
     `contracts/test-fork/fixtures/pool-batch*.json`, then
     `FOUNDRY_PROFILE=fork ARL_BASE_RPC=<Base RPC> forge test --match-contract UniswapLaunchFork`.
   - Import `pool.json` in the Safe app (Apps → Transaction Builder), check the three calls, and
     sign with two of three owners. Buyers then trade on Uniswap, and aggregators and
     DexScreener/GeckoTerminal pick the pool up from the chain; no listing application is needed.
8. **Announce.** Publish the addresses on arlcoin.io and in the repository: set
   `SITE.mainnet.token` (shows "Add ARL to your wallet") and write the token list with
   `node packages/deploy/src/tokenlist-cli.ts apps/web/public/tokenlist.json 8453=<ARL token>`;
   write the supply API config with
   `node packages/deploy/src/supply-config-cli.ts <manifest.json> apps/web/api/supply-config.json`
   and redeploy (arlcoin.io/api/supply then reports the on-chain figures); start `monitor-cli.ts`
   from the deployment block. After a few days of trading, apply to
   CoinGecko and CoinMarketCap with [listing-applications.md](listing-applications.md).

Stop at the first mismatch. A wrong Safe or contract address means the deployer's nonce or the
salt changed; nothing is funded until every check passes.
