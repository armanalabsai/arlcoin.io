"use client";

import { LAYERS, pathFor } from "@/content/registry.ts";
import type { Layer } from "@/content/types.ts";

import { withBase } from "./basePath.ts";
import { isPlainClick } from "./useCoreRoute.ts";

interface Props {
  current: Layer | null;
  onSelect: (layerId: string) => void;
  className?: string;
}

/** Direct access to every layer, for pointer, keyboard and screen reader users alike. */
export function CoreNavigation({ current, onSelect, className = "" }: Props) {
  return (
    <nav aria-label="Layers" className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        {LAYERS.map((l) => {
          const active = current?.id === l.id;
          return (
            <li key={l.id}>
              <a
                href={withBase(pathFor(l.id))}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  if (!isPlainClick(e)) return;
                  e.preventDefault();
                  onSelect(l.id);
                }}
                className={`inline-flex h-8 items-center rounded-(--radius-control) px-3 text-[13px] transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:bg-surface-3 hover:text-fg"
                }`}
              >
                {l.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
