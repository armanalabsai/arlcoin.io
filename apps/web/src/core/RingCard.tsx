"use client";

import type { Metric, Status, VerificationStatus, Weight } from "@/content/types.ts";

import { isPlainClick } from "./useCoreRoute.ts";

export interface RingEntry {
  key: string;
  href: string;
  title: string;
  description: string;
  weight: Weight;
  status?: Status;
  metric?: Metric;
  /** Present for person cards. */
  person?: { initials: string; verificationStatus: VerificationStatus };
}

interface Props {
  entry: RingEntry;
  selected: boolean;
  onActivate: (entry: RingEntry, element: HTMLElement) => void;
}

export function MetricValue({
  metric,
  size,
  emphasis = false,
}: {
  metric: Metric;
  size: "card" | "surface";
  /** Important metric: the value is set in the ARL accent. */
  emphasis?: boolean;
}) {
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
        className={`${
          big
            ? "font-mono text-[40px] leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[52px]"
            : "font-mono text-[18px] leading-none font-medium tracking-[-0.02em] tabular-nums"
        } ${emphasis ? "text-accent" : ""}`}
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
 * Abstract identity mark: initials on graphite with an amber edge. Used
 * instead of a portrait whenever no verified photo exists.
 */
export function IdentityMark({ initials, size }: { initials: string; size: "card" | "surface" }) {
  const big = size === "surface";
  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center rounded-full border border-line-strong bg-surface-3 font-mono tracking-[0.04em] text-fg-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] ${
        big ? "size-16 text-[18px]" : "size-10 text-[12px]"
      }`}
    >
      <span className="absolute inset-[-1px] rounded-full border border-transparent border-t-accent-edge" />
      {initials}
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
      data-weight={entry.weight}
      data-selected={selected ? "true" : undefined}
      className={`material-card group flex h-full flex-col justify-between gap-4 rounded-(--radius-card) border p-4 transition-[border-color,background-color,box-shadow,translate] duration-200 ease-(--ease-out-quint) hover:-translate-y-px active:translate-y-0 active:scale-[0.99]`}
    >
      {entry.person ? (
        <>
          <span className="flex items-start gap-3">
            <IdentityMark initials={entry.person.initials} size="card" />
            <span className="flex min-w-0 flex-col gap-1">
              <span
                className={`leading-tight font-medium tracking-[-0.01em] ${primary ? "text-[17px]" : "text-[15px]"}`}
              >
                {entry.title}
              </span>
              <span className="text-[13px] leading-snug text-fg-muted">{entry.description}</span>
            </span>
          </span>
          <span className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-fg-subtle transition-colors group-hover:text-accent">
              Explore <span aria-hidden="true">→</span>
            </span>
            {entry.person.verificationStatus !== "verified" ? (
              <span className="rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em] text-fg-subtle uppercase">
                {entry.person.verificationStatus === "placeholder" ? "Open" : "Unverified"}
              </span>
            ) : null}
          </span>
        </>
      ) : (
        <>
          <span className="flex flex-col gap-1.5">
            <span
              className={`leading-tight font-medium tracking-[-0.01em] ${primary ? "text-[17px]" : "text-[15px]"}`}
            >
              {entry.title}
            </span>
            <span className="text-[13px] leading-snug text-fg-muted">{entry.description}</span>
          </span>
          {entry.metric ? (
            <MetricValue metric={entry.metric} size="card" emphasis={primary} />
          ) : null}
        </>
      )}
    </a>
  );
}
