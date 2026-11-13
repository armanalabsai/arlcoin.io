import "@fontsource-variable/inter";
import "@fontsource/source-code-pro/400.css";
import "@rainbow-me/rainbowkit/styles.css";
import "~~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Providers } from "~~/components/Providers";

export const metadata: Metadata = {
  title: "ARL App",
  description:
    process.env.NEXT_PUBLIC_ARL_CHAIN === "8453"
      ? "ARL wallet, trading, vesting, staking and AI jobs with a verified evaluator on Base Mainnet."
      : "ARL wallet, vesting and staking. Local test chain.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a1226" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="arl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
