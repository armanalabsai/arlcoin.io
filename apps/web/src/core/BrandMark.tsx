// The ARL mark (small-size variant from assets/brand, served as /arl-icon-small.svg): the
// eight-armed swirl with the A at its centre, light line art on the page itself. Decorative;
// the link around it carries the label.

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 bg-[url(/arl-icon-small.svg)] bg-contain bg-center bg-no-repeat"
      style={{ width: size, height: size }}
    />
  );
}
