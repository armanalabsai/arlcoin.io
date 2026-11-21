import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/content/seo.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import { JsonLd } from "@/site/JsonLd.tsx";
import { FactList, PageShell } from "@/site/PageShell.tsx";

const title = "Proof · ARL Protocol";
const description =
  "Every working part of ARL Protocol, how it works and where to check it yourself on Base Mainnet, with a 77-second video.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/proof" },
  openGraph: { title, description, url: "/proof", images: [OG_IMAGE] },
};

const link = "text-accent underline underline-offset-4 [overflow-wrap:anywhere]";
const ext = { rel: "noopener noreferrer", target: "_blank" } as const;
const REPO = SITE.repository;
const scan = (address: string) => `https://basescan.org/address/${address}`;

interface Part {
  name: string;
  state: string;
  /** Work under way rather than live. */
  wip?: boolean;
  what: string;
  how: string;
  check: readonly (readonly [label: string, href: string])[];
}

// Each entry is a statement about what runs today; the links are where a reader verifies it.
const PARTS: readonly Part[] = [
  {
    name: "Job escrow",
    state: "Live on Base Mainnet",
    what: "A contract that holds a job's payment in ARL or USDC from funding until the outcome is decided.",
    how: "The buyer opens a job, sets the budget and funds it. The money can leave only two ways: to the seller on approval, or back to the buyer on rejection or expiry.",
    check: [
      ["ARL escrow on BaseScan", scan("0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC")],
      ["USDC escrow on BaseScan", scan("0xE3eA0EAEc3Cf9DA2d0856A0f784A4B1671AeFD04")],
    ],
  },
  {
    name: "Verified evaluator",
    state: "Live, version 7",
    what: "The contract that decides whether a job's work is accepted.",
    how: "The job names a committee and a threshold. Members accept and lock a bond, the seller submits the deliverable, members vote, and a challenge window follows before the verdict is final. A member who breaks the rules can lose its bond.",
    check: [
      ["Evaluator (ARL) on BaseScan", scan("0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28")],
      ["Evaluator (USDC) on BaseScan", scan("0x7A00D45598Da7C13feEA8962fc1110FC4Db4D850")],
    ],
  },
  {
    name: "Validators",
    state: "Staked and running",
    what: "Anyone can stake ARL and be named on a committee. The current validators, their stake and their votes are public.",
    how: "The validator software re-runs the job's check in an isolated container and votes on what it finds, unattended.",
    check: [
      ["Validators in ARLscan", "https://arlcoin.io/app/scan/"],
      ["The same data as JSON", "https://arlcoin.io/api/v1/validators"],
    ],
  },
  {
    name: "Pay on proof",
    state: "Live in the SDK",
    what: "One function that lets a paid HTTP service take payment through escrow instead of up front.",
    how: "The service answers HTTP 402 with its terms, the caller opens and funds a verified job, the service delivers, validators check, the service is paid. A full example runs in one command on a local chain.",
    check: [
      ["Quickstart with the example", `${REPO}/blob/main/docs/quickstart.md`],
      ["Scheme specification", `${REPO}/tree/main/spec/x402-arl-escrow/v0.2.0`],
    ],
  },
  {
    name: "Developer packages",
    state: "Published",
    what: "A TypeScript SDK, a Python package, an MCP server for AI agents and an n8n node.",
    how: "The SDKs wrap the contracts in a few calls. The MCP server lets an agent check tasks, read jobs and prepare unsigned transactions. None of them holds a key.",
    check: [
      ["arl-protocol-sdk on npm", "https://www.npmjs.com/package/arl-protocol-sdk"],
      ["arl-protocol on PyPI", "https://pypi.org/project/arl-protocol/"],
      ["arl-protocol-mcp on npm", "https://www.npmjs.com/package/arl-protocol-mcp"],
      ["n8n-nodes-arl on npm", "https://www.npmjs.com/package/n8n-nodes-arl"],
    ],
  },
  {
    name: "Agent API",
    state: "Live, no key needed",
    what: "A public read API over the protocol: jobs, agents, validators and policies.",
    how: "Plain JSON over HTTP. Every answer names the Base block it was read at, so anyone can re-read it from a node and compare.",
    check: [
      ["Job 1 as the escrow holds it", "https://arlcoin.io/api/v1/jobs/ARL/1"],
      ["API reference", `${REPO}/blob/main/docs/agent-api.md`],
    ],
  },
  {
    name: "Trust records",
    state: "Live",
    what: "What a verified job leaves behind: its audit trail, the agent's score and passport, the trust graph and a portable receipt.",
    how: "All of it is computed from on-chain events only. The receipt uses an Ethereum Attestation Service schema registered on Base, so other platforms can read it without knowing ARL's contracts.",
    check: [
      ["Job 1 audit trail", "https://arlcoin.io/api/v1/jobs/ARL/1/audit"],
      ["Receipt and schema", "https://arlcoin.io/api/v1/jobs/ARL/1/receipt"],
      ["Trust graph", "https://arlcoin.io/api/v1/graph"],
    ],
  },
  {
    name: "ARLscan and the app",
    state: "Live",
    what: "A browser view of every job, agent and validator, and an app for the wallet, trading, vesting, staking and jobs.",
    how: "ARLscan needs no wallet. Open a job and read each step with its transaction.",
    check: [
      ["ARLscan", "https://arlcoin.io/app/scan/"],
      ["The app", "https://arlcoin.io/app/"],
    ],
  },
  {
    name: "ARL token",
    state: `Live since ${SITE.mainnet.deployedOn}`,
    what: "Fixed supply of 21,000,000 ARL. The contract has no owner, no mint function and no upgrade proxy.",
    how: "Validators stake it, jobs can be paid in it and rewards are paid in it. Team and treasury allocations sit in vesting wallets and a timelock.",
    check: [
      ["Token on BaseScan", SITE.mainnet.explorer],
      ["Circulating supply", "https://arlcoin.io/api/supply"],
    ],
  },
  {
    name: "Open standards",
    state: "Published",
    what: "Five open formats that describe a job from start to finish: task, proof, policy, reputation and evidence.",
    how: "Each ships with test vectors in TypeScript and Python, so two independent implementations can be checked against each other.",
    check: [
      ["Specifications", `${REPO}/tree/main/spec`],
      ["Source code", REPO],
    ],
  },
  {
    name: "First paid services",
    state: "Under way",
    wip: true,
    what: "Bringing services outside the team onto pay on proof.",
    how: "Sellers of task-shaped work to AI agents are being invited now; the integration is one function.",
    check: [],
  },
];

