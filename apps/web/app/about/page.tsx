import type { Metadata } from "next";
import Link from "next/link";

import { docPath } from "@/content/docs.ts";
import { breadcrumbJsonLd } from "@/content/seo.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import { JsonLd } from "@/site/JsonLd.tsx";
import { FactList, PageShell } from "@/site/PageShell.tsx";

const title = "About · ARL Protocol";
const description =
  "About ARL Protocol: an open-source utility token for AI and compute payments on Base. Official channels and contact: team@arlcoin.io.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/about" },
  openGraph: { title, description, url: "/about", images: [OG_IMAGE] },
};

const link = "text-accent underline underline-offset-4";
const ext = { rel: "me noopener noreferrer", target: "_blank" } as const;

export default function AboutPage() {
  return (
    <PageShell
      current="about"
      eyebrow="About"
      title="About ARL Protocol"
      lead="ARL Protocol builds ARL, the utility token for AI and compute payments on Base. The code, the documents and the security audit are public."
    >
      <JsonLd data={breadcrumbJsonLd([["About", "/about"]])} />

      <FactList
        title="What ARL is"
        items={[
          "ARL is an ERC-20 utility token on Base for paying AI and compute services per request.",
          "Fixed supply of 21,000,000 ARL, minted once at deployment. The token has no owner, no mint, no pause and no upgrade path.",
          <>
            Status: live on Base Mainnet since {SITE.mainnet.deployedOn}. Official contract:{" "}
            <a
              href={SITE.mainnet.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className={`${link} break-all`}
            >
              {SITE.mainnet.token}
            </a>
            , source-verified on Basescan.
          </>,
          <>
            Open source under Apache-2.0:{" "}
            <a href={SITE.repository} {...ext} className={link}>
              github.com/armanalabsai/arlcoin.io
            </a>
            . Security:{" "}
            <Link href={docPath("security-audit")} prefetch={false} className={link}>
              internal audit report
            </Link>
            .
          </>,
        ]}
      />

      <FactList
        title="Contact"
        items={[
          <>
            Email:{" "}
            <a href={`mailto:${SITE.email}`} className={link}>
              {SITE.email}
            </a>{" "}
            (partnerships, press, listings and security reports)
          </>,
          <>
            Contact form:{" "}
            <Link href="/contact" prefetch={false} className={link}>
              arlcoin.io/contact
            </Link>
          </>,
          <>
            X:{" "}
            <a href={SITE.social.x} {...ext} className={link}>
              @arlprotocol
            </a>{" "}
            · Telegram:{" "}
            <a href={SITE.social.telegram} {...ext} className={link}>
              t.me/arlcoin_community
            </a>{" "}
            · Medium:{" "}
            <a href={SITE.social.medium} {...ext} className={link}>
              @arlprotocol
            </a>
          </>,
          "These are the only official channels. The team never sends the first direct message and never asks for a private key, seed phrase or payment.",
        ]}
      />
    </PageShell>
  );
}
