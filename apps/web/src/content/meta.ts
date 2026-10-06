import type { CoreRoute } from "./registry.ts";
import { SITE } from "./site.ts";

/** Document title for a route. Used by server metadata and client navigation alike. */
export function titleFor(route: CoreRoute): string {
  if (route.card && route.layer) return `${route.card.title} · ${route.layer.title} · ARL`;
  if (route.layer) return `${route.layer.title} · ARL`;
  return "ARL · Interactive Core";
}

export function descriptionFor(route: CoreRoute): string {
  if (route.card) return route.card.detail.summary;
  if (route.layer) return route.layer.description;
  return SITE.description;
}
