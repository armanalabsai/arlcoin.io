import type { Metadata } from "next";
import Link from "next/link";

import { OG_IMAGE, SITE } from "@/content/site.ts";
import { AddToWallet } from "@/site/AddToWallet.tsx";
import { FactList, PageShell } from "@/site/PageShell.tsx";

const title = "How to get ARL · ARL";
const description =
  "Where ARL becomes available: the official ARL/USDC pool on Uniswap on Base, from 0.20 USD per ARL, opened at the TGE on 1 November 2026. Only the official contract address is ARL.";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const token = SITE.mainnet.token;
const swapUrl = token
  ? `https://app.uniswap.org/swap?chain=base&inputCurrency=${USDC_BASE}&outputCurrency=${token}`
  : null;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/buy" },
  openGraph: { title, description, url: "/buy", images: [OG_IMAGE] },
};

export default function BuyPage() {
  return (
    <PageShell
      eyebrow="Get ARL"
      title="How to get ARL"
      lead={
        token
          ? "ARL trades in the official ARL/USDC pool on Uniswap on Base. Check the contract address before you buy."
          : `ARL is not available yet. It becomes available at the TGE, targeted for ${SITE.tgeTarget}, in the official ARL/USDC pool on Uniswap on Base.`
      }
    >
      {swapUrl && token ? (
        <div className="glass rounded-[22px] p-6">
          <p className="text-[15px] text-fg-muted">Official ARL contract on Base</p>
          <p className="mt-1 font-mono text-[15px] break-all text-heading">{token}</p>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row">
            <a
              href={swapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex h-12 items-center glass-tint rounded-full px-6 text-[17px] font-semibold"
            >
              Buy on Uniswap
            </a>
            <AddToWallet />
          </div>
        </div>
      ) : null}
      <FactList
        title="Before you buy"
        items={[
          "The official pool is ARL/USDC (1% fee tier) on Uniswap v3 on Base, opened by the Liquidity Safe. It starts at 0.20 USD per ARL and holds only ARL, so no ARL in it is sold below 0.20 USD.",
          "Only the contract address published on this page and in the repository is ARL. Tokens with the same name on other networks or at other addresses are not ARL.",
          "ARL will never ask for your private key, your seed phrase or a payment to a personal address. Anyone who does is attempting theft.",
          "No independent audit has been performed. Tokens can lose all their value. Nothing here is investment advice or a promise of price or listing.",
          <>
            Whitelist sign-ups can claim free ARL from the Public Launch for 60 days after the TGE;
            see the{" "}
            <Link
              href="/whitelist"
              prefetch={false}
              className="text-accent underline underline-offset-4"
            >
              whitelist
            </Link>
            .
          </>,
        ]}
      />
    </PageShell>
  );
}
