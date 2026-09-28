// Turns measured usage into the amount to settle. Pure bigint arithmetic in ARL base units.

export interface MeterInput {
  /** Price of one unit (for example one token of model output) in ARL base units. */
  unitPrice: bigint;
  units: bigint;
  /** The ceiling the payer signed. */
  ceiling: bigint;
}

export interface MeterResult {
  /** Amount to settle: never above the ceiling. */
  amount: bigint;
  /** Usage cost more than the ceiling; the excess is not charged. */
  capped: boolean;
}

export function meter({ unitPrice, units, ceiling }: MeterInput): MeterResult {
  if (unitPrice < 0n || units < 0n) throw new Error("price and units must not be negative");
  if (ceiling <= 0n) throw new Error("ceiling must be positive");
  const cost = unitPrice * units;
  return cost > ceiling ? { amount: ceiling, capped: true } : { amount: cost, capped: false };
}
