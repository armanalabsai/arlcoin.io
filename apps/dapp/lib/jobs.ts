import { isAddressEqual, keccak256, stringToBytes } from "viem";
import type { Address, Hex } from "viem";

import { parseArl } from "./format.ts";

/** ARLJobs.JobStatus, in contract order. */
export const JOB_STATUS = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

/** Limits of ARLJobs (MIN_DURATION, MAX_DESCRIPTION) and of this screen. */
export const MAX_DESCRIPTION = 1024;
export const MIN_HOURS = 1;
export const MAX_HOURS = 24 * 90;

export interface Job {
  id: bigint;
  client: Address;
  provider: Address;
  evaluator: Address;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  status: JobStatus;
  deliverable?: Hex;
  /** Whether the budget was ever escrowed (a Rejected job may have been cancelled while Open). */
  funded?: boolean;
}

export type Role = "client" | "provider" | "evaluator";

export function statusName(index: number): JobStatus {
  const s = JOB_STATUS[index];
  if (!s) throw new Error(`unknown job status ${String(index)}`);
  return s;
}

/** The roles `account` holds in `job` (the client may also be the evaluator). */
export function rolesOf(job: Job, account: Address | undefined): Role[] {
  if (!account) return [];
  const roles: Role[] = [];
  if (isAddressEqual(job.client, account)) roles.push("client");
  if (isAddressEqual(job.provider, account)) roles.push("provider");
  if (isAddressEqual(job.evaluator, account)) roles.push("evaluator");
  return roles;
}

/** What each role can do now, following ARLJobs (ERC-8183). */
export function actions(job: Job, role: Role, now: bigint): string[] {
  const live = now < job.expiredAt;
  switch (job.status) {
    case "Open":
      if (role === "client")
        return [...(job.budget > 0n && live ? ["fund"] : []), "setBudget", "reject"];
      return role === "provider" ? ["setBudget"] : [];
    case "Funded":
      if (!live) return ["claimRefund"];
      if (role === "provider") return ["submit"];
      return role === "evaluator" ? ["reject"] : [];
    case "Submitted": {
      const evaluate = role === "evaluator" ? ["complete", "reject"] : [];
      return live ? evaluate : [...evaluate, "claimRefund"];
    }
    default:
      return [];
  }
}

/** The on-chain reference to a delivered result: keccak256 of its text. */
export function deliverableHash(result: string): Hex {
  return keccak256(stringToBytes(result));
}

export type JobInput =
  | { ok: true; value: { description: string; budget: bigint; seconds: bigint } }
  | { ok: false; error: string };

export function validateJob(input: {
  description: string;
  budget: string;
  hours: string;
}): JobInput {
  const description = input.description.trim();
  if (description === "") return { ok: false, error: "Describe the job" };
  if (new TextEncoder().encode(description).length > MAX_DESCRIPTION)
    return { ok: false, error: `The description is longer than ${String(MAX_DESCRIPTION)} bytes` };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description))
    return { ok: false, error: "The description contains control characters" };
  const budget = parseArl(input.budget);
  if (!budget.ok) return budget;
  if (!/^\d+$/.test(input.hours.trim())) return { ok: false, error: "Enter whole hours" };
  const hours = Number(input.hours.trim());
  if (hours < MIN_HOURS || hours > MAX_HOURS)
    return {
      ok: false,
      error: `The deadline must be between ${String(MIN_HOURS)} hour and ${String(MAX_HOURS / 24)} days`,
    };
  return { ok: true, value: { description, budget: budget.value, seconds: BigInt(hours * 3600) } };
}

/**
 * Anvil's publicly known development accounts 0 to 9 (addresses only). On the local chain the
 * node unlocks them, so the screen can play a provider or evaluator that is one of them.
 */
export const ANVIL_ACCOUNTS: readonly Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8F",
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
];

export function isAnvilAccount(account: Address): boolean {
  return ANVIL_ACCOUNTS.some((a) => isAddressEqual(a, account));
}
