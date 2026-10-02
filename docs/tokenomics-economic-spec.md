# ARL Network Tokenomics Economic Specification v1

Status: **specification.** It records the economic policy for the current
11-allocation model and the CTO decisions of 2026-09-27 and 2026-09-28, including the ARL
Core monetary standard (section 17). It does not change any contract,
deployment script or test. Where the implementation still differs from an
approved decision, section 15 says so.

Every rule in this document carries one of these labels:

- **APPROVED / LOCKED**: decided by the CTO. Implementation may follow after
  its own review.
- **TBD / REQUIRES CTO DECISION**: not decided. Nothing here may be read as a
  decision on it, and no implementation may assume a value.
- **IMPLEMENTATION CONSTRAINT**: a fact about the current code that an approved
  decision has to take into account. It is not an economic decision.

## 1. Executive Summary

- ARL has a fixed maximum supply of **21,000,000 ARL**, minted once at token
  deployment. No mint function exists and none may be added.
- The supply is divided into **11 allocations**. The amounts are locked.
- Founder: the whole **2,100,000 ARL allocation is fully unlocked at TGE**,
  with no cliff, vesting, timelock or protocol-level transfer or sale
  restriction (APPROVED / LOCKED). See section 4.4.
- Investors, Strategic Partnerships and Team vest with **0% at TGE, a 12-month
  cliff, then 36 months linear** (APPROVED / LOCKED).
- The Treasury is held by a timelock under a **3-of-5 Safe** with a minimum
  **48-hour delay** and a cancel-only guardian (APPROVED / LOCKED).
- **Circulating supply** is total supply minus balances held by
  protocol-controlled or locked addresses. An allocation never counts as
  circulating by itself.
- The Public Launch mechanism, the Early Users reward formula, the staking
  emission curve, program budgets, liquidity funding and the LP lock remain
  **TBD**.
- No contract is deployed on any network.
- ARL Core, the planned native chain, uses **8 decimals**: 1 ARL =
  100,000,000 motes. The ERC-20 token keeps **18 decimals**. The Core monetary
  standard, including the 10,000,000 ARL burn floor and the burn epoch, is in
  section 17 (APPROVED / LOCKED where marked).

## 2. Supply Model

Scope: the rules in this section apply to the ERC-20 token. ARL Core monetary
rules, including the Core burn rules, are in section 17. How supply is
accounted for when both representations exist is TBD (section 17.10).

| Rule                                                                                                                                          | Status            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Maximum supply is 21,000,000 ARL                                                                                                              | APPROVED / LOCKED |
| The full supply is minted once, in the token contract's constructor                                                                           | APPROVED / LOCKED |
| No mint, burn, owner, admin, pause or upgrade function                                                                                        | APPROVED / LOCKED |
| Total supply equals maximum supply for the life of the token                                                                                  | APPROVED / LOCKED |
| Rewards, staking, grants and growth programs pay out existing allocations only; no inflation, emission beyond an allocation or hidden reserve | APPROVED / LOCKED |

## 3. 11-Allocation Table

APPROVED / LOCKED. Amounts are exact whole ARL. Shares are derived from the
amounts and rounded to two decimals; the amounts, not the rounded shares, are
authoritative.

| #   | Allocation                    |            ARL |  Share | Purpose                                          | Holder at genesis                                      |
| --- | ----------------------------- | -------------: | -----: | ------------------------------------------------ | ------------------------------------------------------ |
| 1   | Public Launch                 |      5,000,000 | 23.81% | Initial market distribution                      | Dedicated Safe                                         |
| 2   | Community & Staking           |      3,000,000 | 14.29% | Staking and community rewards                    | Dedicated Safe                                         |
| 3   | Ecosystem & Growth            |      2,000,000 |  9.52% | Ecosystem development, user and developer growth | Dedicated Safe                                         |
| 4   | Strategic Partnerships        |      2,000,000 |  9.52% | Strategic partners                               | Vesting wallet → dedicated Safe                        |
| 5   | Liquidity                     |      2,000,000 |  9.52% | DEX and CEX liquidity                            | Dedicated Safe                                         |
| 6   | Founder                       |      2,100,000 | 10.00% | Founder allocation                               | 2,100,000 unlocked to the Founder at TGE (section 4.4) |
| 7   | Investors / Strategic Capital |      1,500,000 |  7.14% | Investors and strategic capital                  | Vesting wallet → dedicated Safe                        |
| 8   | Treasury                      |      1,000,000 |  4.76% | Long-term operations                             | Timelock under the Treasury Safe                       |
| 9   | Team                          |        900,000 |  4.29% | Core team                                        | Dedicated team pool Safe                               |
| 10  | Early Users                   |      1,100,000 |  5.24% | Early adoption                                   | Dedicated Safe                                         |
| 11  | Grants / Bug Bounty           |        400,000 |  1.90% | Developer grants and security bug bounties       | Dedicated Safe                                         |
|     | **Total**                     | **21,000,000** |        |                                                  |                                                        |

