// Reference implementation of the ARL Core monetary standard (economic specification section
// 17, APPROVED / LOCKED). It is the executable form of the standard and its test vectors: any
// ARL Core implementation must produce the same results.
//
// Every function works on bigint integers and fails closed with MonetaryError. There is no
// floating point, no locale handling, and no clamping, wrapping or saturating arithmetic.
//
// Not decided here (section 17.10): remainder destinations, the definition of effective supply,
// burn amounts and schedule, and what happens after a rejected epoch burn.

/** 1 ARL = 10^8 motes (section 17.1). */
export const MOTES_PER_ARL = 100_000_000n;
/** 1 ARL = 10^18 ERC-20 base units. */
export const ERC20_UNITS_PER_ARL = 10n ** 18n;
/** 1 mote = 10^10 ERC-20 base units (section 17.2). */
export const ERC20_UNITS_PER_MOTE = 10n ** 10n;

/** 21,000,000 ARL in motes (section 17.3). */
export const MAX_MONEY = 21_000_000n * MOTES_PER_ARL;
/** 10,000,000 ARL in motes (section 17.8). */
export const SUPPLY_FLOOR = 10_000_000n * MOTES_PER_ARL;

export const U64_MAX = 2n ** 64n - 1n;
export const U128_MAX = 2n ** 128n - 1n;

export class MonetaryError extends Error {
  override name = "MonetaryError";
}

function fail(message: string): never {
  throw new MonetaryError(message);
}

/** Every stored amount and every running sum: 0 ≤ value ≤ MAX_MONEY (section 17.3). */
export function requireMoney(value: bigint, what = "amount"): bigint {
  if (value < 0n || value > MAX_MONEY) fail(`${what} out of range: ${value}`);
  return value;
}

function requireU128(value: bigint, what: string): bigint {
  if (value < 0n || value > U128_MAX) fail(`${what} exceeds u128: ${value}`);
  return value;
}

/** Checked conversion of a u128 intermediate to a stored u64 amount. */
export function toU64Money(value: bigint, what = "result"): bigint {
  requireU128(value, what);
  if (value > U64_MAX) fail(`${what} exceeds u64: ${value}`);
  return requireMoney(value, what);
}

/** `a + b`: fails on overflow or a result above MAX_MONEY. */
export function checkedAdd(a: bigint, b: bigint): bigint {
  return requireMoney(requireMoney(a, "left operand") + requireMoney(b, "right operand"), "sum");
}

/** `a − b`: fails if b > a (no underflow, no saturation). */
export function checkedSub(a: bigint, b: bigint): bigint {
  requireMoney(a, "left operand");
  requireMoney(b, "right operand");
  if (b > a) fail(`underflow: ${a} - ${b}`);
  return a - b;
}

/** Sum of amounts: each partial sum must stay within MAX_MONEY. */
export function checkedSum(amounts: readonly bigint[]): bigint {
  let total = 0n;
  for (const [i, amount] of amounts.entries()) {
    total = requireMoney(
      total + requireMoney(amount, `amount ${String(i)}`),
      `partial sum ${String(i)}`,
    );
  }
  return total;
}

/**
 * `floor(amount × numerator / denominator)` with a u128 intermediate, and the explicit
 * remainder of that division (section 17.6). The result is checked back to a u64 amount.
 */
export function mulDivFloor(
  amount: bigint,
  numerator: bigint,
  denominator: bigint,
): { quotient: bigint; remainder: bigint } {
  requireMoney(amount);
  if (numerator < 0n) fail("numerator is negative");
  if (denominator <= 0n) fail("denominator must be positive");
  const product = requireU128(amount * numerator, "intermediate product");
  return {
    quotient: toU64Money(product / denominator, "quotient"),
    remainder: product % denominator,
  };
}

/**
 * Splits `amount` into `parts` equal shares, rounded down, with the remainder calculated
 * explicitly: `shares × parts + remainder = amount` always holds. The remainder's destination
 * is not decided (section 17.10) and is left to the caller.
 */
export function splitEvenly(amount: bigint, parts: bigint): { share: bigint; remainder: bigint } {
  requireMoney(amount);
  if (parts <= 0n) fail("parts must be positive");
  return { share: amount / parts, remainder: amount % parts };
}

