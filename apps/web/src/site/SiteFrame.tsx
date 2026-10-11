import Link from "next/link";

import { docPath } from "@/content/docs.ts";
import { LAYERS, pathFor } from "@/content/registry.ts";
import { SITE, TOKEN_DISCLAIMER } from "@/content/site.ts";
import { BrandMark } from "@/core/BrandMark.tsx";

import { SiteLinks } from "./SiteLinks.tsx";

/** Header of the landing page and the standalone pages: brand, the layers, and the actions. */
export function SiteHeader({ current }: { current?: "whitelist" | "contact" | "faq" }) {
  return (
    <header className="material-bar sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-6 px-4 sm:px-6">
        <Link
          href="/"
          prefetch={false}
          className="arl-neon inline-flex min-h-11 items-center gap-2 text-[17px] tracking-[-0.03em]"
          aria-label="ARL home"
        >
          <BrandMark />
          ARL
        </Link>
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
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 text-[12px] leading-[1.6] text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <p className="max-w-[64ch]">{TOKEN_DISCLAIMER}</p>
        <FooterLinks />
      </div>
    </footer>
  );
}

export function FooterLinks() {
  const link = "inline-flex min-h-11 items-center hover:text-fg";
  return (
    <nav aria-label="Site" className="flex shrink-0 flex-wrap gap-x-5">
      <Link href="/whitelist" prefetch={false} className={link}>
        Whitelist
      </Link>
      <Link href="/buy" prefetch={false} className={link}>
        Get ARL
      </Link>
      <Link href="/faq" prefetch={false} className={link}>
        FAQ
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
        Docs · Apache-2.0
      </Link>
      <a href={SITE.social.x} rel="me noopener noreferrer" target="_blank" className={link}>
        X
      </a>
      <a href={SITE.social.instagram} rel="me noopener noreferrer" target="_blank" className={link}>
        Instagram
      </a>
      <a href={SITE.social.telegram} rel="me noopener noreferrer" target="_blank" className={link}>
        Telegram
      </a>
    </nav>
  );
}
