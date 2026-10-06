import type { MetadataRoute } from "next";

import { SITE } from "@/content/site.ts";

// Generated at build time; required for the static GitHub Pages export.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", SITE.url).toString(),
  };
}