// ------------------------------------------------------------------ conversions (17.2)

/** Motes → ERC-20 base units: always exact. */
export function motesToErc20Units(motes: bigint): bigint {
  return requireU128(requireMoney(motes, "motes") * ERC20_UNITS_PER_MOTE, "ERC-20 units");
}

/**
 * ERC-20 base units → motes, rounded down, with the remainder calculated explicitly:
 * `units = motes × 10^10 + remainder`, `0 ≤ remainder < 10^10`.
 */
export function erc20UnitsToMotes(units: bigint): { motes: bigint; remainder: bigint } {
  requireU128(units, "ERC-20 units");
  return {
    motes: requireMoney(units / ERC20_UNITS_PER_MOTE, "motes"),
    remainder: units % ERC20_UNITS_PER_MOTE,
  };
}

// ------------------------------------------------------------------ RPC strings (17.5)

const MOTES_STRING = /^(0|[1-9][0-9]*)$/;
const ARL_STRING = /^(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/;

/** Canonical RPC form: the amount in motes as a base-10 integer string. */
export function formatMotes(motes: bigint): string {
  return requireMoney(motes).toString();
}

/** Parses the canonical RPC form. Rejects signs, exponents, spaces and leading zeros. */
export function parseMotes(text: string): bigint {
  if (!MOTES_STRING.test(text)) fail(`not a mote amount: ${JSON.stringify(text)}`);
  return requireMoney(BigInt(text));
}

/** Additional RPC form: ARL with exactly 8 fractional digits, e.g. "2.50000000". */
export function formatArl(motes: bigint): string {
  requireMoney(motes);
  const whole = motes / MOTES_PER_ARL;
  const fraction = (motes % MOTES_PER_ARL).toString().padStart(8, "0");
  return `${whole.toString()}.${fraction}`;
}

/**
 * Parses an ARL decimal string: ASCII digits and at most one ".", at most 8 fractional
 * digits. Rejects signs, exponents, whitespace, digit grouping and values above MAX_MONEY.
 */
export function parseArl(text: string): bigint {
  const m = ARL_STRING.exec(text);
  if (!m?.[1]) fail(`not an ARL amount: ${JSON.stringify(text)}`);
  const fraction = (m[2] ?? ".").slice(1).padEnd(8, "0");
  return requireMoney(BigInt(m[1]) * MOTES_PER_ARL + BigInt(fraction));
}

// ------------------------------------------------------------------ serialization (17.4)

/** Exactly 8 bytes, unsigned, little-endian. */
export function encodeAmount(motes: bigint): Uint8Array {
  let value = requireMoney(motes);
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

/** Rejects any length other than 8 and any decoded value above MAX_MONEY. */
export function decodeAmount(bytes: Uint8Array): bigint {
  if (bytes.length !== 8) fail(`amount must be exactly 8 bytes, got ${String(bytes.length)}`);
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i] ?? 0);
  return requireMoney(value, "decoded amount");
}

// ------------------------------------------------------------------ burn floor (17.8)

/**
 * Applies a burn of `burn` motes to effective supply `supply`. Valid only if the checked
 * subtraction succeeds and the result is at least SUPPLY_FLOOR. Otherwise the burn is
 * rejected: it is never clamped, reduced, split or deferred.
 */
export function applyBurn(supply: bigint, burn: bigint): bigint {
  const after = checkedSub(requireMoney(supply, "supply"), requireMoney(burn, "burn"));
  if (after < SUPPLY_FLOOR) fail(`burn rejected: supply would fall below the floor (${after})`);
  return after;
}

// ------------------------------------------------------------------ burn epoch (17.9)

/** Days since 1970-01-01 for a proleptic Gregorian UTC date (integer arithmetic only). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

/**
 * `T(Y) = Y-06-01T03:00:00Z` in Unix seconds (proleptic Gregorian, UTC, no leap seconds),
 * computed with integer calendar arithmetic, never a date library.
 */
export function burnEpochTimestamp(year: number): bigint {
  if (!Number.isSafeInteger(year) || year < 1970 || year > 9999)
    fail(`invalid year: ${String(year)}`);
  return BigInt(daysFromCivil(year, 6, 1)) * 86_400n + 3n * 3600n;
}
