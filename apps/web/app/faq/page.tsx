import type { Metadata } from "next";

import { breadcrumbJsonLd } from "@/content/seo.ts";

import { faqJsonLd } from "@/content/faq.ts";
import { OG_IMAGE } from "@/content/site.ts";
import { FaqList } from "@/site/FaqList.tsx";
import { JsonLd } from "@/site/JsonLd.tsx";
import { PageShell } from "@/site/PageShell.tsx";

const title = "ARL Token FAQ · ARL Protocol";
const description =
  "ARL token FAQ: maximum supply, launch date, Base network, Uniswap trading, whitelist and airdrop timing, answered by ARL Protocol.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/faq" },
  openGraph: { title, description, url: "/faq", images: [OG_IMAGE] },
};

export default function FaqPage() {
  return (
    <PageShell
      current="faq"
      eyebrow="FAQ"
      title="Questions"
      lead="Short answers about ARL. Everything here is also stated in the Core and the documents."
    >
      <JsonLd data={breadcrumbJsonLd([["FAQ", "/faq"]])} />
      <JsonLd data={faqJsonLd} />
      <div className="glass rounded-[28px] px-6 pt-2 pb-2 sm:px-8">
        <FaqList />
      </div>
    </PageShell>
  );
}