- Every Safe is dedicated to one allocation. No address may hold two
  allocations (APPROVED / LOCKED).
- Safe signer lists and thresholds are operational configuration and are not
  stored in the repository. Only the Treasury's 3-of-5 policy is recorded
  (APPROVED / LOCKED). All other thresholds are TBD.
- The user- and ecosystem-facing allocations (Community & Staking, Ecosystem &
  Growth, Early Users) total 6,100,000 ARL (29.05%).

## 4. Vesting Policy

### 4.1 Approved schedules

| Allocation             | TGE unlock | Cliff     | Linear vesting after cliff | Total     | Status            |
| ---------------------- | ---------- | --------- | -------------------------- | --------- | ----------------- |
| Investors              | 0%         | 12 months | 36 months                  | 48 months | APPROVED / LOCKED |
| Strategic Partnerships | 0%         | 12 months | 36 months                  | 48 months | APPROVED / LOCKED |
| Team (per grant)       | 0%         | 12 months | 36 months                  | 48 months | APPROVED / LOCKED |

Rules (APPROVED / LOCKED):

- Nothing is releasable before the cliff ends. After the cliff, tokens vest
  linearly until the end of the vesting period.
- Months are calendar months. Schedules are expressed as explicit UTC
  timestamps; no contract converts months to seconds.
- A beneficiary cannot be changed and no vesting wallet can be revoked.
- **Team:** each member's grant is tracked separately in its own vesting wallet,
  funded from the team pool Safe. Grants are irrevocable, made in tranches, and
  the beneficiary is the member's own Safe or smart account (M-3 principle).
- **Strategic Partnerships:** the 12 + 36 schedule applies to the allocation's
  vesting wallet. Individual partner agreements may add milestone conditions on
  top. Milestone logic is **not** implemented in the vesting contract; it is
  applied by the partnerships Safe when it funds or releases to a partner.
- **Founder:** not covered by this table; see section 4.4.

### 4.2 Release frequency

With the existing `ARLVestingWallet`, release after the cliff is continuous:
the vested amount grows every second and anyone can trigger a release to the
beneficiary. This is the implemented behavior. A different frequency (for
example monthly steps) would require a new contract and is not part of this
specification.

### 4.3 Vesting start

- **Decided (CTO, 2026-09-29): `VESTING_START = TGE_TIMESTAMP`.** The investor
  and strategic partnership schedules both start at the TGE (section 6). The
  deployment config has one `tge` field and no per-schedule start; the planner
  derives both starts from it and `ARLDeployPlan` refuses schedules that do
  not share their start.
- **TBD:** the TGE date itself.
- Team schedules start at each grant's date (M-3 per-grant tracking).

### 4.4 Founder allocation

The Founder allocation is 2,100,000 ARL. All of it is fully unlocked at TGE
(CTO decision of 2026-09-28, which replaces the earlier split into 2,000,000
ARL unlocked and 100,000 ARL TBD).

| Parameter                                      | Value                                                                                 | Status |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| Total Founder allocation                       | 2,100,000 ARL                                                                         | LOCKED |
| Fully unlocked amount                          | 2,100,000 ARL (the whole allocation)                                                  | LOCKED |
| Availability                                   | Available to the Founder at TGE                                                       | LOCKED |
| Cliff                                          | None                                                                                  | LOCKED |
| Vesting                                        | None                                                                                  | LOCKED |
| Timelock                                       | None                                                                                  | LOCKED |
| Protocol-level transfer restriction            | None                                                                                  | LOCKED |
| Protocol-level sale restriction                | None                                                                                  | LOCKED |
| Right to transfer, use or sell                 | At any time, including through public exchanges, without protocol permission          | LOCKED |
| Address that receives the 2,100,000 ARL at TGE | Not specified                                                                         | TBD    |
| Public disclosure of this structure            | The unlocked status and the Founder's right to sell are published with the tokenomics | LOCKED |

