# Security Policy

## Status

ARL Protocol is under development. No contract is deployed on any network,
and the code has **not** been audited. Do not use it to hold value.

## Reporting a vulnerability

Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/gokturkalazdaghan-dot/ARLCOIN/security/advisories/new).
Do not open a public issue.

Include the affected file or component, the commit, steps to reproduce and
the impact you expect. We aim to acknowledge reports within 3 business days.

A bug bounty paid in ARL from the Grants / Bug Bounty allocation is proposed
in [docs/bug-bounty.md](docs/bug-bounty.md). It goes live with the public
Base Sepolia test period; until then there is no bounty program.

## Scope

- Code in this repository.
- Out of scope: third-party components (report those upstream), and any
  contract or token that claims to be ARL — none has been deployed.

## Secrets

Never commit private keys, seed phrases, API keys or production credentials.
Signer addresses for production multisigs are configured only when those
multisigs are created.
