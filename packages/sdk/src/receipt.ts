// A portable receipt for a finalized verified job, as an Ethereum Attestation Service (EAS)
// attestation on Base. The receipt restates what the escrow and the evaluator already recorded
// (who, what was delivered, what the committee decided), in one record another platform can read
// without knowing ARL's contracts.
//
// Nothing here signs or sends. The SDK builds the receipt from the job's audit trail and prepares
// the unsigned `attest` transaction; whoever wants the receipt on EAS (usually the provider, whose
// record it is) sends it from their own wallet. A receipt is only as true as the job it names:
// anyone can check it against the audit trail, and this module's `receiptFromAudit` is that check.

import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import type { HistoryOptions } from "./agentScore.ts";
import { getJobAudit, type JobAudit } from "./audit.ts";
import { publicClientOf, type ReadClient } from "./client.ts";

/** EAS and its SchemaRegistry on Base (OP Stack predeploys). */
export const EAS: Address = "0x4200000000000000000000000000000000000021";
export const EAS_SCHEMA_REGISTRY: Address = "0x4200000000000000000000000000000000000020";

/** The receipt's EAS schema. Field order and types are part of the schema's identity. */
export const RECEIPT_SCHEMA =
  "uint256 chainId,address escrow,uint256 jobId,address client,address provider,uint256 providerAgentId,bool approved,bytes32 deliverable,bytes32 specHash,bytes32 voteHash,uint64 finalizedAt";

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32: Hex = `0x${"00".repeat(32)}`;

const easAbi = parseAbi([
  "struct AttestationRequestData { address recipient; uint64 expirationTime; bool revocable; bytes32 refUID; bytes data; uint256 value; }",
  "struct AttestationRequest { bytes32 schema; AttestationRequestData data; }",
  "function attest(AttestationRequest request) payable returns (bytes32)",
]);
const registryAbi = parseAbi([
  "struct SchemaRecord { bytes32 uid; address resolver; bool revocable; string schema; }",
  "function register(string schema, address resolver, bool revocable) returns (bytes32)",
  "function getSchema(bytes32 uid) view returns (SchemaRecord)",
]);

/** The schema's UID: no resolver, not revocable (a settled job does not change). */
export function receiptSchemaUid(): Hex {
  return keccak256(
    encodePacked(["string", "address", "bool"], [RECEIPT_SCHEMA, ZERO_ADDRESS, false]),
  );
}

export interface JobReceipt {
  chainId: number;
  escrow: Address;
  jobId: bigint;
  client: Address;
  provider: Address;
  providerAgentId: bigint;
  /** The committee's verdict as finalized: true paid the provider, false refunded the client. */
  approved: boolean;
  deliverable: Hex;
  specHash: Hex;
  voteHash: Hex;
  /** Unix seconds of the Finalized event. */
  finalizedAt: number;
}

/** An unsigned transaction, for the caller's own wallet. */
export interface PreparedCall {
  to: Address;
  data: Hex;
  value: "0";
}

const bytes32 = (v: unknown): Hex | null =>
  typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as Hex) : null;

/**
 * The receipt of a job, from its audit trail. Null while the job is not finalized, or when the
 * trail lacks an event the receipt needs (it is then not a job of the verified evaluator).
 */
export function receiptFromAudit(audit: JobAudit, chainId = 8453): JobReceipt | null {
  const last = (event: string) => audit.entries.filter((e) => e.event === event).at(-1);
  const created = last("JobCreated");
  const configured = last("Configured");
  const submitted = last("JobSubmitted");
  const finalized = last("Finalized");
  if (!created?.actor || !configured || !finalized) return null;
  const provider = created.detail.provider;
  const agent = configured.detail.providerAgentId;
  const specHash = bytes32(configured.detail.specHash);
  const voteHash = bytes32(finalized.detail.voteHash);
  if (
    typeof provider !== "string" ||
    typeof agent !== "string" ||
    typeof finalized.detail.approved !== "boolean" ||
    !specHash ||
    !voteHash
  )
    return null;
  return {
    chainId,
    escrow: audit.escrow,
    jobId: audit.jobId,
    client: created.actor,
    provider: provider as Address,
    providerAgentId: BigInt(agent),
    approved: finalized.detail.approved,
    // A job rejected before any delivery has no deliverable.
    deliverable: bytes32(submitted?.detail.deliverable) ?? ZERO_BYTES32,
    specHash,
    voteHash,
    finalizedAt: finalized.at,
  };
}

/** The receipt as EAS attestation data, in the schema's field order. */
export function encodeReceipt(r: JobReceipt): Hex {
  return encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "address" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "bool" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint64" },
    ],
    [
      BigInt(r.chainId),
      r.escrow,
      r.jobId,
      r.client,
      r.provider,
      r.providerAgentId,
      r.approved,
      r.deliverable,
      r.specHash,
      r.voteHash,
      BigInt(r.finalizedAt),
    ],
  );
}

/** The unsigned EAS `attest` call for a receipt: recipient is the provider, never expires. */
export function prepareReceiptAttestation(r: JobReceipt): PreparedCall {
  return {
    to: EAS,
    data: encodeFunctionData({
      abi: easAbi,
      functionName: "attest",
      args: [
        {
          schema: receiptSchemaUid(),
          data: {
            recipient: r.provider,
            expirationTime: 0n,
            revocable: false,
            refUID: ZERO_BYTES32,
            data: encodeReceipt(r),
            value: 0n,
          },
        },
      ],
    }),
    value: "0",
  };
}

/** The unsigned call that registers the receipt schema; needed once, by anyone. */
export function prepareReceiptSchemaRegistration(): PreparedCall {
  return {
    to: EAS_SCHEMA_REGISTRY,
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: "register",
      args: [RECEIPT_SCHEMA, ZERO_ADDRESS, false],
    }),
    value: "0",
  };
}

export interface JobReceiptAnswer {
  /** The block the job was read at. */
  block: bigint;
  /** Null while the job is not finalized. */
  receipt: JobReceipt | null;
  schema: string;
  schemaUid: Hex;
  /** Whether the schema is registered on EAS yet; an attestation needs it. */
  schemaRegistered: boolean;
  /** The unsigned `attest` call, when there is a receipt. */
  attest?: PreparedCall;
  /** The unsigned `register` call, while the schema is not registered. */
  registerSchema?: PreparedCall;
}

/** Reads a job's receipt and prepares the calls that put it on EAS. */
export async function getJobReceipt(
  c: ReadClient,
  token: "ARL" | "USDC" | Address,
  jobId: bigint,
  opts: HistoryOptions = {},
): Promise<JobReceiptAnswer> {
  const client = publicClientOf(c);
  const audit = await getJobAudit(client, token, jobId, opts);
  const receipt = receiptFromAudit(audit);
  const schemaUid = receiptSchemaUid();
  const record = await client.readContract({
    address: EAS_SCHEMA_REGISTRY,
    abi: registryAbi,
    functionName: "getSchema",
    args: [schemaUid],
    blockNumber: audit.block,
  });
  const schemaRegistered = record.uid.toLowerCase() === schemaUid.toLowerCase();
  return {
    block: audit.block,
    receipt,
    schema: RECEIPT_SCHEMA,
    schemaUid,
    schemaRegistered,
    ...(receipt ? { attest: prepareReceiptAttestation(receipt) } : {}),
    ...(schemaRegistered ? {} : { registerSchema: prepareReceiptSchemaRegistration() }),
  };
}
