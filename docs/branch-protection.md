# Branch Protection

These settings cannot be applied from the repository; the owner configures
them under **Settings → Rules → Rulesets** for `main`.

| Rule                                   | Setting                   |
| -------------------------------------- | ------------------------- |
| Restrict deletions                     | On                        |
| Block force pushes                     | On                        |
| Require a pull request before merging  | On, 1 approval            |
| Require review from Code Owners        | On (`.github/CODEOWNERS`) |
| Dismiss stale approvals on new commits | On                        |
| Require status checks to pass          | `CI / check`              |
| Require branches to be up to date      | On                        |
| Require conversation resolution        | On                        |
| Require signed commits                 | Recommended               |

Also enable:

- **Private vulnerability reporting** (Settings → Security) — `SECURITY.md`
  links to it.
- **Dependabot alerts and security updates.**
- **Secret scanning and push protection.**

Current state: not configured. Branch protection must be enabled before any
contract code is merged.
