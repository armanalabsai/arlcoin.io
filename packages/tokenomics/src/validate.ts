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

  const ids = new Set<string>();
  const names = new Set<string>();
  let total = 0;

  for (const a of allocations) {
    if (ids.has(a.id)) errors.push(`duplicate allocation id "${a.id}"`);
    ids.add(a.id);
    if (names.has(a.name)) errors.push(`duplicate allocation name "${a.name}"`);
    names.add(a.name);

    if (!Number.isSafeInteger(a.amount) || a.amount <= 0) {
      errors.push(`${a.id}: amount must be a positive safe integer, got ${a.amount}`);
      continue;
    }
    total += a.amount;

    errors.push(...validateRelease(a.id, a.release));
    // The type requires custody, but tables are also built from untyped data.
    const custody = (a as Partial<Allocation>).custody;
    if (!custody) {
      errors.push(`${a.id}: custody is not defined`);
    } else {
      errors.push(...validateCustody(a.id, custody, a.release));
    }
  }

  if (total !== maxSupply) {
    errors.push(`allocations total ${total}, expected exactly ${maxSupply}`);
  }

  return errors;
}

function validateRelease(id: string, r: Release): string[] {
  const errors: string[] = [];
  if (r.kind === "custody" && r.controls) {
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
  return errors;
}

/** Checks that where tokens are held matches how they are released. */
function validateCustody(id: string, c: Custody, r: Release): string[] {
  const errors: string[] = [];
  switch (c.holder) {
    case "vesting-wallet":
      if (r.kind !== "vesting") errors.push(`${id}: a vesting wallet needs a vesting release`);
      break;
    case "timelock":
      if (r.kind !== "custody" || !r.controls) {
        errors.push(`${id}: a timelock holder needs custody controls`);
      }
      break;
    case "safe":
    case "grant-pool":
      if (r.kind === "vesting") errors.push(`${id}: a vesting release needs a vesting wallet`);
      break;
  }
  return errors;
}
