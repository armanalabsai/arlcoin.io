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
    errors.push(...validateTranches(a, ids));
  }

  if (total !== maxSupply) {
    errors.push(`allocations total ${total}, expected exactly ${maxSupply}`);
  }

  return errors;
}

function validateRelease(id: string, r: Release): string[] {
  const errors: string[] = [];
  if (r.kind === "vesting") {
    const s = r.schedule;
    if (!Number.isInteger(s.cliffMonths) || s.cliffMonths < 0) {
      errors.push(`${id}: vesting cliff must be a whole number of months`);
    }
    if (!Number.isInteger(s.linearMonths) || s.linearMonths <= 0) {
      errors.push(`${id}: linear vesting must be a positive whole number of months`);
    }
  }
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

/**
 * An allocation held in tranches must say so in both its release rule and its
 * custody, have at least two tranches, and the tranche amounts must add up to
 * the allocation exactly. Each tranche is checked like an allocation.
 */
function validateTranches(a: Allocation, ids: Set<string>): string[] {
  const errors: string[] = [];
  // Tables are also built from untyped data, so custody may be missing here.
  const holder = (a as Partial<Allocation>).custody?.holder;
  const split = a.release.kind === "tranches" || holder === "tranches";
  const tranches = (a as Partial<Allocation>).tranches;
  if (!split) {
    if (tranches !== undefined)
      errors.push(`${a.id}: tranches need a "tranches" release and custody`);
    return errors;
  }
  if (a.release.kind !== "tranches" || holder !== "tranches") {
    errors.push(`${a.id}: a "tranches" release needs "tranches" custody, and the reverse`);
  }
  if (!tranches || tranches.length < 2) {
    errors.push(`${a.id}: an allocation held in tranches needs at least two tranches`);
    return errors;
  }
  let total = 0;
  for (const t of tranches) {
    if (ids.has(t.id)) errors.push(`duplicate allocation or tranche id "${t.id}"`);
    ids.add(t.id);
    if (!Number.isSafeInteger(t.amount) || t.amount <= 0) {
      errors.push(`${t.id}: amount must be a positive safe integer, got ${t.amount}`);
      continue;
    }
    total += t.amount;
    if (t.release.kind === "tranches" || t.custody.holder === "tranches") {
      errors.push(`${t.id}: a tranche cannot itself be split`);
    }
    if (
      a.id === "founder" &&
      (t.release.kind === "vesting" || t.custody.holder === "vesting-wallet")
    ) {
      errors.push(`${t.id}: the Founder allocation does not vest`);
    }
    errors.push(...validateRelease(t.id, t.release));
    errors.push(...validateCustody(t.id, t.custody, t.release));
  }
  if (total !== a.amount) {
    errors.push(`${a.id}: tranches total ${total}, expected exactly ${a.amount}`);
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
      if (r.kind === "reserved") errors.push(`${id}: a reserved release needs custody TBD`);
      break;
    case "tbd":
      // Undecided custody holds reserved tokens only, and never decides a release by itself.
      if (r.kind !== "reserved") errors.push(`${id}: custody TBD needs a reserved release`);
      if (r.status === "approved") errors.push(`${id}: custody TBD cannot be approved`);
      break;
    case "tranches":
      break;
  }
  if (r.kind === "unrestricted" && c.holder !== "safe") {
    errors.push(`${id}: an unrestricted release needs a dedicated Safe`);
  }
  return errors;
}
