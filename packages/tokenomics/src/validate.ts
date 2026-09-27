import { MIN_TIMELOCK_HOURS, type Allocation, type Custody, type Release } from "./allocations.ts";

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

    const own = a.custody ? [{ id: a.id, custody: a.custody, release: a.release }] : [];
    errors.push(...validateRelease(a.id, a.amount, a.release));

    if (a.parts) {
      if (a.custody) errors.push(`${a.id}: custody must be set per part, not on the allocation`);
      const partIds = new Set<string>();
      let partTotal = 0;
      for (const part of a.parts) {
        const id = `${a.id}/${part.id}`;
        if (partIds.has(part.id)) errors.push(`${a.id}: duplicate part id "${part.id}"`);
        partIds.add(part.id);
        if (!Number.isSafeInteger(part.amount) || part.amount <= 0) {
          errors.push(`${id}: amount must be a positive safe integer, got ${part.amount}`);
          continue;
        }
        partTotal += part.amount;
        errors.push(...validateRelease(id, part.amount, part.release));
        own.push({ id, custody: part.custody, release: part.release });
      }
      if (partTotal !== a.amount) {
        errors.push(`${a.id}: parts total ${partTotal}, expected ${a.amount}`);
      }
    } else if (!a.custody) {
      errors.push(`${a.id}: custody is not defined`);
    }

    for (const held of own) errors.push(...validateCustody(held.id, held.custody, held.release));
    if (own.some((h) => h.release.kind === "linear" && h.release.start === "initial-program-end")) {
      const r = a.release;
      if (r.kind !== "program" || !r.initialProgram) {
        errors.push(`${a.id}: a schedule starts at the initial program's end, but there is none`);
      }
    }
  }

  if (total !== maxSupply) {
    errors.push(`allocations total ${total}, expected exactly ${maxSupply}`);
  }

  return errors;
}

/** Checks one release rule for an allocation or part holding `amount` ARL. */
function validateRelease(id: string, amount: number, r: Release): string[] {
  const errors: string[] = [];
  switch (r.kind) {
    case "linear":
      if (!Number.isInteger(r.vestingMonths) || r.vestingMonths <= 0) {
        errors.push(`${id}: vestingMonths must be a positive integer`);
      }
      break;
    case "cliff-linear":
      if (!Number.isInteger(r.cliffMonths) || r.cliffMonths < 0) {
        errors.push(`${id}: cliffMonths must be a non-negative integer`);
      }
      if (!Number.isInteger(r.vestingMonths) || r.vestingMonths <= 0) {
        errors.push(`${id}: vestingMonths must be a positive integer`);
      }
      break;
    case "annual-cap":
      if (!Number.isSafeInteger(r.maxPerYear) || r.maxPerYear <= 0) {
        errors.push(`${id}: maxPerYear must be a positive safe integer`);
      } else if (r.maxPerYear * r.years !== amount) {
        errors.push(
          `${id}: ${r.years} x ${r.maxPerYear} = ${r.maxPerYear * r.years}, expected ${amount}`,
        );
      }
      break;
    case "program":
      if (r.initialProgram) {
        const p = r.initialProgram;
        if (!Number.isSafeInteger(p.maxAmount) || p.maxAmount <= 0) {
          errors.push(`${id}: initial program maxAmount must be a positive safe integer`);
        } else if (p.maxAmount > amount) {
          errors.push(`${id}: initial program ${p.maxAmount} exceeds allocation ${amount}`);
        }
        if (!Number.isInteger(p.durationMonths) || p.durationMonths <= 0) {
          errors.push(`${id}: initial program durationMonths must be a positive integer`);
        }
      }
      break;
    case "custody":
      if (r.controls) {
        const c = r.controls;
        if (!Number.isInteger(c.signers) || !Number.isInteger(c.threshold)) {
          errors.push(`${id}: multisig threshold and signers must be integers`);
        } else if (c.threshold < 2 || c.threshold > c.signers) {
          errors.push(`${id}: threshold ${c.threshold} of ${c.signers} is not a valid multisig`);
        }
        if (!(c.minDelayHours >= MIN_TIMELOCK_HOURS)) {
          errors.push(
            `${id}: timelock ${c.minDelayHours}h is below the ${MIN_TIMELOCK_HOURS}h minimum`,
          );
        }
      }
      break;
  }

  return errors;
}

/** Checks that where tokens are held matches how they are released. */
function validateCustody(id: string, c: Custody, r: Release): string[] {
  const errors: string[] = [];
  const vests = r.kind === "cliff-linear" || r.kind === "linear" || r.kind === "annual-cap";
  switch (c.holder) {
    case "vesting-wallet":
      if (!vests) errors.push(`${id}: a vesting wallet needs a vesting schedule, got "${r.kind}"`);
      break;
    case "grant-pool":
      if (r.kind !== "cliff-linear") {
        errors.push(`${id}: a grant pool needs a per-grant cliff-linear schedule`);
      }
      break;
    case "timelock":
      if (r.kind !== "custody" || !r.controls) {
        errors.push(`${id}: a timelock holder needs custody controls`);
      }
      break;
    case "safe":
      if (vests) errors.push(`${id}: a vesting schedule needs a vesting wallet, not a Safe`);
      break;
  }
  return errors;
}