- The 2,100,000 ARL is unlocked. It is not locked, vested, timelocked,
  restricted, reserved or subject to any future release schedule.
- IMPLEMENTATION CONSTRAINT: the contracts and deployment tooling mint the
  whole Founder allocation (`ARLAllocation.FOUNDER`, 2,100,000 ARL) to one
  genesis holder, `ARLToken.Recipients.founder`, with no vesting wallet.
- IMPLEMENTATION CONSTRAINT: the M-3 rule applies to the Founder recipient:
  off local Anvil it must be a contract (a dedicated Safe). The address of that
  Safe is not set (section 15, item 12).

#### Founder supply states

These terms are distinct. None implies another.

| State       | Meaning for the Founder's 2,100,000 ARL                                                           |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Allocated   | Assigned to the Founder at genesis: 2,100,000 ARL                                                 |
| Unlocked    | Free of any cliff, vesting, timelock or protocol-level restriction: all 2,100,000 ARL, from TGE   |
| Circulating | Counted in circulating supply: all 2,100,000 ARL, from TGE (section 5)                            |
| Transferred | Moved by the Founder to another address, including an exchange deposit address; still circulating |
| Sold        | Ownership passed to a buyer; still circulating                                                    |

A token does not need to be sold to be unlocked or circulating. Tokens the
Founder has not sold are still unlocked and still circulating. "Not sold" does
not mean "locked".

## 5. Circulating Supply Definition

APPROVED / LOCKED definition:

> **Circulating Supply = totalSupply − balances held by protocol-controlled or
> locked addresses.**

The protocol-controlled and locked addresses are published in the official
deployment manifest. They are: every vesting wallet (investors, strategic
partnerships, each team grant and each partner wallet), the treasury timelock,
every genesis Safe other than the address holding the Founder's unlocked
2,100,000 ARL, and any future reward, staking-reward or claim contract funded
from an allocation.

| #   | Term                         | Definition                                                                                        | Counts as circulating    |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | Maximum Supply               | The hard cap: 21,000,000 ARL                                                                      | —                        |
| 2   | Total Supply                 | `totalSupply()`; equal to the maximum supply for the life of the token                            | —                        |
| 3   | Allocated Supply             | The genesis assignment in section 3                                                               | No, not by itself        |
| 4   | Locked Supply                | Balances of vesting wallets, the treasury timelock and every protocol-controlled Safe or contract | No                       |
| 5   | Vested but unreleased Supply | Vested and releasable, but still in a vesting wallet                                              | No, until released       |
| 5a  | Unlocked Founder Supply      | The Founder's 2,100,000 ARL, unlocked at TGE (section 4.4)                                        | Yes, from TGE            |
| 6   | Circulating Supply           | Total supply minus locked supply (including 5)                                                    | Yes                      |
| 7   | Protocol-Owned Liquidity     | ARL the protocol has deposited into an open liquidity pool                                        | Yes, reported separately |
| 8   | Staked User-Owned Supply     | ARL owned by users and staked by them                                                             | Yes, reported separately |

Rules (APPROVED / LOCKED):

- An allocation does not become circulating by being allocated.
- Treasury-controlled balances are not circulating until they are spent to an
  address outside protocol control.
- ARL actually deposited into an open liquidity pool is circulating. ARL still
  in the Liquidity Safe is not.
- User-owned staked ARL stays circulating; staking does not remove it.
- Staking rewards still held in a reward pool are not circulating; rewards paid
  to users are.
- The Founder's unlocked 2,100,000 ARL is circulating from TGE, whether or not
  it has been transferred or sold. The address that holds it is not a
  protocol-controlled or locked address.
- The Public Launch allocation is **not** 5,000,000 circulating at TGE. Only
  what the approved launch mechanism actually distributes becomes circulating.
