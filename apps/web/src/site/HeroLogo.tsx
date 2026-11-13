// The ARL logo at the centre of the landing page, drawn as a small piece of machinery: a gold
// ring of ticks turning slowly, a dashed orbit turning the other way with three nodes on it, and
// a soft glow that breathes behind the mark. Everything is SVG and CSS (globals.css, .hero-logo);
// all motion stops when the visitor prefers reduced motion.

const TICKS = Array.from({ length: 60 }, (_, i) => i);

export function HeroLogo() {
  return (
    <span className="hero-logo" aria-hidden="true">
      <svg viewBox="0 0 400 400" className="hero-logo-rings">
        <defs>
          <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(217 183 122)" stopOpacity="0.38" />
            <stop offset="55%" stopColor="rgb(217 183 122)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="rgb(217 183 122)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hero-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f3e3bf" />
            <stop offset="50%" stopColor="#d9b77a" />
            <stop offset="100%" stopColor="#a8834a" />
          </linearGradient>
        </defs>
        <circle className="hero-logo-glow" cx="200" cy="200" r="196" fill="url(#hero-glow)" />
        <g className="hero-logo-ticks">
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
        <g className="hero-logo-orbit">
          <circle
            cx="200"
            cy="200"
            r="160"
            fill="none"
            stroke="url(#hero-gold)"
            strokeWidth="1.2"
            strokeDasharray="2 9"
            opacity="0.7"
          />
          <circle cx="200" cy="40" r="5" fill="#efd9ab" />
          <circle cx="338.6" cy="280" r="3.5" fill="#d9b77a" />
          <circle cx="61.4" cy="280" r="3.5" fill="#d9b77a" />
        </g>
        <circle
          cx="200"
          cy="200"
          r="138"
          fill="none"
          stroke="url(#hero-gold)"
          strokeWidth="0.8"
          opacity="0.35"
        />
      </svg>
      <span className="hero-logo-mark" />
    </span>
  );
}
