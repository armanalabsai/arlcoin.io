import type { Metadata } from "next";
import Link from "next/link";

import { OG_IMAGE } from "@/content/site.ts";
import { FactList, PageShell } from "@/site/PageShell.tsx";
import { WhitelistForm } from "@/site/forms.tsx";

const title = "Whitelist · ARL";
const description =
  "Register an EVM wallet address for the ARL launch list and launch updates. Registration is free and does not guarantee an allocation.";

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
      lead="Register a wallet address to be considered for the ARL launch claim list and to receive launch updates by email."
    >
      <FactList
        title="Before you register"
        items={[
          "ARL is live on the Base Sepolia testnet only; testnet tokens have no value. No ARL contract exists on Base Mainnet yet, so any token that claims to be ARL there today is not.",
          "Registration is free. No payment is requested, and nothing is for sale.",
          "Registering does not guarantee an allocation. The free Public Launch claim is up to 500,000 ARL in total, at most 10,000 ARL per address, open for 60 days; the list is published before the launch.",
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
