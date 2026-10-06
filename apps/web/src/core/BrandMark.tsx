// The ARL Network mark (small-size variant from assets/brand): three ice-blue orbits around a
// bright nucleus on a night-blue disc. Decorative; the link around it carries the label.

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <defs>
        <radialGradient id="arl-bm-disc" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#10264f" />
          <stop offset="0.55" stopColor="#081633" />
          <stop offset="1" stopColor="#030816" />
        </radialGradient>
        <linearGradient id="arl-bm-orbit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c8ecff" />
          <stop offset="0.5" stopColor="#7cc9ff" />
          <stop offset="1" stopColor="#4aa3ea" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#arl-bm-disc)" />
      <g fill="none" stroke="url(#arl-bm-orbit)" strokeWidth="3">
        <ellipse cx="32" cy="32" rx="23" ry="8.3" transform="rotate(90 32 32)" />
        <ellipse cx="32" cy="32" rx="23" ry="8.3" transform="rotate(30 32 32)" />
        <ellipse cx="32" cy="32" rx="23" ry="8.3" transform="rotate(150 32 32)" />
      </g>
      <circle cx="32" cy="32" r="5.5" fill="#bfe9ff" opacity="0.6" />
      <circle cx="32" cy="32" r="3.5" fill="#ffffff" />
      <circle
        cx="32"
        cy="32"
        r="30.7"
        fill="none"
        stroke="#9fd8ff"
        strokeOpacity="0.45"
        strokeWidth="1.9"
      />
    </svg>
  );
}
