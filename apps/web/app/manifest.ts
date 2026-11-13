import type { MetadataRoute } from "next";

import { SITE } from "@/content/site.ts";

// Generated at build time; required for the static GitHub Pages export.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.brand,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0a1226",
    theme_color: "#0a1226",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/arl-token-200.png", sizes: "200x200", type: "image/png" },
      { src: "/arl-token-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
