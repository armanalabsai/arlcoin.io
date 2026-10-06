"use client";

// Adapted from Scaffold-ETH 2 (MIT, BuidlGuidl): components/ScaffoldEthAppWithProviders.tsx.
// ARL: one dark theme, no progress bar, ARL header and footer.
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";

import { Footer } from "~~/components/arl/Footer";
import { Header } from "~~/components/arl/Header";
import { NucleusField } from "~~/components/arl/NucleusField";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const base = darkTheme({
  accentColor: "#9fd8ff",
  accentColorForeground: "#050b1e",
  overlayBlur: "small",
});
// The wallet sheet is glass too: translucent over a blurred, dimmed page.
const theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: "rgba(10, 20, 48, 0.82)",
    modalBorder: "rgba(255, 255, 255, 0.14)",
  },
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider avatar={BlockieAvatar} theme={theme}>
          <NucleusField />
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
            <Footer />
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgba(10, 20, 48, 0.85)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#f5f7fa",
              },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
