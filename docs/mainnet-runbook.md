# Base Mainnet runbook (not run)

The exact order for launch day. **Nothing here has been run.** Every on-chain step is signed by
the owners in their own wallets; no private key is handled by the tooling. Custody, addresses and
the simulation are in [mainnet-plan.md](mainnet-plan.md); the testnet run of the same steps is in
[deployment.md](deployment.md).

## Before the day

| #   | Item                                                                                                                                     | Check                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `networkGate` opens 8453 at 2026-10-23T00:00:00Z (done 2026-10-05, updated 2026-10-16, tests)                                            | run on or after 2026-10-23 00:00 UTC |
| 2   | Deployer has never sent a transaction and has no code                                                                                    | `cast nonce` = 0, `cast code` = `0x` |
| 3   | Deployer `0xe033104AE32fc7e13263B7AED577Ab20d6E47eAA` funded with 0.002 ETH on Base (owner, 2026-10-20); it sends nothing before the run | `cast balance`                       |
| 4   | Deferred to the later airdrop (no airdrop at TGE): claim list collected as `address,amount` (whole ARL)                                  | not needed at TGE                    |
| 5   | Signer config `contracts/deploy/deployments/8453-signers.env` unchanged                                                                  | SHA-256 in mainnet-plan.md           |
| 6   | Full rehearsal on a Base Mainnet fork passes: `bash scripts/rehearse-base-mainnet-fork.sh`                                               | "MAINNET FORK REHEARSAL PASSED"      |

## Rehearsal (2026-10-17, passed)

`scripts/rehearse-base-mainnet-fork.sh` runs the whole day on a local fork of Base Mainnet with the
real signer configuration, the fork clock set to just after the TGE and the deployer holding exactly
0.001 ETH. Result on 2026-10-17: Base Mainnet refused before the TGE; the 12 Safes and the token at
the addresses in [mainnet-plan.md](mainnet-plan.md) (token `0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4`);
`VerifyARL` passed; total 21,000,000 and circulating 2,100,000 ARL; the deployer spent about
0.00004 ETH of its 0.001 ETH; the four pools held 5,000,000 ARL (2,000,000 from the Liquidity Safe,
3,000,000 from the Public Launch Safe) with ETH and BTC floors from the Chainlink prices on the fork; the claim distributor was deployed and funded by the Public Launch
Safe (rehearsal only; the distributor is not part of TGE day). Run it again in the last days before the TGE.

## Steps

No deploy script writes a record. After each signed run, write the record with the verified-record
tool from the run file the deploy screen signed (`broadcast/<Script>/8453/dry-run/run-latest.json`,
or `8453/run-latest.json` after a broadcast); it writes nothing unless every check passes (exit 0):
`node packages/deploy/src/record-cli.ts <safes|arl|distributor> <run.json> https://mainnet.base.org <record.json>`.
The records go to `contracts/deploy/deployments/8453-safes.json`, `8453.json` and
`8453-distributor.json` (the distributor record only for the later airdrop); the record must be
stamped `base-mainnet`.

1. **Safes.** The run is prepared from the mainnet fork rehearsal. It names the Safe owners, so it
   is not in the repository: the owner keeps the file `8453-safes.json` and loads it with "Choose
   file" on `https://arlcoin.io/app/deploy/` in the deployer's wallet (the screen refuses Base
   Mainnet before the TGE). Sign the 12 transactions, then `record-cli.ts safes`. Check each Safe address against
   [mainnet-plan.md](mainnet-plan.md) and its owners and threshold on chain.
2. **Config and plan.** `safes-config-cli.ts` with `2026-10-23T00:00:00Z` (the planner refuses any
   other TGE off testnet), then `cli.ts`.
3. **Contracts.** Open `https://arlcoin.io/app/deploy/?plan=8453-deploy` (prepared the same way),
   sign nonces 12-15, then
   `record-cli.ts arl`; each created address must match the plan. A created address follows
   from the deployer and nonce alone, so a matching address does not prove the constructor
   arguments. Before signing, check that the file's SHA-256 is
   `4e7acae253947d3343daeed8a56b893459d1b7797c2e7045bb2204ebfd6d909a` and that the arguments
   the screen shows match [mainnet-plan.md](mainnet-plan.md): vesting beneficiaries and dates,
   timelock delay, proposer, executor and guardian, and the eleven token recipients in order
   (security audit 2026-10-17, finding L-01).
