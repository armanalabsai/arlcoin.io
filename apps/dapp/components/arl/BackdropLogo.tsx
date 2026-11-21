// The turning ARL logo of the landing page (apps/web/src/site/HeroLogo.tsx), as a fixed backdrop
// for the app: a gold ring of ticks turning slowly, a dashed orbit turning the other way, and the
// mark at the centre. It sits behind every panel, button and line of text, takes no pointer
// events, and stays in place while the page scrolls. All motion stops when the visitor prefers
// reduced motion (styles/globals.css, .backdrop-logo).

const TICKS = Array.from({ length: 60 }, (_, i) => i);

export function BackdropLogo() {
  return (
    <div className="backdrop-logo" aria-hidden="true">
      <svg viewBox="0 0 400 400" className="backdrop-logo-rings">
        <defs>
          <radialGradient id="backdrop-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(217 183 122)" stopOpacity="0.38" />
            <stop offset="55%" stopColor="rgb(217 183 122)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="rgb(217 183 122)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="backdrop-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f3e3bf" />
            <stop offset="50%" stopColor="#d9b77a" />
            <stop offset="100%" stopColor="#a8834a" />
          </linearGradient>
        </defs>
        <circle cx="200" cy="200" r="196" fill="url(#backdrop-glow)" />
        <g className="backdrop-logo-ticks">
          {TICKS.map((i) => (
            <line
              key={i}
              x1="200"
              y1="12"
              x2="200"
              y2={i % 5 === 0 ? 26 : 19}
              stroke="#d9b77a"
              strokeWidth={i % 5 === 0 ? 2.4 : 1.2}
              strokeLinecap="round"
              opacity={i % 5 === 0 ? 0.9 : 0.45}
              transform={`rotate(${String(i * 6)} 200 200)`}
            />
          ))}
        </g>
        <g className="backdrop-logo-orbit">
          <circle
            cx="200"
            cy="200"
            r="160"
            fill="none"
            stroke="url(#backdrop-gold)"
            strokeWidth="1.2"
            strokeDasharray="2 9"
            opacity="0.7"
          />
          <circle cx="200" cy="40" r="5" fill="#efd9ab" />
          <circle cx="338.6" cy="280" r="3.5" fill="#d9b77a" />
          <circle cx="61.4" cy="280" r="3.5" fill="#d9b77a" />
        </g>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="backdrop-logo-mark"
        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/arl-logo.svg`}
        alt=""
      />
    </div>
  );
}
