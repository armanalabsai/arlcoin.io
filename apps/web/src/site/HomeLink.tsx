"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { withBase } from "@/core/basePath.ts";
import { BrandMark } from "@/core/BrandMark.tsx";
import { scrollPageTo } from "@/site/SmoothScroll.tsx";

// The brand link in the header. A click goes to the home page, reloads its content and starts it
// at the top. It navigates inside the app instead of reloading the whole document. Modified clicks
// (new tab, new window) keep the browser's own behaviour.
export function HomeLink() {
  const router = useRouter();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    scrollPageTo(0, true);
    router.push("/", { scroll: true });
    router.refresh();
  };
  return (
    <a
      href={withBase("/")}
      onClick={onClick}
      className="arl-neon inline-flex min-h-11 items-center gap-2 text-[17px] tracking-[-0.03em]"
      aria-label="ARL home"
    >
      <BrandMark />
      <span className="hidden min-[360px]:inline">ARL</span>
    </a>
  );
}
