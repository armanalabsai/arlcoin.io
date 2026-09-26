# ARL Token, Vesting and Treasury Design

Status: **approved design, not implemented.** No contract code exists yet and
nothing is deployed. Implementation starts only after Phase 1 approval.

All references are to OpenZeppelin Contracts **v5.6.1**
(commit `5fd1781b1454fd1ef8e722282f86f9293cacf256`), verified against the
upstream source. See [`open-source.md`](open-source.md) for why v5.6.1 and not
v5.7.0.

## Token

| Property              | Value                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Standard              | ERC-20 (`ERC20.sol`)                                                |
| Name / symbol         | ARL / ARL                                                           |
| Decimals              | 18                                                                  |
| Supply                | 21,000,000 ARL (21,000,000 × 10¹⁸ base units)                       |
| Issuance              | Minted once, in the constructor, directly to the allocation holders |
| Mint after deployment | Impossible — no external or public function calls `_mint`           |
| Owner / admin         | None. The token does not inherit `Ownable` or `AccessControl`       |
| Pause                 | None. No security analysis has shown a pause to be necessary        |
| Upgradeability        | None. No proxy                                                      |

Constructor rules:

- Takes the recipient list produced from `packages/tokenomics` and reverts
  unless the minted total equals exactly 21,000,000 × 10¹⁸.
- `_mint` is internal to OpenZeppelin's `ERC20`; the ARL contract calls it only
  from the constructor. Tests assert that the deployed bytecode exposes no
  function that can increase `totalSupply`.

Open token decisions:

- `ERC20Permit` (EIP-2612 signed approvals) would help AI payment flows. It
  adds no supply risk. Proposal: include.
- `ERC20Burnable`: burning reduces supply and cannot breach the cap. Proposal:
  exclude until a use case exists.

## Vesting

OpenZeppelin `VestingWallet` releases linearly from `start` over `duration`.
`VestingWalletCliff` returns zero before the cliff, **then releases everything
vested since `start`** — at the end of a 24-month cliff it would release 24
months' worth at once. That does not match "cliff, then linear".

ARL therefore uses a plain `VestingWallet` whose `start` is the end of the
cliff:

| Allocation        | Beneficiary     | `start`                | `duration` |
| ----------------- | --------------- | ---------------------- | ---------- |
| Founder           | founder address | launch + 24 months     | 36 months  |
| Team (per member) | member address  | grant date + 12 months | 36 months  |
| Ecosystem Reserve | ecosystem Safe  | launch                 | 60 months  |

Ecosystem Reserve: linear release of 7,000,000 ARL over 60 months never
exceeds 1,400,000 ARL in any 12-month window, which satisfies the annual cap
without custom code. Released tokens go to the ecosystem Safe; release is not
sale.

Unassigned team tokens: held by a Safe-controlled team pool. A member's
`VestingWallet` is created and funded only when an approved grant exists.

Required decisions and risks:

- **Month length.** "24 months" must become an exact number of seconds.
  Proposal: fix absolute `start` timestamps at deployment rather than
  computing months on-chain.
- **Transferable vesting wallets.** `VestingWallet` is `Ownable`; a beneficiary
  can transfer ownership and so sell unvested tokens (documented upstream).
  Proposal: a thin ARL subclass that disables `transferOwnership` and
  `renounceOwnership`. This is ARL-specific code and needs its own tests.

## Treasury

Approved policy: Safe multisig, **3-of-5** approval, **minimum 48-hour** delay.

Safe has no built-in delay. Proposed composition:

```
Safe (3-of-5) ──proposes / cancels──▶ TimelockController (minDelay = 172,800 s)
                                           │ holds treasury ARL
                                           ▼ executes after the delay
```

- `TimelockController(minDelay, proposers=[Safe], executors=[Safe], admin=address(0))`.
  With `admin = address(0)`, only the timelock itself holds the admin role, so
  any role or delay change must itself pass the 48-hour delay.
- Treasury tokens are held by the timelock, not by the Safe.
- Signer addresses are configured only when the production Safe is created.
  No addresses, keys or seed phrases are ever committed to this repository.

Alternative considered: the Zodiac Delay modifier for Safe. Rejected for now —
`TimelockController` is already part of the selected OpenZeppelin release and
is covered by its audits.

## Role separation

Separate Safes for treasury, ecosystem reserve, team pool and reward programs,
so that one compromised signer set cannot move every allocation. Signer
overlap between Safes is a decision for the project lead.
