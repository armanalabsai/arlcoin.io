import Link from "next/link";

import { SITE } from "@/content/site.ts";

const button =
  "h-8 items-center rounded-(--radius-control) border px-3 text-[13px] transition-colors";
const quietLook = `${button} border-line-strong text-fg-muted hover:border-[rgb(255_255_255/0.28)] hover:text-fg`;
const quiet = `inline-flex ${quietLook}`;
const accent = `inline-flex ${button} border-accent-edge bg-accent-faint text-accent hover:bg-accent-soft hover:text-accent-strong`;

/** Header actions shared by the Core and the standalone pages. */
export function SiteLinks({ current }: { current?: "whitelist" | "contact" }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/contact"
        prefetch={false}
        aria-current={current === "contact" ? "page" : undefined}
        className={`hidden min-[360px]:inline-flex ${quietLook}`}
      >
        Contact
      </Link>
      <Link
        href="/whitelist"
        prefetch={false}
        aria-current={current === "whitelist" ? "page" : undefined}
        className={accent}
      >
        Whitelist
      </Link>
      <a href={SITE.repository} rel="noopener noreferrer" className={quiet}>
        GitHub
      </a>
    </div>
  );
}
