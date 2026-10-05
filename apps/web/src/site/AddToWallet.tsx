"use client";

import { useState } from "react";

import { SITE } from "@/content/site.ts";

type Eip1193 = { request: (args: { method: string; params?: unknown }) => Promise<unknown> };

/**
 * "Add ARL to your wallet" (EIP-747 `wallet_watchAsset`). Renders nothing until the Base Mainnet
 * token address is set in `SITE.mainnet.token`, so no address is shown before it exists.
 */
export function AddToWallet({ className = "" }: { className?: string }) {
  const [note, setNote] = useState("");
  const token = SITE.mainnet.token;
  if (!token) return null;

  async function add() {
    const ethereum = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!ethereum) {
      setNote(`No wallet found. Add the token by address: ${token}`);
      return;
    }
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x2105" }],
      });
      const added = await ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: token,
            symbol: "ARL",
            decimals: 18,
            image: `${SITE.url}/arl-token-200.png`,
          },
        },
      });
      setNote(added ? "ARL added to your wallet on Base." : "Not added.");
    } catch {
      setNote(`Not added. You can add it by address on Base: ${token}`);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void add()}
        className="glass-pill inline-flex h-12 items-center rounded-full px-6 text-[17px] font-semibold text-fg"
      >
        Add ARL to your wallet
      </button>
      {note ? (
        <p role="status" className="mt-2 text-[13px] break-all text-fg-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}
