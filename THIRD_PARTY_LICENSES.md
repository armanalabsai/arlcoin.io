# Third-Party Licenses and Provenance

The ARL Protocol repository is licensed under the Apache License 2.0 (see
[`LICENSE`](LICENSE)). That license does not replace the licenses of the
third-party components listed here; each keeps its own terms, copyright
notices and attribution requirements.

## Vendored source (git submodules, unmodified)

| Component              | Path                                   | Tag     | Commit                                     | License           | Use                                                                                                                               | ARL modifications                                                     |
| ---------------------- | -------------------------------------- | ------- | ------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| OpenZeppelin Contracts | `contracts/lib/openzeppelin-contracts` | v5.6.1  | `5fd1781b1454fd1ef8e722282f86f9293cacf256` | MIT               | `ERC20`, `VestingWallet`, `TimelockController`, `MerkleProof`, `BitMaps`, `SafeERC20` and their dependencies                      | None. ARL contracts inherit from these; upstream files are not edited |
| forge-std              | `contracts/lib/forge-std`              | v1.16.2 | `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` | MIT or Apache-2.0 | Test helpers (tests only)                                                                                                         | None                                                                  |
| solidity-datetime      | `contracts/lib/solidity-datetime`      | v2.2.0  | `294fc244973cc5f9ec374713affde12c1403927c` | MIT               | Calendar-month arithmetic (`DateTime.addMonths`) in the deployment plan validator and verifier; not part of any deployed contract | None                                                                  |

Upstream `LICENSE` files and copyright headers are preserved inside each
submodule. CI verifies both commits on every run.

Compiled ARL contracts include OpenZeppelin code under the MIT license
(Copyright (c) 2016-2026 Zeppelin Group Ltd).

## Adapted source (ported, with modifications)

| Component                                                        | Source                                                 | Commit                                     | License                                                           | ARL file                                    | ARL modifications                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetix `StakingRewards` (as modified in curvefi/unipool-fork) | `curvefi/unipool-fork`, `contracts/StakingRewards.sol` | `262a5747a32acd3bf7124bc21058d6905f86e22a` | MIT (Copyright (c) 2020 Synthetix; Copyright (c) 2020 Ben Hauser) | `contracts/src/ARLStakingRewards.sol` (MIT) | Solidity 0.8.36 and OpenZeppelin v5; owner, pause and token recovery removed; immutable rewards distributor; separate accounting of funded, accrued, paid and returned rewards so staking and reward token can both be ARL; return of unallocated rewards between periods; `stakeWithPermit` tolerant of front-run permits; reserve-aware `unallocatedRewards`; custom errors |

`ARLStakingRewards.sol` is MIT and reproduces, in its header, the copyright notices of both
sources and the full MIT permission notice. The upstream file's own copy of that notice is cut off
at its last line; the standard MIT text is used. The rest of the repository is Apache-2.0.

## Tools (not distributed)

| Tool            | Version | Commit                                     | License           | Use                                                                |
| --------------- | ------- | ------------------------------------------ | ----------------- | ------------------------------------------------------------------ |
| Foundry (forge) | v1.8.3  | `cae51ad458f6abb64852b7709eb784352429825d` | MIT or Apache-2.0 | Build, test, format                                                |
| solc            | 0.8.36  | —                                          | GPL-3.0           | Compiler; compiled output is not subject to the compiler's license |
| Slither         | 0.11.6  | `050cc0a094e77bfd58e8228ae3bb6aa15c65edb4` | AGPL-3.0          | Static analysis in CI only                                         |
| Halmos          | 0.3.3   | —                                          | AGPL-3.0          | Symbolic checks in CI only                                         |
| Aderyn          | 0.6.8   | —                                          | MIT               | Static analysis for the audit scope (not in CI)                    |
| Mythril         | 0.24.8  | —                                          | MIT               | Symbolic analysis for the audit scope (not in CI)                  |

## npm development dependencies (not distributed)

Exact versions and integrity hashes are recorded in `package-lock.json`.

