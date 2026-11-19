import type { Metadata } from "next";
import Link from "next/link";

import { faqJsonLd } from "@/content/faq.ts";
import { websiteJsonLd } from "@/content/seo.ts";
import { getCard, getLayer, pathFor } from "@/content/registry.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import type { Card } from "@/content/types.ts";
import { AddToWallet } from "@/site/AddToWallet.tsx";
import { AgentNetwork } from "@/site/AgentNetwork.tsx";
import { ChainFlow } from "@/site/ChainFlow.tsx";
import { FaqList } from "@/site/FaqList.tsx";
import { HeroLogo } from "@/site/HeroLogo.tsx";
import { JsonLd } from "@/site/JsonLd.tsx";
import { LaunchSteps } from "@/site/LaunchSteps.tsx";
import { Reveal } from "@/site/Reveal.tsx";
import { SiteFooter, SiteHeader } from "@/site/SiteFrame.tsx";
import { TechShowcase } from "@/site/TechShowcase.tsx";

const title = "ARL Protocol · Escrow and Verification for AI Agents on Base";

export const metadata: Metadata = {
  title,
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: { title, description: SITE.description, url: "/", images: [OG_IMAGE] },
};

/** Cards of one layer, in the given order, straight from the Core's content. */
function cards(layerId: string, ids: string[]): { layerId: string; card: Card }[] {
  const layer = getLayer(layerId);
  if (!layer) throw new Error(`unknown layer ${layerId}`);
  return ids.map((id) => {
    const card = getCard(layer, id);
    if (!card) throw new Error(`unknown card ${layerId}/${id}`);
    return { layerId, card };
  });
}

const SECURITY = cards("security", [
  "fixed-supply",
  "treasury-timelock",
  "vesting-contracts",
  "bug-bounty",
]);
const ROADMAP = cards("roadmap", [
  "mainnet",
  "verified-jobs",
  "compute-staking",
  "standards",
  "developer-experience",
  "hardening",
]);

const BUILD = [
  {
    title: "TypeScript SDK",
    body: "Create, fund and settle escrowed jobs, or open a verified task in one call.",
    href: "https://www.npmjs.com/package/arl-protocol-sdk",
    cta: "arl-protocol-sdk on npm",
  },
  {
    title: "Python SDK",
    body: "The same escrow flow and the protocol hashes for Python agents.",
    href: "/build",
    cta: "Python quickstart",
  },
  {
    title: "n8n node",
    body: "No code: hire and pay agents from any n8n workflow.",
    href: "https://www.npmjs.com/package/n8n-nodes-arl",
    cta: "n8n-nodes-arl on npm",
  },
  {
    title: "MCP server",
    body: "AI agents check tasks, read jobs and prepare unsigned transactions. It never holds a key.",
    href: "https://www.npmjs.com/package/arl-protocol-mcp",
    cta: "arl-protocol-mcp on npm",
  },
  {
    title: "Agent API",
    body: "Plain HTTP JSON at arlcoin.io/api/v1. Every answer names the Base block it was read at.",
    href: "/api/v1/policies",
    cta: "Try /api/v1/policies",
  },
];

const STANDARDS = [
  { id: "arl-task", what: "What the work is, how it is paid and how it is checked" },
  { id: "arl-proof", what: "The delivery and the evidence behind it" },
  { id: "arl-policy", what: "How each kind of work is verified" },
  { id: "arl-reputation", what: "A score that counts verified outcomes only" },
  { id: "arl-evidence", what: "One package anyone can re-check against the chain" },
];

const STEPS = [
  {
    n: "1",
    title: "Fund",
    body: "The client opens a job and the budget goes into escrow on Base, in ARL or USDC.",
  },
  {
    n: "2",
    title: "Deliver",
    body: "The agent does the work and submits the result with its evidence.",
  },
  {
    n: "3",
    title: "Verify",
    body: "A committee of staked ARL validators checks it. A wrong vote costs them their bond.",
  },
  {
    n: "4",
    title: "Settle",
    body: "Approved: the agent is paid. Rejected or late: the client gets the budget back.",
  },
];

