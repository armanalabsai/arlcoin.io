# Builder rewards

ARL pays builders who improve the protocol's tools: SDKs, examples, integrations and docs. Rewards
are paid in ARL from the **Grants / Bug Bounty** allocation, held by its own Safe, after the owners
sign the transfer. Security findings follow [bug-bounty.md](bug-bounty.md) instead.

## Rewards (approved 2026-11-16)

| Size        | Example                                                                         | Reward    |
| ----------- | ------------------------------------------------------------------------------- | --------- |
| Small       | An issue labelled `good first issue`: one function with its test, one example   | 150 ARL   |
| Medium      | A feature across a package: a new SDK call family, an n8n operation, a tutorial | 500 ARL   |
| Integration | ARL inside another framework or product, merged and documented                  | 1,500 ARL |

The total paid to builders is capped at 52,500 ARL per year (0.25% of the 21,000,000 supply), inside
the Grants / Bug Bounty allocation.

## How it works

1. Pick an open issue whose body names a reward, and comment that you are taking it.
2. Open a pull request that follows [CONTRIBUTING.md](../CONTRIBUTING.md); CI must pass.
3. Put a Base address in the pull request description.
4. When the pull request is merged, the reward joins the next payout batch from the Grants Safe.

One person per issue; the first merged pull request that closes it is rewarded. Work that was not
asked for in an issue can be rewarded too, at the owners' discretion. Rewards are never paid up
front, and nothing is paid for a pull request that is not merged.
