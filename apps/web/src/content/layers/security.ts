import { repoDoc } from "../site.ts";
import type { Layer } from "../types.ts";

export const security: Layer = {
  id: "security",
  title: "Security",
  description: "How the contracts limit what anyone can do, and what has not been reviewed yet.",
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
      shortDescription: "Internal review complete",
      status: "IN DEVELOPMENT",
      weight: "primary",
      detail: {
        summary:
          "The internal review of the contracts and deployment process is complete: unit, fuzz and invariant tests, Slither, Aderyn, Mythril and Halmos symbolic checks, and a deployment rehearsal on a Base Sepolia fork. Every finding and its triage is public in the repository. An independent external audit has not been performed.",
      },
      links: [{ label: "Security analysis", href: repoDoc("docs/security-analysis.md") }],
    },
    {
      id: "audit",
      title: "External Audit",
      shortDescription: "Not performed",
      status: "PLANNED",
      weight: "secondary",
      metric: { kind: "static", value: "None" },
      detail: {
        summary:
          "No external audit has been performed. Any claim that ARL has been audited is false until an audit report is published in the repository.",
      },
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
      shortDescription: "Audited libraries, pinned",
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
