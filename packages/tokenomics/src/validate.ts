import { MIN_TIMELOCK_HOURS, type Allocation } from "./allocations.ts";

/**
 * Checks an allocation table against the protocol rules and returns every
 * violation found. An empty array means the table is valid.
 *
 * Deployment tooling must refuse to continue unless this returns [] — the
 * check fails closed.
 */
export function validateAllocations(
  allocations: readonly Allocation[],
  maxSupply: number,
): string[] {
  const errors: string[] = [];

  if (!Number.isSafeInteger(maxSupply) || maxSupply <= 0) {
    errors.push(`max supply must be a positive safe integer, got ${maxSupply}`);
  }

  const seen = new Set<string>();
  let total = 0;

  for (const a of allocations) {
    if (seen.has(a.id)) errors.push(`duplicate allocation id "${a.id}"`);
    seen.add(a.id);

    if (!Number.isSafeInteger(a.amount) || a.amount <= 0) {
      errors.push(`${a.id}: amount must be a positive safe integer, got ${a.amount}`);
      continue;
    }
    total += a.amount;

    const r = a.release;
    switch (r.kind) {
      case "cliff-linear":
        if (!Number.isInteger(r.cliffMonths) || r.cliffMonths < 0) {
          errors.push(`${a.id}: cliffMonths must be a non-negative integer`);
        }
        if (!Number.isInteger(r.vestingMonths) || r.vestingMonths <= 0) {
          errors.push(`${a.id}: vestingMonths must be a positive integer`);
        }
        break;
      case "annual-cap":
        if (!Number.isSafeInteger(r.maxPerYear) || r.maxPerYear <= 0) {
          errors.push(`${a.id}: maxPerYear must be a positive safe integer`);
        } else if (r.maxPerYear * r.years !== a.amount) {
          errors.push(
            `${a.id}: ${r.years} x ${r.maxPerYear} = ${r.maxPerYear * r.years}, expected ${a.amount}`,
          );
        }
        break;
      case "program":
        if (r.initialProgram) {
          const p = r.initialProgram;
          if (!Number.isSafeInteger(p.maxAmount) || p.maxAmount <= 0) {
            errors.push(`${a.id}: initial program maxAmount must be a positive safe integer`);
          } else if (p.maxAmount > a.amount) {
            errors.push(`${a.id}: initial program ${p.maxAmount} exceeds allocation ${a.amount}`);
          }
          if (!Number.isInteger(p.durationMonths) || p.durationMonths <= 0) {
            errors.push(`${a.id}: initial program durationMonths must be a positive integer`);
          }
        }
        break;
      case "custody":
        if (r.controls) {
          const c = r.controls;
          if (!Number.isInteger(c.signers) || !Number.isInteger(c.threshold)) {
            errors.push(`${a.id}: multisig threshold and signers must be integers`);
          } else if (c.threshold < 2 || c.threshold > c.signers) {
            errors.push(
              `${a.id}: threshold ${c.threshold} of ${c.signers} is not a valid multisig`,
            );
          }
          if (!(c.minDelayHours >= MIN_TIMELOCK_HOURS)) {
            errors.push(
              `${a.id}: timelock ${c.minDelayHours}h is below the ${MIN_TIMELOCK_HOURS}h minimum`,
            );
          }
        }
        break;
    }
  }

  if (total !== maxSupply) {
    errors.push(`allocations total ${total}, expected exactly ${maxSupply}`);
  }

  return errors;
}
