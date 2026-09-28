# ARL Token, Vesting and Treasury

Status: **implemented and tested; not deployed.** No contract address exists on
any network. Deployment requires a separate approval.

Source: [`contracts/src/`](../contracts/src). Upstream: OpenZeppelin Contracts
v5.6.1 (`5fd1781b1454fd1ef8e722282f86f9293cacf256`). Compiler: solc 0.8.36,
EVM version `cancun`, optimizer 200 runs, no via-IR.

## Contracts

| Contract           | Upstream base                             | ARL-specific code                                        |
| ------------------ | ----------------------------------------- | -------------------------------------------------------- |
| `ARLToken`         | `ERC20`, `ERC20Permit` (both unmodified)  | Constructor that mints the eleven allocations once       |
| `ARLAllocation`    | —                                         | Library of allocation constants                          |
| `ARLVestingWallet` | `VestingWallet` (unmodified vesting math) | Explicit cliff parameters; beneficiary cannot be changed |
| `ARLTimelock`      | `TimelockController`                      | No external admin; 48-hour floor on the delay            |

## Token

| Property                     | Value                                          |
| ---------------------------- | ---------------------------------------------- |
| Name / symbol                | ARL / ARL                                      |
| Decimals                     | 18                                             |
| Supply                       | 21,000,000 ARL, minted once in the constructor |
| Public functions             | ERC-20, EIP-2612 permit, `MAX_SUPPLY`          |
| Owner, admin, pause, upgrade | None                                           |

### Supply invariant

`totalSupply() == MAX_SUPPLY == 21,000,000 × 10¹⁸` from the end of the
constructor for the life of the contract.

Why no code path can increase supply:

1. OpenZeppelin's `_mint` is `internal`. `ARLToken` calls it only in its
   constructor, which runs once.
2. There is no burn, so supply also cannot decrease.
3. The contract is not upgradeable and has no `delegatecall`, so the code cannot
   change after deployment.
4. The constructor reverts unless the minted total equals `MAX_SUPPLY`.

Enforced by:

- `test_NoAdminOrMintFunctions` — calls mint, burn, owner, pause, role,
  initializer and upgrade selectors with valid arguments; all fail.
- `scripts/check-token-abi.mjs` — CI fails if the compiled ABI contains any
  function beyond ERC-20, EIP-2612 permit (`permit`, `nonces`,
  `DOMAIN_SEPARATOR`, `eip712Domain`) and `MAX_SUPPLY`.
- Invariants `invariant_TotalSupplyIsExactlyMax` and
  `invariant_BalancesSumToSupply` over 262,144 random calls (extended run).
- `contract-consistency.test.ts` — the Solidity constants must equal
  `packages/tokenomics` in amount and order, `ARLToken.Recipients` must have
  exactly one field per allocation, and `_mint` must appear exactly eleven
  times, all inside the constructor.

## Vesting

### Why `ARLVestingWallet`

OpenZeppelin v5.6.1 was checked first:

- `VestingWalletCliff` returns zero before the cliff and then applies the
  linear formula from `start`. At cliff expiry it releases the whole cliff
  period's share at once. Rejected.
- `VestingWallet` with `start = cliff end` gives exactly "nothing during the
  cliff, then linear" with unmodified OpenZeppelin math.
- `VestingWallet` is `Ownable`; the beneficiary can call `transferOwnership`
  and hand over every unvested token. OpenZeppelin warns about this in the
  contract itself and ships no non-transferable variant. Composition does not
  solve it: whatever address owns the wallet can transfer it.

`ARLVestingWallet` therefore adds only:

- explicit `cliffStart`, `cliffEnd`, `vestingEnd` timestamps, validated as
  `0 < cliffStart <= cliffEnd < vestingEnd`;
- `transferOwnership` and `renounceOwnership` that always revert.

No vesting math is changed. There are no initializers, so double
initialization is not possible.

### Schedules

