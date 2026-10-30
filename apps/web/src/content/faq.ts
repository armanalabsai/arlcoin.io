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
      "ARL is live on Base Mainnet. The only official contract is 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4; it trades in the official Uniswap v3 pools on Base (see How to get ARL). Any other address presented as ARL is not official. Tokens can lose all their value, and nothing here is investment advice.",
  },
  {
    question: "What is ARL for?",
    answer:
      "ARL is the native utility token planned for decentralized AI and compute services: AI services paid per use, GPU and CPU capacity paid per second, and staking. The token, staking, jobs escrow and anonymous-poll contracts and the ARL app run on the Base Sepolia testnet (arlcoin.io/app); nothing is on Base Mainnet yet.",
  },
  {
    question: "What is the maximum supply?",
    answer:
      "21,000,000 ARL. The whole supply is minted once at deployment and split into 11 allocations. The token contract has no owner, no mint function, no pause and no upgrade path.",
  },
  {
    question: "Does registering on the whitelist guarantee an allocation?",
    answer:
      "No. There is no airdrop at the launch. An airdrop of 500,000 ARL is planned for a later date; its date, eligibility and rules will be announced on arlcoin.io, X @arlprotocol and the Telegram community. Registration is free and no payment is requested.",
  },
  {
    question: "Why would an AI developer pay with ARL instead of existing payment methods?",
    answer:
      "Because of what happens to the money, not the token itself. A job paid through ARL sits in an on-chain escrow (ERC-8183) and is released only after a staked validator committee has checked the result, with a challenge window before payout; compute is paid per second and stops when the work stops. There are no chargebacks, no accounts to open with each provider and no intermediary holding the funds. ARL does not replace card payments for everything: it fits paying agents and providers you do not know. Today this runs on the Base Sepolia testnet only.",
  },
  {
    question: "Why would a GPU provider accept ARL for capacity?",
    answer:
      "The client escrows the whole amount before the work starts, and the provider earns it second by second (ComputePayment) or on approval of the job (ARLJobs), so it never works on credit and cannot be charged back. Payment is settled on Base within seconds, with no invoicing or payment processor. A provider decides for itself whether to accept ARL; no provider is paid in ARL on Base Mainnet yet.",
  },
  {
    question: "Will buyers actually use ARL, or only hold it to sell?",
    answer:
      "Both will happen; no token can prevent speculation. ARL has uses that spend it or lock it: paying for AI services and compute, staking, and validator stake on the verified evaluator, where each accepted job locks a bond that is burned if the validator misbehaves. How much ARL is used rather than held depends on real usage, which does not exist on Base Mainnet yet; the app publishes the network's jobs, stake and slashing so this can be checked rather than claimed.",
  },
  {
    question: "What net revenue does the protocol earn per transaction?",
    answer:
      "Today, zero. The jobs escrow, the compute payment stream and the verified evaluator charge no protocol fee: the full amount goes from client to provider, and slashed bonds are burned, not collected. A validator fee paid by the client and shared among the voting validators is a published design for a later phase (docs/verifiable-execution.md); any fee would need new contracts and would be announced before it applies.",
  },
  {
    question: "How do circulating supply and selling pressure change as demand grows?",
    answer:
      "The supply is fixed at 21,000,000 ARL with no minting, so demand cannot be met by issuing new tokens. At TGE the Founder's 2,100,000 ARL is unlocked and may be sold (this is disclosed). The launch pools hold ARL that leaves them only when buyers pay in. Investor, partnership and team allocations unlock after a 12-month cliff over 36 months, and treasury balances are not circulating until spent. Staked ARL stays circulating but is not for sale while staked, and validator bonds are locked while a job runs.",
  },
  {
    question: "Which blockchain will ARL use?",
    answer:
      "Base. ARL is an ERC-20 token on Base Mainnet (chain 8453). The app runs on the Base Sepolia testnet (chain 84532).",
  },
  {
    question: "When is the launch?",
    answer:
      "ARL launched on Base Mainnet on 24 October 2026: the token, the vesting wallets and the treasury timelock are deployed and source-verified on Basescan. The TGE date for every vesting schedule is 23 October 2026.",
  },
  {
    question: "After the launch, can I sell ARL on a DEX?",
    answer:
      "Yes, the token has no transfer tax, blacklist or pause. The launch pools on Uniswap start with ARL only, priced from 0.20 USD: buyers pay USDC, USDT, ETH or BTC into them, and a seller can sell back only as much as buyers have paid in, never below 0.20 USD. Right after the launch a pool may therefore have little to pay sellers until buying starts.",
  },
  {
    question: "Do testnet tokens have any value?",
    answer:
      "No. ARL on the Base Sepolia testnet has no value and cannot be exchanged for anything. The ARL app at arlcoin.io/app hands out testnet ARL from a faucet so the staking, jobs, payments and anonymous polls can be tried for free.",
  },
  {
    question: "Is ARL Protocol the same as other tokens called ARL?",
    answer:
      "No. ARL Protocol (arlcoin.io) is the ERC-20 token on Base described on this site, with a fixed supply of 21,000,000. It is not related to other projects or tokens that also use the ticker ARL on Solana, Ethereum or BNB Chain. Check the contract address on arlcoin.io before you interact with any ARL token.",
  },
  {
    question: "What are the official channels?",
    answer:
      "Only these: the website arlcoin.io, X @arlprotocol, the Telegram group t.me/arlcoin_community and the email address team@arlcoin.io. Any other account claiming to be ARL is not official.",
  },
  {
    question: "How do I delete my whitelist registration?",
    answer:
      "Ask through the contact form or write to team@arlcoin.io from the email address you registered with. The registration is then deleted, as described in the privacy notice.",
  },
  {
    question: "Will ARL ever ask for my private key or seed phrase?",
    answer:
      "Never. ARL will never ask for your private key, your seed phrase or a payment. Anyone who does is attempting theft.",
  },
  {
    question: "How do I contact the team?",
    answer:
      "Use the contact form or write to team@arlcoin.io. Report security vulnerabilities privately by email with “Security” in the subject.",
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
