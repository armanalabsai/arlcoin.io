import type { MetadataRoute } from "next";

import { SITE } from "@/content/site.ts";

// Generated at build time; required for the static GitHub Pages export.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ARL Protocol",
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#050b1e",
    theme_color: "#050b1e",
    lang: "en",
    categories: ["finance", "utilities", "developer tools"],
    icons: [
      { src: "/arl-token-200.png", sizes: "200x200", type: "image/png" },
      { src: "/arl-token-512.png", sizes: "512x512", type: "image/png" },
      { src: "/arl-token.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
