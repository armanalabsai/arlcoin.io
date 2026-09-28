export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-6 text-center text-xs text-subtle">
      <p>
        Local test chain only. ARL is not deployed on any public network; amounts and schedules here
        are development values, not the ARL token economics.
      </p>
      <p className="mt-2">
        <a className="link" href="https://arlcoin.io">
          arlcoin.io
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