- Circulating supply is computed from on-chain balances. It is never estimated
  or hard-coded, and no figure is published before a deployment exists.
- Future unlocks count only when released out of a vesting wallet or
  protocol-controlled address.

This definition replaces the circulating-supply method recorded under the
superseded M-2 decision, which counted vested but unreleased tokens as
circulating.

## 6. TGE Definition

APPROVED / LOCKED: **TGE is the block in which the ARL token contract is
deployed**, unless a later launch event is formally approved and published.

At TGE, apart from the Founder's unlocked 2,100,000 ARL, the entire supply is
held by protocol-controlled or locked addresses. Circulating supply at the TGE
block is therefore the Founder's 2,100,000 ARL. It rises only as approved
mechanisms distribute other tokens.

## 7. Public Launch Policy

APPROVED / LOCKED:

- 5,000,000 ARL is the **ceiling** for the Public Launch allocation, not an
  amount released at TGE.
- Circulating supply from this allocation at TGE depends entirely on the
  approved launch mechanism.
- Any part of the allocation not used by an approved mechanism stays in its
  controlled or locked holder. The token has no burn; unused tokens are not
  destroyed.
- Public Launch and Liquidity are separate allocations. Neither may be used to
  fund or disguise the other.
- Any launch mechanism needs separate legal approval and separate
  implementation approval before it is built or announced.

APPROVED / LOCKED (CTO decision of 2026-09-28, legal approval confirmed by the
CTO): the launch mechanism is a **Merkle claim**. A fixed, published list of
accounts and amounts is committed on-chain as a Merkle root; each listed account
can claim its amount once, within a claim window. No funds are collected from
participants. After the window closes, the unclaimed balance returns to the
Public Launch Safe; nothing is burned.

IMPLEMENTATION CONSTRAINT: `ARLMerkleDistributor` implements the mechanism. It
has no owner, admin, pause or upgrade path; the list, the claim window and the
return address are fixed at deployment. The launch parameters below are not
approved (`LAUNCH_PARAMETERS_APPROVED = false`); `DeployDistributor` runs only on
local Anvil and Base Sepolia, and Base Mainnet is hard-locked.

TBD / REQUIRES CTO DECISION: the eligibility rules for the list, the operational
split between public access, launch distribution and launch incentives, the
amount distributed at TGE, any per-address limits, the claim window, the
tranche schedule for the remainder, any vesting for participants, and the
policy for the unused remainder.

## 8. Early User Policy

APPROVED / LOCKED principles for the 1,100,000 ARL Early Users allocation:

- Rewards are **contribution-based**: only genuine, verifiable use of the
  protocol qualifies.
- Rewards are distributed in **epochs**, each with a published budget.
- **Anti-Sybil** controls apply, including **per-address limits**.
- Eligibility rules are **transparent** and published before an epoch starts.
- Referral rewards are designed to prevent abuse.
- **No reward is paid merely for connecting a wallet.**
- No claim contract is implemented by this specification.
- No reward formula is final.

TBD / REQUIRES CTO DECISION: epoch length and count, budget per epoch, reward
formula, eligible activities, Sybil controls and review process, per-address
limits, referral rules and budget, the claim mechanism and its contract,
whether claimed rewards vest, and the policy for unused epoch budgets.

## 9. Staking Policy

APPROVED / LOCKED:

- The maximum staking reward allocation is **3,000,000 ARL** (Community &
  Staking).
- Staking **never mints** ARL. All emissions come from this allocation and
  stay within 3,000,000 ARL in total.
- Staked ARL remains owned by the user (section 5).
- No staking contract exists, and none is part of this specification.

TBD / REQUIRES CTO DECISION: the emission curve and duration, any APY target
(an APY depends on emission and on the amount staked, so it cannot be fixed
without both), whether protocol revenue supplements rewards, the split between
staking and other community rewards, and the staking contract and its audit.

## 10. Ecosystem & Growth Policy

APPROVED / LOCKED:

- The 2,000,000 ARL allocation funds ecosystem development, developer and user
  growth, integrations, and referral and growth programs.
- Spending runs through **controlled budgets** approved per program.
- There is **no unrestricted immediate release** of the allocation.

TBD / REQUIRES CTO DECISION: program budgets, approval process and signers,
per-program vesting for recipients, eligibility rules, and reporting.

