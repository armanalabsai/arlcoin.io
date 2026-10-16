import type { MetadataRoute } from "next";

import { DOCS, docPath } from "@/content/docs.ts";
import { allPaths } from "@/content/registry.ts";
import { SITE, SITE_PAGES } from "@/content/site.ts";

// Generated at build time; required for the static GitHub Pages export.
export const dynamic = "force-static";

// No lastModified: the site does not know when content last changed, and a
// made-up date would be wrong. Every URL ends in a slash, as served (trailingSlash) and as in
// each page's canonical link, so search engines are never sent through a redirect.
const withSlash = (path: string) => (path.endsWith("/") ? path : `${path}/`);

// Crawl hints: the home page and the launch pages first, legal pages last.
const PRIORITY: Record<string, number> = { "/": 1, "/buy": 0.9, "/whitelist": 0.9, "/faq": 0.8 };
const LOW = new Set(["/privacy", "/terms"]);

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...allPaths(), ...SITE_PAGES, ...DOCS.map((d) => docPath(d.slug))].map((path) => ({
    url: new URL(withSlash(path), SITE.url).toString(),
    changeFrequency:
      path === "/" || path === "/buy" ? "daily" : LOW.has(path) ? "yearly" : "weekly",
    priority: PRIORITY[path] ?? (LOW.has(path) ? 0.3 : path.startsWith("/docs") ? 0.6 : 0.7),
  }));
}
