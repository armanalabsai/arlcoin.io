import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { descriptionFor, titleFor } from "@/content/meta.ts";
import { LAYERS, getCard, getLayer, pathFor } from "@/content/registry.ts";
import { OG_IMAGE } from "@/content/site.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return LAYERS.flatMap((l) => l.cards.map((c) => ({ layer: l.id, card: c.id })));
}

async function resolve(params: PageProps<"/core/[layer]/[card]">["params"]) {
  const { layer: layerId, card: cardId } = await params;
  const layer = getLayer(layerId);
  const card = layer ? getCard(layer, cardId) : undefined;
  if (!layer || !card) notFound();
  return { layer, card };
}

export async function generateMetadata({
  params,
}: PageProps<"/core/[layer]/[card]">): Promise<Metadata> {
  const route = await resolve(params);
  const path = pathFor(route.layer.id, route.card.id);
  return {
    title: titleFor(route),
    description: descriptionFor(route),
    alternates: { canonical: path },
    openGraph: {
      title: titleFor(route),
      description: descriptionFor(route),
      url: path,
      images: [OG_IMAGE],
    },
  };
}

export default async function CardPage({ params }: PageProps<"/core/[layer]/[card]">) {
  await resolve(params);
  return null;
}
