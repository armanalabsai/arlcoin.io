import type { Metadata } from "next";

import { faqJsonLd } from "@/content/faq.ts";
import { OG_IMAGE } from "@/content/site.ts";
import { FaqList } from "@/site/FaqList.tsx";
import { JsonLd } from "@/site/JsonLd.tsx";
import { PageShell } from "@/site/PageShell.tsx";

const title = "FAQ · ARL";
const description =
  "Answers to common questions about ARL: sale, supply, whitelist, audit, chain and launch.";

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
      <JsonLd data={faqJsonLd} />
      <FaqList />
    </PageShell>
  );
}
