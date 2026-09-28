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
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          avatar={BlockieAvatar}
          theme={darkTheme({ accentColor: "#eea53f", accentColorForeground: "#1a1204" })}
        >
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
            <Footer />
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{ style: { background: "#0f1a3b", color: "#f2f2f0" } }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
