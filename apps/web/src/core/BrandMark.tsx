// The ARL mark (small-size variant from assets/brand, served as /arl-icon-small.svg): the
// eight-armed swirl in light line art on a dark disc. Decorative; the link around it carries
// the label.

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full bg-[url(/arl-icon-small.svg)] bg-cover"
      style={{ width: size, height: size }}
    />
  );
}
