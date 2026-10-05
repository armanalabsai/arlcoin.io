"use client";

import { LAYERS, pathFor } from "@/content/registry.ts";
import { TOKEN_DISCLAIMER } from "@/content/site.ts";
import { FooterLinks } from "@/site/PageShell.tsx";

import { withBase } from "./basePath.ts";
import { isPlainClick } from "./useCoreRoute.ts";

interface Props {
  onOpen: (layerId: string, cardId?: string) => void;
}

/**
 * A plain index of every layer and card. It gives crawlers and keyboard users
 * a linear path through all content, and every link works without JavaScript.
 */
export function ProtocolIndex({ onOpen }: Props) {
  return (
    <footer className="border-t border-line px-4 pt-16 pb-12 sm:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12">
        <h2 className="text-[12px] text-fg-subtle">Index</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          {LAYERS.map((layer) => (
            <section key={layer.id} className="flex flex-col gap-3">
              <h3 className="text-[14px] font-extrabold">
                <a
                  href={withBase(pathFor(layer.id))}
                  onClick={(e) => {
                    if (!isPlainClick(e)) return;
                    e.preventDefault();
                    onOpen(layer.id);
                  }}
                  className="hover:text-accent"
                >
                  {layer.title}
                </a>
              </h3>
              <ul className="flex flex-col gap-2">
                {layer.cards.map((card) => (
                  <li key={card.id}>
                    <a
                      href={withBase(pathFor(layer.id, card.id))}
                      onClick={(e) => {
                        if (!isPlainClick(e)) return;
                        e.preventDefault();
                        onOpen(layer.id, card.id);
                      }}
                      className="text-[13px] leading-snug text-fg-muted hover:text-fg"
                    >
                      {card.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-8 text-[12px] leading-[1.6] text-fg-subtle sm:flex-row sm:justify-between sm:gap-8">
          <p className="max-w-[70ch]">{TOKEN_DISCLAIMER}</p>
          <FooterLinks />
        </div>
      </div>
    </footer>
  );
}
