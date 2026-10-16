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
          "ARL is live on the Base Sepolia testnet only; testnet tokens have no value. No ARL contract exists on Base Mainnet yet, so any token that claims to be ARL there today is not.",
          "Registration is free. No payment is requested, and nothing is for sale.",
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