## 11. Partnership Policy

APPROVED / LOCKED:

- The 2,000,000 ARL Strategic Partnerships allocation vests with 0% at TGE, a
  12-month cliff and 36 months linear (section 4).
- It is not an unconditional transfer pool.
- Individual partner agreements may add milestone conditions. Milestones are
  applied by the partnerships Safe, not by the vesting contract.

TBD / REQUIRES CTO DECISION:

- The milestone template: what qualifies (for example an integration live on
  mainnet, an on-chain usage threshold, or a minimum active period), how
  completion is verified, and how it is published.
- The per-partner cap and whether each partner receives its own vesting
  wallet.
- The return policy for unmet milestones.
- The agreement template.

## 12. Grants Policy

The 400,000 ARL Grants / Bug Bounty allocation has two separate programs.

### A. Developer Grants

APPROVED / LOCKED: the M-3 principles apply where applicable. Grants are
irrevocable, paid in tranches, and each recipient receives tokens through its
own Safe.

TBD / REQUIRES CTO DECISION: eligibility, the review committee and its
threshold, per-grant caps, the milestone and tranche structure, reporting, and
the budget split between grants and bug bounties.

### B. Security Bug Bounties

APPROVED / LOCKED: bounties are paid from this allocation only.

TBD / REQUIRES CTO DECISION: the severity levels and payout table (none is
defined here), the payout process and its speed, disclosure rules consistent
with `SECURITY.md`, and whether bounty payouts are exempt from tranche rules.

## 13. Liquidity Policy

APPROVED / LOCKED:

- The 2,000,000 ARL Liquidity allocation is held in a **dedicated Safe** until
  used.
- Only the amount actually placed into market liquidity becomes circulating.
- LP-token custody must be controlled; LP tokens may not sit in an individual's
  wallet.
- The Public Launch allocation may not be used to hide or replace liquidity
  funding, and the Liquidity allocation may not be used as launch
  distribution.

TBD / REQUIRES CTO DECISION: the initial pool size, venues and fee tiers, the
matching asset and how it is funded, the LP-token lock mechanism and duration,
market-maker terms for any centralized exchange, and the tranche schedule.

## 14. Treasury Policy

APPROVED / LOCKED (unchanged):

- The 1,000,000 ARL Treasury is held by `ARLTimelock`, controlled by a 3-of-5
  Safe.
- Every operation waits at least 48 hours.
- A separate guardian Safe can only cancel pending operations. It has no
  sunset.
- Treasury balances are not circulating until spent (section 5).

TBD / REQUIRES CTO DECISION: the spending policy (permitted purposes and caps),
periodic public reporting, signer selection, and monitoring of scheduled
operations.

## 15. Remaining TBD Decisions

1. The TGE date. The vesting start rule is decided (`VESTING_START =
TGE_TIMESTAMP`, section 4.3); the date is not.
2. Public Launch: eligibility rules for the claim list, operational split, TGE
   amount, limits, claim window, tranches, unused remainder (the mechanism, a
   Merkle claim, is approved; section 7).
3. Early Users: epochs, budgets, formula, eligibility, Sybil controls, limits,
   referral rules, claim mechanism and contract, vesting of claims.
4. Staking: emission curve, duration, APY target, revenue supplement, contract.
5. Ecosystem & Growth: program budgets, approvals, recipient vesting, reporting.
6. Strategic Partnerships: milestone template, per-partner cap and wallets,
   return policy, agreement template.
7. Grants: grant rules and committee, budget split, bounty payout table and
   process.
8. Liquidity: pool size, venues, matching asset funding, LP lock, market-maker
   terms.
9. Treasury: spending policy, reporting, signers, monitoring.
10. Team: tranche sizes and the policy for unassigned pool tokens.
11. Signer sets and thresholds for every Safe except the Treasury.
12. Founder: the address that receives the unlocked 2,100,000 ARL at TGE.
13. ARL Core: the unresolved items listed in section 17.10.

Vesting implementation status (not a decision): the approved section 4.1
durations (12-month cliff, 36 months linear, calendar months) are enforced by
the tokenomics package, the deployment planner, `ARLDeployPlan` and the
verifier. Both schedules start at the TGE (section 4.3); the TGE date is not confirmed
(`VESTING_SCHEDULES_APPROVED = false`). The tooling deploys only to local Anvil
and Base Sepolia, which may use a placeholder start; Base Mainnet is hard-locked.

