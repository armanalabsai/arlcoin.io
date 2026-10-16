import type { CoreRoute } from "./registry.ts";
import { SITE } from "./site.ts";

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

export function descriptionFor(route: CoreRoute): string {
  if (route.card) return clampDescription(route.card.detail.summary);
  if (route.layer) return clampDescription(route.layer.description);
  return SITE.description;
}
