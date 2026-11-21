import Link from "next/link";

import { docPath } from "@/content/docs.ts";
import { LAYERS, pathFor } from "@/content/registry.ts";
import { SITE } from "@/content/site.ts";
import { SOLUTIONS } from "@/content/solutions.ts";
import { withBase } from "@/core/basePath.ts";

import { LiveStatus } from "./LiveStatus.tsx";
import { HomeLink } from "./HomeLink.tsx";
import { SiteLinks } from "./SiteLinks.tsx";

/** Header of the landing page and the standalone pages: brand, the layers, and the actions. */
export function SiteHeader({ current }: { current?: "whitelist" | "contact" | "faq" | "about" }) {
  return (
    <header className="material-bar sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <HomeLink />
          <LiveStatus />
        </div>
        <nav aria-label="Layers" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-[13px] text-fg-muted">
            {LAYERS.map((l) => (
              <li key={l.id}>
                <Link
                  href={pathFor(l.id)}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center transition-colors hover:text-fg"
                >
                  {l.title}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/build"
                prefetch={false}
                className="inline-flex min-h-11 items-center transition-colors hover:text-fg"
              >
                Build
              </Link>
            </li>
            <li>
              <Link
                href="/docs"
                prefetch={false}
                className="inline-flex min-h-11 items-center transition-colors hover:text-fg"
              >
                Docs
              </Link>
            </li>
          </ul>
        </nav>
        <SiteLinks current={current} />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-2 text-[12px] leading-[1.6] text-fg-subtle">
        <UseCaseLinks />
        <FooterLinks />
      </div>
    </footer>
  );
}

/** The landing pages, linked from every page so search engines and readers can find them. */
export function UseCaseLinks() {
  const link = "inline-flex min-h-11 items-center hover:text-fg";
  return (
    <nav aria-label="Use cases" className="flex flex-wrap gap-x-5">
      {SOLUTIONS.map((s) => (
        <Link key={s.slug} href={`/${s.slug}`} prefetch={false} className={link}>
          {s.short}
        </Link>
      ))}
    </nav>
  );
}

export function FooterLinks() {
  const link = "inline-flex min-h-11 items-center hover:text-fg";
  return (
    <nav aria-label="Site" className="flex shrink-0 flex-wrap gap-x-5">
      <Link href="/whitelist" prefetch={false} className={link}>
        Whitelist
      </Link>
      <a href={withBase("/app/")} className={link}>
        App
      </a>
      <Link href="/buy" prefetch={false} className={link}>
        Get ARL
      </Link>
      <Link href="/faq" prefetch={false} className={link}>
        FAQ
      </Link>
      <Link href="/about" prefetch={false} className={link}>
        About
      </Link>
      <Link href="/proof" prefetch={false} className={link}>
        Proof
      </Link>
      <Link href="/contact" prefetch={false} className={link}>
        Contact
      </Link>
      <Link href="/privacy" prefetch={false} className={link}>
        Privacy
      </Link>
      <Link href="/terms" prefetch={false} className={link}>
        Terms
      </Link>
      <Link href={docPath("security")} prefetch={false} className={link}>
        Security
      </Link>
      <Link href="/docs" prefetch={false} className={link}>
        Docs
      </Link>
      <a href={SITE.repository} rel="me noopener noreferrer" target="_blank" className={link}>
        GitHub
      </a>
      <a href={SITE.packages.npmSdk} rel="noopener noreferrer" target="_blank" className={link}>
        npm
      </a>
      <a href={SITE.packages.pypi} rel="noopener noreferrer" target="_blank" className={link}>
        PyPI
      </a>
      <a href={SITE.packages.n8n} rel="noopener noreferrer" target="_blank" className={link}>
        n8n node
      </a>
      <a href={SITE.social.x} rel="me noopener noreferrer" target="_blank" className={link}>
        X @arlprotocol
      </a>
      <a href={SITE.social.telegram} rel="me noopener noreferrer" target="_blank" className={link}>
        Telegram
      </a>
      <a
        href={SITE.social.telegramChat}
        rel="me noopener noreferrer"
        target="_blank"
        className={link}
      >
        Telegram chat
      </a>
      <a href={SITE.social.farcaster} rel="me noopener noreferrer" target="_blank" className={link}>
        Farcaster
      </a>
      <a href={SITE.social.linkedin} rel="me noopener noreferrer" target="_blank" className={link}>
        LinkedIn
      </a>
      <a href={SITE.social.devto} rel="me noopener noreferrer" target="_blank" className={link}>
        DEV
      </a>
      <a
        href={SITE.social.productHunt}
        rel="me noopener noreferrer"
        target="_blank"
        className={link}
      >
        Product Hunt
      </a>
      <a
        href={`${SITE.repository}/blob/main/LICENSE`}
        rel="noopener noreferrer"
        target="_blank"
        className={link}
      >
        Apache-2.0
      </a>
      <a
        href={`${SITE.packages.n8nRepository}/blob/main/LICENSE`}
        rel="noopener noreferrer"
        target="_blank"
        className={link}
      >
        MIT (n8n node)
      </a>
    </nav>
  );
}
