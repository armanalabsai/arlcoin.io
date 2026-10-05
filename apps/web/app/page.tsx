import type { Metadata } from "next";
import Link from "next/link";

import { faqJsonLd } from "@/content/faq.ts";
import { getCard, getLayer, pathFor } from "@/content/registry.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import type { Card } from "@/content/types.ts";
import { FaqList } from "@/site/FaqList.tsx";
import { JsonLd } from "@/site/JsonLd.tsx";
import { Reveal } from "@/site/Reveal.tsx";
import { SiteFooter, SiteHeader } from "@/site/SiteFrame.tsx";
import { TechShowcase } from "@/site/TechShowcase.tsx";

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
  publisher: {
    "@type": "Organization",
    name: "ARL Protocol",
    url: SITE.url,
    logo: `${SITE.url}/icon.svg`,
    email: SITE.email,
    sameAs: [SITE.social.x, SITE.social.instagram, SITE.repository],
  },
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
        <section className="landing-hero px-4 pt-16 pb-16 text-center sm:px-6 sm:pt-24">
          <p className="text-[17px] font-semibold text-accent">Native utility token</p>
          <h1 className="mt-2 text-[64px] leading-none font-bold tracking-[-0.04em] sm:text-[96px]">
            ARL
          </h1>
          <p className="mx-auto mt-4 max-w-[720px] text-[22px] leading-[1.3] font-semibold tracking-[-0.02em] text-fg sm:text-[28px]">
            The token planned for decentralized AI and compute services.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/whitelist" prefetch={false} className={primary}>
              Join the whitelist
            </Link>
            <Link href={pathFor()} prefetch={false} className={secondary}>
              Explore the Core ›
            </Link>
          </div>
          <Link
            href={pathFor()}
            prefetch={false}
            aria-label="Open the ARL Core"
            className="landing-core glass mx-auto mt-14 flex size-[240px] flex-col items-center justify-center rounded-full sm:size-[320px]"
          >
            <span className="text-[48px] leading-none font-bold tracking-[-0.04em] text-heading sm:text-[64px]">
              ARL
            </span>
            <span className="mt-2 text-[13px] text-accent">Overview</span>
          </Link>
          <p className="mt-6 text-[12px] text-fg-subtle">
            ARL is live on the Base Sepolia testnet. Nothing is for sale. Registering is free.
          </p>
        </section>

        <Section
          alt
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
          heading="Built for AI and compute."
          sub="Swipe through how each one is meant to work. The token runs on the Base Sepolia testnet; nothing is on Base Mainnet yet."
        >
          <Reveal delay={120} className="mt-12">
            <TechShowcase />
          </Reveal>
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

        <Section heading="Where ARL is today." sub="No dates are set for future phases.">
          <Reveal delay={120} className="glass mt-14 rounded-[28px] p-6 sm:p-10">
            <ol className="landing-road text-left">
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
          </Reveal>
        </Section>

        <Section alt heading="Questions.">
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

        <section className="landing-final border-t border-line px-4 py-20 text-center sm:px-6 sm:py-28">
          <Reveal className="glass mx-auto max-w-[880px] rounded-[32px] px-6 py-14 sm:py-20">
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
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
