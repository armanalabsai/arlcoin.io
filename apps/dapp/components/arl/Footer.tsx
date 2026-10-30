import { IS_LOCAL } from "~~/lib/contracts";

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-6 text-center text-xs text-subtle [overflow-wrap:anywhere]">
      <p>
        {IS_LOCAL
          ? "Local test chain only. Amounts and schedules on this chain are development values. The official ARL contract on Base Mainnet is published on arlcoin.io."
          : "This app runs on the Base Sepolia testnet; testnet ARL has no value. ARL on Base Mainnet: 0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4."}
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
