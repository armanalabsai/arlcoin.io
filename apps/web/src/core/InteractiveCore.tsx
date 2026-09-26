"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { LAYERS, nextLayer, pathFor } from "@/content/registry.ts";
import { SITE } from "@/content/site.ts";

import { CoreCard } from "./CoreCard.tsx";
import { CoreNavigation } from "./CoreNavigation.tsx";
import { DetailSurface } from "./DetailSurface.tsx";
import { Orbit } from "./Orbit.tsx";
import { ProtocolIndex } from "./ProtocolIndex.tsx";
import type { RingEntry } from "./RingCard.tsx";
import { isPlainClick, useCoreRoute } from "./useCoreRoute.ts";

/**
 * The ARL Interactive Core. One component renders every view: the overview
 * (the layers around the Core), a layer (its cards around the Core) and a
 * card's detail surface. What is shown is derived from the URL alone.
 */
export function InteractiveCore() {
  const { route, navigate, openCard, closeCard } = useCoreRoute();
  const { layer, card } = route;
  const origin = useRef<DOMRect | null>(null);

  const entries: RingEntry[] = useMemo(() => {
    if (!layer) {
      return LAYERS.map((l) => ({
        key: l.id,
        href: pathFor(l.id),
        title: l.title,
        description: l.description,
        weight: "secondary",
      }));
    }
    return layer.cards.map((c) => ({
      key: c.id,
      href: pathFor(layer.id, c.id),
      title: c.title,
      description: c.shortDescription,
      weight: c.weight,
      ...(c.status ? { status: c.status } : {}),
      ...(c.metric ? { metric: c.metric } : {}),
      ...(c.person ? { open: c.person.open } : {}),
    }));
  }, [layer]);

  const onActivate = useCallback(
    (entry: RingEntry, element: HTMLElement) => {
      if (!layer) {
        navigate(pathFor(entry.key));
        return;
      }
      origin.current = element.getBoundingClientRect();
      openCard(layer.id, entry.key);
    },
    [layer, navigate, openCard],
  );

  const onCore = useCallback(() => {
    navigate(pathFor(nextLayer(layer)?.id));
  }, [layer, navigate]);

  const onIndex = useCallback(
    (layerId: string, cardId?: string) => {
      origin.current = null;
      if (cardId) openCard(layerId, cardId);
      else navigate(pathFor(layerId));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [navigate, openCard],
  );

  // Escape on a layer returns to the overview. On a detail surface the
  // dialog handles Escape itself.
  useEffect(() => {
    if (!layer || card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      navigate("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layer, card, navigate]);

  const takeOrigin = useCallback(() => {
    const rect = origin.current;
    origin.current = null;
    return rect;
  }, []);

  const heading = layer ? `${layer.title} layer` : "ARL overview";

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#core"
        className="sr-only-focusable fixed top-2 left-2 z-[60] rounded-(--radius-control) bg-surface-3 px-3 py-2 text-[13px]"
      >
        Skip to the Core
      </a>

      <header className="material-bar sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-8">
          <Link
            href="/"
            prefetch={false}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              navigate("/");
            }}
            className="text-[17px] font-semibold tracking-[-0.03em]"
            aria-label="ARL overview"
          >
            ARL
          </Link>
          <CoreNavigation
            current={layer}
            onSelect={(id) => navigate(pathFor(id))}
            className="hidden md:block"
          />
          <a
            href={SITE.repository}
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-(--radius-control) border border-line-strong px-3 text-[13px] text-fg-muted transition-colors hover:border-[rgb(255_255_255/0.28)] hover:text-fg"
          >
            GitHub
          </a>
        </div>
      </header>

      <main id="core" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <h1 className="sr-only">{heading}</h1>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {layer ? `${layer.title} layer, ${layer.cards.length} cards.` : "Overview."}
        </p>
        <Orbit
          ringKey={layer?.id ?? "home"}
          label={layer ? `${layer.title} cards` : "Layers"}
          entries={entries}
          selectedKey={card?.id ?? null}
          onActivate={onActivate}
          core={<CoreCard layer={layer} onActivate={onCore} />}
          caption={
            <div className="flex max-w-[340px] flex-col items-center gap-5 text-center">
              <p className="text-[15px] leading-[1.55] text-balance text-fg-muted">
                {layer ? layer.description : SITE.description}
              </p>
              {layer ? (
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="inline-flex h-8 items-center gap-2 rounded-(--radius-control) px-2 text-[13px] text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
                >
                  <span aria-hidden="true">←</span> Overview
                </button>
              ) : null}
              {layer ? (
                <CoreNavigation
                  current={layer}
                  onSelect={(id) => navigate(pathFor(id))}
                  className="md:hidden"
                />
              ) : null}
            </div>
          }
        />
      </main>

      <ProtocolIndex onOpen={onIndex} />

      <DetailSurface
        layer={layer}
        card={card}
        originRect={takeOrigin}
        onClose={closeCard}
        onStep={(id) => {
          if (layer) navigate(pathFor(layer.id, id), { replace: true });
        }}
      />
    </div>
  );
}
