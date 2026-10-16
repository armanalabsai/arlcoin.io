import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DOCS, docPath } from "@/content/docs.ts";
import { breadcrumbJsonLd } from "@/content/seo.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import { JsonLd } from "@/site/JsonLd.tsx";
import { PageShell } from "@/site/PageShell.tsx";
import { renderDoc } from "@/site/renderDoc.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

const find = (slug: string) => DOCS.find((d) => d.slug === slug);

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const doc = find((await params).slug);
  if (!doc) return {};
  const title = `${doc.title} · ARL Protocol`;
  return {
    title,
    description: doc.description,
    alternates: { canonical: docPath(doc.slug) },
    openGraph: { title, description: doc.description, url: docPath(doc.slug), images: [OG_IMAGE] },
  };
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const doc = find((await params).slug);
  if (!doc) notFound();
  return (
    <PageShell eyebrow="Documents" title={doc.title} lead={doc.description} wide>
      <JsonLd
        data={breadcrumbJsonLd([
          ["Documents", "/docs"],
          [doc.title, docPath(doc.slug)],
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: doc.title,
          description: doc.description,
          url: new URL(`${docPath(doc.slug)}/`, SITE.url).toString(),
          inLanguage: "en",
          author: { "@id": `${SITE.url}/#organization` },
          publisher: { "@id": `${SITE.url}/#organization` },
        }}
      />
      <article className="doc-prose" dangerouslySetInnerHTML={{ __html: renderDoc(doc) }} />
    </PageShell>
  );
}
