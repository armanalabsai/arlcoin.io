import type { Metadata } from "next";

import { descriptionFor, titleFor } from "@/content/meta.ts";
import { HOME, pathFor } from "@/content/registry.ts";
import { OG_IMAGE } from "@/content/site.ts";

export const metadata: Metadata = {
  title: titleFor(HOME),
  description: descriptionFor(HOME),
  alternates: { canonical: pathFor() },
  openGraph: {
    title: titleFor(HOME),
    description: descriptionFor(HOME),
    url: pathFor(),
    images: [OG_IMAGE],
  },
};

// The overview of the Core; the layout renders the Core itself.
export default function CoreOverview() {
  return null;
}
