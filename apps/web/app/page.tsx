import type { Metadata } from "next";
import Link from "next/link";

import { faqJsonLd } from "@/content/faq.ts";
import { getCard, getLayer, pathFor } from "@/content/registry.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import type { Card } from "@/content/types.ts";
import { FaqList } from "@/site/FaqList.tsx";
import { JsonLd } from "@/site/JsonLd.tsx";
import { SiteFooter, SiteHeader } from "@/site/SiteFrame.tsx";

const title = "ARL · The token for AI and compute services";

export const metadata: Metadata = {
  title,
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: { title, description: SITE.description, url: "/", images: [OG_IMAGE] },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  inLanguage: "en",
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

const TECHNOLOGY = cards("technology", ["ai-payments", "compute", "zk-privacy", "arl-network"]);
const SECURITY = cards("security", [
  "fixed-supply",
  "treasury-timelock",
  "vesting-contracts",
  "audit",
]);
const ROADMAP = cards("roadmap", [
  "phase-0",
  "phase-1",
  "phase-2",
  "testnet",
  "mainnet",
  "services",
]);

const primary =
  "inline-flex h-12 items-center rounded-full bg-accent px-6 text-[17px] font-semibold text-page transition-colors hover:bg-accent-strong";
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
      className={`border-t border-line px-4 py-16 sm:px-6 sm:py-24 ${alt ? "bg-[rgb(8_18_41/0.82)]" : ""}`}
    >
      <div className="mx-auto max-w-[1040px] text-center">
        <h2 className="text-[36px] leading-[1.1] font-bold sm:text-[56px]">{heading}</h2>
        {sub ? (
          <p className="mx-auto mt-4 max-w-[640px] text-[17px] leading-[1.5] text-fg-muted sm:text-[21px]">
            {sub}
          </p>
        ) : null}
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

      <main id="content" className="flex-1">
        <section className="landing-hero px-4 pt-16 pb-16 text-center sm:px-6 sm:pt-24">
          <p className="text-[17px] font-semibold text-accent">Native utility token</p>
          <h1 className="mt-2 text-[64px] leading-none font-bold tracking-[-0.04em] sm:text-[96px]">
            ARL
          </h1>
          <p className="mx-auto mt-4 max-w-[720px] text-[22px] leading-[1.3] font-semibold tracking-[-0.02em] text-fg sm:text-[28px]">
            The token planned for decentralized AI and compute services.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Link href="/whitelist" prefetch={false} className={primary}>
              Join the whitelist
            </Link>
            <Link href={pathFor()} prefetch={false} className={more}>
              Explore the Core ›
            </Link>
          </div>
          <Link
            href={pathFor()}
            prefetch={false}
            aria-label="Open the ARL Core"
            className="landing-core mx-auto mt-14 flex size-[240px] flex-col items-center justify-center rounded-full sm:size-[320px]"
          >
            <span className="text-[48px] leading-none font-bold tracking-[-0.04em] text-heading sm:text-[64px]">
              ARL
            </span>
            <span className="mt-2 text-[13px] text-accent">Overview</span>
          </Link>
          <p className="mt-6 text-[12px] text-fg-subtle">
            ARL is not yet deployed. Nothing is for sale. Registering is free.
          </p>
        </section>

        <Section
          alt
          heading="Fixed. Forever."
          sub="The whole supply is minted once at deployment. No owner, no mint function, no pause, no upgrade."
        >
          <p className="mt-8 font-mono text-[44px] font-semibold tracking-[-0.04em] text-accent tabular-nums sm:text-[80px]">
            21,000,000
          </p>
          <p className="mt-2 text-[17px] text-fg-muted">ARL maximum supply · 11 allocations</p>
          <Link href={pathFor("token")} prefetch={false} className={`${more} mt-4`}>
            See the token ›
          </Link>
        </Section>

        <Section
          heading="Built for AI and compute."
          sub="What ARL is for. Nothing is on a public network yet."
        >
          <div className="mt-12 grid gap-4 text-left sm:grid-cols-2">
            {TECHNOLOGY.map(({ layerId, card }) => (
              <Link
                key={card.id}
                href={pathFor(layerId, card.id)}
                prefetch={false}
                className="group flex flex-col justify-between gap-6 rounded-[20px] border border-line bg-surface-2 p-8 transition-colors hover:border-accent-edge sm:min-h-[280px] sm:p-10"
              >
                <div>
                  {card.status ? (
                    <span className="inline-block rounded-[6px] border border-accent-edge px-2 py-1 font-mono text-[11px] tracking-[0.06em] text-accent">
                      {card.status}
                    </span>
                  ) : null}
                  <h3 className="mt-6 text-[28px] leading-[1.15] font-bold sm:text-[32px]">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-[17px] leading-[1.5] text-fg-muted">
                    {card.shortDescription}
                  </p>
                </div>
                <span className="text-[17px] text-accent group-hover:underline">Learn more ›</span>
              </Link>
            ))}
          </div>
        </Section>

        <Section
          alt
          heading={
            <>
              Security first.
              <br />
              Honest about the rest.
            </>
          }
          sub="How the contracts limit what anyone can do, and what has not been reviewed yet."
        >
          <div className="mt-14 grid grid-cols-1 gap-8 text-left min-[480px]:grid-cols-2 lg:grid-cols-4">
            {SECURITY.map(({ layerId, card }) => (
              <Link
                key={card.id}
                href={pathFor(layerId, card.id)}
                prefetch={false}
                className="group block"
              >
                <h3 className="text-[17px] font-bold group-hover:text-accent">{card.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.5] text-fg-muted">
                  {card.shortDescription}
                </p>
              </Link>
            ))}
          </div>
        </Section>

        <Section heading="Where ARL is today." sub="No dates are set for future phases.">
          <ol className="landing-road mt-14 text-left">
            {ROADMAP.map(({ layerId, card }) => (
              <li key={card.id} data-status={status(card)}>
                <Link href={pathFor(layerId, card.id)} prefetch={false} className="group block">
                  <span className="block text-[15px] font-bold text-heading group-hover:text-accent">
                    {card.title}
                  </span>
                  <span className="mt-1 block font-mono text-[11px] tracking-[0.06em] text-fg-muted uppercase">
                    {status(card)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Section>

        <Section alt heading="Questions.">
          <div className="mx-auto mt-12 max-w-[760px]">
            <FaqList limit={5} />
            <Link href="/faq" prefetch={false} className={`${more} mt-6`}>
              All questions ›
            </Link>
          </div>
        </Section>

        <section className="landing-final border-t border-line px-4 py-20 text-center sm:px-6 sm:py-28">
          <h2 className="text-[36px] leading-[1.1] font-bold sm:text-[56px]">
            Be there at launch.
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[17px] leading-[1.5] text-fg-muted sm:text-[21px]">
            Register a wallet address for launch updates. Free, and no payment is ever requested.
          </p>
          <div className="mt-8">
            <Link href="/whitelist" prefetch={false} className={primary}>
              Join the whitelist
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
