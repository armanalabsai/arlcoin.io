# Security Policy

## Status

ARL Protocol is under development. No contract is deployed on any network,
and the code has **not** been audited. Do not use it to hold value.

## Reporting a vulnerability

Report vulnerabilities privately by email to
[team@arlcoin.io](mailto:team@arlcoin.io) with "Security" in the subject.
Do not open a public issue.

Include the affected file or component, the commit, steps to reproduce and
the impact you expect. We aim to acknowledge reports within 3 business days.

A bug bounty will be published separately, funded from the Grants / Bug
Bounty allocation, before any mainnet deployment. Until then there is no
bounty program.

## Scope

- Code in this repository.
- Out of scope: third-party components (report those upstream), and any
  contract or token that claims to be ARL — none has been deployed.

## Secrets

Never commit private keys, seed phrases, API keys or production credentials.
Signer addresses for production multisigs are configured only when those
multisigs are created.