Two allocations are held by `ARLVestingWallet`s, each releasing to a
dedicated Safe: Investors / Strategic Capital and Strategic Partnerships. Their
approved schedule is 0% at TGE, a 12-month cliff, then 36 months linear, in
calendar months. The Founder allocation does not vest (see below). The
deployment configuration supplies explicit UTC timestamps; the planner and
`ARLDeployPlan` reject any schedule with other durations, checking calendar
months with `DateTime.addMonths` from solidity-datetime (MIT). The vesting start
(TGE) is not confirmed, so both refuse every chain except local Anvil until it
is (`VESTING_SCHEDULES_APPROVED = false`). The verifier asserts that each
deployed wallet matches its planned beneficiary and timestamps, and that the
planned schedule has the approved durations.

The contracts never convert months to seconds. Vested amount at time `t`:

- `t < cliffEnd`: 0
- `cliffEnd ≤ t < vestingEnd`: `allocation × (t − cliffEnd) / (vestingEnd − cliffEnd)`, rounded down
- `t ≥ vestingEnd`: the full allocation

`release` may be called by anyone and always pays the beneficiary.

Strategic Partnerships is not an unconditional transfer pool: tokens reach the
partnerships Safe only as they vest, and the intended flow is partnership →
milestone → vesting → release. Milestones are not defined.

### Founder allocation

The whole 2,100,000 ARL Founder allocation (`FOUNDER`) is minted at genesis to
one dedicated Founder Safe and is unlocked at TGE. It does not go through a
vesting wallet, and the token gives the Founder Safe no privilege: it uses the
same ERC-20 transfer mechanics as every holder. Every plan address must be
distinct, so the Founder Safe cannot share an address with any other holder.

### Team pool

The 900,000 ARL team allocation is minted to a dedicated team pool Safe. A
member's `ARLVestingWallet` is created and funded from the pool only when an
approved grant exists. No individual grants are defined. Each grant vests with
0% at the grant date, a 12-month cliff, then 36 months linear. Grants are irrevocable and made in tranches; each member's
beneficiary is the member's own Safe or smart account. `ARLVestingWallet` has
no revocation and none is added.

### Known limitation

A beneficiary that loses its key loses the tokens in its wallet; there is no
recovery path in the vesting wallet by design. Recovery therefore lives in the
beneficiary itself:

- The Founder recipient must be a dedicated Safe (for example
  2-of-3). Off local Anvil, the deployment plan and the verifier reject it
  without contract code (M-3). A lost key is replaced by rotating the Safe's
  owners.
- Team members' beneficiaries are their own Safes or smart accounts.

Signer addresses and thresholds are Safe configuration and are never stored in
this repository.

## Treasury

Policy: Safe 3-of-5, minimum 48-hour delay, independent guardian that can
only cancel.

```
Safe (3-of-5) ──schedule / cancel / execute──▶ ARLTimelock (≥ 48 h)
                                                   ▲  │ holds 1,000,000 ARL
Guardian Safe ─────────── cancel only ─────────────┘  ▼
                                              token transfers
```

`ARLTimelock` is OpenZeppelin `TimelockController` with:

- admin fixed to `address(0)`: only the timelock holds `DEFAULT_ADMIN_ROLE`,
  so role changes must themselves wait the delay;
- a 48-hour floor in the constructor and in `updateDelay`. Upstream
  `updateDelay` accepts any value, so a scheduled call could otherwise reduce
  the delay to zero;
- at least one proposer and one executor required;
- no zero address in the proposer or executor list. Upstream accepts
  `address(0)`, and an `address(0)` executor opens execution to everyone;
- a guardian passed to the constructor that receives only `CANCELLER_ROLE`. It
  must be non-zero and must not appear in the proposer or executor list. It can
  cancel a pending operation during the delay, and cannot schedule, execute,
  move funds or change roles. There is no sunset.

