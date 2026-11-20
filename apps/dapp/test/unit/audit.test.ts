import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditUrl, parseAudit } from "../../lib/audit.ts";

const TX = `0x${"ab".repeat(32)}`;
const WHO = `0x${"12".repeat(20)}`;
const entry = { step: "The client opened the job", event: "JobCreated", at: 1_795_191_666 };

describe("ARLscan audit trail", () => {
  it("names the API route of a job", () => {
    assert.equal(auditUrl(7n), "/api/v1/jobs/ARL/7/audit");
    assert.equal(auditUrl(7n, "USDC"), "/api/v1/jobs/USDC/7/audit");
  });

  it("keeps well-formed steps and drops the rest", () => {
    const a = parseAudit({
      block: "60100000",
      entries: [
        { ...entry, transaction: TX, actor: WHO },
        { ...entry, transaction: TX, actor: "not an address" },
        { ...entry, transaction: "0x12" },
        { ...entry, step: "line\u0000break", transaction: TX },
        { ...entry, at: "soon", transaction: TX },
        null,
      ],
    });
    assert.equal(a.block, "60100000");
    assert.equal(a.steps.length, 2);
    assert.equal(a.steps[0]?.actor, WHO);
    assert.equal(a.steps[1]?.actor, undefined);
  });

  it("refuses an answer that is not a trail", () => {
    assert.throws(() => parseAudit({ error: "chain read failed" }), /not an audit trail/);
    assert.throws(() => parseAudit({ block: "x", entries: [] }), /not an audit trail/);
    assert.throws(() => parseAudit(null), /not an audit trail/);
  });
});
