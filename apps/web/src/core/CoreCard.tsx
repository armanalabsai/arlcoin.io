"use client";

import { LAYERS, nextLayer } from "@/content/registry.ts";
import type { Layer } from "@/content/types.ts";

import { HeroLogo } from "@/site/HeroLogo.tsx";

interface Props {
  layer: Layer | null;
  onActivate: () => void;
}

/**
 * The anchor of every view: the turning ARL logo on a transparent ground. Activating
 * the Core moves to the next layer (home follows the last one); the current
 * layer and the next one are given in the accessible name.
 */
export function CoreCard({ layer, onActivate }: Props) {
  const next = nextLayer(layer);
  const index = layer ? LAYERS.findIndex((l) => l.id === layer.id) : -1;
  const label = layer
    ? `ARL Core. ${layer.title} layer, ${index + 1} of ${LAYERS.length}. Activate to open ${next ? next.title : "the overview"}.`
    : `ARL Core. Overview. Activate to open ${next?.title ?? ""}.`;

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={label}
      data-testid="arl-core"
      className="group relative grid size-[184px] shrink-0 place-items-center rounded-full min-[1100px]:size-[216px] min-[1100px]:[@media(max-height:899px)]:size-[184px]"
    >
      {/* The turning ARL logo of the landing page and the app: a ring of ticks, a counter-turning
          orbit and a breathing glow around the mark. It is decoration (the button carries the
          name) and is drawn with SVG and a background image, so pages keep no <img>. */}
      <HeroLogo />
      <span
        aria-hidden="true"
        className="absolute -bottom-7 text-[12px] whitespace-nowrap text-fg-subtle opacity-0 group-focus-visible:opacity-100"
      >
        {next ? `Next · ${next.title}` : "Overview"}
      </span>
    </button>
  );
}
