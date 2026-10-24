import { IS_LOCAL } from "~~/lib/contracts";

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-6 text-center text-xs text-subtle">
      <p>
        {IS_LOCAL
          ? "Local test chain only. Amounts and schedules on this chain are development values. The ARL token is on Base Mainnet at 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4."
          : "Base Sepolia testnet. Testnet ARL has no value. The ARL token is on Base Mainnet at 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4."}
      </p>
      <p className="mt-2">
        <a className="link" href="https://arlcoin.io">
          arlcoin.io
        </a>
        {" · "}
        <a className="link" href="https://arlcoin.io/terms">
          Terms
        </a>
        {" · "}
        <a className="link" href="https://arlcoin.io/privacy">
          Privacy
        </a>
        {" · "}
        <a className="link" href="https://github.com/armanalabsai/arlcoin.io">
          Source
        </a>
        {" · "}
        <a className="link" href="https://arlcoin.io/docs/security-audit">
          Internal security audit (17 Oct 2026)
        </a>
        {" · "}
        Built on Scaffold-ETH 2 (MIT)
      </p>
    </footer>
  );
}
