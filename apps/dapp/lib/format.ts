// Amount and schedule arithmetic for the app. Pure bigint math on ARL base units (18 decimals).

export const ARL_DECIMALS = 18;
const UNIT = 10n ** BigInt(ARL_DECIMALS);

/** Formats base units as ARL with thousands separators, truncated to `maxDecimals`. */
export function formatArl(value: bigint, maxDecimals = 4): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = (abs / UNIT).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (abs % UNIT)
    .toString()
    .padStart(ARL_DECIMALS, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export type ParsedAmount = { ok: true; value: bigint } | { ok: false; error: string };

/** Parses a user-typed ARL amount ("1,234.5") into base units. Rejects zero and negatives. */
export function parseArl(input: string): ParsedAmount {
  const text = input.trim().replace(/,/g, "");
  if (text === "") return { ok: false, error: "Enter an amount" };
  if (!/^\d*\.?\d*$/.test(text) || text === ".") return { ok: false, error: "Not a number" };
  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > ARL_DECIMALS) return { ok: false, error: "Too many decimals (max 18)" };
  const value = BigInt(whole || "0") * UNIT + BigInt(fraction.padEnd(ARL_DECIMALS, "0") || "0");
  if (value === 0n) return { ok: false, error: "Amount must be above zero" };
  return { ok: true, value };
}

/** Checks an amount against what the account can spend. */
export function checkAmount(input: string, available: bigint | undefined): ParsedAmount {
  const parsed = parseArl(input);
  if (!parsed.ok) return parsed;
  if (available !== undefined && parsed.value > available)
    return { ok: false, error: "More than available" };
  return parsed;
}

export type VestingPhase = "cliff" | "vesting" | "complete";

/** Phase of a cliff + linear schedule (ARLVestingWallet: linear from `cliffEnd` to `vestingEnd`). */
export function vestingPhase(now: bigint, cliffEnd: bigint, vestingEnd: bigint): VestingPhase {
  if (now < cliffEnd) return "cliff";
  if (now < vestingEnd) return "vesting";
  return "complete";
}

/** Share of `part` in `total` as a percentage with one decimal ("12.3"). */
export function percent(part: bigint, total: bigint): string {
  if (total === 0n) return "0";
  const tenths = (part * 1000n) / total;
  return `${(tenths / 10n).toString()}.${(tenths % 10n).toString()}`;
}

/** Reward per day for a staker at the current rate: rate × 1 day × stake / total staked. */
export function rewardPerDay(rewardRate: bigint, staked: bigint, totalStaked: bigint): bigint {
  if (totalStaked === 0n) return 0n;
  return (rewardRate * 86_400n * staked) / totalStaked;
}

/** "3d 4h", "5h 2m", "45s": time left until `target`, or "ended". */
export function timeLeft(now: bigint, target: bigint): string {
  if (target <= now) return "ended";
  let s = Number(target - now);
  const d = Math.floor(s / 86_400);
  s -= d * 86_400;
  const h = Math.floor(s / 3_600);
  s -= h * 3_600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d > 0) return `${String(d)}d ${String(h)}h`;
  if (h > 0) return `${String(h)}h ${String(m)}m`;
  if (m > 0) return `${String(m)}m ${String(s)}s`;
  return `${String(s)}s`;
}

/** UTC date and time of a Unix timestamp. */
export function formatDate(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
