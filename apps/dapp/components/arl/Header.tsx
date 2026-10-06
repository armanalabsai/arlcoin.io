"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const NAV = [
  { href: "/", label: "Wallet" },
  { href: "/vesting", label: "Vesting" },
  { href: "/trade", label: "Trade" },
  { href: "/staking", label: "Staking" },
  { href: "/payments", label: "Payments" },
  { href: "/network", label: "Network" },
  { href: "/jobs", label: "Jobs" },
  { href: "/private", label: "Private" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="glass-bar sticky top-0 z-20">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`}
            alt=""
            width={24}
            height={24}
          />
          <span>ARL App</span>
        </Link>
        <nav className="ml-2 hidden gap-1 sm:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`btn btn-sm ${pathname === item.href ? "btn-glass text-primary" : "btn-ghost text-muted"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <RainbowKitCustomConnectButton />
        </div>
      </div>
      <nav
        className="flex overflow-x-auto border-t border-line sm:hidden"
        aria-label="Main (mobile)"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={`shrink-0 grow px-3 py-2 text-center text-sm ${pathname === item.href ? "text-primary" : "text-muted"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
