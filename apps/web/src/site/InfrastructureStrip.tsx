// ARL's partners, as a scrolling band at the very bottom of every page. A company is listed only
// once the owner states that the partnership is in place. The list is empty for now (2026-11-19),
// and the band is not rendered while it is.

const PROVIDERS: readonly { name: string; role: string; href: string }[] = [];

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
  if (PROVIDERS.length === 0) return null;
  return (
    <section aria-label="Partnership" className="infra-strip">
      <p className="infra-label">Partnership</p>
      <div className="infra-viewport">
        <div className="infra-track">
          <Run />
          <Run hidden />
        </div>
      </div>
    </section>
  );
}
