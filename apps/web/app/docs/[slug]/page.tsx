import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DOCS, docPath } from "@/content/docs.ts";
import { OG_IMAGE } from "@/content/site.ts";
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
  const title = `${doc.title} · ARL`;
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
      <article className="doc-prose" dangerouslySetInnerHTML={{ __html: renderDoc(doc) }} />
    </PageShell>
  );
}
