"use client";

import { LAYERS, nextLayer } from "@/content/registry.ts";
import type { Layer } from "@/content/types.ts";

import { withBase } from "./basePath.ts";

interface Props {
  layer: Layer | null;
  onActivate: () => void;
}

/**
 * The anchor of every view: the ARL logo on a transparent ground. Activating
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
      {/* The ARL logo (public/arl-logo.svg, from assets/brand), the A of ARL at its centre, as a
          background image, not an <img>: it is decoration (the button carries the name), and
          pages keep no <img> so that no unverified photo can appear. */}
      <span
        aria-hidden="true"
        className="pointer-events-none size-full bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${withBase("/arl-logo.svg")}")` }}
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-7 text-[12px] whitespace-nowrap text-fg-subtle opacity-0 group-focus-visible:opacity-100"
      >
        {next ? `Next · ${next.title}` : "Overview"}
      </span>
    </button>
  );
}
