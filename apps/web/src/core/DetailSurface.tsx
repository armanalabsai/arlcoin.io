"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  usePresence,
  useReducedMotion,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Card, Layer } from "@/content/types.ts";

import { FADE_FAST, SPRING_SHEET, SPRING_SURFACE } from "./motion.ts";
import { IdentityMark, MetricValue } from "./RingCard.tsx";

interface Props {
  layer: Layer | null;
  card: Card | null;
  /** Where the surface comes from: the card that was activated, if any. */
  originRect: () => DOMRect | null;
  onClose: () => void;
  onStep: (cardId: string) => void;
}

const SHEET_QUERY = "(max-width: 767px)";

/**
 * The immersive detail view. It opens inside the current screen, grows out of
 * the card that was selected and returns into it when closed. On small
 * screens it is a full-height sheet that can be dragged down to close.
 *
 * Radix Dialog provides the dialog semantics, focus trap, Escape handling and
 * scroll lock. It is rendered without a portal so a deep link's content is in
 * the server-rendered HTML.
 */
export function DetailSurface({ layer, card, originRect, onClose, onStep }: Props) {
  const open = layer !== null && card !== null;
  // Keep the last opened card so the surface can finish its exit animation
  // after the route has already changed (React's "previous props" pattern).
  const [shown, setShown] = useState<{ layer: Layer; card: Card } | null>(
    open ? { layer, card } : null,
  );
  if (open && (shown?.layer !== layer || shown.card !== card)) setShown({ layer, card });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AnimatePresence>
        {open && shown ? (
          <Surface
            key="surface"
            layer={shown.layer}
            card={shown.card}
            originRect={originRect}
            onClose={onClose}
            onStep={onStep}
          />
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

interface SurfaceProps {
  layer: Layer;
  card: Card;
  originRect: () => DOMRect | null;
  onClose: () => void;
  onStep: (cardId: string) => void;
}

function Surface({ layer, card, originRect, onClose, onStep }: SurfaceProps) {
  const [isPresent, safeToRemove] = usePresence();
  const reduce = useReducedMotion() ?? false;
  const [sheet, setSheet] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);
  const opacity = useMotionValue(1);
  const contentOpacity = useMotionValue(1);
  const overlay = useMotionValue(1);

  const index = layer.cards.findIndex((c) => c.id === card.id);
  const prev = layer.cards[index - 1];
  const next = layer.cards[index + 1];

  // Enter: runs before paint so the first frame is already the start state.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const isSheet = window.matchMedia(SHEET_QUERY).matches;
    setSheet(isSheet);
    const run: Array<{ stop: () => void }> = [];

    run.push(animate(overlay, [0, 1], FADE_FAST));
    if (reduce) {
      run.push(animate(opacity, [0, 1], FADE_FAST));
    } else if (isSheet) {
      const h = panel.getBoundingClientRect().height;
      run.push(animate(y, [h, 0], SPRING_SHEET));
    } else {
      const from = originRect();
      const to = panel.getBoundingClientRect();
      if (from && to.width > 0 && to.height > 0) {
        x.set(from.left + from.width / 2 - (to.left + to.width / 2));
        y.set(from.top + from.height / 2 - (to.top + to.height / 2));
        scaleX.set(from.width / to.width);
        scaleY.set(from.height / to.height);
        contentOpacity.set(0);
        run.push(animate(x, 0, SPRING_SURFACE));
        run.push(animate(y, 0, SPRING_SURFACE));
        run.push(animate(scaleX, 1, SPRING_SURFACE));
        run.push(animate(scaleY, 1, SPRING_SURFACE));
        run.push(animate(contentOpacity, 1, { duration: 0.22, delay: 0.1 }));
      } else {
        run.push(animate(opacity, [0, 1], FADE_FAST));
        run.push(animate(scaleX, [0.98, 1], SPRING_SURFACE));
        run.push(animate(scaleY, [0.98, 1], SPRING_SURFACE));
      }
    }
    return () => run.forEach((a) => a.stop());
    // Enter runs once per opening; later card changes cross-fade the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exit: return into the card, slide the sheet down, or fade.
  useEffect(() => {
    if (isPresent) return;
    const panel = panelRef.current;
    const done = () => safeToRemove();
    if (!panel || reduce) {
      animate(overlay, 0, FADE_FAST);
      void animate(opacity, 0, FADE_FAST).then(done);
      return;
    }
    animate(overlay, 0, { duration: 0.2 });
    if (sheet) {
      void animate(y, panel.getBoundingClientRect().height, SPRING_SHEET).then(done);
      return;
    }
    const target = document.querySelector<HTMLElement>(`[data-ring-card="${CSS.escape(card.id)}"]`);
    const from = target?.getBoundingClientRect();
    const to = panel.getBoundingClientRect();
    if (from && from.width > 0 && to.width > 0) {
      animate(contentOpacity, 0, { duration: 0.1 });
      animate(x, from.left + from.width / 2 - (to.left + to.width / 2), SPRING_SURFACE);
      animate(y, from.top + from.height / 2 - (to.top + to.height / 2), SPRING_SURFACE);
      animate(scaleX, from.width / to.width, SPRING_SURFACE);
      void animate(scaleY, from.height / to.height, SPRING_SURFACE).then(done);
      animate(opacity, 0, { duration: 0.18, delay: 0.14 });
    } else {
      void animate(opacity, 0, FADE_FAST).then(done);
    }
  }, [
    isPresent,
    safeToRemove,
    reduce,
    sheet,
    card.id,
    overlay,
    opacity,
    y,
    x,
    scaleX,
    scaleY,
    contentOpacity,
  ]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "ArrowRight" && next) onStep(next.id);
    if (e.key === "ArrowLeft" && prev) onStep(prev.id);
  };

  return (
    <>
      <Dialog.Overlay forceMount asChild>
        <motion.div
          style={{ opacity: overlay }}
          className="fixed inset-0 z-40 bg-[rgb(3_7_20/0.62)]"
        />
      </Dialog.Overlay>
      <Dialog.Content
        forceMount
        asChild
        aria-describedby="detail-summary"
        onKeyDown={onKeyDown}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document
            .querySelector<HTMLElement>(`[data-ring-card="${CSS.escape(card.id)}"]`)
            ?.focus({ preventScroll: true });
        }}
      >
        <motion.div
          ref={panelRef}
          data-testid="detail-surface"
          style={{ x, y, scaleX, scaleY, opacity }}
          drag={sheet && !reduce ? "y" : false}
          dragListener={false}
          dragControls={drag}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.9 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 700) onClose();
          }}
          className="material-surface fixed inset-x-0 bottom-0 z-50 flex h-[94dvh] flex-col overflow-hidden rounded-t-(--radius-surface) border border-line-strong outline-none md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-96px)] md:w-[min(760px,calc(100vw-64px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-(--radius-surface)"
        >
          <div
            className="flex touch-none justify-center pt-3 pb-1 md:hidden"
            onPointerDown={(e) => drag.start(e)}
            aria-hidden="true"
          >
            <span className="h-1 w-10 rounded-full bg-line-strong" />
          </div>

          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 md:px-8 md:py-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="-ml-2 inline-flex h-9 items-center gap-2 rounded-(--radius-control) px-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
              >
                <span aria-hidden="true">←</span>
                <span>Back to {layer.title}</span>
              </button>
            </Dialog.Close>
            {card.status ? <StatusBadge status={card.status} /> : null}
          </header>

          <motion.div
            style={{ opacity: contentOpacity }}
            className="flex-1 overflow-y-auto overscroll-contain"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.article
                key={card.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE_FAST}
                className="flex flex-col gap-8 px-5 pt-7 pb-10 md:px-8 md:pt-9"
              >
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] text-fg-subtle">
                    {layer.title} · {String(index + 1).padStart(2, "0")} /{" "}
                    {String(layer.cards.length).padStart(2, "0")}
                  </p>
                  <Dialog.Title className="text-[32px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance md:text-[44px]">
                    {card.title}
                  </Dialog.Title>
                  {card.person ? (
                    <div className="flex items-center gap-4">
                      <IdentityMark initials={card.person.initials} size="surface" />
                      <div className="flex flex-col gap-1">
                        <p className="text-[15px] text-fg">{card.person.role}</p>
                        <p className="text-[12px] text-fg-subtle">
                          {card.person.verificationStatus === "verified"
                            ? "Verified profile"
                            : card.person.verificationStatus === "placeholder"
                              ? "Open role"
                              : "Profile not yet verified"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {card.metric ? (
                  <MetricValue
                    metric={card.metric}
                    size="surface"
                    emphasis={card.weight === "primary"}
                  />
                ) : null}

                <Dialog.Description
                  id="detail-summary"
                  className="max-w-[60ch] text-[17px] leading-[1.6] text-fg"
                >
                  {card.detail.summary}
                </Dialog.Description>

                {card.detail.facts?.length ? (
                  <dl className="grid grid-cols-1 border-t border-line sm:grid-cols-2">
                    {card.detail.facts.map((f) => (
                      <div
                        key={f.label}
                        className="flex flex-col gap-1 border-b border-line py-3 sm:odd:pr-6"
                      >
                        <dt className="text-[12px] tracking-[0.02em] text-fg-subtle">{f.label}</dt>
                        <dd
                          className={
                            f.mono
                              ? "font-mono text-[14px] tabular-nums"
                              : "text-[15px] leading-snug"
                          }
                        >
                          {f.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {card.detail.sections?.map((s) => (
                  <section key={s.heading} className="flex flex-col gap-3">
                    <h3 className="text-[12px] text-fg-subtle">{s.heading}</h3>
                    {s.body ? (
                      <p className="max-w-[60ch] text-[15px] leading-[1.6] text-fg-muted">
                        {s.body}
                      </p>
                    ) : null}
                    {s.items ? (
                      <ul className="flex flex-col gap-2">
                        {s.items.map((item) => (
                          <li
                            key={item}
                            className="flex gap-3 text-[15px] leading-[1.5] text-fg-muted"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[0.7em] h-px w-3 shrink-0 bg-line-strong"
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}

                {card.links?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {card.links.map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-2 rounded-(--radius-control) border border-line-strong px-3 text-[13px] transition-colors hover:border-[rgb(255_255_255/0.28)] hover:bg-surface-3"
                      >
                        {l.label}
                        <span aria-hidden="true" className="text-fg-subtle">
                          ↗
                        </span>
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    ))}
                  </div>
                ) : null}

                {layer.disclaimer ? (
                  <p className="max-w-[60ch] border-t border-line pt-5 text-[12px] leading-[1.6] text-fg-subtle">
                    {layer.disclaimer}
                  </p>
                ) : null}
              </motion.article>
            </AnimatePresence>
          </motion.div>

          <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 md:px-8">
            <StepButton card={prev} direction="previous" onStep={onStep} />
            <StepButton card={next} direction="next" onStep={onStep} />
          </footer>
        </motion.div>
      </Dialog.Content>
    </>
  );
}

function StepButton({
  card,
  direction,
  onStep,
}: {
  card: Card | undefined;
  direction: "previous" | "next";
  onStep: (id: string) => void;
}) {
  if (!card) return <span />;
  const isNext = direction === "next";
  return (
    <button
      type="button"
      onClick={() => onStep(card.id)}
      className={`inline-flex h-9 max-w-[48%] items-center gap-2 rounded-(--radius-control) px-2 text-[13px] text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg ${isNext ? "-mr-2 ml-auto" : "-ml-2"}`}
    >
      {isNext ? null : <span aria-hidden="true">←</span>}
      <span className="truncate">
        <span className="sr-only">{isNext ? "Next: " : "Previous: "}</span>
        {card.title}
      </span>
      {isNext ? <span aria-hidden="true">→</span> : null}
    </button>
  );
}

const STATUS_STYLE: Record<string, string> = {
  PLANNED: "border-line-strong text-fg-muted",
  "IN DEVELOPMENT": "border-accent/40 text-accent",
  LIVE: "border-fg text-fg",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-[4px] border px-2 py-0.5 text-[12px] ${STATUS_STYLE[status] ?? ""}`}>
      {status}
    </span>
  );
}
