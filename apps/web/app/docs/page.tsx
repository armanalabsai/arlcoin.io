import type { Metadata } from "next";
import Link from "next/link";

import { DOCS, docPath } from "@/content/docs.ts";
import { OG_IMAGE } from "@/content/site.ts";
import { PageShell } from "@/site/PageShell.tsx";

const title = "Documents · ARL";
const description = "ARL's design, tokenomics, security and licence documents.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/docs" },
  openGraph: { title, description, url: "/docs", images: [OG_IMAGE] },
};

export default function DocsIndex() {
  return (
    <PageShell
      eyebrow="Documents"
      title="Documents"
      lead="How ARL is designed, how the token works and how it is secured. The code is licensed under Apache-2.0."
    >
      <ul className="flex flex-col">
        {DOCS.map((d) => (
          <li key={d.slug} className="border-b border-line">
            <Link
              href={docPath(d.slug)}
              prefetch={false}
              className="group flex min-h-16 flex-col justify-center gap-1 py-4"
            >
              <span className="text-[17px] font-semibold text-heading group-hover:text-accent">
                {d.title} <span aria-hidden="true">›</span>
              </span>
              <span className="text-[15px] text-fg-muted">{d.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
