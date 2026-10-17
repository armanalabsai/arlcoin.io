import Link from "next/link";

import { PUBLIC_LAUNCH } from "../../../../packages/tokenomics/src/index.ts";
import { SITE } from "@/content/site.ts";
import { AddToWallet } from "@/site/AddToWallet.tsx";
import { Reveal } from "@/site/Reveal.tsx";

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
    title: "Follow the official channels",
    when: "Open now",
    body: `There is no airdrop at launch. An airdrop of ${PUBLIC_LAUNCH.tgeTranche.toLocaleString("en-US")} ARL is planned for a later date; its date and rules are announced only on arlcoin.io, X ${SITE.social.xHandle} and Telegram.`,
    action: (
      <a href={SITE.social.telegram} target="_blank" rel="noopener noreferrer" className={link}>
        Join Telegram ›
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

/** The launch route on the landing page: whitelist, channels, buy and add to a wallet. */
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
