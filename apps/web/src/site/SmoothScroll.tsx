"use client";

import type Lenis from "lenis";
import { useEffect } from "react";

import { easeOutQuint, SCROLL_DURATION } from "@/core/motion.ts";

// Mounted once in the root layout. Gives wheel and trackpad scrolling of the page the same
// ease-out-quint curve as the rest of the site's motion (Lenis). Touch keeps the platform's
// native momentum. Off under prefers-reduced-motion: the page then scrolls natively, and turns
// off live if the setting changes. Horizontal rails and open dialogs scroll on their own, and a
// dialog's scroll lock (data-scroll-locked on <body>) stops the page. Lenis loads after the
// page is idle, so it never delays the first paint.

let lenis: Lenis | null = null;

/** Scrolls the page to `top`, with the site's curve when smooth scrolling is on. */
export function scrollPageTo(top: number, immediate = false): void {
  if (lenis) lenis.scrollTo(top, { immediate, duration: SCROLL_DURATION, easing: easeOutQuint });
  else window.scrollTo({ top, left: 0, behavior: immediate ? "instant" : "smooth" });
}

export function SmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lock: MutationObserver | null = null;
    let active = true;

    const start = async () => {
      if (lenis || reduced.matches) return;
      const { default: Lenis } = await import("lenis");
      if (!active || lenis || reduced.matches) return;
      lenis = new Lenis({
        autoRaf: true,
        duration: SCROLL_DURATION,
        easing: easeOutQuint,
        smoothWheel: true,
        syncTouch: false,
        anchors: true,
        prevent: (node) => node.closest(".rail, [role='dialog'], [data-lenis-prevent]") !== null,
      });
      lock = new MutationObserver(() => {
        if (document.body.hasAttribute("data-scroll-locked")) lenis?.stop();
        else lenis?.start();
      });
      lock.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    };
    const stop = () => {
      lock?.disconnect();
      lock = null;
      lenis?.destroy();
      lenis = null;
    };
    const onChange = () => {
      if (reduced.matches) stop();
      else void start();
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void start(), { timeout: 2000 })
      : window.setTimeout(() => void start(), 1);
    reduced.addEventListener("change", onChange);
    return () => {
      active = false;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      reduced.removeEventListener("change", onChange);
      stop();
    };
  }, []);
  return null;
}
