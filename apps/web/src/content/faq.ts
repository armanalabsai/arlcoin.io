// Frequently asked questions. Every answer restates what the rest of the site already says;
// nothing here adds a fact of its own.

export interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

export const FAQ: readonly FaqEntry[] = [
  {
    question: "Is ARL for sale?",
    answer:
      "No. ARL is not deployed and nothing is for sale. No ARL contract exists on any network yet, so any token that claims to be ARL today is not.",
  },
  {
    question: "What is ARL for?",
    answer:
      "ARL is the native utility token planned for decentralized AI and compute services: AI services paid per use, GPU and CPU capacity paid per second, and staking. None of it is on a public network yet.",
  },
  {
    question: "What is the maximum supply?",
    answer:
      "21,000,000 ARL. The whole supply is minted once at deployment and split into 11 allocations. The token contract has no owner, no mint function, no pause and no upgrade path.",
  },
  {
    question: "Does registering on the whitelist guarantee an allocation?",
    answer:
      "No. Eligibility rules, amounts and the claim window are not decided; they will be published before the launch. Registration is free and no payment is requested.",
  },
  {
    question: "Has ARL been audited?",
    answer:
      "The internal review is complete: unit, fuzz and invariant tests, static analysis and symbolic checks. No external audit has been performed. Any claim that ARL has been audited is false until an audit report is published.",
  },
  {
    question: "Which blockchain will ARL use?",
    answer:
      "ARL is an ERC-20 token built for EVM-compatible chains. The deployment chain has not been selected yet.",
  },
  {
    question: "When is the launch?",
    answer:
      "No dates are set. The token contracts are written and tested; the security review is in progress, and testnet and mainnet have not started.",
  },
  {
    question: "Will ARL ever ask for my private key or seed phrase?",
    answer:
      "Never. ARL will never ask for your private key, your seed phrase or a payment. Anyone who does is attempting theft.",
  },
  {
    question: "How do I contact the team?",
    answer:
      "Use the contact form or write to armanalabsai@gmail.com. Report security vulnerabilities privately by email with “Security” in the subject.",
  },
];

/** schema.org FAQPage markup for search engines. */
export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
};
