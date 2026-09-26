import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { descriptionFor, titleFor } from "@/content/meta.ts";
import { LAYERS, getLayer, pathFor } from "@/content/registry.ts";

export const dynamicParams = false;

export function generateStaticParams() {
  return LAYERS.map((l) => ({ layer: l.id }));
}

export async function generateMetadata({ params }: PageProps<"/core/[layer]">): Promise<Metadata> {
  const { layer: id } = await params;
  const layer = getLayer(id);
  if (!layer) notFound();
  const route = { layer, card: null };
  const path = pathFor(layer.id);
  return {
    title: titleFor(route),
    description: descriptionFor(route),
    alternates: { canonical: path },
    openGraph: { title: titleFor(route), description: descriptionFor(route), url: path },
  };
}

export default async function LayerPage({ params }: PageProps<"/core/[layer]">) {
  const { layer } = await params;
  if (!getLayer(layer)) notFound();
  return null;
}
