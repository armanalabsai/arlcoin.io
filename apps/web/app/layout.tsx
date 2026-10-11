import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";

import { SITE } from "@/content/site.ts";
import { NucleusField } from "@/core/NucleusField.tsx";
import { BackgroundMusic } from "@/site/BackgroundMusic.tsx";
import { InfrastructureStrip } from "@/site/InfrastructureStrip.tsx";
import { SoftNavigation } from "@/site/SoftNavigation.tsx";

import "./globals.css";

const AUDIO_UNLOCK = `(function(){try{if(localStorage.getItem("arl-music")==="off")return}catch(e){}
var E=["pointerdown","touchend","click","keydown"];function go(){var C=window.AudioContext||window.webkitAudioContext;if(!C)return;
var c=window.__arlAudio||(window.__arlAudio=new C());c.resume().then(function(){if(c.state!=="running")return;
E.forEach(function(e){removeEventListener(e,go,true)});dispatchEvent(new Event("arl-audio-unlocked"))})}
E.forEach(function(e){addEventListener(e,go,true)})})();`;

export const metadata: Metadata = {
  // Google Search Console ownership of https://arlcoin.io/ (added 2026-10-05).
  verification: { google: "LLHEGdS5Ee4XR_Cn93c2NcdIwcAG5zJM3IZtCFuxeJg" },
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: "ARL · Interactive Core",
  description: SITE.description,
  openGraph: { type: "website", siteName: SITE.name, locale: "en_US" },
  twitter: { card: "summary_large_image", site: "@armanalabsai", creator: "@armanalabsai" },
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
      <head>
        {/* Unlocks audio on the very first click, tap or key press, before the page has
            hydrated, so that gesture is never lost; music.ts then plays through this context. */}
        <script dangerouslySetInnerHTML={{ __html: AUDIO_UNLOCK }} />
      </head>
      <body>
        <NucleusField />
        {children}
        <InfrastructureStrip />
        <BackgroundMusic />
        <SoftNavigation />
        {/* Cookieless page counts; on only for the Vercel deployment, where the script is served. */}
        {process.env.NEXT_PUBLIC_ARL_ANALYTICS === "1" ? <Analytics /> : null}
      </body>
    </html>
  );
}
