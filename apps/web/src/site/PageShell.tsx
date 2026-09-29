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
            <p className="text-[12px] text-accent">{eyebrow}</p>
            <h1 className="text-[32px] leading-[1.15] font-semibold sm:text-[38px]">{title}</h1>
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
      <Link href="/terms" prefetch={false} className="hover:text-fg">
        Terms
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
    <section className="flex flex-col gap-4 rounded-(--radius-card) border border-line bg-surface-1 p-6">
      <h2 className="text-[15px] font-medium">{title}</h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] leading-[1.6] text-fg-muted marker:text-fg-subtle">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
