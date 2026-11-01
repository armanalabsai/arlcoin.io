import type { Metadata } from "next";
import Link from "next/link";

import { breadcrumbJsonLd } from "@/content/seo.ts";
import { OG_IMAGE, SITE } from "@/content/site.ts";
import { type Solution, solution, SOLUTIONS } from "@/content/solutions.ts";
import { withBase } from "@/core/basePath.ts";

import { JsonLd } from "./JsonLd.tsx";
import { FactList, PageShell } from "./PageShell.tsx";

const link = "text-accent underline underline-offset-4";
const button = "press inline-flex h-12 items-center rounded-full px-6 text-[17px] font-semibold";

/** Metadata for a landing page: title, description, canonical and social card. */
export function solutionMetadata(slug: string): Metadata {
  const s = solution(slug);
  const url = `/${s.slug}`;
  return {
    title: s.title,
    description: s.description,
    keywords: [s.keyword, "ARL", "ARL Protocol", "Base", "x402", "ERC-8004", "ERC-8183"],
    alternates: { canonical: url },
    openGraph: { title: s.title, description: s.description, url, images: [OG_IMAGE] },
  };
}

/** schema.org: the page as a TechArticle about the keyword, plus its FAQ. */
function structuredData(s: Solution) {
  const url = `${SITE.url}/${s.slug}/`;
  return [
    breadcrumbJsonLd([[s.heading, `/${s.slug}`]]),
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${url}#article`,
      headline: s.heading,
      description: s.description,
      url,
      inLanguage: "en",
      keywords: s.keyword,
      about: { "@type": "Thing", name: s.keyword },
      isPartOf: { "@id": `${SITE.url}/#website` },
      publisher: { "@id": `${SITE.url}/#organization` },
      image: `${SITE.url}${OG_IMAGE.url}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: s.faq.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
  ];
}

function Actions({ s }: { s: Solution }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a href={withBase(s.appPath)} className={`${button} glass-tint`}>
        {s.appLabel}
      </a>
      <Link href="/buy" prefetch={false} className={`${button} glass-pill`}>
        Get ARL
      </Link>
    </div>
  );
}

/** A landing page for one search term: the problem, how ARL solves it, status, FAQ, links. */
export function SolutionPage({ slug }: { slug: string }) {
  const s = solution(slug);
  const others = SOLUTIONS.filter((o) => o.slug !== s.slug);
  return (
    <PageShell eyebrow={s.eyebrow} title={s.heading} lead={s.lead}>
      {structuredData(s).map((data, i) => (
        <JsonLd key={i} data={data} />
      ))}

      <Actions s={s} />

      {s.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="text-[26px] leading-[1.2] font-bold">{section.heading}</h2>
          {section.body ? (
            <p className="text-[17px] leading-[1.6] text-fg-muted">{section.body}</p>
          ) : null}
          {section.items ? (
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[17px] leading-[1.6] text-fg-muted marker:text-fg-subtle">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <h2 className="text-[26px] leading-[1.2] font-bold">How it works</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[17px] leading-[1.6] text-fg-muted marker:font-semibold marker:text-accent">
          {s.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <FactList title="Where it runs today" items={s.status} />

      <section className="flex flex-col gap-3">
        <h2 className="text-[26px] leading-[1.2] font-bold">Questions</h2>
        <div className="border-t border-line">
          {s.faq.map((f) => (
            <details key={f.question} className="faq-item border-b border-line">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-3 text-[17px] font-semibold text-heading">
                {f.question}
                <span aria-hidden="true" className="faq-mark text-[22px] font-light text-accent">
                  +
                </span>
              </summary>
              <p className="pb-5 text-[16px] leading-[1.55] text-fg-muted">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <FactList
        title="Read more"
        items={s.links.map((l) =>
          l.external ? (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href} prefetch={false} className={link}>
              {l.label}
            </Link>
          ),
        )}
      />

      <nav aria-label="Related use cases" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">Related use cases</h2>
        <ul className="flex flex-wrap gap-2">
          {others.map((o) => (
            <li key={o.slug}>
              <Link
                href={`/${o.slug}`}
                prefetch={false}
                className="glass-pill inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold"
              >
                {o.heading}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="glass flex flex-col gap-4 rounded-[22px] p-6">
        <h2 className="text-[22px] font-bold">Start with ARL Protocol</h2>
        <p className="text-[16px] leading-[1.55] text-fg-muted">
          Open the ARL app, read the{" "}
          <Link href="/core" prefetch={false} className={link}>
            Interactive Core
          </Link>{" "}
          or write to{" "}
          <a href={`mailto:${SITE.email}`} className={link}>
            {SITE.email}
          </a>
          .
        </p>
        <Actions s={s} />
      </section>
    </PageShell>
  );
}
