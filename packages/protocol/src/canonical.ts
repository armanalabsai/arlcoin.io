// Canonical JSON for hashing ARL protocol documents (arl-task/1 and later specs). The same rules as
// `@arl/verifier` (canonical.ts) so a document hashes identically everywhere: object keys sorted
// by UTF-16 code units, no whitespace, strings escaped as ECMAScript JSON.stringify does, safe
// integers only. Anything else is refused rather than silently normalized.

import { keccak256, stringToBytes, type Hex } from "viem";

export class CanonicalError extends Error {
  override name = "CanonicalError";
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new CanonicalError(`not a safe integer: ${value}`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalError("only plain objects can be canonicalized");
    }
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new CanonicalError(`cannot canonicalize a ${typeof value}`);
}

/** keccak256 of the UTF-8 bytes of the canonical JSON. */
export function canonicalHash(value: unknown): Hex {
  return keccak256(stringToBytes(canonicalize(value)));
}
