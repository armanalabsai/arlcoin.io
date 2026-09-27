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

| Allocation                  |            ARL |       Share |
| --------------------------- | -------------: | ----------: |
| Founder                     |      2,100,000 |      10.00% |
| Ecosystem Reserve           |      7,000,000 |      33.33% |
| Treasury                    |      3,000,000 |      14.29% |
| Community / Staking         |      3,000,000 |      14.29% |
| Liquidity                   |      2,000,000 |       9.52% |
| Strategic Partnerships      |      1,500,000 |       7.14% |
| Public Launch               |      1,000,000 |       4.76% |
| Grants / Bug Bounty         |        400,000 |       1.91% |
| Team                        |        500,000 |       2.38% |
| Mining / Early User Rewards |        500,000 |       2.38% |
| **Total**                   | **21,000,000** | **100.00%** |

Shares are rounded to basis points with the largest-remainder method so they
always add up to 100.00%. Grants / Bug Bounty is exactly 1.9048%.

The total is validated automatically: `npm test` fails if the allocations do
not sum to exactly 21,000,000 ARL.

## Release rules

| Allocation                  | Rule                                                                                                                                                                                                                                                                          | Status    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Founder                     | 24-month cliff, then 36-month linear vesting to a dedicated founder Safe                                                                                                                                                                                                      | approved  |
| Ecosystem Reserve           | At most 1,400,000 ARL unlocked per year for 5 years (linear over 1,830 days). Unlocked tokens stay in the reserve until spent; an unlock is not a sale. Uses: protocol development, strategic partnerships, ecosystem development, staking incentives, infrastructure, grants | approved  |
| Treasury                    | Safe multisig, 3-of-5 approval, minimum 48-hour timelock, separated roles                                                                                                                                                                                                     | approved  |
| Community / Staking         | 60-month linear vesting from deployment, no cliff, to a dedicated Safe. Rewards are paid from this allocation or protocol revenue; never new issuance                                                                                                                         | approved  |
| Liquidity                   | Held in a Safe, no vesting; first DEX amount decided separately                                                                                                                                                                                                               | approved  |
| Strategic Partnerships      | 36-month linear vesting from deployment, no cliff, to a dedicated Safe. Released per signed agreement, limited to the amount that has vested and is available                                                                                                                 | approved  |
| Public Launch               | Held in a Safe, no vesting (approved). Launch terms set before any launch (undecided)                                                                                                                                                                                         | undecided |
| Grants / Bug Bounty         | Held in a Safe, no vesting; paid per grant or bounty award                                                                                                                                                                                                                    | approved  |
| Team                        | 12-month cliff, then 36-month linear vesting, per member from each grant date; unassigned tokens in a dedicated team pool Safe                                                                                                                                                | approved  |
| Mining / Early User Rewards | See below                                                                                                                                                                                                                                                                     | approved  |

How these rules map to contracts is described in
[`token-design.md`](token-design.md).

### Team

- 500,000 ARL in total, separate from the founder allocation.
- Individual grants are not assigned yet.
- Each member gets a separate vesting schedule and contract when an approved
  grant exists: 12-month cliff from the grant date, then 36 months linear.
- Grants are irrevocable and made in tranches: each tranche is a new
  `ARLVestingWallet` funded from the pool, so a member who leaves early
  forfeits only tranches not yet granted (decided 2026-09-27).
- Each member's beneficiary is the member's own Safe or smart account, so a
  lost key can be recovered by rotating signers.
- Unassigned team tokens are held in a dedicated team pool Safe. The pool has
  no schedule of its own; it is the reserve from which approved individual
  grants are funded, and each grant then vests on its own schedule.

### Treasury

- Safe multisig, 3-of-5 approval threshold.
- Every transaction passes a timelock of at least 48 hours.
- Signer addresses are configured only when the production Safe is created.

### Mining / Early User Rewards

This is not proof-of-work mining. The allocation rewards verified early use of
the protocol.

- Initial program: up to **100,000 ARL** during the first **6 months**.
- Eligible activity may include early AI service usage, compute provider
  participation, compute consumption, developer and testnet activity, and
  other objectively measurable protocol usage.
- Reward formulas are not defined yet.
- Custody (decided 2026-09-27): the initial 100,000 ARL is held in a Safe. The
  remaining 400,000 ARL vests linearly over 36 months, with no cliff, to a
  dedicated Safe, starting when the initial 6-month program period ends. How
  it is distributed is decided by future reward programs.

## Custody

Decided 2026-09-27 (M-2). The source of truth is the `custody` field in
[`packages/tokenomics`](../packages/tokenomics/src/allocations.ts).

| Allocation                         | Held by                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Founder                            | Vesting wallet → dedicated founder Safe                                       |
| Ecosystem Reserve                  | Vesting wallet → dedicated Ecosystem Reserve Safe                             |
| Treasury                           | Treasury timelock, controlled by the Treasury Safe                            |
| Community / Staking                | Vesting wallet → dedicated Safe                                               |
| Liquidity                          | Safe, no vesting                                                              |
| Strategic Partnerships             | Vesting wallet → dedicated Safe                                               |
| Public Launch                      | Safe, no vesting                                                              |
| Grants / Bug Bounty                | Safe, no vesting                                                              |
| Team                               | Dedicated team pool Safe; each grant → its own vesting wallet → member's Safe |
| Mining / Early User Rewards (100k) | Safe, no vesting                                                              |
| Mining / Early User Rewards (400k) | Vesting wallet → dedicated Safe                                               |

- Each vesting allocation has its own dedicated Safe beneficiary. The Treasury,
  Guardian, founder and Ecosystem Reserve Safes are separate from each other and
  from these.
- Safe signer lists and thresholds are operational configuration. They are not
  stored in this repository. The treasury's approved 3-of-5 policy is the only
  threshold recorded here.

## Circulating supply methodology

Decided 2026-09-27 (M-2). Circulating supply is computed deterministically from
on-chain state; no estimate is ever published.

- Tokens held in Safe custody and not yet distributed are **not circulating**.
- Tokens locked and unvested in vesting wallets are **not circulating**.
- Tokens that have vested and are releasable from a vesting wallet are
  **circulating**.
- Tokens released or transferred out of custody are **circulating**.
- No release creates new ARL. Circulating supply can never exceed 21,000,000
  ARL.

No token is deployed yet, so there is no circulating supply to report. The same
rules will be used by the website's Network Console, explorers and data
aggregators once a deployment exists.
