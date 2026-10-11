"use client";

import type { MouseEvent } from "react";

import { withBase } from "@/core/basePath.ts";
import { BrandMark } from "@/core/BrandMark.tsx";

// The brand link in the header. A click reloads the home page from the server and starts it at
// the top, instead of a client-side transition that keeps the scroll position. Modified clicks
// (new tab, new window) keep the browser's own behaviour.
export function HomeLink() {
  const href = withBase("/");
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      // Not supported: the reload below still starts at the top of a fresh page.
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    window.location.assign(href);
  };
  return (
    <a
      href={href}
      onClick={onClick}
      className="arl-neon inline-flex min-h-11 items-center gap-2 text-[17px] tracking-[-0.03em]"
      aria-label="ARL home"
    >
      <BrandMark />
      ARL
    </a>
  );
}
