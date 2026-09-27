# Third-Party Licenses and Provenance

The ARL Protocol repository is licensed under the Apache License 2.0 (see
[`LICENSE`](LICENSE)). That license does not replace the licenses of the
third-party components listed here; each keeps its own terms, copyright
notices and attribution requirements.

## Vendored source (git submodules, unmodified)

| Component              | Path                                   | Tag     | Commit                                     | License           | Use                                                                   | ARL modifications                                                     |
| ---------------------- | -------------------------------------- | ------- | ------------------------------------------ | ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| OpenZeppelin Contracts | `contracts/lib/openzeppelin-contracts` | v5.6.1  | `5fd1781b1454fd1ef8e722282f86f9293cacf256` | MIT               | `ERC20`, `VestingWallet`, `TimelockController` and their dependencies | None. ARL contracts inherit from these; upstream files are not edited |
| forge-std              | `contracts/lib/forge-std`              | v1.16.2 | `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` | MIT or Apache-2.0 | Test helpers (tests only)                                             | None                                                                  |

Upstream `LICENSE` files and copyright headers are preserved inside each
submodule. CI verifies both commits on every run.

Compiled ARL contracts include OpenZeppelin code under the MIT license
(Copyright (c) 2016-2026 Zeppelin Group Ltd).

## Tools (not distributed)

| Tool            | Version | Commit                                     | License           | Use                                                                |
| --------------- | ------- | ------------------------------------------ | ----------------- | ------------------------------------------------------------------ |
| Foundry (forge) | v1.8.3  | `cae51ad458f6abb64852b7709eb784352429825d` | MIT or Apache-2.0 | Build, test, format                                                |
| solc            | 0.8.36  | —                                          | GPL-3.0           | Compiler; compiled output is not subject to the compiler's license |
| Slither         | 0.11.6  | `050cc0a094e77bfd58e8228ae3bb6aa15c65edb4` | AGPL-3.0          | Static analysis in CI only                                         |

## npm development dependencies (not distributed)

Exact versions and integrity hashes are recorded in `package-lock.json`.

| Package           | Version | License    | Purpose                  |
| ----------------- | ------- | ---------- | ------------------------ |
| typescript        | 5.9.3   | Apache-2.0 | Type checking            |
| @types/node       | 22.20.4 | MIT        | Node.js type definitions |
| eslint            | 10.11.0 | MIT        | Linting                  |
| @eslint/js        | 10.0.1  | MIT        | ESLint recommended rules |
| typescript-eslint | 8.70.1  | MIT        | TypeScript lint rules    |
| prettier          | 3.9.9   | MIT        | Formatting               |

## Website (`apps/web`)

Exact versions and integrity hashes are recorded in `apps/web/package-lock.json`. None of the
website's source is copied from third parties; these packages are used as published.

Runtime (included in the built site):

| Package                | Version | License | Purpose                                      |
| ---------------------- | ------- | ------- | -------------------------------------------- |
| next                   | 16.3.6  | MIT     | Framework, routing, static generation        |
| react / react-dom      | 19.3.0  | MIT     | UI runtime                                   |
| motion                 | 13.4.4  | MIT     | Springs, presence and drag animations        |
| @radix-ui/react-dialog | 1.1.23  | MIT     | Accessible dialog (focus trap, Escape, ARIA) |
| geist                  | 1.7.2   | OFL-1.1 | Geist Sans and Geist Mono fonts, self-hosted |

Transitive runtime packages are MIT, ISC, Apache-2.0, BSD-3-Clause or 0BSD, with three
exceptions:

- `caniuse-lite` (CC-BY-4.0): browser-support data used at build time.
- `@img/sharp-libvips-*` and `@img/sharp-wasm32` (LGPL-3.0-or-later components): optional
  native libraries loaded by Next.js's image optimiser. The site does not use `next/image`, and
  they are never shipped to browsers.

Development only (not distributed):

| Package                                     | Version | License    | Purpose                                               |
| ------------------------------------------- | ------- | ---------- | ----------------------------------------------------- |
| typescript                                  | 5.9.3   | Apache-2.0 | Type checking                                         |
| tailwindcss / @tailwindcss/postcss          | 4.3.3   | MIT        | CSS utilities and build                               |
| eslint                                      | 9.39.5  | MIT        | Linting (ESLint 9 is required by the Next.js plugins) |
| eslint-config-next                          | 16.3.6  | MIT        | Next.js, React and a11y lint rules                    |
| @playwright/test                            | 1.63.0  | Apache-2.0 | End-to-end tests                                      |
| @types/node, @types/react, @types/react-dom | —       | MIT        | Type definitions                                      |

The `scroll-morph-hero.tsx` component supplied during design was not used: its source and
license could not be verified. See [`docs/website.md`](docs/website.md).

## CI actions

| Action                       | Version | Commit                                     | License           |
| ---------------------------- | ------- | ------------------------------------------ | ----------------- |
| actions/checkout             | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` | MIT               |
| actions/setup-node           | v7.0.0  | `820762786026740c76f36085b0efc47a31fe5020` | MIT               |
| actions/setup-python         | v7.0.0  | `5fda3b95a4ea91299a34e894583c3862153e4b97` | MIT               |
| foundry-rs/foundry-toolchain | v1.9.1  | `908c540300062bd5a7e473851cdb4282204cee09` | MIT or Apache-2.0 |

## Evaluated, not added

See [`docs/open-source.md`](docs/open-source.md). The Safe smart account
(v1.5.0, LGPL-3.0) is used as a deployed instance and is not vendored.
