import "@fontsource-variable/manrope";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/500.css";
import type { Metadata, Viewport } from "next";

import { SITE } from "@/content/site.ts";
import { NucleusField } from "@/core/NucleusField.tsx";
import { InfrastructureStrip } from "@/site/InfrastructureStrip.tsx";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: "ARL · Interactive Core",
  description: SITE.description,
  openGraph: { type: "website", siteName: SITE.name, locale: "en_US" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
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
        <InfrastructureStrip />
      </body>
    </html>
  );
}