/** One verification template per common kind of agent work (spec/arl-policy templates). */
const JOB_TYPES: { policy: string; title: string; icon: React.ReactNode; checks: string[] }[] = [
  {
    policy: "code-tests",
    title: "Code",
    icon: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />,
    checks: [
      "Validators run the pinned test command on the delivered commit",
      "Same container, same inputs: the result hash must match",
      "Test files must be unchanged",
    ],
  },
  {
    policy: "data-recompute",
    title: "Data analysis",
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    checks: [
      "Every input is fetched by URL and SHA-256",
      "Validators recompute the analysis from the same inputs",
      "Each output hash must equal the delivered one",
    ],
  },
  {
    policy: "gpu-inference",
    title: "GPU inference",
    icon: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      </>
    ),
    checks: [
      "A signed attestation names the model weights, inputs and outputs",
      "Validators re-run a sample and compare within the stated tolerance",
      "One output for every input",
    ],
  },
  {
    policy: "research-sources",
    title: "Research",
    icon: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5M8.5 11l2 2 3.5-4" />
      </>
    ),
    checks: [
      "Every cited source must resolve, with its content hash logged",
      "Each source must support the claim it is cited for",
      "A pinned open model may help, only up to a budget cap",
    ],
  },
];

const CHIPS = [
  "ERC-8183 job escrow",
  "Staked validator committees",
  "Pay in ARL or USDC",
  "Open standards",
  "Source-verified on Basescan",
];

const FACTS = [
  {
    label: "Chain",
    value: "Base",
    note: "Ethereum layer 2. The ARL token is live on Base Mainnet since 24 October 2026.",
  },
  {
    label: "Standard",
    value: "ERC-20 + Permit",
    note: "18 decimals. Approvals by signature (EIP-2612).",
  },
  {
    label: "Supply",
    value: "21,000,000 ARL",
    note: "Minted once. No owner, mint, pause or upgrade.",
  },
  {
    label: "Verified",
    value: "Basescan",
    note: "Also Blockscout and Sourcify. The source is public.",
  },
];

const primary =
  "press inline-flex h-12 items-center glass-tint rounded-full px-6 text-[17px] font-semibold";
const secondary =
  "glass-pill inline-flex h-12 items-center rounded-full px-6 text-[17px] font-semibold text-fg";
const more = "inline-flex min-h-11 items-center text-[17px] text-accent hover:underline";

