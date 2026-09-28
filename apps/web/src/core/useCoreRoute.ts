"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { titleFor } from "@/content/meta.ts";
import { HOME, parsePath, pathFor, type CoreRoute } from "@/content/registry.ts";

import { stripBase, withBase } from "./basePath.ts";

/**
 * The URL is the only source of truth for what the Core shows. Navigation uses
 * the native History API, which Next.js integrates with `usePathname`: the
 * address bar, back/forward and refresh all work, and no route is fetched or
 * remounted, so moving between layers never feels like a page change.
 */
export function useCoreRoute() {
  const pathname = usePathname();
  const route: CoreRoute = useMemo(() => parsePath(pathname) ?? HOME, [pathname]);

  // Path of a detail we opened ourselves from its layer. Closing it then goes
  // back one history entry instead of adding one, so Back and Close agree.
  const openedFrom = useRef<string | null>(null);

  useEffect(() => {
    document.title = titleFor(route);
  }, [route]);

  useEffect(() => {
    const onPop = () => {
      openedFrom.current = null;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (path === stripBase(window.location.pathname)) return;
    if (options?.replace) window.history.replaceState(null, "", withBase(path));
    else window.history.pushState(null, "", withBase(path));
  }, []);

  const openCard = useCallback(
    (layerId: string, cardId: string) => {
      const target = pathFor(layerId, cardId);
      const current = stripBase(window.location.pathname);
      openedFrom.current = current === pathFor(layerId) ? target : null;
      navigate(target);
    },
    [navigate],
  );

  const closeCard = useCallback(() => {
    if (!route.layer) return;
    const here = stripBase(window.location.pathname);
    if (openedFrom.current === here) {
      openedFrom.current = null;
      window.history.back();
    } else {
      navigate(pathFor(route.layer.id));
    }
  }, [navigate, route.layer]);

  return { route, navigate, openCard, closeCard };
}

/** Plain left-click without modifiers: handle in place. Anything else: let the browser open the link. */
export function isPlainClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
