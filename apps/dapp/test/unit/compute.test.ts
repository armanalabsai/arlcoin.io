import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  billedSeconds,
  computeCeiling,
  describeCapacity,
  formatDuration,
  settleRun,
} from "../../lib/compute.ts";
import { encodeRegistration, parseRegistration, validateService } from "../../lib/registry.ts";

const ARL = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const PAY = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const FAC = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

const gpu = {
  kind: "gpu",
  gpuModel: "NVIDIA H100 80GB",
  gpus: 2,
  gpuMemoryGb: 80,
  vcpus: 32,
  memoryGb: 256,
  maxSeconds: 3600,
};
const input = (compute: Record<string, unknown>, unit = "GPU second") => ({
  name: "H100 pair",
  description: "Two H100s for batch inference and fine-tuning.",
  endpoint: "https://gpu.example.org/jobs",
  compute,
  terms: {
    network: "eip155:31337",
    asset: ARL,
    unitPrice: "100000000000000", // 0.0001 ARL per GPU second
    unit,
    payTo: PAY,
    facilitator: FAC,
  },
});

describe("compute capacity in the registration file", () => {
  it("round-trips GPU and CPU capacity", () => {
    const g = validateService(input(gpu));
    const parsed = parseRegistration(encodeRegistration(g));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value, g);
    assert.equal(parsed.value.compute?.gpuModel, "NVIDIA H100 80GB");

    const c = validateService(
      input({ kind: "cpu", vcpus: 8, memoryGb: 32, maxSeconds: 600 }, "CPU second"),
    );
    const cp = parseRegistration(encodeRegistration(c));
    assert.ok(cp.ok);
    assert.deepEqual(cp.value.compute, {
      kind: "cpu",
      gpus: 0,
      gpuMemoryGb: 0,
      vcpus: 8,
      memoryGb: 32,
      maxSeconds: 600,
    });
  });

  it("keeps services without capacity as they were", () => {
    const s = validateService({
      ...input(gpu),
      compute: undefined,
      terms: { ...input(gpu).terms, unit: "1,000 tokens" },
    });
    assert.equal("compute" in s, false);
    const parsed = parseRegistration(encodeRegistration(s));
    assert.ok(parsed.ok);
    assert.equal(parsed.value.compute, undefined);
  });

  it("rejects capacity that is missing, out of range or priced in the wrong unit", () => {
    const bad: Record<string, unknown>[] = [
      { ...gpu, kind: "tpu" },
      { ...gpu, gpuModel: "" },
      { ...gpu, gpuModel: undefined },
      { ...gpu, gpus: 0 },
      { ...gpu, gpus: 65 },
      { ...gpu, gpus: 1.5 },
      { ...gpu, gpuMemoryGb: 0 },
      { ...gpu, vcpus: 0 },
      { ...gpu, memoryGb: 20_000 },
      { ...gpu, maxSeconds: 59 },
      { ...gpu, maxSeconds: 86_401 },
      { ...gpu, maxSeconds: "3600" },
      { kind: "cpu", gpus: 1, vcpus: 8, memoryGb: 32, maxSeconds: 600 },
      { kind: "cpu", gpuModel: "x", vcpus: 8, memoryGb: 32, maxSeconds: 600 },
    ];
    for (const b of bad) assert.throws(() => validateService(input(b)), JSON.stringify(b));
    assert.throws(() => validateService(input(gpu, "CPU second")), /priced per GPU second/);
    assert.throws(() => validateService(input(gpu, "1,000 tokens")));
  });

  it("does not list a file whose capacity is malformed", () => {
    const uri = encodeRegistration(validateService(input(gpu)));
    const file = JSON.parse(Buffer.from(uri.split(",")[1]!, "base64").toString()) as {
      arl: Record<string, unknown>;
    };
    for (const compute of [null, "big", { ...gpu, gpus: -1 }]) {
      file.arl.compute = compute;
      const tampered = `data:application/json;base64,${Buffer.from(JSON.stringify(file)).toString("base64")}`;
      assert.equal(parseRegistration(tampered).ok, false, JSON.stringify(compute));
    }
  });
});

describe("per-second billing", () => {
  const service = validateService(input(gpu));
  const price = 100_000_000_000_000n;

  it("bills whole seconds, rounding up", () => {
    assert.equal(billedSeconds(0, 0), 0n);
    assert.equal(billedSeconds(0, 1), 1n);
    assert.equal(billedSeconds(0, 1000), 1n);
    assert.equal(billedSeconds(0, 1001), 2n);
    assert.equal(billedSeconds(5_000, 65_000), 60n);
    assert.throws(() => billedSeconds(10, 9));
    assert.throws(() => billedSeconds(0, Number.NaN));
  });

  it("signs a ceiling for at most the provider's longest job", () => {
    assert.equal(computeCeiling(service, 600), price * 600n);
    assert.equal(computeCeiling(service, 3600), price * 3600n);
    assert.throws(() => computeCeiling(service, 0));
    assert.throws(() => computeCeiling(service, 3601));
    assert.throws(() => computeCeiling(service, 1.5));
  });

  it("settles the seconds used, never above the ceiling", () => {
    const ceiling = computeCeiling(service, 600);
    assert.deepEqual(settleRun(service, 0, 90_500, ceiling), {
      seconds: 91n,
      amount: price * 91n,
      capped: false,
    });
    assert.deepEqual(settleRun(service, 0, 700_000, ceiling), {
      seconds: 700n,
      amount: ceiling,
      capped: true,
    });
  });

  it("refuses services that are not compute", () => {
    const ai = validateService({
      ...input(gpu),
      compute: undefined,
      terms: { ...input(gpu).terms, unit: "1,000 tokens" },
    });
    assert.throws(() => computeCeiling(ai, 10));
    assert.throws(() => settleRun(ai, 0, 1, 1n));
    assert.equal(describeCapacity(ai), undefined);
  });

  it("describes capacity in one line", () => {
    assert.equal(
      describeCapacity(service),
      "2 × NVIDIA H100 80GB (80 GB), 32 vCPU, 256 GB RAM, jobs up to 1 h",
    );
    assert.deepEqual(
      [formatDuration(90), formatDuration(600), formatDuration(7200)],
      ["90 s", "10 min", "2 h"],
    );
  });
});
