import type { Allocation } from "./allocations.ts";

export interface Share {
  readonly id: string;
  /** Share of max supply in basis points (1 bp = 0.01%). */
  readonly basisPoints: number;
}

/**
 * Splits 10,000 basis points across allocations with the largest-remainder
 * method, so displayed percentages always add up to exactly 100.00%.
 * Deterministic: ties are broken by table order.
 */
export function shareOfSupply(allocations: readonly Allocation[], maxSupply: number): Share[] {
  const TOTAL_BP = 10_000;
  const exact = allocations.map((a, index) => {
    const scaled = a.amount * TOTAL_BP;
    return {
      id: a.id,
      index,
      floor: Math.floor(scaled / maxSupply),
      remainder: scaled % maxSupply,
    };
  });

  let left = TOTAL_BP - exact.reduce((sum, e) => sum + e.floor, 0);
  const byRemainder = [...exact].sort((x, y) => y.remainder - x.remainder || x.index - y.index);
  const bonus = new Set<number>();
  for (const e of byRemainder) {
    if (left <= 0) break;
    bonus.add(e.index);
    left -= 1;
  }

  return exact.map((e) => ({
    id: e.id,
    basisPoints: e.floor + (bonus.has(e.index) ? 1 : 0),
  }));
}

/** 1000 → "10.00%". */
export const formatBasisPoints = (bp: number) => `${(bp / 100).toFixed(2)}%`;
