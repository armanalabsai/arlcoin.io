import Link from "next/link";

import { repoDoc, SITE, TOKEN_DISCLAIMER } from "@/content/site.ts";
import { BrandMark } from "@/core/BrandMark.tsx";

import { SiteLinks } from "./SiteLinks.tsx";

interface Props {
  current?: "whitelist" | "contact";
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}

/** Frame for the pages outside the Core: header, a readable column and the footer. */
export function PageShell({ current, eyebrow, title, lead, children }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="material-bar sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-8">
          <Link
            href="/"
            prefetch={false}
            className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.03em]"
            aria-label="ARL overview"
          >
            <BrandMark />
            ARL
          </Link>
          <SiteLinks current={current} />
        </div>
      </header>

      <main id="content" className="flex-1 px-4 pt-14 pb-20 sm:px-8">
        <div className="mx-auto flex max-w-[680px] flex-col gap-10">
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
              {eyebrow}
            </p>
            <h1 className="text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[42px]">
              {title}
            </h1>
            <p className="text-[16px] leading-[1.6] text-fg-muted">{lead}</p>
          </div>
          {children}
        </div>
      </main>

      <footer className="border-t border-line px-4 py-10 sm:px-8">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 text-[12px] leading-[1.6] text-fg-subtle sm:flex-row sm:justify-between sm:gap-8">
          <p className="max-w-[70ch]">{TOKEN_DISCLAIMER}</p>
          <FooterLinks />
        </div>
      </footer>
    </div>
  );
}

export function FooterLinks() {
  return (
    <nav aria-label="Site" className="flex shrink-0 flex-wrap gap-x-4 gap-y-2">
      <Link href="/whitelist" prefetch={false} className="hover:text-fg">
        Whitelist
      </Link>
      <Link href="/contact" prefetch={false} className="hover:text-fg">
        Contact
      </Link>
      <Link href="/privacy" prefetch={false} className="hover:text-fg">
        Privacy
      </Link>
      <a href={repoDoc("SECURITY.md")} rel="noopener noreferrer" className="hover:text-fg">
        Security
      </a>
      <a href={SITE.repository} rel="noopener noreferrer" className="hover:text-fg">
        Source code · Apache-2.0
      </a>
    </nav>
  );
}

/** A bordered list of short facts shown before a form. */
export function FactList({ title, items }: { title: string; items: readonly React.ReactNode[] }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-1/70 p-6">
      <h2 className="text-[15px] font-medium">{title}</h2>
      <ul className="flex flex-col gap-3 text-[14px] leading-[1.6] text-fg-muted">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
