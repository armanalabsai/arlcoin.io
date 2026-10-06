// How one paid AI job moves through Base, in five steps: the x402 upto payment flow as built
// and tested on Base Sepolia. A light travels the steps and a row of Base blocks slides past;
// both stop when the visitor prefers reduced motion. Horizontal on wide screens, vertical on
// phones.

const STEPS = [
  { title: "Wallet", body: "Signs a spending ceiling", tech: "Permit2 · x402 upto" },
  {
    title: "AI or GPU service",
    body: "Does the work and meters it",
    tech: "per call · per second",
  },
  { title: "Facilitator", body: "Settles only what was used", tech: "never above the ceiling" },
  { title: "Base", body: "Records the ARL transfer", tech: "ERC-20 · block confirmed" },
  {
    title: "Basescan · ERC-8004",
    body: "Anyone verifies; rating saved",
    tech: "public, permanent",
  },
] as const;

/** Line icons drawn around (0, 0), about 30 units across. */
function Icon({ i }: { i: number }) {
  switch (i) {
    case 0:
      return (
        <>
          <rect x="-15" y="-11" width="30" height="22" rx="5" />
          <path d="M15 -3h-8a3 3 0 0 0 0 6h8" />
        </>
      );
    case 1:
      return (
        <>
          <rect x="-11" y="-11" width="22" height="22" rx="4" />
          <rect x="-5" y="-5" width="10" height="10" rx="1.5" />
          <path d="M-6 -15v4M0 -15v4M6 -15v4M-6 11v4M0 11v4M6 11v4M-15 -6h4M-15 0h4M-15 6h4M11 -6h4M11 0h4M11 6h4" />
        </>
      );
    case 2:
      return (
        <>
          <circle r="14" />
          <path d="M-6 0l4 4 8-9" />
        </>
      );
    case 3:
      return (
        <>
          <path d="M0 -15l13 7.5v15L0 15l-13-7.5v-15z" />
          <path d="M-13 -7.5L0 0l13-7.5M0 0v15" />
        </>
      );
    default:
      return (
        <>
          <circle cx="-3" cy="-3" r="10" />
          <path d="M4.5 4.5L13 13" />
        </>
      );
  }
}

const icon = {
  fill: "none",
  stroke: "#c8ebff",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Packet({ path }: { path: string }) {
  return (
    <g className="flow-packet">
      <circle r="13" fill="url(#arl-flow-packet)" />
      <circle r="4" fill="#fff" />
      <animateMotion dur="4.5s" repeatCount="indefinite">
        <mpath href={path} />
      </animateMotion>
    </g>
  );
}

function Wide() {
  const y = 120;
  const xs = STEPS.map((_, i) => 104 + i * 208);
  return (
    <svg className="flow flow-wide" viewBox="0 0 1040 420" aria-hidden="true" focusable="false">
      <path
        id="arl-flow-rail"
        d={`M${xs[0]} ${y} H${xs[4]}`}
        stroke="url(#arl-flow-line)"
        strokeWidth="2"
        fill="none"
        strokeDasharray="4 8"
        className="flow-dash"
      />
      {STEPS.map((s, i) => (
        <g
          key={s.title}
          transform={`translate(${xs[i]} ${y})`}
          style={{ "--d": `${i * 0.9}s` } as React.CSSProperties}
        >
          <circle r="44" className="flow-halo" />
          <circle r="36" className="flow-disc" />
          <g {...icon}>
            <Icon i={i} />
          </g>
          <text y="-58" className="flow-num">{`0${i + 1}`}</text>
          <text y="72" className="flow-t1">
            {s.title}
          </text>
          <text y="94" className="flow-t2">
            {s.body}
          </text>
          <text y="114" className="flow-t3">
            {s.tech}
          </text>
        </g>
      ))}
      <Packet path="#arl-flow-rail" />
      <text x="520" y="290" className="flow-cap">
        Base blocks, about every 2 seconds
      </text>
      <path d={`M${xs[3]} ${y + 128} V318`} className="flow-drop" />
      <defs>
        <linearGradient id="arl-flow-fade-g" x1="0" x2="1040" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".08" stopColor="#fff" />
          <stop offset=".92" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="arl-flow-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1040" height="420">
          <rect width="1040" height="420" fill="url(#arl-flow-fade-g)" />
        </mask>
      </defs>
      <g mask="url(#arl-flow-fade)">
        <g className="flow-chain">
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i} transform={`translate(${40 + i * 116} 0)`} className={i === 6 ? "on" : ""}>
              <rect width="100" height="64" rx="10" />
              <text x="12" y="26" className="flow-bn">
                Block
              </text>
              <text x="12" y="46" className="flow-bt">
                {i === 6 ? "ARL transfer" : "txs"}
              </text>
              {i < 9 ? <path d="M100 32h16" className="flow-link" /> : null}
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}

function Narrow() {
  const x = 56;
  const ys = STEPS.map((_, i) => 60 + i * 132);
  return (
    <svg className="flow flow-narrow" viewBox="0 0 358 650" aria-hidden="true" focusable="false">
      <path
        id="arl-flow-rail-v"
        d={`M${x} ${ys[0]} V${ys[4]}`}
        stroke="#9fd8ff"
        strokeOpacity="0.45"
        strokeWidth="2"
        fill="none"
        strokeDasharray="4 8"
        className="flow-dash"
      />
      {STEPS.map((s, i) => (
        <g
          key={s.title}
          transform={`translate(${x} ${ys[i]})`}
          style={{ "--d": `${i * 0.9}s` } as React.CSSProperties}
        >
          <circle r="34" className="flow-halo" />
          <circle r="28" className="flow-disc" />
          <g {...icon} strokeWidth={2.4} transform="scale(.8)">
            <Icon i={i} />
          </g>
          <text x="52" y="-14" className="flow-num start">{`0${i + 1}`}</text>
          <text x="52" y="8" className="flow-t1 start">
            {s.title}
          </text>
          <text x="52" y="30" className="flow-t2 start">
            {s.body}
          </text>
          <text x="52" y="50" className="flow-t3 start">
            {s.tech}
          </text>
        </g>
      ))}
      <Packet path="#arl-flow-rail-v" />
    </svg>
  );
}

export function ChainFlow() {
  return (
    <figure className="m-0">
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="arl-flow-line" x1="0" x2="1">
            <stop offset="0" stopColor="#9fd8ff" stopOpacity=".15" />
            <stop offset=".5" stopColor="#9fd8ff" stopOpacity=".6" />
            <stop offset="1" stopColor="#9fd8ff" stopOpacity=".15" />
          </linearGradient>
          <radialGradient id="arl-flow-packet">
            <stop offset="0" stopColor="#fff" />
            <stop offset=".45" stopColor="#bfe9ff" />
            <stop offset="1" stopColor="#9fd8ff" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      <Wide />
      <Narrow />
      <figcaption>
        <ol className="sr-only">
          {STEPS.map((s) => (
            <li key={s.title}>
              {s.title}: {s.body} ({s.tech}).
            </li>
          ))}
        </ol>
        <span className="mt-4 block text-[13px] text-fg-subtle">
          The design as built and tested on Base Sepolia. Not running on Base Mainnet yet.
        </span>
      </figcaption>
    </figure>
  );
}
