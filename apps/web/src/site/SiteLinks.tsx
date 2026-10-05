import Link from "next/link";

// Header actions shared by the Core and the standalone pages. Each link is at least 44px tall
// for touch; the visible pill inside it can be smaller.
const tap = "inline-flex min-h-11 items-center";

export function SiteLinks({ current }: { current?: "whitelist" | "contact" | "faq" }) {
  return (
    <div className="flex items-center gap-4">
      <Link
        href="/faq"
        prefetch={false}
        aria-current={current === "faq" ? "page" : undefined}
        className={`${tap} hidden text-[13px] text-fg-muted transition-colors hover:text-fg min-[420px]:inline-flex`}
      >
        FAQ
      </Link>
      <Link
        href="/contact"
        prefetch={false}
        aria-current={current === "contact" ? "page" : undefined}
        className={`${tap} hidden text-[13px] text-fg-muted transition-colors hover:text-fg min-[360px]:inline-flex`}
      >
        Contact
      </Link>
      <Link
        href="/whitelist"
        prefetch={false}
        aria-current={current === "whitelist" ? "page" : undefined}
        className={`${tap} group`}
      >
        <span className="glass-tint inline-flex h-8 items-center rounded-full px-4 text-[13px] font-semibold">
          Join whitelist
        </span>
      </Link>
    </div>
  );
}
