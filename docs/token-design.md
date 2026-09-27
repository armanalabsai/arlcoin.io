# ARL Token, Vesting and Treasury

Status: **implemented and tested; not deployed.** No contract address exists on
any network. Deployment requires a separate approval.

Source: [`contracts/src/`](../contracts/src). Upstream: OpenZeppelin Contracts
v5.6.1 (`5fd1781b1454fd1ef8e722282f86f9293cacf256`). Compiler: solc 0.8.36,
EVM version `cancun`, optimizer 200 runs, no via-IR.

## Contracts

| Contract           | Upstream base                             | ARL-specific code                                        |
| ------------------ | ----------------------------------------- | -------------------------------------------------------- |
| `ARLToken`         | `ERC20`, `ERC20Permit` (both unmodified)  | Constructor that mints the ten allocations once          |
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
  `packages/tokenomics`.

## Vesting

### Why `ARLVestingWallet`

OpenZeppelin v5.6.1 was checked first:

- `VestingWalletCliff` returns zero before the cliff and then applies the
  linear formula from `start`. At cliff expiry it releases the whole cliff
  period's share at once (for the founder, 24/60 of the allocation). Rejected.
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

Timestamps are explicit UTC calendar dates supplied at deployment. The
contracts never convert months to seconds.

| Allocation        | `cliffStart` | `cliffEnd`                  | `vestingEnd`                    |
| ----------------- | ------------ | --------------------------- | ------------------------------- |
| Founder           | launch date  | launch + 24 calendar months | `cliffEnd` + 36 calendar months |
| Team member       | grant date   | grant + 12 calendar months  | `cliffEnd` + 36 calendar months |
| Ecosystem Reserve | launch date  | launch date (no cliff)      | launch + 1,830 days             |

Vested amount at time `t`:

- `t < cliffEnd`: 0
- `cliffEnd ≤ t < vestingEnd`: `allocation × (t − cliffEnd) / (vestingEnd − cliffEnd)`, rounded down
- `t ≥ vestingEnd`: the full allocation

`release` may be called by anyone and always pays the beneficiary.

### Ecosystem Reserve

A standard linear release satisfies the 1,400,000 ARL annual cap; no custom
logic is needed. The duration must be chosen carefully:

- Five calendar years from 2027-01-01 are 1,826 days and include leap year 2028. Linear over 1,826 days releases 7,000,000 × 366 / 1,826 ≈ 1,403,066 ARL
  in 2028 — over the cap (`test_PlainFiveCalendarYearsWouldBreachCap`).
- Linear over 5 × 366 = **1,830 days** releases at most 1,400,000 ARL in any
  window of up to 366 days, so the cap holds in every calendar year
  (duration approved 2026-09-26).
  Verified for each calendar year and by fuzzing arbitrary windows. Release
  completes about four days after the fifth anniversary.

Released tokens go to the ecosystem Safe. Release is not sale.

### Team pool

The 500,000 ARL team allocation is minted to a multisig-controlled pool. A
member's `ARLVestingWallet` is created and funded from the pool only when an
approved grant exists. No individual grants are defined. Grants are
irrevocable and made in tranches; each member's beneficiary is the member's own
Safe or smart account. `ARLVestingWallet` has no revocation and none is added.

### Known limitation

A beneficiary that loses its key loses the tokens in its wallet; there is no
recovery path in the vesting wallet by design. Recovery therefore lives in the
beneficiary itself:

- The founder beneficiary must be a dedicated Safe (for example 2-of-3). Off
  local Anvil, the deployment plan and the verifier reject a founder
  beneficiary without contract code. A lost key is replaced by rotating the
  Safe's owners; the beneficiary address never changes.
- Team members' beneficiaries are their own Safes or smart accounts.

Signer addresses and thresholds are Safe configuration and are never stored in
this repository.

## Treasury

Policy: Safe 3-of-5, minimum 48-hour delay, independent guardian that can
only cancel.

```
Safe (3-of-5) ──schedule / cancel / execute──▶ ARLTimelock (≥ 48 h)
                                                   ▲  │ holds 3,000,000 ARL
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

Community / Staking, Liquidity, Strategic Partnerships, Public Launch, Grants /
Bug Bounty and Mining / Early User Rewards are minted to their own multisigs.
Their release programs are later phases.

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
