import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/content/seo.ts";
import { JsonLd } from "@/site/JsonLd.tsx";
import Link from "next/link";

import { OG_IMAGE } from "@/content/site.ts";
import { FactList, PageShell } from "@/site/PageShell.tsx";
import { WhitelistForm } from "@/site/forms.tsx";

const title = "ARL Whitelist: Launch Updates · ARL Protocol";
const description =
  "Register an EVM wallet address for ARL launch updates and the later airdrop list. Registration is free and does not guarantee an allocation.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/whitelist" },
  openGraph: { title, description, url: "/whitelist", images: [OG_IMAGE] },
};

export default function WhitelistPage() {
  return (
    <PageShell
      current="whitelist"
      eyebrow="Launch list"
      title="Whitelist"
      lead="Register a wallet address to receive ARL launch updates by email and to be considered for the later airdrop."
    >
      <JsonLd data={breadcrumbJsonLd([["Whitelist", "/whitelist"]])} />
      <FactList
        title="Before you register"
        items={[
          "ARL is live on Base Mainnet. The only official contract is 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4; any other address presented as ARL is not official.",
          "Registration is free. No payment is ever requested.",
          "Registering does not guarantee an allocation. There is no airdrop at the launch; an airdrop of 500,000 ARL is planned for a later date, with its rules announced before it opens.",
          "ARL will never ask for your private key or seed phrase. Anyone who does is attempting theft.",
          <>
            Your address and email are handled as described in the{" "}
            <Link
              href="/privacy"
              prefetch={false}
              className="text-accent underline underline-offset-4"
            >
              privacy notice
            </Link>
            .
          </>,
        ]}
      />
      <WhitelistForm />
    </PageShell>
  );
}
