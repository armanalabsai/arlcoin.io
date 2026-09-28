// The ARL Core mark (small-size variant from assets/brand): the Core ring with an amber orbit
// and a rising "A" of network nodes. Decorative; the link around it carries the label.

export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <circle
        cx="128"
        cy="128"
        r="98"
        fill="none"
        stroke="rgb(255 255 255 / 0.2)"
        strokeWidth="16"
      />
      <path
        d="M128 30A98 98 0 0 1 212.9 177"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M78 178L128 66L178 178"
        fill="none"
        stroke="currentColor"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="128" cy="66" r="20" fill="var(--color-accent)" />
    </svg>
  );
}
