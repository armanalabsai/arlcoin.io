export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-6 text-center text-xs text-subtle">
      <p>
        Local test chain only. ARL is not deployed on any public network. Amounts and schedules on
        this chain are development values.
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
        <a className="link" href="https://github.com/gokturkalazdaghan-dot/ARLCOIN">
          Source
        </a>
        {" · "}
        Built on Scaffold-ETH 2 (MIT)
      </p>
    </footer>
  );
}
