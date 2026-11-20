import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeAbiParameters, decodeFunctionData, parseAbi, parseAbiParameters } from "viem";

import {
  EAS,
  EAS_SCHEMA_REGISTRY,
  RECEIPT_SCHEMA,
  encodeReceipt,
  prepareReceiptAttestation,
  prepareReceiptSchemaRegistration,
  receiptFromAudit,
  receiptSchemaUid,
  type JobAudit,
} from "../src/index.ts";

const CLIENT = "0x00000000000000000000000000000000000000A1";
const PROVIDER = "0x00000000000000000000000000000000000000b2";
const ESCROW = "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC";
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

const entry = (event: string, at: number, detail: Record<string, unknown>, actor?: string) => ({
  step: event,
  event,
  contract: "evaluator" as const,
  block: BigInt(at),
  at,
  transaction: h(at),
  logIndex: 0,
  ...(actor ? { actor: actor as `0x${string}` } : {}),
  detail: detail as JobAudit["entries"][number]["detail"],
});

const audit = (finalized: boolean): JobAudit => ({
  token: "ARL",
  escrow: ESCROW,
  evaluator: "0x0D160C869bd2a7AaEDd29e11fc60fdAEf21c3E28",
  jobId: 7n,
  block: 999n,
  entries: [
    entry("JobCreated", 100, { provider: PROVIDER }, CLIENT),
    entry("Configured", 101, { providerAgentId: "42", specHash: h(1) }),
    entry("JobSubmitted", 102, { deliverable: h(2) }, PROVIDER),
    ...(finalized ? [entry("Finalized", 200, { approved: true, voteHash: h(3) })] : []),
  ],
});

describe("job receipt", () => {
  it("exists only for a finalized job, and restates the trail", () => {
    assert.equal(receiptFromAudit(audit(false)), null);
    const r = receiptFromAudit(audit(true));
    assert.ok(r);
    assert.deepEqual(
      [r.chainId, r.jobId, r.client, r.provider, r.providerAgentId, r.approved, r.finalizedAt],
      [8453, 7n, CLIENT, PROVIDER, 42n, true, 200],
    );
    assert.deepEqual([r.specHash, r.deliverable, r.voteHash], [h(1), h(2), h(3)]);
  });

  it("encodes the receipt in the schema's field order", () => {
    const r = receiptFromAudit(audit(true));
    assert.ok(r);
    const decoded = decodeAbiParameters(parseAbiParameters(RECEIPT_SCHEMA), encodeReceipt(r));
    assert.equal(decoded[0], 8453n);
    assert.equal(decoded[2], 7n);
    assert.equal(decoded[3], CLIENT);
    assert.equal(decoded[6], true);
    assert.equal(decoded[10], 200n);
  });

  it("prepares unsigned calls to EAS: attest to the provider, register the schema", () => {
    const r = receiptFromAudit(audit(true));
    assert.ok(r);
    const attest = prepareReceiptAttestation(r);
    assert.equal(attest.to, EAS);
    assert.equal(attest.value, "0");
    const call = decodeFunctionData({
      abi: parseAbi([
        "struct D { address recipient; uint64 expirationTime; bool revocable; bytes32 refUID; bytes data; uint256 value; }",
        "struct R { bytes32 schema; D data; }",
        "function attest(R request) payable returns (bytes32)",
      ]),
      data: attest.data,
    });
    const request = call.args[0];
    assert.equal(request.schema, receiptSchemaUid());
    assert.equal(request.data.recipient, PROVIDER);
    assert.equal(request.data.revocable, false);
    assert.equal(request.data.data, encodeReceipt(r));

    const register = prepareReceiptSchemaRegistration();
    assert.equal(register.to, EAS_SCHEMA_REGISTRY);
    assert.match(receiptSchemaUid(), /^0x[0-9a-f]{64}$/);
  });
});
