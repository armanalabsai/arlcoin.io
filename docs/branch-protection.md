# Repository and Branch Protection

## Current state (verified 2026-09-26)

- `main` is **not protected** (GitHub API: `protected: false`). Direct pushes and force pushes
  are currently possible.
- `.github/CODEOWNERS` assigns every path to `@gokturkalazdaghan-dot`.
- CI runs on every pull request and on pushes to `main`.

No setting has been changed. Every item below is applied by the repository owner under
**Settings**; none of it costs money on a public repository.

## Recommended ruleset for `main`

Create one ruleset under **Settings → Rules → Rulesets → New branch ruleset**, target `main`,
enforcement **Active**, with no bypass actors unless stated.

| Rule                                   | Setting                                                  | Why                                                                                                   |
| -------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Restrict deletions                     | On                                                       | `main` cannot be deleted                                                                              |
| Block force pushes                     | On                                                       | History cannot be rewritten                                                                           |
| Require a pull request before merging  | On                                                       | No direct pushes; every change is reviewable                                                          |
| Required approvals                     | See "Single maintainer" below                            | —                                                                                                     |
| Dismiss stale approvals on new commits | On                                                       | An approval covers the exact code merged                                                              |
| Require review from Code Owners        | See "Single maintainer" below                            | —                                                                                                     |
| Require conversation resolution        | On                                                       | Review threads cannot be ignored                                                                      |
| Require status checks to pass          | `typescript`, `contracts`, `slither`, `rehearsal`, `web` | CI must be green                                                                                      |
| Require branches to be up to date      | On                                                       | Checks run against the code that will land                                                            |
| Require signed commits                 | On                                                       | Commits are attributable (GitHub verifies SSH, GPG and S/MIME signatures and signs web merges itself) |
| Require linear history                 | Optional                                                 | Not required; merge commits are the current convention                                                |

## Single maintainer: the review problem

The repository has one maintainer, who is also the author of most pull requests. GitHub does
not allow an author to approve their own pull request. Therefore:

- **Two-person review does not exist today.** CODEOWNERS names one person, and that person
  cannot approve their own changes.
- Requiring one approval with no bypass would block every merge by the maintainer.
- Requiring one approval with an admin bypass would make the rule ceremonial: every merge would
  use the bypass.

Recommended until a second reviewer exists:

1. Require a pull request and all five status checks, with **no bypass actors**.
2. Set required approvals to **0** and leave Code Owner review **off**, so every enforced rule is
   real rather than routinely bypassed.
3. Before any mainnet deployment, add at least one independent reviewer with write access, then
   set required approvals to **1** and turn Code Owner review **on**.

This gap is recorded here so it is not mistaken for two-person control.

## Repository security settings

| Setting                                          | Location                                  | Recommended                                     |
| ------------------------------------------------ | ----------------------------------------- | ----------------------------------------------- |
| Secret scanning                                  | Settings → Code security                  | On                                              |
| Push protection for secrets                      | Settings → Code security                  | On                                              |
| Private vulnerability reporting                  | Settings → Code security                  | On (`SECURITY.md` links to it)                  |
| Dependabot alerts                                | Settings → Code security                  | On                                              |
| Dependabot security updates                      | Settings → Code security                  | On                                              |
| Default `GITHUB_TOKEN` permissions               | Settings → Actions → General              | Read repository contents only                   |
| Allow Actions to create or approve pull requests | Settings → Actions → General              | Off                                             |
| Approval for workflows from outside contributors | Settings → Actions → General              | Require approval for all outside collaborators  |
| Require actions pinned to a full commit SHA      | Settings → Actions → General (if offered) | On; all workflow actions are already SHA-pinned |

## What CI already enforces

- Workflow permissions are `contents: read`; checkouts do not persist credentials.
- Every action is pinned to a full commit SHA.
- The OpenZeppelin and forge-std submodule commits and the Foundry build commit are verified.
- No job uses secrets.
