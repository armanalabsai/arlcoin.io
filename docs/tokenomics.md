# ARL Tokenomics

Source of truth: [`packages/tokenomics/src/allocations.ts`](../packages/tokenomics/src/allocations.ts).
This page describes that file; if they ever differ, the code is correct and
this page is out of date. `contracts/src/ARLAllocation.sol` holds the same
amounts, and a test fails if the two differ.

Model: the 11-allocation model approved on 2026-09-27 (M-2 model
replacement). It supersedes the 10-allocation Phase 1 table. The former
7,000,000 ARL Ecosystem Reserve no longer exists.

## Supply

- Maximum supply: **21,000,000 ARL**, minted once, in the token contract's
  constructor. The contract has no function that can mint more.
- No mechanism may create supply above this cap. Staking and reward programs
  pay out existing allocations; they never issue new tokens. There is no
  inflation, emission or hidden reserve.
- No token has been deployed. There is no contract address, chain, explorer or
  circulating supply yet.

## Allocation

| Allocation                    |            ARL |  Share | Purpose                                      |
| ----------------------------- | -------------: | -----: | -------------------------------------------- |
| Public Launch                 |      5,000,000 | 23.81% | Initial market distribution                  |
| Community & Staking           |      3,000,000 | 14.29% | Staking and community rewards                |
| Ecosystem & Growth            |      2,000,000 |  9.52% | User acquisition, referral, ecosystem growth |
| Strategic Partnerships        |      2,000,000 |  9.52% | Strategic partners                           |
| Liquidity                     |      2,000,000 |  9.52% | DEX and CEX liquidity                        |
| Founder                       |      2,100,000 | 10.00% | Founder allocation                           |
| Investors / Strategic Capital |      1,500,000 |  7.14% | Investors and strategic capital              |
| Treasury                      |      1,000,000 |  4.76% | Long-term operations                         |
| Team                          |        900,000 |  4.29% | Core team                                    |
| Early Users                   |      1,100,000 |  5.24% | Early adoption                               |
| Grants / Bug Bounty           |        400,000 |  1.90% | Developer grants and security                |
| **Total**                     | **21,000,000** |        |                                              |

Amounts are exact integers and add up to exactly 21,000,000 ARL; `npm test`
fails otherwise. Shares are derived from the amounts and rounded half up to two
decimals, so the rounded shares add up to 99.99%.

The user- and ecosystem-facing allocations (Community & Staking, Ecosystem &
Growth, Early Users) total 6,100,000 ARL (29.05%).

## Custody

Custody architecture approved 2026-09-27. Source of truth: the `custody` field
in `packages/tokenomics`. Every Safe is dedicated to one allocation.

| Allocation                    | Held by                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Public Launch                 | Dedicated Safe                                                                |
| Community & Staking           | Dedicated Safe                                                                |
| Ecosystem & Growth            | Dedicated Safe                                                                |
| Strategic Partnerships        | Vesting wallet → dedicated Safe                                               |
| Liquidity                     | Dedicated Safe                                                                |
| Founder                       | Vesting wallet → dedicated founder Safe                                       |
| Investors / Strategic Capital | Vesting wallet → dedicated Safe                                               |
| Treasury                      | Treasury timelock, controlled by the Treasury Safe, cancel-only guardian      |
| Team                          | Dedicated team pool Safe; each grant → its own vesting wallet → member's Safe |
| Early Users                   | Dedicated Safe                                                                |
| Grants / Bug Bounty           | Dedicated Safe                                                                |

- The deployment plan and verifier reject any address used for two roles.
- Safe signer lists and thresholds are operational configuration and are not
  stored in this repository. The treasury's approved 3-of-5 policy is the only
  threshold recorded here.

## Release rules

| Allocation                    | Rule                                                                                                    | Status    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| Public Launch                 | Terms set before any launch                                                                             | undecided |
| Community & Staking           | Paid from this allocation or protocol revenue; never new issuance. Rates and schedule not defined       | undecided |
| Ecosystem & Growth            | Programs tied to genuine, verifiable activity. Rules, rates and schedule not defined                    | undecided |
| Strategic Partnerships        | Vesting wallet; schedule TBD. Not an unconditional pool: partnership → milestone → vesting → release    | undecided |
| Liquidity                     | Held as a reserve; the amount used for any pool or listing is decided separately                        | approved  |
| Founder                       | Vesting wallet; schedule TBD                                                                            | undecided |
| Investors / Strategic Capital | Vesting wallet; schedule TBD. Not unlocked at launch by default                                         | undecided |
| Treasury                      | Safe 3-of-5, minimum 48-hour timelock, cancel-only guardian                                             | approved  |
| Team                          | Irrevocable per-member grants in tranches from the pool, each to the member's own Safe; schedule TBD    | undecided |
| Early Users                   | Rewards only for genuine, verifiable usage; connecting a wallet earns nothing. Amounts and schedule TBD | undecided |
| Grants / Bug Bounty           | Paid per grant or bounty award                                                                          | undecided |

A vesting schedule that is TBD cannot reach a public network: the planner
(`packages/deploy`) and `ARLDeployPlan` both refuse any chain other than local
Anvil until the schedules are approved. Local rehearsals use placeholder
schedules that are not decisions.

Future reward programs (staking, referral, onboarding, early users) must be
compatible with eligibility rules, Sybil resistance, abuse prevention, rate
limiting and claim controls. No such program exists.

How these rules map to contracts is described in
[`token-design.md`](token-design.md).

## Supply concepts

These are kept separate everywhere, including the website:

- **Maximum supply** and **total supply**: 21,000,000 ARL, equal for the life of
  the token.
- **Allocation**: the genesis assignment above. Allocated is not circulating.
- **Released supply**: tokens that have left a vesting wallet or custody Safe.
- **Unlocked supply**: tokens that have vested and are releasable.
- **Circulating supply**: computed from on-chain state after deployment. It is
  never hard-coded, and in particular it is not assumed to be 21,000,000 ARL or
  7,000,000 ARL (Public Launch plus Liquidity).

The circulating supply methodology recorded on 2026-09-27 under the superseded
M-2 decision (Safe-held and unvested tokens are not circulating; vested and
releasable tokens and tokens released from custody are) must be re-confirmed
for this model before it is published.