Founder implementation status (not a decision): the whole Founder allocation
(2,100,000 ARL) is minted at genesis to one dedicated Founder Safe, with no
vesting wallet, and is unlocked at TGE.

## 16. Mainnet Preconditions

Before any mainnet deployment, all of the following must be true:

1. Every item in section 15 is decided, or explicitly deferred in writing with
   no effect on the deployment.
2. The approved vesting schedules are implemented in the source of truth, the
   deployment planner and the verifier, and the public-network gate is lifted
   only by that change.
3. The circulating-supply definition (section 5) is implemented against the
   deployment manifest and published with its address list.
4. Any new contract (launch mechanism, claim, staking, LP lock) is specified,
   implemented, tested and independently audited.
5. The production chain is selected, and a testnet rehearsal with real test
   Safes for every role has passed.
6. Signer sets for every Safe are in place and verified.
7. Liquidity matching funds are secured and the LP-lock policy is approved.
8. The launch mechanism has legal and implementation approval.
9. An independent external audit of the final contracts is complete. No audit
   has been performed so far.

## 17. ARL Core Monetary Standard

Status: the decisions in this section are **APPROVED / LOCKED** (CTO,
2026-09-27) unless an item is marked TBD. ARL Core is not implemented; nothing
in this section changes the ERC-20 token, its deployment tooling or its tests.
`packages/monetary` is the executable reference of this section: its test
vectors are the worked examples below, and any ARL Core implementation must
produce the same results. It decides none of the items in section 17.10.

### 17.1 Terminology

| Term             | Meaning                                                                                | Status            |
| ---------------- | -------------------------------------------------------------------------------------- | ----------------- |
| ARL              | The unit of account. Human-readable amounts are stated in ARL                          | APPROVED / LOCKED |
| mote             | The ARL Core base unit: the smallest amount ARL Core can represent. 1 mote = 10^-8 ARL | APPROVED / LOCKED |
| Core base unit   | Same as mote                                                                           | APPROVED / LOCKED |
| ERC-20 base unit | The smallest unit of the ERC-20 token. 1 ERC-20 base unit = 10^-18 ARL                 | APPROVED / LOCKED |
| Core precision   | 8 decimal places                                                                       | APPROVED / LOCKED |
| ERC-20 precision | 18 decimal places (`decimals() = 18`), unchanged                                       | APPROVED / LOCKED |

Plural of mote: motes. Amounts in motes and in ERC-20 base units are always
non-negative integers.

### 17.2 Conversion equations

APPROVED / LOCKED:

```text
1 ARL  = 10^8  motes                  = 100,000,000 motes
1 ARL  = 10^18 ERC-20 base units      = 1,000,000,000,000,000,000 ERC-20 base units
1 mote = 10^10 ERC-20 base units      = 10,000,000,000 ERC-20 base units

motes            = ARL × 10^8
ERC-20 units     = ARL × 10^18
ERC-20 units     = motes × 10^10                       (exact; checked)
motes            = floor(ERC-20 units / 10^10)         (floor; see 17.6)
remainder        = ERC-20 units − motes × 10^10        (0 ≤ remainder < 10^10)
ERC-20 units     = motes × 10^10 + remainder           (always holds exactly)
```

Mote to ERC-20 conversion is always exact. ERC-20 to mote conversion is exact
only when the remainder is 0.

Worked examples:

| Amount                                       | motes                 | ERC-20 base units                  | Remainder (ERC-20 base units) |
| -------------------------------------------- | --------------------- | ---------------------------------- | ----------------------------- |
| 1 ARL                                        | 100,000,000           | 1,000,000,000,000,000,000          | 0                             |
| 2.5 ARL                                      | 250,000,000           | 2,500,000,000,000,000,000          | 0                             |
| 1 mote (0.00000001 ARL)                      | 1                     | 10,000,000,000                     | 0                             |
| 21,000,000 ARL (maximum)                     | 2,100,000,000,000,000 | 21,000,000,000,000,000,000,000,000 | 0                             |
| 10,000,000 ARL (floor)                       | 1,000,000,000,000,000 | 10,000,000,000,000,000,000,000,000 | 0                             |
| 12,345,678,901,234,567,890 ERC-20 base units | 1,234,567,890         | 12,345,678,901,234,567,890         | 1,234,567,890                 |