4. **Verify.** `VerifyARL`, `bytecode-cli.ts verify`, `supply-cli.ts` (total 21,000,000, circulating
   2,100,000), then `explorer-cli.ts --check-broadcast --run` with `ETHERSCAN_API_KEY` set.
5. **Claim list — deferred to the later airdrop; not part of TGE day.** There is no airdrop at
   TGE (owner decision 2026-10-16). When the 500,000 ARL airdrop is announced, build the list with
   `launch-list-cli.ts <list.csv> input.json`, then `distribution-cli.ts input.json distribution.json`,
   using the eligibility and limits announced then.
6. **Pool.** The Liquidity Safe opens the single-sided ARL position at and above 0.20 USD
   ([launch-route.md](launch-route.md)); the position stays in the Safe for 12 months.
   - Check that no ARL/USDC, ARL/USDT, ARL/WETH or ARL/cbBTC 1% pool exists yet (`getPool` on the Uniswap v3 factory
     `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` returns zero). If one exists, its price must be
     at or below 0.20 USD; otherwise the batch reverts and nothing is deposited (fork-tested).
   - Pool size (owner decisions 2026-10-06 and 2026-10-17): 2,000,000 ARL in total, the whole
     Liquidity allocation, split USDC 800,000, USDT 400,000, WETH 600,000, cbBTC 200,000 (as in
     the fork-tested fixture).
   - **Prepared:** `bash scripts/launch-day-pools.sh` reads the ETH and BTC prices from Chainlink
     on Base and writes both batches (this step and step 7) to `apps/dapp/public/plans/`; they are
     published at `https://arlcoin.io/app/plans/8453-pool-liquidity.json` and
     `8453-pool-public-launch.json`. Run it again shortly before signing so the prices are current.
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
7. **Public Launch sale positions** (owner decision 2026-10-10; legal approval confirmed by the owner, see
   [tokenomics-economic-spec.md](tokenomics-economic-spec.md) section 7). Right after step 6 and before any address is announced, the Public Launch
   Safe adds ARL-only positions on the same four pools and ranges: USDT 900,000, USDC 750,000,
   WETH 675,000, cbBTC 675,000 (3,000,000 ARL, owner decision 2026-10-17; the 500,000 ARL kept for
   the later airdrop and the 1,500,000 ARL launchpad reserve stay in the Safe). Write `pools-public-launch.json` (example:
   `contracts/test-fork/fixtures/pools-public-launch.json`) with `"allocation": "publicLaunch"`,
   the Public Launch Safe as `liquiditySafe` and the same ETH and BTC prices as step 6, run
   `pool-cli.ts`, rehearse with
   `FOUNDRY_PROFILE=fork ARL_BASE_RPC=<Base RPC> forge test --match-contract UniswapPublicLaunchFork`,
   then sign with two of three owners. If anyone has traded since step 6 the batch reverts and
   deposits nothing (fork-tested); rebuild it with `priceUsd` at or above the pool's current price.
   To avoid that, collect both owner signatures for this batch before step 6 is executed, and
   execute it within seconds of step 6 (security audit 2026-10-17, finding M-03).
8. **Distributor — deferred to the later airdrop; not part of TGE day.** `ARLMerkleDistributor`
   is not deployed at TGE. For the later airdrop: `DeployDistributor` with the announced claim
   end (the script currently enforces at most 60 days), then `record-cli.ts distributor … --distribution distribution.json`; the Public Launch Safe
   (2-of-3) funds it with exactly the list total.
9. **Announce.** Publish the addresses on arlcoin.io and in the repository: set
   `SITE.mainnet.token` (shows "Add ARL to your wallet") and write the token list with
   `node packages/deploy/src/tokenlist-cli.ts apps/web/public/tokenlist.json 8453=<ARL token>`;
   write the supply API config with
   `node packages/deploy/src/supply-config-cli.ts <manifest.json> apps/web/api/supply-config.json`
   and redeploy (arlcoin.io/api/supply then reports the on-chain figures); start `monitor-cli.ts`
   from the deployment block, and commit the plan as `contracts/deploy/deployments/8453-plan.json`
   next to `8453.json`: `.github/workflows/monitor.yml` then checks the deployment every 6 hours
   and fails (GitHub emails the owner) on a critical finding. After a few days of trading, apply to
   CoinGecko and CoinMarketCap with [listing-applications.md](listing-applications.md).

Stop at the first mismatch. A wrong Safe or contract address means the deployer's nonce or the
salt changed; nothing is funded until every check passes.
