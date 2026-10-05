import type { Metadata } from "next";

import { descriptionFor, titleFor } from "@/content/meta.ts";
import { HOME } from "@/content/registry.ts";
import { SITE, OG_IMAGE } from "@/content/site.ts";

export const metadata: Metadata = {
  title: titleFor(HOME),
  description: descriptionFor(HOME),
  alternates: { canonical: "/" },
  openGraph: {
    title: titleFor(HOME),
    description: descriptionFor(HOME),
    url: "/",
    images: [OG_IMAGE],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE.url}/#website`,
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      inLanguage: "en",
      publisher: { "@id": `${SITE.url}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE.url}/#organization`,
      name: "ARL Protocol",
      url: SITE.url,
      logo: `${SITE.url}/icon.svg`,
      email: SITE.email,
      sameAs: [SITE.social.instagram, SITE.repository],
    },
  ],
};

export default function Home() {
  return (
    <script
      type="application/ld+json"
      // Static, trusted content; `<` is escaped so the JSON cannot close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}
