"use client";

import { LAYERS, nextLayer } from "@/content/registry.ts";
import type { Layer } from "@/content/types.ts";

interface Props {
  layer: Layer | null;
  onActivate: () => void;
}

const RING = 108; // radius of the layer ring, in SVG units (viewBox 240)
const GAP = 0.05; // radians between segments

function arc(index: number, count: number): string {
  const span = (Math.PI * 2) / count;
  const start = -Math.PI / 2 + index * span + GAP / 2;
  const end = start + span - GAP;
  const x1 = 120 + RING * Math.cos(start);
  const y1 = 120 + RING * Math.sin(start);
  const x2 = 120 + RING * Math.cos(end);
  const y2 = 120 + RING * Math.sin(end);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RING} ${RING} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * The anchor of every view. The ring shows where the current layer sits in
 * the cycle; activating the Core moves to the next layer (home follows the
 * last one).
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
      className="core-surface group relative grid size-[184px] shrink-0 place-items-center rounded-full border border-line-strong transition-[transform,border-color] duration-200 ease-(--ease-out-quint) hover:border-accent-edge active:scale-[0.97] min-[1100px]:size-[216px] min-[1100px]:[@media(max-height:899px)]:size-[184px]"
    >
      <svg
        viewBox="0 0 240 240"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      >
        {LAYERS.map((l, i) => (
          <path
            key={l.id}
            d={arc(i, LAYERS.length)}
            fill="none"
            strokeWidth={i === index ? 3 : 1.5}
            strokeLinecap="round"
            className={
              i === index
                ? "stroke-accent transition-[stroke] duration-300"
                : "stroke-line-strong transition-[stroke] duration-300"
            }
          />
        ))}
      </svg>
      <span className="flex flex-col items-center gap-2">
        <span className="text-[44px] leading-none font-semibold tracking-[-0.04em] min-[1100px]:text-[52px] min-[1100px]:[@media(max-height:899px)]:text-[44px]">
          ARL
        </span>
        <span className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase">
          {layer ? layer.title : "Core"}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="absolute -bottom-7 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap text-fg-subtle uppercase opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {next ? `Next · ${next.title}` : "Overview"}
      </span>
    </button>
  );
}
