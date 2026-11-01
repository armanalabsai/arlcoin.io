import Link from "next/link";

import { withBase } from "@/core/basePath.ts";

// Header actions shared by the Core and the standalone pages. Each link is at least 44px tall
// for touch; the visible pill inside it can be smaller. FAQ and Contact live in the footer only.
// Whitelist, also in the footer, gives way when the header is narrow; Open app and Get ARL always
// show.
const tap = "inline-flex min-h-11 items-center";
// The same box for links shown only from a breakpoint: no display class of its own, so `hidden`
// and the breakpoint's `inline-flex` decide.
const tapAt = "min-h-11 items-center";

export function SiteLinks({
  current,
}: {
  current?: "whitelist" | "contact" | "faq" | "about" | "buy";
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <Link
        href="/whitelist"
        prefetch={false}
        aria-current={current === "whitelist" ? "page" : undefined}
        className={`${tapAt} hidden text-[13px] text-fg-muted transition-colors hover:text-fg sm:inline-flex`}
      >
        Whitelist
      </Link>
      {/* The app is a separate static export under /app, so a plain anchor loads it. */}
      <a href={withBase("/app/")} className={`${tap} group`}>
        <span className="glass-pill inline-flex h-8 items-center rounded-full px-4 text-[13px] font-semibold whitespace-nowrap">
          <span className="min-[400px]:hidden">App</span>
          <span className="hidden min-[400px]:inline">Open app</span>
        </span>
      </a>
      <Link
        href="/buy"
        prefetch={false}
        aria-current={current === "buy" ? "page" : undefined}
        className={`${tap} group`}
      >
        <span className="glass-tint inline-flex h-8 items-center rounded-full px-4 text-[13px] font-semibold whitespace-nowrap">
          Get ARL
        </span>
      </Link>
    </div>
  );
}
