# Open-Source Evaluation

ARL builds on mature open-source components and keeps ARL-specific logic
separate. This page records what was evaluated. Adopted components and their
exact provenance are listed in [`THIRD_PARTY_LICENSES.md`](../THIRD_PARTY_LICENSES.md).

Licenses were read from each repository's own `LICENSE`/`COPYING` files on
2026-09-26, not from third-party summaries. Re-check before adoption; licenses
can change between releases.

## Licensing constraints for an Apache-2.0 repository

- **MIT, Apache-2.0**: can be incorporated.
- **LGPL-3.0**: fine for deployed contracts ARL interacts with but does not
  copy (for example a Safe instance). Copying source requires review.
- **GPL-2.0-or-later / GPL-3.0**: code can be used, but any module derived from
  it must be distributed under GPL-3.0. That module could not be Apache-2.0.
- **AGPL-3.0**: acceptable for tools run in CI and not distributed.
- **BUSL-1.1**: production use is not permitted without a license from the
  owner until the change date.

## Phase 1 — token foundation (adopted)

| Component              | Repository                          | Version / commit                                     | License           | Security record                                                                                                                                 | Use                                                                  |
| ---------------------- | ----------------------------------- | ---------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| OpenZeppelin Contracts | OpenZeppelin/openzeppelin-contracts | v5.6.1 / `5fd1781b1454fd1ef8e722282f86f9293cacf256`  | MIT               | Audit reports for every 5.x minor release in `audits/` (latest: v5.5 and v5.6 changes, Feb 2026); Immunefi bug bounty; patches the latest minor | ERC-20, VestingWallet, TimelockController                            |
| Safe smart account     | safe-global/safe-smart-account      | v1.5.0 / `dc437e8fba8b4805d76bcbd1c668c9fd3d1e83be`  | LGPL-3.0          | Audit reports for each release in `docs/` (v1.5.0: Ackee, Certora)                                                                              | Treasury multisig — deployed instance, not vendored                  |
| Foundry                | foundry-rs/foundry                  | v1.8.3 / `cae51ad458f6abb64852b7709eb784352429825d`  | MIT or Apache-2.0 | Published security policy                                                                                                                       | Build, unit, fuzz and invariant tests                                |
| forge-std              | foundry-rs/forge-std                | v1.16.2 / `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` | MIT or Apache-2.0 | —                                                                                                                                               | Test helpers                                                         |
| solidity-datetime      | RollaProject/solidity-datetime      | v2.2.0 / `294fc244973cc5f9ec374713affde12c1403927c`  | MIT               | 0.8 port of BokkyPooBah's DateTime library                                                                                                      | Calendar-month checks of vesting schedules (deployment tooling only) |
| Slither                | crytic/slither                      | 0.11.6 / `050cc0a094e77bfd58e8228ae3bb6aa15c65edb4`  | AGPL-3.0          | Maintained by Trail of Bits                                                                                                                     | Static analysis in CI (not distributed)                              |

OpenZeppelin v5.7.0 (released 2026-07-29) is newer, but its `audits/`
directory has no v5.7 report and npm's `latest` tag still points to 5.6.1.
Pin v5.6.1 and re-evaluate when a v5.7 audit is published.

`wevm/viem` (MIT, npm 2.56.9) is adopted to read on-chain balances for the circulating-supply
report.

`OpenZeppelin/merkle-tree` (MIT, npm 1.0.8) is adopted to build Public Launch claim lists in the
same `StandardMerkleTree` encoding that `ARLMerkleDistributor` verifies with OpenZeppelin
`MerkleProof`.

`curvefi/unipool-fork` (MIT, commit `262a5747a32acd3bf7124bc21058d6905f86e22a`, file
`contracts/StakingRewards.sol`) is the source of `ARLStakingRewards`. That file is a modified
Synthetix `StakingRewards` (MIT, Copyright (c) 2020 Synthetix) in which the reward is pulled in
with `transferFrom`. It is ported to Solidity 0.8 and OpenZeppelin v5, not vendored; the changes
are listed in the contract header and in `THIRD_PARTY_LICENSES.md`. The original Synthetix
repository could not be retrieved for comparison, so provenance is recorded only as far as the
curvefi fork.

`x402-foundation/x402` (npm `@x402/core` and `@x402/evm` 2.27.0, Apache-2.0; source commit
`71eb9a55e081e7b81ba3046d0bd17c3eb9c7bf81`) is adopted for ARL payments: the `upto` scheme client
and facilitator, used as published. ARL calls the deployed `x402UptoPermit2Proxy` (MIT, audited by
Cantina in February and March 2026) and Permit2 (MIT); both are pinned by address and code hash.
See `docs/payments.md`.