| Package                         | Version | License    | Purpose                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| typescript                      | 6.0.3   | Apache-2.0 | Type checking                                                                                                                                                                                                                                                                                                |
| @types/node                     | 22.20.4 | MIT        | Node.js type definitions                                                                                                                                                                                                                                                                                     |
| eslint                          | 10.11.0 | MIT        | Linting                                                                                                                                                                                                                                                                                                      |
| @eslint/js                      | 10.0.1  | MIT        | ESLint recommended rules                                                                                                                                                                                                                                                                                     |
| typescript-eslint               | 8.70.1  | MIT        | TypeScript lint rules                                                                                                                                                                                                                                                                                        |
| prettier                        | 3.9.9   | MIT        | Formatting                                                                                                                                                                                                                                                                                                   |
| @safe-global/safe-smart-account | 1.5.0   | LGPL-3.0   | Safe build artifacts deployed on local Anvil by the rehearsal only; no Safe source is copied into ARL (upstream commit `dc437e8fba8b4805d76bcbd1c668c9fd3d1e83be`)                                                                                                                                           |
| @safe-global/safe-deployments   | 1.37.63 | MIT        | Canonical Safe v1.5.0 singleton addresses and code hashes, used by the deployment planner and pinned in `ARLDeployPlan.sol` (a test checks they match); used as published, no source copied. npm integrity `sha512-dH4V3iHH5tZdxx3DBvvBzmnlOZpKMXUx6CBFGUwlARnUa9MEVVyg8Sbpc3DplsaPB5fLh0J97+WB5ylxhLWCRA==` |
| viem                            | 2.56.9  | MIT        | Reads `totalSupply` and manifest balances from the chain for the circulating-supply report (`packages/deploy`); used as published, no source copied                                                                                                                                                          |
| @openzeppelin/merkle-tree       | 1.0.8   | MIT        | Builds and verifies Public Launch claim lists (`StandardMerkleTree`) for `ARLMerkleDistributor` (`packages/deploy`); used as published, no source copied. Its transitive `uuid` is pinned to 11.1.1 by an npm override (GHSA-w5hq-g745-h8pq)                                                                 |

## Website (`apps/web`)

Exact versions and integrity hashes are recorded in `apps/web/package-lock.json`. None of the
website's source is copied from third parties; these packages are used as published.

Runtime (included in the built site):

| Package                | Version | License | Purpose                                                                                                                           |
| ---------------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| next                   | 16.3.6  | MIT     | Framework, routing, static generation                                                                                             |
| react / react-dom      | 19.3.0  | MIT     | UI runtime                                                                                                                        |
| motion                 | 13.4.4  | MIT     | Springs, presence and drag animations                                                                                             |
| @radix-ui/react-dialog | 1.1.23  | MIT     | Accessible dialog (focus trap, Escape, ARIA)                                                                                      |
| geist                  | 1.7.2   | OFL-1.1 | Geist Sans and Geist Mono fonts, self-hosted; Geist SemiBold and Medium glyphs are outlined in the ARL wordmark (`assets/brand/`) |
| @noble/hashes          | 2.4.0   | MIT     | Keccak-256 for the EIP-55 address checksum in the whitelist form                                                                  |

Transitive runtime packages are MIT, ISC, Apache-2.0, BSD-3-Clause or 0BSD, with three
exceptions:

- `caniuse-lite` (CC-BY-4.0): browser-support data used at build time.
- `@img/sharp-libvips-*` and `@img/sharp-wasm32` (LGPL-3.0-or-later components): optional
  native libraries loaded by Next.js's image optimiser. The site does not use `next/image`, and
  they are never shipped to browsers.

Development only (not distributed):

| Package                                     | Version | License    | Purpose                                               |
| ------------------------------------------- | ------- | ---------- | ----------------------------------------------------- |
| typescript                                  | 6.0.3   | Apache-2.0 | Type checking                                         |
| tailwindcss / @tailwindcss/postcss          | 4.3.3   | MIT        | CSS utilities and build                               |
| eslint                                      | 9.39.5  | MIT        | Linting (ESLint 9 is required by the Next.js plugins) |
| eslint-config-next                          | 16.3.6  | MIT        | Next.js, React and a11y lint rules                    |
| @playwright/test                            | 1.63.0  | Apache-2.0 | End-to-end tests                                      |
| @types/node, @types/react, @types/react-dom | —       | MIT        | Type definitions                                      |

The `scroll-morph-hero.tsx` component supplied during design was not used: its source and
license could not be verified. See [`docs/website.md`](docs/website.md).

## App (`apps/dapp`)

The ARL web app is built on Scaffold-ETH 2 (MIT). Exact versions and integrity hashes of its
packages are recorded in `apps/dapp/package-lock.json`.

Adapted source: `scaffold-eth/scaffold-eth-2`, `packages/nextjs`, commit
`6cdf354a4a02aded39c92d5e0d83cd24e4628239`, MIT (Copyright (c) 2023 BuidlGuidl). The upstream
license is kept verbatim in `apps/dapp/LICENSE-scaffold-eth-2`; the adapted files stay under MIT.

