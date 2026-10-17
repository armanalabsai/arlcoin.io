import { SITE } from "./site.ts";

// Structured data shared by every page (schema.org JSON-LD). Only facts that are stated
// elsewhere on the site: names, the domain, the official channels and the source code.

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;

/** The project behind arlcoin.io, with its official channels as `sameAs`. */
export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE.brand,
  alternateName: ["ARL", "ARL token", "arlcoin"],
  url: SITE.url,
  logo: { "@type": "ImageObject", url: `${SITE.url}/arl-token-512.png`, width: 512, height: 512 },
  email: SITE.email,
  sameAs: [SITE.social.x, SITE.social.telegram, SITE.repository],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: SITE.email,
    url: `${SITE.url}/contact/`,
    availableLanguage: ["English"],
  },
} as const;

/** The site itself, published by the organization. */
export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": SITE_ID,
  name: SITE.brand,
  alternateName: SITE.name,
  url: SITE.url,
  description: SITE.description,
  inLanguage: "en",
  publisher: { "@id": ORG_ID },
} as const;

/** Breadcrumbs for a page below the home page: `[name, path]` pairs, home first implied. */
export function breadcrumbJsonLd(trail: readonly (readonly [string, string])[]) {
  const items = [["Home", "/"] as const, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: new URL(path.endsWith("/") ? path : `${path}/`, SITE.url).toString(),
    })),
  };
}