`safe-global/safe-deployments` (MIT, npm 1.37.63) is adopted for the canonical Safe v1.5.0
singleton addresses and code hashes: off local Anvil, every Safe role must be a genuine Safe
v1.5.0 proxy of a canonical singleton.

OpenZeppelin, forge-std, Foundry and Slither are now in use; the Safe is used
as a deployed instance only. Exact provenance is in `THIRD_PARTY_LICENSES.md`.

## Later phases (evaluated, not selected)

| Layer    | Candidate                           | Head evaluated   | License                                                      | Note                                                          |
| -------- | ----------------------------------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| DEX      | Uniswap v2 core                     | `6a9e7c978606`   | GPL-3.0                                                      | Usable; derived module must be GPL-3.0                        |
| DEX      | Uniswap v3 core                     | `d0831dc6b8a3`   | BUSL-1.1 → GPL-2.0-or-later (change date 2023-04-01, passed) | Now GPL                                                       |
| DEX      | Uniswap v4 core                     | `46c6834698c4`   | BUSL-1.1 until 2027-06-15, then MIT                          | Not usable in production before 2027-06-15 without a license  |
| DEX      | Balancer v2                         | `e91a2b643a49`   | GPL-3.0                                                      | Usable; GPL obligations                                       |
| Lending  | Aave v3 (aave-v3-origin)            | `8305565ae342`   | BUSL-1.1 until 2027-03-06                                    | Not usable in production without a license                    |
| Lending  | Compound III (Comet)                | `f766f51583c2`   | BUSL-1.1 → GPL-2.0-or-later (change date 2025-12-31, passed) | Now GPL                                                       |
| Lending  | Morpho Blue                         | `8e26ca6a8dbc`   | GPL-2.0-or-later                                             | Usable; GPL obligations                                       |
| Payments | x402 (Coinbase)                     | `dd927a26cfef`   | Apache-2.0                                                   | HTTP-native payment protocol; relevant to AI service payments |
| Payments | ERC-4337 reference (eth-infinitism) | v0.9.0           | GPL-3.0                                                      | Account abstraction, sponsored transactions                   |
| ZK       | gnark                               | v0.16.3          | Apache-2.0                                                   | Go proving library                                            |
| ZK       | Noir                                | v0.39.0          | MIT or Apache-2.0                                            | Circuit language                                              |
| ZK       | SP1                                 | v6.8.1           | MIT or Apache-2.0                                            | zkVM                                                          |
| ZK       | RISC Zero                           | v3.0.6           | MIT or Apache-2.0                                            | zkVM                                                          |
| ZK       | halo2 (zcash)                       | `54841311f448`   | MIT or Apache-2.0                                            | No trusted setup                                              |
| ZK       | circom / snarkjs                    | v2.2.3 / v0.7.6  | GPL-3.0                                                      | Groth16 needs a trusted setup                                 |
| Compute  | Akash                               | v2.1.2           | Apache-2.0                                                   | Decentralized compute marketplace                             |
| Compute  | Bacalhau                            | v1.9.4           | Apache-2.0                                                   | Distributed job execution                                     |
| Compute  | Golem (yagna)                       | v0.18.0          | GPL-3.0                                                      | Compute marketplace                                           |
| Network  | Cosmos SDK / CometBFT               | v0.55.0 / v1.0.1 | Apache-2.0                                                   | Application-specific chains                                   |
| Network  | OP Stack                            | v1.19.6          | MIT                                                          | Ethereum L2 framework                                         |
| Network  | Arbitrum Nitro                      | v2025.01.21      | BUSL-1.1 until 2030-12-31                                    | Production use limited to covered chains                      |
| Network  | reth                                | v2.6.0           | MIT or Apache-2.0                                            | Ethereum execution client                                     |
| Network  | go-ethereum                         | v1.17.6          | LGPL-3.0 / GPL-3.0                                           | Ethereum execution client                                     |
| Indexing | The Graph (graph-node)              | v0.45.0          | MIT or Apache-2.0                                            | Indexing                                                      |
| Indexing | Ponder                              | `6b0bd2cb598c`   | MIT                                                          | EVM indexing framework                                        |

Each later-phase selection needs its own full review (security history, test
status, maintenance) before its phase begins.
