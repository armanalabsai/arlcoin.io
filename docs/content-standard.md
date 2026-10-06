# Content Standard

Applies to all ARL software, website copy, documentation, code comments and
commit messages.

## Language

- English only, written to the standard of an experienced native-speaking
  technology team.
- Precise and restrained. Describe what the software does, not how it feels.
- Avoid inflated wording ("revolutionary", "cutting-edge", "next-generation",
  "seamlessly", "unlock the future" and similar) unless a specific fact
  supports it.

## Factual claims

Never state as fact anything that has not happened. In particular:

- contract addresses, chain, explorer links, circulating supply
- deployments, mainnet or testnet status
- audits, exchange listings, partnerships, users or transaction volume

Use a status label instead: `PLANNED`, `IN DEVELOPMENT`, `LIVE`. `LIVE` requires
verifiable evidence.

## Third-party companies (OpenAI, Anthropic, Google)

ARL has **no partnership** with OpenAI, Anthropic or Google. A "Partnerships"
section may list them only with the actual relationship, for example:

> **OpenAI · Anthropic · Google** — Planned integration. ARL intends to use
> their publicly available model APIs as a customer under each provider's
> standard terms. This is not a partnership, sponsorship or endorsement.

Rules:

- Do not use their logos without written permission.
- Update the wording only when a documented agreement exists, and link to it.
- Do not describe an API integration as a partnership.

## Review checklist

Before merging user-facing text:

1. Grammar, spelling and punctuation checked.
2. Terminology consistent with `docs/tokenomics.md`.
3. No Turkish or mixed-language text.
4. No inflated or generic marketing language.
5. Every factual claim verified; every unverified item carries a status label.
