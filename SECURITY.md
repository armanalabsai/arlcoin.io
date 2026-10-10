# Security Policy

## Status

ARL Protocol is under development. The token, two vesting wallets and the treasury timelock are
deployed on Base Sepolia (testnet) only; the addresses are in [README.md](README.md). Nothing is
deployed on Base Mainnet. The code has **not** been independently audited. Do not use it to hold
value.

## Reporting a vulnerability

Report vulnerabilities privately by email to
[team@arlcoin.io](mailto:team@arlcoin.io) with "Security" in the subject.
Do not open a public issue.

Include the affected file or component, the commit, steps to reproduce and
the impact you expect. We aim to acknowledge reports within 3 business days.

The bug bounty, funded from the Grants / Bug Bounty allocation, is described in
[docs/bug-bounty.md](docs/bug-bounty.md).

## Scope

- Code in this repository.
- The Base Sepolia contracts listed in [README.md](README.md).
- Out of scope: third-party components (report those upstream), and any
  contract or token that claims to be ARL at an address not listed in [README.md](README.md).

## Secrets

Never commit private keys, seed phrases, API keys or production credentials.
Signer addresses for production multisigs are configured only when those
multisigs are created.
