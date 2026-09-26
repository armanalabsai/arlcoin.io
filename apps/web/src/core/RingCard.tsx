"use client";

import type { Metric, Status, Weight } from "@/content/types.ts";

import { isPlainClick } from "./useCoreRoute.ts";

export interface RingEntry {
  key: string;
  href: string;
  title: string;
  description: string;
  weight: Weight;
  status?: Status;
  metric?: Metric;
  /** Present for person cards: open seats are marked as such. */
  open?: boolean;
}

interface Props {
  entry: RingEntry;
  selected: boolean;
  onActivate: (entry: RingEntry, element: HTMLElement) => void;
}

const SIZE: Record<Weight, string> = {
  primary: "min-[1100px]:w-[248px] min-[1100px]:min-h-[132px]",
  secondary: "min-[1100px]:w-[212px] min-[1100px]:min-h-[116px]",
  tertiary: "min-[1100px]:w-[188px] min-[1100px]:min-h-[100px]",
};

export function MetricValue({ metric, size }: { metric: Metric; size: "card" | "surface" }) {
  const big = size === "surface";
  if (metric.kind === "unavailable") {
    return (
      <span
        className={
          big
            ? "font-mono text-[15px] tracking-[0.02em] text-fg-muted"
            : "font-mono text-[11px] tracking-[0.04em] text-fg-subtle"
        }
      >
        {metric.label}
      </span>
    );
  }
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={
          big
            ? "font-mono text-[40px] leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[52px]"
            : "font-mono text-[18px] leading-none font-medium tracking-[-0.02em] tabular-nums"
        }
      >
        {metric.value}
      </span>
      {metric.unit ? (
        <span
          className={
            big ? "text-[15px] text-fg-muted" : "text-[11px] tracking-[0.02em] text-fg-subtle"
          }
        >
          {metric.unit}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A card in the ring. It is a real link to its own URL, so it can be opened in
 * a new tab and crawled; a plain click is handled in place instead.
 */
export function RingCard({ entry, selected, onActivate }: Props) {
  const primary = entry.weight === "primary";
  return (
    <a
      href={entry.href}
      data-ring-card={entry.key}
      aria-current={selected ? "true" : undefined}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        onActivate(entry, e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onActivate(entry, e.currentTarget);
        }
      }}
      className={`group flex h-full w-full flex-col justify-between gap-4 rounded-(--radius-card) border p-4 transition-[border-color,background-color,translate] duration-200 ease-(--ease-out-quint) hover:-translate-y-px active:translate-y-0 active:scale-[0.99] ${
        selected
          ? "border-accent bg-surface-2"
          : "border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2"
      } ${SIZE[entry.weight]}`}
    >
      <span className="flex flex-col gap-1.5">
        <span className="flex items-start justify-between gap-3">
          <span
            className={`leading-tight font-medium tracking-[-0.01em] ${primary ? "text-[17px]" : "text-[15px]"}`}
          >
            {entry.title}
          </span>
          {entry.open ? (
            <span className="shrink-0 rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-fg-subtle uppercase">
              Open
            </span>
          ) : null}
        </span>
        <span className="text-[13px] leading-snug text-fg-muted">{entry.description}</span>
      </span>
      {entry.metric ? <MetricValue metric={entry.metric} size="card" /> : null}
    </a>
  );
}
