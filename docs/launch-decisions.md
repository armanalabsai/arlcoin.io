# Launch decisions

**APPROVED by the owner on 2026-10-05:** TGE 2026-11-01; Public Launch 1,000,000 ARL at TGE,
10,000 ARL per address, 60-day claim window, launchpad buyers and whitelist sign-ups; liquidity
with no project cash (launch proceeds, or single-sided ARL at or above 0.20 USD), LP in the
Liquidity Safe locked 12 months. The 50,000 USD example below is not used. The tables are kept
as the record of the options considered. Fixed and unchanged: 21,000,000 ARL, the 11 allocations, listing price
0.20 USD per ARL (FDV 4,200,000 USD), TGE = the Base Mainnet token deployment block, vesting
12 + 36 months from TGE, mainnet custody in [mainnet-plan.md](mainnet-plan.md).

These decisions close the two flags that keep mainnet shut:
`VESTING_SCHEDULES_APPROVED` (`contracts/script/ARLDeployPlan.sol`) and
`LAUNCH_PARAMETERS_APPROVED` (`contracts/script/DeployDistributor.s.sol`).

## 1. TGE

| Option     | Implication                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| 2026-11-01 | Current target (moved from 2026-12-01 by the owner on 2026-10-05). About 4 weeks for the remaining items. |
| Later date | More time for an audit or the public test period; vesting dates move with it.                             |

The TGE date sets the vesting start (cliff ends one year later, vesting ends four years later).

## 2. Public Launch (5,000,000 ARL; specification section 7)

| Parameter           | Options                                                                       | Notes                                                              |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Distributed at TGE  | All 5,000,000, or a first tranche (for example 1,000,000) with later tranches | A tranche keeps unclaimed tokens in the Public Launch Safe         |
| Eligibility         | Launchpad buyers, whitelist sign-ups (site form), verified early testers      | The Merkle list is fixed at deployment; it cannot be edited later  |
| Per-address cap     | None, or a fixed cap (for example 10,000 ARL)                                 | Caps limit concentration; Sybil resistance needs eligibility rules |
| Claim window        | 30, 60 or 90 days                                                             | After it, the remainder can only go to the Public Launch Safe      |
| Remainder           | Back to the Public Launch Safe for later tranches; nothing is burned          | Already fixed by the contract (`returnTo`)                         |
| Participant vesting | None, or a separate vesting wallet per buyer group                            | The distributor pays immediately; vesting needs extra contracts    |

Launchpads usually set their own sale size and buyer unlock; their terms override this table for
the tokens they sell.

## 3. Liquidity (2,000,000 ARL allocation; specification section 13)

At 0.20 USD per ARL a pool needs matching funds equal in value to the ARL side:

| ARL in the pool | Matching asset needed | Share of the Liquidity allocation |
| --------------- | --------------------- | --------------------------------- |
| 100,000         | 20,000 USD            | 5%                                |
| 250,000         | 50,000 USD            | 12.5%                             |
| 500,000         | 100,000 USD           | 25%                               |

| Parameter        | Options                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Venue on Base    | Uniswap (v3 or v4) or Aerodrome                                                                |
| Pair             | ARL/USDC, ARL/USDT, ARL/WETH and ARL/cbBTC, all single-sided from 0.20 USD (owner, 2026-10-05) |
| Matching asset   | USDC or ETH from outside the protocol (no allocation holds it); source decided by the owner    |
| LP-token custody | The Liquidity Safe (2-of-3), or a time lock on the LP position                                 |
| LP lock duration | 6, 12 or 24 months                                                                             |

The specification forbids keeping LP tokens in an individual's wallet and forbids using the
Public Launch allocation as liquidity.

## 4. After the decisions

1. Record them in `docs/tokenomics-economic-spec.md` and `packages/tokenomics`.
2. Set the two flags in a reviewed change, with tests.
3. Done 2026-10-05: `networkGate` opens 8453 at the TGE, 2026-11-01T00:00:00Z.
4. Rebuild the mainnet plan with the approved TGE and simulate again; addresses stay as in
   [mainnet-plan.md](mainnet-plan.md) if the deployer has not sent any transaction.
