import { IS_LOCAL } from "~~/lib/contracts";

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-6 text-center text-xs text-subtle">
      <p>
        {IS_LOCAL
          ? "Local test chain only. ARL is deployed on Base Sepolia (testnet) only, not on Base Mainnet. Amounts and schedules on this chain are development values."
          : "Base Sepolia testnet. ARL is not yet deployed on Base Mainnet. Testnet ARL has no value."}
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
