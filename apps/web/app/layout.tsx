import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/source-serif-4";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/500.css";
import type { Metadata, Viewport } from "next";

import { SITE } from "@/content/site.ts";
import { NucleusField } from "@/core/NucleusField.tsx";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: "ARL · Interactive Core",
  description: SITE.description,
  openGraph: { type: "website", siteName: SITE.name, locale: "en_US" },
  twitter: { card: "summary_large_image" },
  keywords: [
    "ARL",
    "ARL token",
    "ARL Protocol",
    "Base",
    "AI compute token",
    "x402 payments",
    "ERC-8004",
    "ERC-8183",
    "utility token",
  ],
  category: "technology",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  themeColor: "#050b1e",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NucleusField />
        {children}
      </body>
    </html>
  );
}