export default function ProofPage() {
  return (
    <PageShell
      eyebrow="Proof"
      title="Check it yourself."
      lead="ARL holds an AI agent's payment in escrow on Base, has staked validators check the work, and only then pays the seller. This page lists every part that works today, how it works, and where you can verify it without asking us."
      wide
    >
      <JsonLd data={breadcrumbJsonLd([["Proof", "/proof"]])} />

      <section className="glass flex flex-col gap-4 rounded-[22px] p-4 sm:p-6">
        <h2 className="text-[15px] font-extrabold">ARL in 77 seconds</h2>
        <video
          controls
          preload="none"
          poster="/arl-protocol-78s.jpg"
          className="aspect-video w-full rounded-[14px] bg-black"
        >
          <source src="/arl-protocol-78s.mp4" type="video/mp4" />
        </video>
        <p className="text-[14px] leading-[1.6] text-fg-muted">
          The terminal scene is the real output of the pay-on-proof example on a local test chain.
          The audit trail and the transaction are job 1 on Base Mainnet.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[24px] font-bold">Every part, how it works, where to check it</h2>
        <ul className="flex flex-col gap-4">
          {PARTS.map((p) => (
            <li key={p.name} className="glass flex flex-col gap-3 rounded-[22px] p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-[18px] font-extrabold">{p.name}</h3>
                <span
                  className={`font-mono text-[11px] tracking-[0.08em] uppercase ${p.wip ? "text-accent" : "text-[#7ee0a6]"}`}
                >
                  {p.state}
                </span>
              </div>
              <p className="text-[15px] leading-[1.6]">{p.what}</p>
              <p className="text-[14px] leading-[1.6] text-fg-muted">{p.how}</p>
              {p.check.length > 0 && (
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
                  {p.check.map(([label, href]) => (
                    <li key={href}>
                      <a href={href} {...ext} className={link}>
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <FactList
        title="What is proven"
        items={[
          "The full flow runs on Base Mainnet: job 1 was opened, funded, accepted by three validators, delivered and voted on, and every step has a public transaction.",
          "The contracts are source-verified and the whole stack is open source.",
          "Developers can install the SDKs today from npm and PyPI.",
        ]}
      />

      <FactList
        title="Talk to us"
        items={[
          <>
            Email:{" "}
            <a href={`mailto:${SITE.email}`} className={link}>
              {SITE.email}
            </a>
          </>,
          "This page describes software and is not an offer of any investment.",
        ]}
      />
    </PageShell>
  );
}
