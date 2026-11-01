import { docPath } from "./docs.ts";
import { SITE } from "./site.ts";

// Landing pages for the search terms in docs/seo-strategy.md (section 10). Every statement here
// is backed by code, a test or a document in the repository and agrees with the Core, the FAQ
// and the README. Status lines say where each part runs today.

export interface SolutionLink {
  readonly label: string;
  readonly href: string;
  /** Outside arlcoin.io (GitHub, Basescan). */
  readonly external?: boolean;
}

export interface SolutionSection {
  readonly heading: string;
  readonly body?: string;
  readonly items?: readonly string[];
}

export interface Solution {
  readonly slug: string;
  /** The search term the page is written for. */
  readonly keyword: string;
  /** Short label for the footer. */
  readonly short: string;
  /** Document title, at most 60 characters. */
  readonly title: string;
  /** Meta description, at most 155 characters. */
  readonly description: string;
  readonly eyebrow: string;
  readonly heading: string;
  readonly lead: string;
  readonly sections: readonly SolutionSection[];
  readonly steps: readonly string[];
  readonly status: readonly string[];
  readonly faq: readonly { readonly question: string; readonly answer: string }[];
  readonly links: readonly SolutionLink[];
  /** The ARL app page the main button opens. */
  readonly appPath: `/app/${string}`;
  readonly appLabel: string;
}

const repo = (path: string): SolutionLink["href"] => `${SITE.repository}/blob/main/${path}`;

const DOC = {
  payments: { label: "Payments design (x402 upto)", href: docPath("payments") },
  architecture: { label: "Architecture", href: docPath("architecture") },
  app: { label: "ARL app guide", href: docPath("app") },
  audit: { label: "Security audit report", href: docPath("security-audit") },
  provider: {
    label: "Compute provider reference",
    href: repo("docs/compute-provider.md"),
    external: true,
  },
  streaming: {
    label: "Per-second streaming contract",
    href: repo("docs/compute-streaming.md"),
    external: true,
  },
  jobs: { label: "Jobs escrow (ERC-8183)", href: repo("docs/jobs.md"), external: true },
  verified: {
    label: "Verified execution",
    href: repo("docs/verifiable-execution.md"),
    external: true,
  },
  quickstart: { label: "SDK quickstart", href: repo("docs/quickstart.md"), external: true },
} as const satisfies Record<string, SolutionLink>;

