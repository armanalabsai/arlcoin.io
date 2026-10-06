import type { Allocation } from "./allocations.ts";

export interface Share {
  readonly id: string;
  /** Share of max supply in basis points (1 bp = 0.01%). */
  readonly basisPoints: number;
}

/**
 * Share of max supply per allocation in basis points, rounded half up from
 * the exact integer amounts. Rounded shares may not add up to exactly
 * 100.00%; the underlying amounts always add up to the max supply.
 * Deterministic and integer-only.
 */
export function shareOfSupply(allocations: readonly Allocation[], maxSupply: number): Share[] {
  const TOTAL_BP = 10_000;
  return allocations.map((a) => {
    const scaled = a.amount * TOTAL_BP;
    const floor = Math.floor(scaled / maxSupply);
    const remainder = scaled % maxSupply;
    return { id: a.id, basisPoints: floor + (remainder * 2 >= maxSupply ? 1 : 0) };
  });
}

/** 1000 → "10.00%". */
export const formatBasisPoints = (bp: number) => `${(bp / 100).toFixed(2)}%`;
