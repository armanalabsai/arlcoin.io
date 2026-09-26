# ARL Tokenomics

Source of truth: [`packages/tokenomics/src/allocations.ts`](../packages/tokenomics/src/allocations.ts).
This page describes that file; if they ever differ, the code is correct and
this page is out of date.

## Supply

- Maximum supply: **21,000,000 ARL**
- No mechanism may create supply above this cap. Staking and reward programs
  pay out existing allocations; they never issue new tokens.
- No token has been deployed. There is no contract address, chain, explorer or
  circulating supply yet.

## Allocation

| Allocation | ARL | Share |
| --- | ---: | ---: |
| Founder | 2,100,000 | 10.00% |
| Ecosystem Reserve | 7,000,000 | 33.33% |
| Treasury | 3,000,000 | 14.29% |
| Community / Staking | 3,000,000 | 14.29% |
| Liquidity | 2,000,000 | 9.52% |
| Strategic Partnerships | 1,500,000 | 7.14% |
| Public Launch | 1,000,000 | 4.76% |
| Grants / Bug Bounty | 400,000 | 1.91% |
| Team | 500,000 | 2.38% |
| Mining / Early User Rewards | 500,000 | 2.38% |
| **Total** | **21,000,000** | **100.00%** |

Shares are rounded to basis points with the largest-remainder method so they
always add up to 100.00%. Grants / Bug Bounty is exactly 1.9048%.

The total is validated automatically: `npm test` fails if the allocations do
not sum to exactly 21,000,000 ARL.

## Release rules

| Allocation | Rule | Status |
| --- | --- | --- |
| Founder | 24-month cliff, then 36-month linear vesting | approved |
| Ecosystem Reserve | At most 1,400,000 ARL unlocked per year for 5 years. Unlocked tokens stay in the reserve until spent; an unlock is not a sale. Uses: protocol development, strategic partnerships, ecosystem development, staking incentives, infrastructure, grants | approved |
| Treasury | Multisig with timelock and separated roles; parameters undecided | approved in principle |
| Community / Staking | Paid from this allocation or protocol revenue; never new issuance | approved in principle |
| Liquidity | Held as a reserve; first DEX amount decided separately | approved in principle |
| Strategic Partnerships | Per signed agreement | undecided |
| Public Launch | Terms set before any launch | undecided |
| Grants / Bug Bounty | Per award | undecided |
| Team | Long-term vesting required — see proposal below | **proposal** |
| Mining / Early User Rewards | See below | approved |

### Team vesting — proposal

The team allocation is separate from the founder allocation. Proposed
schedule, **not approved**:

- 12-month cliff, then 36-month linear vesting (48 months total), per member.
- Each grant gets its own vesting contract when the member joins; the vesting
  clock starts at the grant date.
- Unassigned team tokens stay locked in a team pool controlled by a multisig
  and cannot be spent for any other purpose.

### Mining / Early User Rewards

This is not proof-of-work mining. The allocation rewards verified early use of
the protocol.

- Initial program: up to **100,000 ARL** during the first **6 months**.
- Eligible activity may include early AI service usage, compute provider
  participation, compute consumption, developer and testnet activity, and
  other objectively measurable protocol usage.
- Reward formulas are not defined yet.
- The remaining 400,000 ARL is governed by future ecosystem reward programs.