export const SOLUTIONS: readonly Solution[] = [
  {
    slug: "per-second-gpu-billing",
    short: "GPU billing",
    keyword: "per-second GPU billing",
    title: "Per-Second GPU Billing on Base · ARL Protocol",
    description:
      "Per-second GPU billing in ARL on Base: the client signs a ceiling, you settle the seconds used, never more. Open-source provider node and contracts.",
    eyebrow: "For GPU providers",
    heading: "Per-second GPU billing",
    lead: "Charge for GPU time by the second, not by the hour. The client signs a spending ceiling for the longest run; your node settles the seconds the job actually used, in ARL on Base.",
    sections: [
      {
        heading: "Why per second",
        body: "Inference calls, fine-tuning steps and batch jobs rarely fill a whole hour. Billing by the second lets a provider price a GPU honestly for short work and lets a client pay only for the time the job ran. Every settlement is an ERC-20 transfer on Base that anyone can check on Basescan.",
      },
      {
        heading: "What a provider gets",
        items: [
          "A listing on the open ERC-8004 registry in the ARL app: GPU model and count, GPU memory, vCPUs, memory, the longest job and a price per GPU or CPU second.",
          "Payment before work: the client's signed ceiling is verified by the facilitator before the job starts.",
          "Exact metering: any part of a second is billed as a whole second, and the amount settled is price × seconds, never above the ceiling.",
          "Open-source reference node (@arl/provider): runs only the jobs you define, for the paid time, in a process with an empty environment so your keys never reach the job.",
          "Longer work through the jobs escrow (ERC-8183) with a deadline and refunds, or a per-second payment stream (ComputePayment) that escrows rate × duration and settles at stop.",
        ],
      },
    ],
    steps: [
      "List your GPU capacity and price per second in the ARL app.",
      "A client requests a run; your node answers HTTP 402 with the ceiling: price per second × the longest run.",
      "The client's wallet signs the ceiling (x402 upto, Permit2) and sends the request again.",
      "Your node verifies the authorization, runs the job and stops it when the paid time ends.",
      "The facilitator settles the seconds used in ARL; the answer carries the receipt and the output.",
    ],
    status: [
      "Provider listing and per-second payments run on the Base Sepolia testnet in the ARL app.",
      "The ARL token is live on Base Mainnet; the jobs escrow is live on Base Mainnet, paid in ARL or USDC.",
      "The per-second streaming contract is tested on a local chain with 100% coverage and is in development.",
    ],
    faq: [
      {
        question: "How is a partial second billed?",
        answer:
          "As a whole second. The amount settled is the price per second times the billed seconds and can never exceed the ceiling the client signed.",
      },
      {
        question: "What if a job fails?",
        answer:
          "A job that exits with an error is billed for the time it used, a job that could not start is billed nothing, and if settlement fails the output is withheld.",
      },
      {
        question: "Can I run my own containers and GPUs?",
        answer:
          "Yes. Each job is a command you define, for example docker run with --gpus all and --network none, so GPU assignment and isolation stay under your control.",
      },
    ],
    links: [DOC.provider, DOC.payments, DOC.streaming, DOC.app],
    appPath: "/app/network/",
    appLabel: "List GPU capacity",
  },
  {
    slug: "ai-agent-payment-infrastructure",
    short: "Agent payments",
    keyword: "AI agent payment infrastructure",
    title: "AI Agent Payment Infrastructure · ARL Protocol",
    description:
      "AI agent payment infrastructure on Base: x402 usage-based payments, escrowed jobs (ERC-8183), identity and ratings (ERC-8004) and an open-source SDK.",
    eyebrow: "For AI agent developers",
    heading: "Payment infrastructure for AI agents",
    lead: "Agents need to pay services they have never met, without accounts, card numbers or a human in the loop. ARL gives an agent a wallet-signed spending limit, escrow for larger jobs and on-chain ratings of who delivered.",
    sections: [
      {
        heading: "Three building blocks",
        items: [
          "Pay per use (x402 upto): the service answers HTTP 402, the agent's wallet signs a ceiling, the service meters the work and a facilitator settles only what was used.",
          "Escrowed jobs (ERC-8183): the agent funds a job with a deadline; the provider is paid when the result is accepted, and the agent is refunded if the deadline passes.",
          "Identity and reputation (ERC-8004): providers register on an open registry, and the ARL app records a rating after each paid job, so an agent can choose by track record.",
        ],
      },
      {
        heading: "Built for software, not checkout pages",
        body: "Every step is an HTTP header or a contract call, so an agent framework can drive it end to end. The signed ceiling caps what any service can take, each authorization settles at most once and expires within minutes, and every payment is a transfer on Base that the agent's owner can audit.",
      },
      {
        heading: "Verified results",
        body: "For work that must be checked, a staked validator committee re-executes the job in a pinned, isolated container and votes, with a challenge window before payout. The SDK exposes this as openVerifiedJob, getVerdict and finalizeJob.",
      },
    ],
    steps: [
      "Install the open-source SDK (@arl/sdk, viem) and give the agent a wallet with a spending budget.",
      "Call a service; on HTTP 402 the agent signs the ceiling and retries with the payment header.",
      "For larger tasks, open an escrowed job with a deadline instead of paying up front.",
      "Read the usage receipt or the validators' verdict, then rate the provider on ERC-8004.",
    ],
    status: [
      "The jobs escrow (ERC-8183) is live on Base Mainnet, paid in ARL or USDC.",
      "Usage-based payments, provider registration and verified jobs run on the Base Sepolia testnet in the ARL app.",
      "Three validators re-execute Base Sepolia jobs every 10 minutes.",
    ],
    faq: [
      {
        question: "Does an agent need an account with each provider?",
        answer:
          "No. The agent signs a payment for each request or funds an escrowed job; the provider is identified by its ERC-8004 registration and its address.",
      },
      {
        question: "How much can a service charge an agent?",
        answer:
          "At most the ceiling the agent signed for that request. The facilitator settles the metered amount and the contract refuses anything above the ceiling.",
      },
      {
        question: "Which standards does ARL use?",
        answer:
          "x402 (upto scheme) with Permit2 for per-use payments, ERC-8183 for escrowed jobs, ERC-8004 for identity and reputation, all on Base.",
      },
    ],
    links: [DOC.quickstart, DOC.payments, DOC.jobs, DOC.verified],
    appPath: "/app/jobs/",
    appLabel: "Try escrowed jobs",
  },
  {
    slug: "on-chain-compute-payments",
    short: "Compute payments",
    keyword: "on-chain compute payments",
    title: "On-Chain Compute Payments on Base · ARL Protocol",
    description:
      "On-chain compute payments in ARL on Base: signed spending ceilings, escrowed jobs with refunds, signed usage receipts and transfers anyone can verify.",
    eyebrow: "For on-chain payments",
    heading: "On-chain compute payments",
    lead: "Compute paid on-chain has no chargebacks, no invoices and no middleman holding the money. ARL settles every payment as a transfer on Base, bounded by a limit the payer signed.",
    sections: [
      {
        heading: "Three ways to pay",
        items: [
          "Per use (x402 upto): the payer signs a ceiling, the provider meters the work and the facilitator settles the amount used, never above the ceiling.",
          "Escrowed jobs (ERC-8183): funds sit in a contract until the work is accepted, with a deadline and a refund path.",
          "Per-second streams (ComputePayment): rate × duration is escrowed, the provider withdraws what it has earned, and the rest returns to the payer at stop.",
        ],
      },
      {
        heading: "What the chain guarantees",
        items: [
          "Payee, facilitator, token, ceiling, nonce and deadline are all covered by the payer's signature.",
          "Each authorization settles at most once and can be revoked by the payer.",
          "A signed usage receipt records the seconds billed, the price, the amount and a hash of the output.",
          "The token has no owner, no mint and no upgrade path, and its source is verified on Basescan.",
        ],
      },
      {
        heading: "The token",
        body: "ARL is a fixed-supply ERC-20 on Base: 21,000,000 ARL minted once, with no mint, no pause and no upgrade path. Escrowed jobs also accept USDC, so a provider can be paid in the asset it prefers.",
      },
    ],
    steps: [
      "Get ARL on Base (or use USDC for escrowed jobs).",
      "Choose a provider in the ARL app and the payment model: per use, escrow or stream.",
      "Sign the ceiling or fund the escrow; nothing moves above that limit.",
      "Check the settlement and the usage receipt on Basescan.",
    ],
    status: [
      "The ARL token and the jobs escrow (paid in ARL or USDC) are live on Base Mainnet.",
      "Per-use payments run on the Base Sepolia testnet in the ARL app.",
      "Every contract is open source under Apache-2.0 and tested at 100% line and function coverage.",
    ],
    faq: [
      {
        question: "Which network does ARL use?",
        answer:
          "Base, an Ethereum layer 2. The official ARL contract is 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4.",
      },
      {
        question: "Can a provider take more than agreed?",
        answer:
          "No. The ceiling is part of the payer's signature, and the settlement contract rejects any amount above it.",
      },
      {
        question: "Where can I verify a payment?",
        answer:
          "Every settlement is an ERC-20 transfer on Base, visible on Basescan with the payer, the provider and the amount.",
      },
    ],
    links: [DOC.payments, DOC.jobs, DOC.streaming, DOC.audit],
    appPath: "/app/payments/",
    appLabel: "Try a payment",
  },
  {
    slug: "pay-per-second-ai-inference",
    short: "AI inference",
    keyword: "pay-per-second AI inference",
    title: "Pay-Per-Second AI Inference · ARL Protocol",
    description:
      "Pay-per-second AI inference: wrap your model as a job, answer HTTP 402, run for the paid time and settle the seconds used in ARL on Base.",
    eyebrow: "For AI inference providers",
    heading: "Pay-per-second AI inference",
    lead: "Price inference by the time it takes, not by a flat subscription. Your model runs as a job, the client signs a ceiling for the longest run, and you settle the seconds used in ARL.",
    sections: [
      {
        heading: "How a model becomes a paid endpoint",
        body: "The reference provider (@arl/provider) turns any command into a paid job, for example a container that loads your model and reads the prompt from standard input. It lists the jobs with their price per second and the longest run, and it never lets a client pass its own command.",
      },
      {
        heading: "Why it fits inference",
        items: [
          "Short requests are billed fairly: a two-second generation costs two seconds.",
          "Payment is authorized before the GPU starts, and settlement happens before the output is released.",
          "A signed usage receipt with a hash of the output lets the client prove what it paid for.",
          "Clients rate the provider on the ERC-8004 registry after each paid job, so good service builds a public record.",
        ],
      },
    ],
    steps: [
      "Define a job that runs your model, for example docker run --gpus all --network none <image>.",
      "Set the price per second and the longest run, and list the service in the ARL app.",
      "Clients call POST /jobs/<name>; your node answers 402 until a signed ceiling arrives.",
      "The model runs for the paid time; the seconds used are settled in ARL and returned with the output.",
    ],
    status: [
      "Per-second settlement over x402 upto runs on the Base Sepolia testnet.",
      "The reference provider software is open source and tested end to end on a Base Sepolia fork.",
      "The ARL token is live on Base Mainnet.",
    ],
    faq: [
      {
        question: "Which models can I serve?",
        answer:
          "Any model you can start from a command. The provider runs your command with the request body as standard input and returns its output.",
      },
      {
        question: "How long can one paid run last?",
        answer:
          "One per-use payment covers a run of up to 9 minutes. Longer work goes through the jobs escrow (ERC-8183) or a per-second stream.",
      },
      {
        question: "Do my API keys reach the model process?",
        answer:
          "No. The job starts without a shell and with an empty environment, so the provider's keys and settings never reach it.",
      },
    ],
    links: [DOC.provider, DOC.payments, DOC.quickstart, DOC.architecture],
    appPath: "/app/network/",
    appLabel: "List an inference service",
  },
  {
    slug: "decentralized-gpu-marketplace",
    short: "GPU marketplace",
    keyword: "decentralized GPU marketplace",
    title: "Decentralized GPU Marketplace on Base · ARL Protocol",
    description:
      "A decentralized GPU marketplace on Base: providers list on ERC-8004, clients pay per second or via escrow in ARL, staked validators check results.",
    eyebrow: "For the GPU ecosystem",
    heading: "A decentralized GPU marketplace",
    lead: "No platform account, no central operator holding the money. Providers list GPU capacity on an open registry, clients pay in ARL by the second or through escrow, and results can be checked by staked validators.",
    sections: [
      {
        heading: "How the market fits together",
        items: [
          "Discovery: providers register on the open ERC-8004 registry with GPU model and count, GPU memory, vCPUs, memory and a price per second.",
          "Payment: per use over x402 upto, per-second streams, or escrowed jobs (ERC-8183) for larger work.",
          "Trust: clients rate providers after paid jobs, and verified jobs are re-executed by a staked validator committee with a challenge window and slashing.",
          "Openness: every contract, the SDK, the provider node and the validator are open source under Apache-2.0.",
        ],
      },
      {
        heading: "Why on Base",
        body: "Base keeps fees low enough for per-second settlement while inheriting Ethereum security. Every listing, payment and rating is public, so anyone can build a dashboard, a scheduler or a client on top of the same data.",
      },
    ],
    steps: [
      "Providers register capacity and prices in the ARL app.",
      "Clients compare listings and ratings on the registry.",
      "A job is paid per second or funded in escrow, in ARL (escrow also accepts USDC).",
      "Validators can re-execute the job; the result and the rating are recorded on-chain.",
    ],
    status: [
      "The ARL token and the jobs escrow (paid in ARL or USDC) are live on Base Mainnet.",
      "The provider registry, per-second payments and verified jobs run on the Base Sepolia testnet in the ARL app.",
      "Early providers are eligible for the Early Users program.",
    ],
    faq: [
      {
        question: "Who runs the marketplace?",
        answer:
          "No single operator. Listings, payments and ratings are contracts on Base, and the software for providers, clients and validators is open source.",
      },
      {
        question: "How are results checked?",
        answer:
          "For verified jobs, staked validators re-execute the job in a pinned, isolated container and vote; a wrong vote can be challenged and slashed.",
      },
      {
        question: "How do I join as a provider?",
        answer:
          "Open the ARL app, connect a wallet on Base Sepolia and register your capacity on the Network page. Questions go to team@arlcoin.io.",
      },
    ],
    links: [DOC.verified, DOC.provider, DOC.jobs, DOC.architecture],
    appPath: "/app/network/",
    appLabel: "Open the network",
  },
];

export const SOLUTION_PATHS = SOLUTIONS.map((s) => `/${s.slug}` as const);

export function solution(slug: string): Solution {
  const found = SOLUTIONS.find((s) => s.slug === slug);
  if (!found) throw new Error(`unknown solution: ${slug}`);
  return found;
}
