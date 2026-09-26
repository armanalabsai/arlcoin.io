# Third-Party Licenses and Provenance

The ARL Protocol repository is licensed under the Apache License 2.0 (see
[`LICENSE`](LICENSE)). That license does not replace the licenses of the
third-party components listed here; each keeps its own terms, copyright
notices and attribution requirements.

## Included in this repository

None. No third-party source code is vendored.

## Development dependencies (npm, not distributed)

Installed from the npm registry at exact versions recorded in
`package-lock.json` (with integrity hashes).

| Package           | Version | License    | Purpose                  | ARL modifications |
| ----------------- | ------- | ---------- | ------------------------ | ----------------- |
| typescript        | 5.9.3   | Apache-2.0 | Type checking            | None              |
| @types/node       | 22.20.4 | MIT        | Node.js type definitions | None              |
| eslint            | 10.11.0 | MIT        | Linting                  | None              |
| @eslint/js        | 10.0.1  | MIT        | ESLint recommended rules | None              |
| typescript-eslint | 8.70.1  | MIT        | TypeScript lint rules    | None              |
| prettier          | 3.9.9   | MIT        | Formatting               | None              |

Transitive dependencies are listed in `package-lock.json`.

## CI actions

| Action             | Version | Commit                                     | License |
| ------------------ | ------- | ------------------------------------------ | ------- |
| actions/checkout   | v7.0.1  | `3d3c42e5aac5ba805825da76410c181273ba90b1` | MIT     |
| actions/setup-node | v7.0.0  | `820762786026740c76f36085b0efc47a31fe5020` | MIT     |

## Selected for Phase 1 (not yet added)

See [`docs/open-source.md`](docs/open-source.md). When a component is added,
record here: repository, exact tag and commit, license, location in this
repository, and every ARL modification. Upstream code is never edited in
place; its `LICENSE`, `NOTICE` and copyright headers are kept intact.
