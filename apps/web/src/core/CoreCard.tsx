"use client";

import { LAYERS, nextLayer } from "@/content/registry.ts";
import type { Layer } from "@/content/types.ts";

import { withBase } from "./basePath.ts";

interface Props {
  layer: Layer | null;
  onActivate: () => void;
}

/**
 * The anchor of every view: the ARL mark on a transparent ground. Activating
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
      {/* A background image, not an <img>: the mark is decoration (the button carries the
          name), and pages keep no <img> so that no unverified photo can appear. */}
      <span
        aria-hidden="true"
        className="pointer-events-none size-full bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url("${withBase("/arl-core-mark.png")}")` }}
      />
      {/* The A of ARL in the mark's empty centre, in the wordmark's type. */}
      <span
        aria-hidden="true"
        className="arl-neon pointer-events-none absolute inset-0 grid place-items-center text-[30px] leading-none tracking-[-0.04em] min-[1100px]:text-[36px] min-[1100px]:[@media(max-height:899px)]:text-[30px]"
      >
        A
      </span>
      <span
        aria-hidden="true"
        className="absolute -bottom-7 text-[12px] whitespace-nowrap text-fg-subtle opacity-0 group-focus-visible:opacity-100"
      >
        {next ? `Next · ${next.title}` : "Overview"}
      </span>
    </button>
  );
}
