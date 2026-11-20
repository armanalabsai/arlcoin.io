import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DELIVERABLE_HEADER,
  JOB_HEADER,
  expressPayOnProof,
  payOnProof,
  type PayOnProofConfig,
  type PayOnProofDeps,
  type VerifiedClients,
} from "../src/index.ts";

const PROVIDER = "0x00000000000000000000000000000000000000aa";
const CLIENT = "0x00000000000000000000000000000000000000bb";
const DELIVERABLE = `0x${"ab".repeat(32)}` as const;
const JOBS = "0x9aE99bF9a59aF47E81346B7c0b93Cd2B610455fC";
const HEADER = `8453:${JOBS}:7`;

const clients = { publicClient: {}, walletClient: {} } as unknown as VerifiedClients;

function setup(over: Partial<PayOnProofDeps> = {}, extra: Partial<PayOnProofConfig> = {}) {
  const calls: string[] = [];
  let submitted: { jobId: bigint; deliverable: string } | null = null;
  const deps: PayOnProofDeps = {
    checkFundedJob: () => {
      calls.push("check");
      return Promise.resolve({ jobId: 7n, client: CLIENT });
    },
    approveCommittee: () => {
      calls.push("approve");
      return Promise.resolve("0x01" as const);
    },
    waitForAcceptance: () => {
      calls.push("wait");
      return Promise.resolve(2);
    },
    submitDeliverable: (_c, _o, jobId, deliverable) => {
      calls.push("submit");
      submitted = { jobId, deliverable };
      return Promise.resolve("0x02" as const);
    },
    ...over,
  };
  const pending: Promise<unknown>[] = [];
  let runs = 0;
  const handle = payOnProof(
    {
      clients,
      offer: {
        chainId: 8453,
        provider: PROVIDER,
        specUri: "https://example.com/spec.json",
        specHash: `0x${"11".repeat(32)}`,
        budget: 5n * 10n ** 18n,
        committee: [
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000003",
        ],
        threshold: 2,
      },
      deps,
      waitUntil: (p) => pending.push(p),
      ...extra,
    },
    (_req, job) => {
      runs += 1;
      return Promise.resolve({
        body: JSON.stringify({ ok: true, job: job.jobId.toString() }),
        deliverable: DELIVERABLE,
      });
    },
  );
  return {
    handle,
    calls,
    pending,
    runs: () => runs,
    submitted: () => submitted,
  };
}

const req = (header?: string) =>
  new Request("https://service.example/run", {
    method: "POST",
    headers: header ? { [JOB_HEADER]: header } : {},
    body: "{}",
  });

describe("pay-on-proof", () => {
  it("answers 402 with the arl-escrow offer when no job is named", async () => {
    const s = setup();
    const res = await s.handle(req());
    assert.equal(res.status, 402);
    const body = (await res.json()) as { accepts: { scheme: string; payTo: string }[] };
    const [first] = body.accepts;
    assert.ok(first);
    assert.equal(first.scheme, "arl-escrow");
    assert.equal(first.payTo.toLowerCase(), PROVIDER);
    assert.equal(s.runs(), 0);
  });

  it("refuses a job that does not match the offer, with the reason, before any work", async () => {
    const s = setup({
      checkFundedJob: () => Promise.reject(new Error("job 7: not funded")),
    });
    const res = await s.handle(req(HEADER));
    assert.equal(res.status, 402);
    assert.match(((await res.json()) as { error: string }).error, /not funded/);
    assert.equal(s.runs(), 0);
  });

  it("runs the work once for a funded job and submits its deliverable after acceptance", async () => {
    const s = setup();
    const res = await s.handle(req(HEADER));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get(JOB_HEADER), HEADER);
    assert.equal(res.headers.get(DELIVERABLE_HEADER), DELIVERABLE);
    assert.deepEqual(await res.json(), { ok: true, job: "7" });
    await Promise.all(s.pending);
    assert.deepEqual(s.calls, ["check", "approve", "wait", "submit"]);
    assert.deepEqual(s.submitted(), { jobId: 7n, deliverable: DELIVERABLE });
  });

  it("serves a job only once", async () => {
    const s = setup();
    assert.equal((await s.handle(req(HEADER))).status, 200);
    const again = await s.handle(req(HEADER));
    assert.equal(again.status, 409);
    assert.equal(s.runs(), 1);
  });

  it("releases the job when the committee approval fails, so the client can retry", async () => {
    let fail = true;
    const s = setup({
      approveCommittee: () =>
        fail ? Promise.reject(new Error("rpc down")) : Promise.resolve("0x01" as const),
    });
    assert.equal((await s.handle(req(HEADER))).status, 503);
    fail = false;
    assert.equal((await s.handle(req(HEADER))).status, 200);
    assert.equal(s.runs(), 1);
  });

  it("reports a failed background submission without failing the response", async () => {
    const errors: bigint[] = [];
    const s = setup(
      {
        waitForAcceptance: () => Promise.reject(new Error("1 of 2 members accepted")),
      },
      { onError: (_e, jobId) => errors.push(jobId) },
    );
    assert.equal((await s.handle(req(HEADER))).status, 200);
    await Promise.all(s.pending);
    assert.deepEqual(errors, [7n]);
  });

  it("works as an Express handler", async () => {
    const config: PayOnProofConfig = {
      clients,
      offer: {
        chainId: 8453,
        provider: PROVIDER,
        specUri: "https://example.com/spec.json",
        specHash: `0x${"11".repeat(32)}`,
        budget: 1n,
        committee: [
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
          "0x0000000000000000000000000000000000000003",
        ],
        threshold: 2,
      },
    };
    const mw = expressPayOnProof(config, () =>
      Promise.resolve({ body: "x", deliverable: DELIVERABLE }),
    );
    const out: { status?: number; headers: Record<string, string>; body?: Buffer } = {
      headers: {},
    };
    const res = {
      status(code: number) {
        out.status = code;
        return res;
      },
      setHeader(name: string, value: string) {
        out.headers[name] = value;
      },
      send(body: unknown) {
        out.body = body as Buffer;
      },
    };
    await mw(
      {
        method: "POST",
        originalUrl: "/run",
        protocol: "https",
        headers: { "content-type": "application/json" },
        body: { prompt: "hi" },
        get: () => "service.example",
      },
      res,
      (e) => {
        throw e;
      },
    );
    assert.equal(out.status, 402);
    assert.equal(out.headers["content-type"], "application/json");
    assert.match(out.body?.toString() ?? "", /arl-escrow/);
  });
});
