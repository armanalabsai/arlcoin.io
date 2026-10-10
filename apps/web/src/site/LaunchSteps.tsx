import Link from "next/link";

import { PUBLIC_LAUNCH } from "../../../../packages/tokenomics/src/index.ts";
import { SITE } from "@/content/site.ts";
import { AddToWallet } from "@/site/AddToWallet.tsx";
import { Reveal } from "@/site/Reveal.tsx";

/** The app's Claim screen, published next to the site under /app. */
export const CLAIM_APP_PATH = "/app/claim/";

const tge = new Date(`${SITE.tgeTarget}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const live = SITE.mainnet.token !== null;
const fromTge = live ? "Open" : `From ${tge}`;

interface Step {
  n: string;
  title: string;
  when: string;
  body: string;
  action: React.ReactNode;
}

const link =
  "inline-flex min-h-11 items-center text-[15px] font-semibold text-accent hover:underline";

const STEPS: Step[] = [
  {
    n: "1",
    title: "Join the whitelist",
    when: "Open now",
    body: "Register an EVM wallet address. It is free, and no payment is ever requested.",
    action: (
      <Link href="/whitelist" prefetch={false} className={link}>
        Register ›
      </Link>
    ),
  },
  {
    n: "2",
    title: "Claim free ARL",
    when: fromTge,
    body: `Whitelisted addresses claim up to ${PUBLIC_LAUNCH.maxPerAddress.toLocaleString("en-US")} ARL each, ${PUBLIC_LAUNCH.tgeTranche.toLocaleString("en-US")} ARL in total, for ${String(PUBLIC_LAUNCH.claimWindowDays)} days. You pay only network gas.`,
    action: (
      <a href={CLAIM_APP_PATH} className={link}>
        Open the claim ›
      </a>
    ),
  },
  {
    n: "3",
    title: "Buy on Uniswap",
    when: fromTge,
    body: "ARL/USDC, ARL/USDT, ARL/ETH and ARL/BTC pools on Uniswap on Base, from 0.20 USD per ARL. Check the contract address first.",
    action: (
      <Link href="/buy" prefetch={false} className={link}>
        How to get ARL ›
      </Link>
    ),
  },
  {
    n: "4",
    title: "Add ARL to MetaMask",
    when: live ? "Open" : "After launch",
    body: live
      ? "Add the official Base token to MetaMask or any wallet that supports it in one step."
      : "One step once the official Base Mainnet address is published here. Until then, no token on Base Mainnet is ARL.",
    action: live ? <AddToWallet /> : null,
  },
];

/** The launch route on the landing page: whitelist, claim, buy and add to a wallet. */
export function LaunchSteps() {
  return (
    <div className="mt-12 grid grid-cols-1 gap-4 text-left min-[480px]:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <Reveal key={s.n} delay={i * 80} className="glass flex h-full flex-col rounded-[22px] p-6">
          <span className="flex items-center justify-between gap-3">
            <span className="font-mono text-[13px] font-semibold text-accent">{s.n}</span>
            <span
              data-testid={`launch-when-${s.n}`}
              className="glass-pill inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold text-fg"
            >
              {s.when}
            </span>
          </span>
          <span className="mt-3 block text-[17px] font-bold text-heading">{s.title}</span>
          <span className="mt-2 block flex-1 text-[15px] leading-[1.5] text-fg-muted">
            {s.body}
          </span>
          {s.action ? <span className="mt-3 block">{s.action}</span> : null}
        </Reveal>
      ))}
    </div>
  );
}
