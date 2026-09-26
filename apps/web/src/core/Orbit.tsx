"use client";

import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

import { FADE_FAST, INSTANT, SPRING_ORBIT, STAGGER } from "./motion.ts";
import { RingCard, type RingEntry } from "./RingCard.tsx";

interface Props {
  /** Changes when the layer changes; cards of the old layer collapse into the Core first. */
  ringKey: string;
  label: string;
  entries: readonly RingEntry[];
  selectedKey: string | null;
  core: ReactNode;
  caption: ReactNode;
  onActivate: (entry: RingEntry, element: HTMLElement) => void;
}

/** Matches the CSS breakpoints in globals.css. */
export const DENSE_FROM = 11;
const ORBIT_QUERY = "(min-width: 1100px) and (min-height: 760px) and (pointer: fine)";
const DENSE_ORBIT_QUERY = "(min-width: 1360px) and (min-height: 820px) and (pointer: fine)";
const PARALLAX_PX = 6;

/**
 * One animation engine for every layer. On wide screens cards sit on an
 * ellipse around the Core (positions are pure CSS, see globals.css); on narrow
 * screens the same list flows as a grid below it. Switching layers collapses
 * the current cards into the Core and expands the next set from it.
 */
export function Orbit({ ringKey, label, entries, selectedKey, core, caption, onActivate }: Props) {
  const reduce = useReducedMotion() ?? false;
  const dense = entries.length >= DENSE_FROM;
  const stageRef = useRef<HTMLDivElement>(null);

  // Pointer parallax: motion values only, no React state per frame.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 120, damping: 24 });
  const y = useSpring(py, { stiffness: 120, damping: 24 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reduce) return;
    const query = window.matchMedia(dense ? DENSE_ORBIT_QUERY : ORBIT_QUERY);
    let rect: DOMRect | null = null;

    const onMove = (e: PointerEvent) => {
      if (!query.matches) return;
      rect ??= stage.getBoundingClientRect();
      px.set(((e.clientX - rect.left) / rect.width - 0.5) * -2 * PARALLAX_PX);
      py.set(((e.clientY - rect.top) / rect.height - 0.5) * -2 * PARALLAX_PX);
    };
    const onLeave = () => {
      px.set(0);
      py.set(0);
    };
    const invalidate = () => {
      rect = null;
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(stage);
    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", invalidate, { passive: true });
    return () => {
      observer.disconnect();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", invalidate);
    };
  }, [px, py, reduce, dense]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-ring-card]"));
    const index = cards.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    e.preventDefault();
    const last = cards.length - 1;
    const target =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? last
          : e.key === "ArrowRight" || e.key === "ArrowDown"
            ? (index + 1) % cards.length
            : (index - 1 + cards.length) % cards.length;
    cards[target]?.focus();
  };

  const count = entries.length;

  return (
    <div ref={stageRef} className="orbit-stage" data-dense={dense ? "" : undefined}>
      <div aria-hidden="true" className="orbit-ring" />
      <div className="orbit-core z-10 flex flex-col items-center gap-10">
        {core}
        <div className="orbit-caption">{caption}</div>
      </div>
      <motion.div style={{ x, y }} className="orbit-layer">
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul
            key={ringKey}
            aria-label={label}
            onKeyDown={onKeyDown}
            className="orbit-list"
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={{
              expanded: { transition: { staggerChildren: reduce ? 0 : STAGGER } },
              collapsed: {
                transition: { when: "afterChildren", staggerChildren: 0, staggerDirection: -1 },
              },
            }}
          >
            {entries.map((entry, i) => {
              // Odd counts start at the top; even counts are rotated half a step
              // so that no card sits directly above or below the Core, where
              // the caption is.
              const offset = count % 2 === 0 ? 0.5 : 0;
              const angle = -Math.PI / 2 + ((i + offset) / count) * Math.PI * 2;
              return (
                <motion.li
                  key={entry.key}
                  className={`orbit-item ${entry.weight === "primary" ? "sm:col-span-2" : ""}`}
                  style={
                    {
                      "--cos": Math.cos(angle).toFixed(4),
                      "--sin": Math.sin(angle).toFixed(4),
                    } as React.CSSProperties
                  }
                  variants={{
                    expanded: {
                      "--t": 1,
                      opacity: 1,
                      transition: reduce ? FADE_FAST : SPRING_ORBIT,
                    },
                    collapsed: {
                      "--t": 0,
                      opacity: 0,
                      transition: reduce ? INSTANT : { duration: 0.18, ease: [0.4, 0, 1, 1] },
                    },
                  }}
                >
                  <RingCard
                    entry={entry}
                    selected={entry.key === selectedKey}
                    onActivate={onActivate}
                  />
                </motion.li>
              );
            })}
          </motion.ul>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
