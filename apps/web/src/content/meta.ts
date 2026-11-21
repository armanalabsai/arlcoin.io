import type { CoreRoute } from "./registry.ts";

/** Document title for a route. Used by server metadata and client navigation alike. */
export function titleFor(route: CoreRoute): string {
  if (route.card && route.layer) return `${route.card.title} · ${route.layer.title} · ARL Protocol`;
  if (route.layer) return `${route.layer.title} · ARL Protocol`;
  return "Interactive Core · ARL Protocol";
}

/** Longest meta description search engines show in full. */
export const MAX_DESCRIPTION = 155;

/** Cuts a description at a word boundary so it fits `MAX_DESCRIPTION`, ending with an ellipsis. */
export function clampDescription(text: string, max = MAX_DESCRIPTION): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const end = cut.lastIndexOf(" ");
  return `${(end > max / 2 ? cut.slice(0, end) : cut).replace(/[\s,;:.·-]+$/, "")}…`;
}

/**
 * Search descriptions for the layers whose on-page caption is too short to say what the page is
 * about out of context. The caption itself stays short: it sits beside the Core.
 */
const LAYER_SEARCH: Record<string, string> = {
  security:
    "ARL Protocol security: how the contracts limit what anyone can do, and how they are checked.",
  roadmap:
    "The ARL Protocol roadmap. Live on Base Mainnet: verified jobs, payments, standards and tools.",
  ecosystem:
    "The ARL Protocol ecosystem: the open-source software ARL builds on, and the builder programs.",
};

export function descriptionFor(route: CoreRoute): string {
  if (route.card) return clampDescription(route.card.detail.summary);
  if (route.layer) return clampDescription(LAYER_SEARCH[route.layer.id] ?? route.layer.description);
  return "The ARL Protocol Core: token, technology, security, roadmap and ecosystem, each fact linked to its source.";
}
