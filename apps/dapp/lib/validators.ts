// The validators of the verified evaluator, as ARLscan shows them. The list comes from the Agent
// API (GET /api/v1/validators), which reads it from the chain; everything in the answer is
// checked here before it reaches the page, and anything malformed is left out.

import { AUDIT_API } from "./audit.ts";

export const VALIDATORS_URL = `${AUDIT_API}/validators`;

export interface ValidatorRow {
  validator: `0x${string}`;
  /** Stake and the part locked on running jobs, in ARL base units. */
  stake: bigint;
  locked: bigint;
  accepted: number;
  approved: number;
  rejected: number;
  slashes: number;
  /** Unix seconds of the first stake, when known. */
  since?: number;
}

export interface ValidatorList {
  /** The block the list was read at. */
  block: string;
  rows: ValidatorRow[];
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UINT = /^\d{1,78}$/;
const MAX_ROWS = 200;

const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9 ? v : null;

/** Reads the API's answer into the ARL validators the page shows. Throws when it is not a list. */
export function parseValidators(body: unknown): ValidatorList {
  const b = body as { block?: unknown; validators?: unknown } | null;
  if (!b || typeof b.block !== "string" || !UINT.test(b.block) || !Array.isArray(b.validators))
    throw new Error("the answer is not a validator list");
  const rows: ValidatorRow[] = [];
  for (const raw of b.validators.slice(0, MAX_ROWS)) {
    const v = raw as Record<string, unknown> | null;
    if (!v || v.token !== "ARL") continue;
    const accepted = count(v.accepted);
    const approved = count(v.approved);
    const rejected = count(v.rejected);
    const slashes = count(v.slashes);
    if (
      typeof v.validator !== "string" ||
      !ADDRESS.test(v.validator) ||
      typeof v.stake !== "string" ||
      !UINT.test(v.stake) ||
      typeof v.locked !== "string" ||
      !UINT.test(v.locked) ||
      accepted === null ||
      approved === null ||
      rejected === null ||
      slashes === null
    )
      continue;
    rows.push({
      validator: v.validator as `0x${string}`,
      stake: BigInt(v.stake),
      locked: BigInt(v.locked),
      accepted,
      approved,
      rejected,
      slashes,
      ...(typeof v.since === "number" && Number.isFinite(v.since) ? { since: v.since } : {}),
    });
  }
  return { block: b.block, rows };
}