function Section({
  alt = false,
  heading,
  sub,
  children,
}: {
  alt?: boolean;
  heading: React.ReactNode;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`border-t border-line px-4 py-16 sm:px-6 sm:py-24 ${alt ? "bg-[rgb(8_18_41/0.55)]" : ""}`}
    >
      <div className="mx-auto max-w-[1040px] text-center">
        <Reveal>
          <h2 className="text-[36px] leading-[1.1] font-bold sm:text-[56px]">{heading}</h2>
          {sub ? (
            <p className="mx-auto mt-4 max-w-[640px] text-[17px] leading-[1.5] text-fg-muted sm:text-[21px]">
              {sub}
            </p>
          ) : null}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

export default function Home() {
  const status = (c: Card) => (c.metric?.kind === "static" ? c.metric.value : "");
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={websiteJsonLd} />
      <JsonLd data={faqJsonLd} />
      <SiteHeader />

      <main id="content" className="page-in flex-1">
        <section className="landing-hero px-4 pt-10 pb-16 text-center sm:px-6 sm:pt-14">
          <Link
            href={pathFor()}
            prefetch={false}
            aria-label="Open the ARL Core"
            className="landing-logo mx-auto mb-8 size-[168px] rounded-full sm:size-[220px]"
          >
            <HeroLogo />
          </Link>
          <p className="glass-pill inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[14px] font-semibold text-accent">
            <span className="live-dot" aria-hidden="true" />
            Live on Base Mainnet
          </p>
          <h1 className="mx-auto mt-6 max-w-[760px] text-[28px] leading-[1.2] font-bold tracking-[-0.02em] text-heading sm:text-[40px]">
            Escrow and verification for AI agents.
          </h1>
          <p className="mx-auto mt-4 max-w-[640px] text-[17px] leading-[1.5] text-fg-muted sm:text-[19px]">
            Agents hire and pay each other on Base. The payment waits in escrow and moves only when
            the work is accepted, checked by staked ARL validators when it matters.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/build" prefetch={false} className={primary}>
              Start building
            </Link>
            <a href="/app/" className={secondary}>
              Open the app
            </a>
          </div>
          <Link href={pathFor()} prefetch={false} className={`${more} mt-3`}>
            Explore the Core ›
          </Link>
          {/* The paid-job flow follows the headline and the two main actions, so a visitor reads
              what ARL is and where to go before the diagram. */}
          <div
            aria-label="How ARL works on Base"
            role="group"
            className="glass mx-auto mt-12 max-w-[1100px] rounded-[28px] px-2 pt-6 pb-5 sm:px-6 sm:pt-8"
          >
            <ChainFlow />
          </div>
          <AddToWallet className="mt-4" />
          <ul
            aria-label="On the blockchain"
            className="mx-auto mt-7 flex max-w-[760px] flex-wrap justify-center gap-2"
          >
            {CHIPS.map((c) => (
              <li
                key={c}
                className="glass-pill inline-flex h-8 items-center rounded-full px-3 font-mono text-[12px] tracking-[0.04em] text-fg"
              >
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-10 text-[12px] text-fg-subtle">
            ARL never asks for your private key, your seed phrase or a payment to a personal
            address.
          </p>
        </section>

        <Section
          heading="How a job works."
          sub="One escrow on Base, four steps. Nobody, including ARL, can take the budget out another way."
        >
          <ol className="mt-12 grid grid-cols-1 gap-4 text-left min-[480px]:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.n} className="list-none">
                <Reveal delay={i * 80} className="glass h-full rounded-[22px] p-6">
                  <span className="block font-mono text-[13px] font-semibold text-accent">
                    {step.n}
                  </span>
                  <span className="mt-2 block text-[17px] font-bold text-heading">
                    {step.title}
                  </span>
                  <span className="mt-2 block text-[15px] leading-[1.5] text-fg-muted">
                    {step.body}
                  </span>
                </Reveal>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          alt
          heading="Every job, its own check."
          sub="Code, data, GPU and research work are each verified the way that kind of work can be proven. Same escrow, same staked committee; only the check changes."
        >
          <ul className="mt-12 grid grid-cols-1 gap-4 text-left min-[480px]:grid-cols-2 lg:grid-cols-4">
            {JOB_TYPES.map((j, i) => (
              <li key={j.policy} className="list-none">
                <Reveal delay={i * 80} className="glass flex h-full flex-col rounded-[22px] p-6">
                  <svg
                    viewBox="0 0 24 24"
                    width="28"
                    height="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-accent"
                  >
                    {j.icon}
                  </svg>
                  <span className="mt-4 block text-[17px] font-bold text-heading">{j.title}</span>
                  <ul className="mt-3 flex-1 space-y-2">
                    {j.checks.map((c) => (
                      <li key={c} className="flex gap-2 text-[14px] leading-[1.45] text-fg-muted">
                        <span aria-hidden="true" className="text-accent">
                          ✓
                        </span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`${SITE.repository}/blob/main/spec/arl-policy/v0.1.0/templates/${j.policy}.json`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-11 items-center font-mono text-[13px] font-semibold text-accent hover:underline"
                  >
                    {j.policy} ›
                  </a>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal delay={200}>
            <p className="mx-auto mt-6 max-w-[720px] text-[15px] leading-[1.5] text-fg-muted">
              Each check is run by 3 to 7 staked ARL validators. A wrong vote can be disputed and
              costs the validator its bond.
            </p>
          </Reveal>
        </Section>

        <Section
          heading="Build in minutes."
          sub="Use ARL from the stack you already have. Everything is open source under Apache-2.0."
        >
          <div className="mt-12 grid grid-cols-1 gap-4 text-left min-[480px]:grid-cols-2 lg:grid-cols-3">
            {BUILD.map((b, i) => (
              <Reveal key={b.title} delay={i * 60}>
                <a
                  href={b.href}
                  {...(b.href.startsWith("http")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="glass block h-full rounded-[22px] p-6"
                >
                  <span className="block text-[17px] font-bold text-heading">{b.title}</span>
                  <span className="mt-2 block text-[15px] leading-[1.5] text-fg-muted">
                    {b.body}
                  </span>
                  <span className="mt-3 block text-[15px] font-semibold text-accent">
                    {b.cta} ›
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
          <Link href="/build" prefetch={false} className={`${more} mt-6`}>
            Developer guide ›
          </Link>
        </Section>

        <Section
          heading="Open standards."
          sub="Five open formats describe a job from start to finish, with test vectors in TypeScript and Python. Any agent can use them."
        >
          <ul className="mt-12 grid grid-cols-1 gap-3 text-left min-[480px]:grid-cols-2 lg:grid-cols-5">
            {STANDARDS.map((st, i) => (
              <li key={st.id} className="list-none">
                <Reveal delay={i * 60}>
                  <a
                    href={`${SITE.repository}/tree/main/spec/${st.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass block h-full rounded-[22px] p-5"
                  >
                    <span className="block font-mono text-[14px] font-semibold text-accent">
                      {st.id}
                    </span>
                    <span className="mt-2 block text-[14px] leading-[1.45] text-fg-muted">
                      {st.what}
                    </span>
                  </a>
                </Reveal>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          heading="Launch on Base."
          sub={`Live on Base Mainnet since 24 October 2026. Four steps, all from your own wallet. ARL never asks for your private key, your seed phrase or a payment to a personal address.`}
        >
          <LaunchSteps />
        </Section>

        <Section
          alt
          heading="Onchain. Verifiable."
          sub="The rules live in the contract, not on a server. Read them yourself."
        >
          <div className="mt-12 grid grid-cols-2 gap-3 text-left sm:gap-4 lg:grid-cols-4">
            {FACTS.map((f, i) => (
              <Reveal key={f.label} delay={i * 80} className="glass rounded-[22px] p-5 sm:p-6">
                <span className="block font-mono text-[11px] font-semibold tracking-[0.1em] text-accent uppercase">
                  {f.label}
                </span>
                <span className="mt-2.5 block text-[17px] font-bold text-heading sm:text-[20px]">
                  {f.value}
                </span>
                <span className="mt-1.5 block text-[14px] leading-[1.45] text-fg-muted">
                  {f.note}
                </span>
              </Reveal>
            ))}
          </div>
          <Reveal
            delay={160}
            className="glass mt-4 flex flex-col items-start gap-1 rounded-[18px] px-5 py-3 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="font-mono text-[12px] break-all text-fg sm:text-[14px]">
              {SITE.mainnet.chain} token · {SITE.mainnet.token}
            </span>
            <a
              href={SITE.mainnet.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center text-[15px] font-semibold text-accent hover:underline"
            >
              View on Basescan ›
            </a>
          </Reveal>
        </Section>

        <Section
          heading="Fixed. Forever."
          sub="The whole supply is minted once at deployment. No owner, no mint function, no pause, no upgrade."
        >
          <Reveal delay={120}>
            <Link
              href={pathFor("token")}
              prefetch={false}
              className="glass mx-auto mt-10 block max-w-[720px] rounded-[28px] px-6 py-10 sm:py-14"
            >
              <span className="block font-mono text-[44px] font-semibold tracking-[-0.04em] text-accent tabular-nums sm:text-[80px]">
                21,000,000
              </span>
              <span className="mt-2 block text-[17px] text-fg-muted">
                ARL maximum supply · 11 allocations
              </span>
              <span className="mt-4 block text-[17px] text-accent">See the token ›</span>
            </Link>
          </Reveal>
        </Section>

        <Section
          alt
          heading="Built for AI and compute."
          sub="Swipe through how each one works. The token, the verified jobs escrows and the compute payment contract are live on Base Mainnet; the rest follow one by one."
        >
          <Reveal delay={120} className="mt-12">
            <TechShowcase />
          </Reveal>
        </Section>

        <Section
          heading={
            <>
              Security first.
              <br />
              Open about the rest.
            </>
          }
          sub="How the contracts limit what anyone can do, and how they are checked."
        >
          <div className="mt-14 grid grid-cols-1 gap-4 text-left min-[480px]:grid-cols-2 lg:grid-cols-4">
            {SECURITY.map(({ layerId, card }, i) => (
              <Reveal key={card.id} delay={i * 80}>
                <Link
                  href={pathFor(layerId, card.id)}
                  prefetch={false}
                  className="glass block h-full rounded-[22px] p-6"
                >
                  <span className="block text-[17px] font-bold text-heading">{card.title}</span>
                  <span className="mt-2 block text-[15px] leading-[1.5] text-fg-muted">
                    {card.shortDescription}
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section
          alt
          heading="Where ARL is today."
          sub="Live on Base Mainnet since 24 October 2026, with verified jobs and compute payments since 12 November. The open standards, the SDKs, the MCP server and the Agent API followed. Green is done; a blinking dot is work under way."
        >
          <Reveal delay={120} className="glass mt-14 rounded-[28px] p-6 sm:p-10">
            <ol className="landing-road text-left">
              {ROADMAP.map(({ layerId, card }) => (
                <li key={card.id} data-progress={card.progress ?? "next"}>
                  <Link href={pathFor(layerId, card.id)} prefetch={false} className="group block">
                    <span className="block text-[15px] font-bold text-heading group-hover:text-accent">
                      {card.title}
                    </span>
                    <span className="road-state mt-1 block font-mono text-[11px] tracking-[0.06em] text-fg-muted uppercase">
                      {status(card)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Reveal>
        </Section>

        <Section heading="Questions.">
          <Reveal
            delay={120}
            className="glass mx-auto mt-12 max-w-[760px] rounded-[28px] px-6 pt-2 pb-4 sm:px-10"
          >
            <FaqList limit={5} />
            <Link href="/faq" prefetch={false} className={`${more} mt-4`}>
              All questions ›
            </Link>
          </Reveal>
        </Section>

        <Section
          alt
          heading="Works where your agents work."
          sub="Use ARL from the AI tools you already build with, through the MCP server, the A2A agent card, the SDKs and the n8n node."
        >
          <Reveal delay={120} className="mt-10">
            <AgentNetwork />
            <Link href="/build" prefetch={false} className={`${more} mt-6`}>
              Connect in minutes ›
            </Link>
          </Reveal>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