| ARL file (under `apps/dapp/`)                                                                                                                                                                                                                                                                                                                                                                 | ARL modifications                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks/scaffold-eth/` (`useCopyToClipboard`, `useDeployedContractInfo`, `useOutsideClick`, `useScaffoldReadContract`, `useScaffoldWriteContract`, `useSelectedNetwork`, `useTargetNetwork`, `useTransactor`), `utils/scaffold-eth/` (`block`, `common`, `contract`, `contractsData`, `getParsedError`, `notification`), `components/scaffold-eth/BlockieAvatar.tsx`, `types/abitype/abi.d.ts` | None (reformatted by the repository's Prettier settings only)                                                                                                      |
| `hooks/scaffold-eth/index.ts`, `utils/scaffold-eth/index.ts`, `services/store/store.ts`                                                                                                                                                                                                                                                                                                       | Only the modules the app uses are exported; type-only imports                                                                                                      |
| `hooks/scaffold-eth/useNetworkColor.ts`, `utils/scaffold-eth/networks.ts`                                                                                                                                                                                                                                                                                                                     | Single theme; hosted RPC (Alchemy) URLs and other chains removed                                                                                                   |
| `components/scaffold-eth/RainbowKitCustomConnectButton/`                                                                                                                                                                                                                                                                                                                                      | No burner-wallet private key reveal, QR code, ENS or block explorer; chain name instead of native balance                                                          |
| `scaffold.config.ts`, `services/web3/wagmiConfig.tsx`, `services/web3/wagmiConnectors.tsx`, `components/Providers.tsx`                                                                                                                                                                                                                                                                        | Local Anvil chain only behind a network gate (`lib/network.ts`: Base Mainnet refused); no Ethereum Mainnet, hosted RPC key, WalletConnect project or burner wallet |

The pages (`app/`), ARL components (`components/arl/`), `lib/`, the local development wallet
(`services/web3/localDevWallet.ts`), scripts and tests are ARL code (Apache-2.0).

Runtime packages (included in the built app), used as published:

| Package                | Version | License | Purpose                              |
| ---------------------- | ------- | ------- | ------------------------------------ |
| next                   | 16.3.6  | MIT     | Framework                            |
| react / react-dom      | 19.3.0  | MIT     | UI runtime                           |
| wagmi                  | 2.19.5  | MIT     | Wallet connection and contract calls |
| viem                   | 2.56.9  | MIT     | Ethereum client                      |
| @rainbow-me/rainbowkit | 2.2.11  | MIT     | Wallet selection                     |
| @tanstack/react-query  | 5.104.0 | MIT     | Data fetching cache (wagmi peer)     |
| react-hot-toast        | 2.6.1   | MIT     | Transaction notifications            |
| zustand                | 5.0.15  | MIT     | Selected network state               |
| usehooks-ts            | 3.1.1   | MIT     | React hooks                          |
| blo                    | 2.0.0   | MIT     | Address avatars                      |
| @heroicons/react       | 2.2.0   | MIT     | Icons                                |

Build and test: daisyui 5.7.46 (MIT; its generated CSS is in the built app), tailwindcss and @tailwindcss/postcss
4.3.3 (MIT), abitype 1.2.4 (MIT), type-fest 5.6.0 (MIT or CC0-1.0), @playwright/test 1.63.0
(Apache-2.0), eslint 9.39.5 and eslint-config-next 16.3.6 (MIT), typescript 6.0.3 (Apache-2.0).
npm overrides pin transitive `ws` 8.22.0, `uuid` 11.1.1 and `decode-uri-component` 0.5.0 to
patched releases (`npm audit` reports no vulnerabilities).

## CI actions

| Action                       | Version | Commit                                     | License           |
| ---------------------------- | ------- | ------------------------------------------ | ----------------- |
| actions/checkout             | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` | MIT               |
| actions/setup-node           | v7.0.0  | `820762786026740c76f36085b0efc47a31fe5020` | MIT               |
| actions/setup-python         | v7.0.0  | `5fda3b95a4ea91299a34e894583c3862153e4b97` | MIT               |
| foundry-rs/foundry-toolchain | v1.9.1  | `908c540300062bd5a7e473851cdb4282204cee09` | MIT or Apache-2.0 |

## Evaluated, not added

See [`docs/open-source.md`](docs/open-source.md). The Safe smart account
(v1.5.0, LGPL-3.0) is used as a deployed instance and is not vendored. The
local rehearsal deploys it from the npm package listed above.
