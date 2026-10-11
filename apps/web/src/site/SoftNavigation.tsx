"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BASE_PATH, stripBase } from "@/core/basePath.ts";

// Mounted once in the root layout. Turns plain clicks on links to other pages of this site into
// client-side navigations, so the root layout, and the background music in it, stays alive and
// keeps playing across pages. Next's <Link> does this already; this covers plain anchors such as
// links inside documents. It runs after the page's own click handlers and leaves alone anything
// they handled, modified clicks, new-tab and download links, other origins, the separate app
// under /app, and in-page anchors.
export function SoftNavigation() {
  const router = useRouter();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (BASE_PATH && !url.pathname.startsWith(BASE_PATH)) return;
      const path = stripBase(url.pathname);
      if (path === "/app" || path.startsWith("/app/")) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      )
        return;
      e.preventDefault();
      router.push(`${path}${url.search}${url.hash}`);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [router]);
  return null;
}
