# Contributing

## Requirements

- Node.js 22.18 or newer (see `.nvmrc`)
- `npm ci` to install exact dependency versions

## Workflow

1. Branch from `main`. Never push to `main` directly.
2. Keep each pull request to one change; write tests with the change.
3. Run `npm run check` (typecheck, lint, format check, tests) before pushing.
4. Open a pull request. CI must pass and the code owner must approve.

## Standards

- **English only** — code, identifiers, comments, docs, commit messages and
  all user-facing text. See [`docs/content-standard.md`](docs/content-standard.md).
- **Facts only.** Never present a deployment, audit, listing, partnership or
  metric that does not exist.
- **Tokenomics** are defined once, in `packages/tokenomics`. Do not restate
  numbers elsewhere in code.
- **Open source first.** Before writing substantial new code, check for a
  mature implementation and record the evaluation in
  [`docs/open-source.md`](docs/open-source.md).
- **Third-party code** keeps its license, copyright and NOTICE files. Record
  every adopted component in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
- **Dependencies** are pinned to exact versions and justified in the pull
  request.

## Commit messages

Imperative mood, English, for example `Add ecosystem reserve vesting tests`.

## License

By contributing you agree that your contributions are licensed under the
Apache License 2.0.
