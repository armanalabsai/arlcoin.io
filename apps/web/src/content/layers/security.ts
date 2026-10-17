import { repoDoc } from "../site.ts";
import type { Layer } from "../types.ts";

export const security: Layer = {
  id: "security",
  title: "Security",
  description: "How the contracts limit what anyone can do, and how they are checked.",
  cards: [
    {
      id: "fixed-supply",
      title: "Fixed Supply",
      shortDescription: "No mint, owner, pause or upgrade",
      status: "IN DEVELOPMENT",
      weight: "primary",
      detail: {
        summary:
          "The token contract has no owner, no admin role, no pause and no upgrade path. The full supply is minted in the constructor; no function can mint afterwards. A CI check fails if the token's public interface ever changes.",
        facts: [
          { label: "Mint after deployment", value: "None" },
          { label: "Admin keys", value: "None" },
          { label: "Upgradeable", value: "No" },
        ],
      },
      links: [{ label: "Token design", href: repoDoc("docs/token-design.md") }],
    },
    {
      id: "review-status",
      title: "Security Review",
      shortDescription: "Completed 17 Oct 2026, findings closed",
      status: "IN DEVELOPMENT",
      weight: "primary",
      detail: {
        summary:
          "A comprehensive, multi-layer security review of the ARL contracts, built on open-source tools, was completed on 17 October 2026 at commit ab7595b: Slither and Aderyn static analysis, 271 Foundry tests with 29 fuzz tests at 10,000 runs and 5 invariant suites, Halmos symbolic proofs, Mythril symbolic execution and manual triage. It found no critical issue and no exploitable vulnerability in the contract code. Every finding is closed: fixed in the launch procedure, or accepted with a documented mitigation. The review was carried out by the ARL team with open-source and AI-assisted tooling; it is not a third-party audit. The scope, raw tool outputs, triage and report are public, and a CI workflow reproduces them on every change.",
        facts: [
          { label: "Critical findings", value: "None" },
          { label: "Open findings", value: "None" },
          { label: "Reviewed commit", value: "ab7595b" },
        ],
      },
      links: [
        { label: "Security review report", href: repoDoc("security/2026-10-17/report.md") },
        { label: "Security analysis", href: repoDoc("docs/security-analysis.md") },
      ],
    },
    {
      id: "bug-bounty",
      title: "Bug Bounty",
      shortDescription: "Open, paid in ARL",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      metric: { kind: "static", value: "Up to 40,000 ARL" },
      detail: {
        summary:
          "Anyone who finds a vulnerability in the ARL contracts can report it privately and be rewarded in ARL from the Grants / Bug Bounty allocation: up to 40,000 ARL for a critical finding. The rules and the rewards are public.",
      },
      links: [{ label: "Bug bounty", href: repoDoc("docs/bug-bounty.md") }],
    },
    {
      id: "treasury-timelock",
      title: "Treasury Timelock",
      shortDescription: "48-hour minimum delay",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      detail: {
        summary:
          "Treasury transactions are scheduled by a Safe multisig and can execute only after at least 48 hours. The delay cannot be lowered below 48 hours, and the timelock has no external admin.",
      },
    },
    {
      id: "vesting-contracts",
      title: "Vesting Contracts",
      shortDescription: "Beneficiary fixed at deployment",
      status: "IN DEVELOPMENT",
      weight: "secondary",
      detail: {
        summary:
          "Vesting wallets release tokens only on their schedule. The beneficiary cannot be changed and there is no administrator who can withdraw unvested tokens.",
      },
    },
    {
      id: "testing",
      title: "Testing",
      shortDescription: "Unit, fuzz, invariant, static analysis",
      status: "IN DEVELOPMENT",
      weight: "tertiary",
      detail: {
        summary:
          "Every change runs unit, fuzz and invariant tests, Slither static analysis and a full local deployment rehearsal that must reject misconfigured deployments.",
        facts: [
          { label: "Tests", value: "Foundry unit, fuzz and invariant" },
          { label: "Static analysis", value: "Slither" },
          { label: "Deployment rehearsal", value: "Local chain, in CI" },
        ],
      },
    },
    {
      id: "open-source",
      title: "Open Source Foundation",
      shortDescription: "OpenZeppelin libraries, pinned",
      status: "IN DEVELOPMENT",
      weight: "tertiary",
      detail: {
        summary:
          "Token, vesting and timelock logic comes from OpenZeppelin Contracts v5.6.1, pinned to an exact commit and used without modification. ARL-specific code is kept small and documented.",
      },
      links: [{ label: "Third-party licenses", href: repoDoc("THIRD_PARTY_LICENSES.md") }],
    },
    {
      id: "disclosure",
      title: "Report a Vulnerability",
      shortDescription: "Private disclosure",
      weight: "tertiary",
      detail: {
        summary:
          "Report vulnerabilities privately as described in the security policy. Do not open a public issue for a security problem.",
      },
      links: [{ label: "Security policy", href: repoDoc("SECURITY.md") }],
    },
  ],
};
