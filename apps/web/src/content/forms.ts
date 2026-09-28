import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

// Forms (whitelist, contact) post from the browser to Web3Forms, which delivers each
// submission by email. The access key is designed to be public: it only lets a form send
// to the inbox it was created for. An empty key keeps the forms closed.
export const FORMS = {
  endpoint: "https://api.web3forms.com/submit",
  accessKey: process.env.NEXT_PUBLIC_WEB3FORMS_KEY ?? "",
  privacyPolicy: "https://web3forms.com/privacy",
} as const;

export const formsOpen = (): boolean => FORMS.accessKey.length > 0;

/** EIP-55 mixed-case checksum encoding of a 20-byte hex address. */
export function toChecksumAddress(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i];
  }
  return out;
}

/**
 * An EVM address: 0x and 40 hex digits. All-lowercase and all-uppercase forms carry no
 * checksum and are accepted; a mixed-case address must match its EIP-55 checksum, which
 * catches most typing and copying mistakes. The zero address is rejected.
 */
export function isEvmAddress(value: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return false;
  const body = value.slice(2);
  if (/^0+$/.test(body)) return false;
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
  return toChecksumAddress(value) === value;
}

/** A pragmatic email check; delivery is the real test. */
export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export const CONTACT_TOPICS = [
  "General question",
  "Partnership",
  "Press",
  "Exchange or listing",
  "Other",
] as const;

export const MESSAGE_MAX = 2000;