### 17.3 Numeric representation and safety

APPROVED / LOCKED:

- Every stored Core amount (balance, transfer amount, fee, stake, reward,
  burn amount, total supply) is an unsigned 64-bit integer (u64) in motes.
- Intermediate products and quotients (for example `amount × numerator /
denominator`) are computed in unsigned 128-bit integers (u128). Every
  result is converted back to u64 with a checked conversion.
- All monetary arithmetic and every numeric conversion is checked. Unchecked,
  wrapping or saturating arithmetic is not permitted for monetary values.
- Floating-point arithmetic, decimal floating-point types and
  locale-dependent parsing are not permitted anywhere in consensus-critical
  monetary code.
- `MAX_MONEY = 21,000,000 × 10^8 = 2,100,000,000,000,000 motes`. Every amount,
  and every running sum of amounts, must satisfy `0 ≤ value ≤ MAX_MONEY`.
- Range headroom: `MAX_MONEY` needs 51 bits. The u64 maximum is
  18,446,744,073,709,551,615, so every valid amount fits with a margin of
  more than 8,000 times.
- ERC-20 amounts can reach 2.1 × 10^25 base units, which does not fit in u64.
  Any Core-side code that handles ERC-20 base units uses u128
  (maximum ≈ 3.4 × 10^38) with checked arithmetic.

Required checks, each of which must fail closed:

| Operation             | Precondition                          | On failure                   |
| --------------------- | ------------------------------------- | ---------------------------- |
| `balance + amount`    | no overflow; result ≤ `MAX_MONEY`     | transaction invalid          |
| `balance − amount`    | `balance ≥ amount`                    | transaction invalid          |
| `amount + fee`        | no overflow; result ≤ `MAX_MONEY`     | transaction invalid          |
| sum of amounts        | each partial sum ≤ `MAX_MONEY`        | transaction or block invalid |
| u128 → u64 conversion | value ≤ u64 maximum and ≤ `MAX_MONEY` | operation invalid            |
| division              | denominator ≠ 0                       | operation invalid            |
| burn                  | the floor rule in 17.8 holds          | burn invalid (17.8)          |

A block containing an invalid transaction or an invalid state transition is
invalid.

### 17.4 Serialization

APPROVED / LOCKED:

- A Core base-unit integer is serialized as exactly **8 bytes, unsigned,
  little-endian**. This is the only valid encoding wherever an amount is
  hashed, signed, stored in consensus state or sent in a consensus network
  message.
- Variable-length encodings are not used for amounts.
- A decoder rejects an amount field that is not exactly 8 bytes. A decoded
  value above `MAX_MONEY` is invalid.
- Each value has exactly one encoding, and each encoding has exactly one
  value.

Example: 250,000,000 motes (2.5 ARL) = `0x000000000EE6B280`, serialized as
bytes `80 B2 E6 0E 00 00 00 00`.

### 17.5 RPC and API representation

APPROVED / LOCKED:

- Canonical and mandatory: the amount in motes as a **base-10 integer
  string**, for example `"250000000"`.
- Optional additional field: the amount in ARL as a decimal string with
  exactly 8 fractional digits, for example `"2.50000000"`.
- Amounts are never sent or accepted as JSON numbers. Clients must not depend
  on a floating-point representation.
- Conversion between motes and ARL strings uses integer arithmetic only:
  `whole = motes / 10^8`, `fraction = motes mod 10^8`, output
  `whole + "." + fraction` padded to 8 digits.
- Parsing an ARL string accepts ASCII digits and at most one `.`, with at
  most 8 fractional digits. It rejects signs, exponents, whitespace, digit
  grouping, locale separators and values above `MAX_MONEY`.

TBD / REQUIRES CTO DECISION: the RPC and API field names.

### 17.6 Rounding

APPROVED / LOCKED:

- Transfers, fees stated in motes and burns stated in motes involve no
  rounding.
- Where a conversion or a proportional calculation cannot be exact, the
  result is rounded down (floor).
