import { ecosystem } from "./layers/ecosystem.ts";
import { roadmap } from "./layers/roadmap.ts";
import { security } from "./layers/security.ts";
import { teamLayer } from "./layers/team.ts";
import { technology } from "./layers/technology.ts";
import { token } from "./layers/token.ts";
import type { Card, Layer } from "./types.ts";

/** Layer order is the order the Core cycles through. */
export const LAYERS: readonly Layer[] = [
  teamLayer,
  token,
  technology,
  security,
  roadmap,
  ecosystem,
];

export interface CoreRoute {
  readonly layer: Layer | null;
  readonly card: Card | null;
}

export const HOME: CoreRoute = { layer: null, card: null };

export function getLayer(id: string): Layer | undefined {
  return LAYERS.find((l) => l.id === id);
}

export function getCard(layer: Layer, id: string): Card | undefined {
  return layer.cards.find((c) => c.id === id);
}

/** `/core`, `/core/<layer>` or `/core/<layer>/<card>`. The landing page is `/`. */
export function pathFor(layerId?: string, cardId?: string): string {
  if (!layerId) return "/core";
  return cardId ? `/core/${layerId}/${cardId}` : `/core/${layerId}`;
}

/** Parses a pathname into a route, or returns null when it names nothing. */
export function parsePath(pathname: string): CoreRoute | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] !== "core" || parts.length > 3) return null;
  if (parts.length === 1) return HOME;
  const layer = parts[1] ? getLayer(parts[1]) : undefined;
  if (!layer) return null;
  if (parts.length === 2) return { layer, card: null };
  const card = parts[2] ? getCard(layer, parts[2]) : undefined;
  return card ? { layer, card } : null;
}

/** The layer after `current` in the cycle; home follows the last layer. */
export function nextLayer(current: Layer | null): Layer | null {
  if (!current) return LAYERS[0] ?? null;
  const index = LAYERS.findIndex((l) => l.id === current.id);
  return LAYERS[index + 1] ?? null;
}

/** Every path of the Core, for static generation and the sitemap. */
export function allPaths(): string[] {
  return [
    pathFor(),
    ...LAYERS.flatMap((l) => [pathFor(l.id), ...l.cards.map((c) => pathFor(l.id, c.id))]),
  ];
}
