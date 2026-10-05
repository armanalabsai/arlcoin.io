# Bug bounty

Status: **live since 2026-10-05**, with the public Base Sepolia test period and the public
repository (https://gitlab.com/armanalabs-group/arlcoin). Scope commit: `00d9056`. The amounts below are paid only when a valid report
is accepted; nothing is paid up front.

## Why a bounty instead of a paid audit

The owner decided on 2026-10-03 not to pay for an independent audit before launch. The contracts
are instead covered by the checks in [audit-scope.md](audit-scope.md) (tests at 100% line and
function coverage, fuzzing, invariants, Halmos proofs, Slither, Aderyn, Mythril), a public test
period on Base Sepolia, and this bounty. Every listing and launchpad document states plainly that
no independent audit has been done.

## Funding

Rewards are paid in ARL from the **Grants / Bug Bounty** allocation (400,000 ARL), held by its own
Safe. A reward is a transfer from that Safe after the owners sign it. No other allocation pays
bounties.

## Rewards (approved 2026-10-05)

| Severity | Example                                                                                                                                        | Reward     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Critical | Minting beyond 21,000,000 ARL; moving tokens without the holder's approval; draining a vesting wallet, the distributor or the staking contract | 40,000 ARL |
| High     | Releasing vested tokens early; bypassing the 48-hour timelock floor; claiming twice from the distributor                                       | 15,000 ARL |
| Medium   | Locking funds so they can only be recovered by the owners; incorrect accounting that does not lose funds                                       | 4,000 ARL  |
| Low      | A deviation from the documented behaviour without loss or lock of funds                                                                        | 500 ARL    |

The total paid in one program period is capped at 200,000 ARL. Rewards from the Grants / Bug
Bounty allocation never exceed its 400,000 ARL.

## Rules

- In scope: the contracts in `contracts/src` at the commit named in the program announcement, as
  deployed on Base Sepolia during the test period and on Base Mainnet afterwards.
- Out of scope: third-party code (OpenZeppelin, Safe, forge-std; report those upstream), the
  website, the dApp front end, social engineering, and denial of service against RPC providers.
- Report privately to armanalabsai@gmail.com (see `SECURITY.md`); do not disclose publicly before a fix is deployed or 90 days have passed.
- Testing on Base Mainnet must not touch other users' funds. Use a local fork.
- The first valid report of an issue is rewarded; duplicates are not.
- Reporters must not be on a sanctions list, and must be able to receive ARL on Base.

## Open items (owner)

- None. The program is open; it is listed on arlcoin.io next to the audit status.
