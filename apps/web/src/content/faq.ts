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
      "No. ARL is live on the Base Sepolia testnet only, where tokens have no value, and nothing is for sale. No ARL contract exists on Base Mainnet yet, so any token that claims to be ARL on a main network today is not.",
  },
  {
    question: "What is ARL for?",
    answer:
      "ARL is the native utility token planned for decentralized AI and compute services: AI services paid per use, GPU and CPU capacity paid per second, and staking. The token contracts run on the Base Sepolia testnet; nothing is on Base Mainnet yet.",
  },
  {
    question: "What is the maximum supply?",
    answer:
      "21,000,000 ARL. The whole supply is minted once at deployment and split into 11 allocations. The token contract has no owner, no mint function, no pause and no upgrade path.",
  },
  {
    question: "Does registering on the whitelist guarantee an allocation?",
    answer:
      "No. The Public Launch gives away up to 500,000 ARL at the TGE through a free claim open for 60 days, at most 10,000 ARL per address; the exact list is published before the launch. Registration is free and no payment is requested.",
  },
  {
    question: "Has ARL been audited?",
    answer:
      "The internal review is complete: unit, fuzz and invariant tests, Slither with no findings, Halmos symbolic proofs and a reproducible build. No independent external audit has been performed; audit requests were sent to independent firms, and a bug bounty paid in ARL is open for the contracts. Any claim that ARL has been audited is false.",
  },
  {
    question: "Which blockchain will ARL use?",
    answer:
      "Base. ARL is an ERC-20 token on Base: Base Sepolia for the testnet (live) and Base Mainnet for production.",
  },
  {
    question: "When is the launch?",
    answer:
      "The Base Mainnet launch (TGE) is targeted for 1 November 2026. The contracts are deployed and source-verified on the Base Sepolia testnet; Base Mainnet has not started.",
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
