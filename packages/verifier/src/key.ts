import { isHex } from "viem";

/**
 * The validator's private key from the environment: 32 bytes in hex, with or without the 0x
 * prefix. Surrounding whitespace (a trailing newline from a pasted secret) is ignored. The error
 * never contains the value.
 */
export function validatorKey(raw: string | undefined): `0x${string}` {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") throw new Error("ARL_VALIDATOR_KEY must be set");
  const key = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!isHex(key) || key.length !== 66) {
    throw new Error(
      "ARL_VALIDATOR_KEY must be a 32-byte private key in hex (64 hex digits, 0x optional)",
    );
  }
  return key;
}
