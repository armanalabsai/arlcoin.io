// The services the site runs on, as a scrolling band at the very bottom of every page.
// They are providers the site uses as a regular customer, not partners: the label says so.

const PROVIDERS = [
  { name: "Vercel", role: "Hosting", href: "https://vercel.com" },
  { name: "Supabase", role: "Database", href: "https://supabase.com" },
] as const;

/** Enough copies to fill a wide screen; the track holds two runs of them. */
const COPIES = 4;

function Run({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="infra-run" aria-hidden={hidden ? true : undefined}>
      {Array.from({ length: COPIES }, (_, copy) =>
        PROVIDERS.map((p) => (
          <li key={`${String(copy)}-${p.name}`} className="infra-item">
            <a
              href={p.href}
              rel="noopener noreferrer"
              tabIndex={hidden || copy > 0 ? -1 : undefined}
              className="infra-link"
            >
              <span className="infra-name">{p.name}</span>
              <span className="infra-role">{p.role}</span>
            </a>
          </li>
        )),
      )}
    </ul>
  );
}

export function InfrastructureStrip() {
  return (
    <section aria-label="Infrastructure" className="infra-strip">
      <p className="infra-label">Runs on</p>
      <div className="infra-viewport">
        <div className="infra-track">
          <Run />
          <Run hidden />
        </div>
      </div>
    </section>
  );
}