- The remainder is always calculated explicitly:
  `remainder = input − Σ outputs`, with `0 ≤ remainder`.
- Value is never lost silently: `Σ outputs + remainder = input` must hold
  exactly for every such operation.
- Example: 100 motes split equally among 3 recipients gives 33, 33 and 33
  motes, with a remainder of 1 mote.

TBD / REQUIRES CTO DECISION: the **destination of each remainder**. The
current specification gives no basis for choosing one, so none is assigned:

- the ERC-20 to mote conversion remainder (below 10^10 ERC-20 base units);
- remainders from proportional distributions (staking rewards, validator
  rewards, fee distribution, any future split).

Until a destination is approved for a given operation, that operation is not
fully specified and must not be implemented.

### 17.7 Precision immutability

APPROVED / LOCKED:

- Core precision (8 decimals, 1 ARL = 10^8 motes) is fixed at genesis and is
  immutable after mainnet.
- No governance, admin, parameter or upgrade mechanism may change it.
- Any change would reinterpret every balance and every signed transaction. It
  would therefore be a new protocol, not a parameter change, and could not
  happen silently.

### 17.8 10,000,000 ARL supply floor

APPROVED / LOCKED:

- `SUPPLY_FLOOR = 10,000,000 ARL = 1,000,000,000,000,000 motes`.
- For a burn of `b` motes against effective supply `S` (in motes), the burn
  is valid only if the checked subtraction `S − b` succeeds and
  `S − b ≥ SUPPLY_FLOOR`.
- A burn that fails this condition is **rejected**:
  - it is not applied;
  - it is not clamped;
  - it is not reduced, split or deferred automatically.
- A state transition that applies a rejected burn is invalid, and so is a
  block containing it.
- The condition depends only on `S`, `b` and `SUPPLY_FLOOR`, so every node
  reaches the same result.

TBD / REQUIRES CTO DECISION:

- The definition of **effective supply** `S` while both the ERC-20 token and
  ARL Core exist (how the two are reconciled without double counting).
- What happens to the burn schedule after a scheduled epoch burn is rejected
  under this rule. The rule itself is locked: the burn is not applied.

The burn amount, formula, decay, source and first burn are TBD and are not
defined here.

### 17.9 Burn epoch

APPROVED / LOCKED:

- The semantic time source is the ARL Core **consensus timestamp**, subject
  to the chain's deterministic timestamp validity rules. Local wall-clock
  time is never used.
- For calendar year `Y`, the epoch instant is
  `T(Y) = Y-06-01T03:00:00Z`, expressed in Unix seconds (proleptic Gregorian
  calendar, UTC, no leap seconds, no time zones or daylight saving). Example:
  `T(2027) = 1811818800`.
- `T(Y)` is computed with integer calendar arithmetic, never with a
  locale-dependent or floating-point date library.
- Interpretation: epoch `Y` is due in the first block whose consensus
  timestamp is greater than or equal to `T(Y)` and in which epoch `Y` has not
  yet been processed. Consensus state records the last processed epoch, so
  each epoch is processed at most once.
- No block height is defined. None is required unless the consensus design
  requires one.

Dependencies on the ARL Core consensus specification (not yet written):

- the timestamp validity rules: monotonicity, allowed drift and unit (seconds
  are assumed by `T(Y)`);
- whether a burn is applied in the block that crosses `T(Y)`, or in a
  designated position within it.

### 17.10 Unresolved ARL Core items

These are the only open items in this section. None may be assumed.

1. Remainder destination for the ERC-20 to mote conversion (17.6).
2. Remainder destination for proportional distributions (17.6).
3. Definition of effective supply `S` while both representations exist
   (17.8).
4. Burn schedule behavior after a scheduled epoch burn is rejected (17.8).
5. Handling of several epochs that pass without a block (for example after a
   halt longer than a year): process each missed epoch or only one. This is
   an economic decision (17.9).
6. First burn year, burn amount, formula, decay and source (economic, TBD).
7. Consensus timestamp rules and the exact in-block position of the epoch
   burn: a dependency on the consensus specification (17.9).
8. The ERC-20 to ARL Core conversion mechanism itself (bridge, migration or
   other). It is not defined.
9. RPC and API field names (17.5).