A compromised guardian can cancel every Treasury operation, including an
operation that replaces the guardian. Funds cannot be moved or stolen that way,
but Treasury operations can be frozen until the guardian is replaced by social
or legal means. This trade-off was accepted on 2026-09-27. If the guardian's
keys are lost, the Treasury replaces it through a scheduled `revokeRole` and
`grantRole`, which a guardian without keys cannot cancel.

The Safe's 3-of-5 threshold and the guardian Safe's threshold are Safe
configuration. They are verified when the production Safes are created, not by
these contracts. The guardian's signers are to be disjoint from the Treasury
Safe's. Tests use labelled test accounts in place of the Safes. No signer
addresses exist yet.

## Other allocations

Public Launch, Community & Staking, Ecosystem & Growth, Liquidity, Early Users
and Grants / Bug Bounty are minted directly to their own dedicated Safes; the
Team allocation is minted to the team pool Safe. See
[`tokenomics.md`](tokenomics.md#custody).

### Public Launch claim distributor

The approved Public Launch mechanism is a Merkle claim (economic specification
section 7). `ARLMerkleDistributor` holds a fixed Merkle root of `(index,
account, amount)` entries, encoded as an OpenZeppelin `StandardMerkleTree`
(double-hashed leaves). Each entry can be claimed once before `claimEnd`; anyone
may submit a claim, but the tokens always go to the listed account. After
`claimEnd`, `sweep` returns the whole remaining balance to `returnTo`, the Public
Launch Safe. There is no owner, admin, pause, upgrade or root change. The
distributor is funded by a separate transfer from the Public Launch Safe; a
claim the balance cannot cover reverts and stays claimable.

The Merkle proof check is OpenZeppelin `MerkleProof`, the claimed flags are
OpenZeppelin `BitMaps`, and transfers use `SafeERC20`, all unmodified.
`packages/deploy` builds the list with `@openzeppelin/merkle-tree`
(`distribution-cli.ts`), rejecting duplicate or zero addresses, amounts above a
per-address limit, and totals above the budget or the 5,000,000 ARL Public
Launch allocation. The other programs have no approved claim mechanism, and
their lists are refused.

## ERC20Permit

**Included** (approved 2026-09-26). `ARLToken` inherits OpenZeppelin
`ERC20Permit("ARL")` unmodified; the EIP-712 domain is name `ARL`, version `1`.

| Aspect                  | Assessment                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benefit for AI payments | The x402 EVM specification (commit `dd927a26`) settles tokens without EIP-3009 through Permit2. Its `eip2612GasSponsoring` extension uses EIP-2612 so the user's one-time Permit2 approval is also gasless. Without permit, every payer first sends an on-chain `approve`. |
| Irreversibility         | The token is immutable. Permit cannot be added after deployment.                                                                                                                                                                                                           |
| OpenZeppelin support    | `ERC20Permit` in v5.6.1, covered by its audits. EIP-3009 is not in v5.6.1 and would be custom code — not recommended.                                                                                                                                                      |
| Replay protection       | EIP-712 domain binds chain ID and contract address; per-owner sequential nonces; deadline; `ECDSA` rejects malleable signatures.                                                                                                                                           |
| Supply                  | No effect. Permit only sets allowances.                                                                                                                                                                                                                                    |
| Risks                   | Phishing of off-chain signatures; a front-run permit makes the victim's transaction revert (callers should tolerate an already-used permit); `ERC20Permit` verifies EOA signatures only — smart-contract wallets use Permit2 or `approve`.                                 |
| Cost                    | Adds `permit`, `nonces`, `DOMAIN_SEPARATOR` and `eip712Domain`; no change to transfer gas.                                                                                                                                                                                 |

Tests (`ARLTokenPermit.t.sol`): valid permit and `transferFrom`, nonce
increment, supply unchanged, exact-deadline boundary, replay, expiry (fuzzed),
wrong signer, altered value or spender, other chain ID, high-`s` malleable
signature, zero signature, and fuzzed keys, values and deadlines.
