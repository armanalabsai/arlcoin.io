import type { MetadataRoute } from "next";

import { allPaths } from "@/content/registry.ts";
import { SITE } from "@/content/site.ts";

// No lastModified: the site does not know when content last changed, and a
// made-up date would be wrong.
export default function sitemap(): MetadataRoute.Sitemap {
  return allPaths().map((path) => ({ url: new URL(path, SITE.url).toString() }));
}
