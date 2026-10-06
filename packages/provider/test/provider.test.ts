import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";

import {
  ArlUptoFacilitator,
  BASE_SEPOLIA,
  InMemoryAuthorizationStore,
  PaymentNetworkLocked,
  type Permit2Authorization,
  type UptoScheme,
} from "@arl/payments";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";

import {
  ComputeProvider,
  MAX_RUN_SECONDS,
  ProviderError,
  billedSeconds,
  createProviderServer,
  runProcess,
  type ComputeJob,
  type ProviderConfig,
  type Runner,
} from "../src/index.ts";

// Test addresses only; ARL is not deployed.
const ARL = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x2222222222222222222222222222222222222222";
const FACILITATOR = "0x3333333333333333333333333333333333333333";
const PAYER = "0x4444444444444444444444444444444444444444";
const PRICE = 10n ** 15n; // 0.001 ARL per second
const NOW = 1_800_000_000;

const node = (script: string): ComputeJob => ({ command: process.execPath, args: ["-e", script] });
const JOBS = {
  echo: node("process.stdin.pipe(process.stdout)"),
  sleep: node("setTimeout(() => {}, 60_000)"),
  fail: node("process.exit(3)"),
  env: node("process.stdout.write(JSON.stringify(Object.keys(process.env)))"),
  loud: node("process.stdout.write('x'.repeat(5000))"),
};

class FakeScheme implements UptoScheme {
  settled: string[] = [];
  valid = true;
  settles = true;
  verify() {
    return Promise.resolve(
      this.valid ? { isValid: true, payer: PAYER } : { isValid: false, invalidReason: "bad sig" },
    );
  }
  settle(_p: PaymentPayload, r: PaymentRequirements): Promise<SettleResponse> {
    this.settled.push(r.amount);
    return Promise.resolve(
      this.settles
        ? { success: true, transaction: "0xabc", network: r.network, amount: r.amount }
        : { success: false, errorReason: "reverted", transaction: "", network: r.network },
    );
  }
}

let nonce = 0;
function setup(overrides: Partial<ProviderConfig> = {}) {
  const scheme = new FakeScheme();
  const facilitator = new ArlUptoFacilitator({
    chainId: 84_532,
    arlToken: ARL,
    scheme,
    store: new InMemoryAuthorizationStore(),
    nowSeconds: () => NOW,
  });
  const provider = new ComputeProvider({
    chainId: 84_532,
    arlToken: ARL,
    payTo: PAY_TO,
    facilitatorAddress: FACILITATOR,
    pricePerSecond: PRICE,
    maxSeconds: 120,
    jobs: JOBS,
    facilitator,
    ...overrides,
  });
  return { scheme, provider };
}

/** What a payer's wallet would sign for these requirements (signature checked by the SDK). */
function pay(r: PaymentRequirements, n = ++nonce): PaymentPayload {
  const auth: Permit2Authorization = {
    from: PAYER,
    spender: BASE_SEPOLIA.uptoProxy,
    nonce: String(n),
    deadline: String(NOW + r.maxTimeoutSeconds),
    permitted: { token: r.asset, amount: r.amount },
    witness: { to: r.payTo, facilitator: FACILITATOR, validAfter: "0" },
  };
  return { x402Version: 2, accepted: r, payload: { signature: "0x", permit2Authorization: auth } };
}

/** A runner that reports a fixed duration without starting anything. */
const timed =
  (elapsedMs: number, exitCode = 0): Runner =>
  () =>
    Promise.resolve({
      elapsedMs,
      exitCode,
      timedOut: false,
      stdout: Buffer.from("out"),
      stderr: Buffer.alloc(0),
      truncated: false,
    });

describe("billing", () => {
  it("counts any part of a second as a second", () => {
    assert.equal(billedSeconds(0), 0n);
    assert.equal(billedSeconds(1), 1n);
    assert.equal(billedSeconds(1000), 1n);
    assert.equal(billedSeconds(1001), 2n);
    assert.throws(() => billedSeconds(-1));
    assert.throws(() => billedSeconds(Number.NaN));
  });

  it("asks for a ceiling of price × seconds, with time to settle after the run", () => {
    const { provider } = setup();
    const r = provider.requirements("echo", 30);
    assert.equal(r.scheme, "upto");
    assert.equal(r.network, "eip155:84532");
    assert.equal(r.amount, (PRICE * 30n).toString());
    assert.equal(r.maxTimeoutSeconds, 90);
  });

  it("settles the seconds used, rounded up", async () => {
    const { provider, scheme } = setup({ runner: timed(2_400) });
    const r = provider.requirements("echo", 10);
    const out = await provider.execute("echo", 10, Buffer.alloc(0), pay(r));
    assert.equal(out.billedSeconds, 3n);
    assert.equal(out.amount, PRICE * 3n);
    assert.equal(out.capped, false);
    assert.deepEqual(scheme.settled, [(PRICE * 3n).toString()]);
    assert.equal(out.stdout.toString(), "out");
  });

  it("never settles above the signed ceiling", async () => {
    const { provider, scheme } = setup({ runner: timed(10_700) });
    const r = provider.requirements("echo", 10);
    const out = await provider.execute("echo", 10, Buffer.alloc(0), pay(r));
    assert.equal(out.billedSeconds, 11n);
    assert.equal(out.amount, PRICE * 10n);
    assert.equal(out.capped, true);
    assert.deepEqual(scheme.settled, [(PRICE * 10n).toString()]);
  });

  it("bills a job that exits with an error for the time it used", async () => {
    const { provider } = setup({ runner: timed(500, 3) });
    const out = await provider.execute(
      "fail",
      5,
      Buffer.alloc(0),
      pay(provider.requirements("fail", 5)),
    );
    assert.equal(out.exitCode, 3);
    assert.equal(out.amount, PRICE);
  });

  it("retires an authorization when no time was used", async () => {
    const { provider, scheme } = setup({ runner: timed(0) });
    const out = await provider.execute(
      "echo",
      5,
      Buffer.alloc(0),
      pay(provider.requirements("echo", 5)),
    );
    assert.equal(out.amount, 0n);
    assert.equal(out.settlement.success, true);
    assert.deepEqual(scheme.settled, []);
  });
});

describe("refusals", () => {
  it("refuses Base Mainnet when it starts", () => {
    assert.throws(() => setup({ chainId: 8453 }), PaymentNetworkLocked);
  });

  it("refuses runs longer than one authorization can pay for", () => {
    assert.throws(() => setup({ maxSeconds: MAX_RUN_SECONDS + 1 }), /maxSeconds/);
    const { provider } = setup();
    assert.throws(() => provider.requirements("echo", 121), ProviderError);
    assert.throws(() => provider.requirements("echo", 0), ProviderError);
    assert.throws(() => provider.requirements("echo", 1.5), ProviderError);
  });

  it("only runs the provider's own jobs", () => {
    const { provider } = setup();
    assert.throws(() => provider.requirements("rm -rf", 5), /unknown job/);
    assert.throws(() => provider.requirements("constructor", 5), /unknown job/);
  });

  it("refuses a payment for another job length, payee or amount, before running", async () => {
    let ran = false;
    const { provider } = setup({
      runner: () => {
        ran = true;
        return timed(1)(JOBS.echo, Buffer.alloc(0), { seconds: 1, maxOutputBytes: 1 });
      },
    });
    const r = provider.requirements("echo", 10);
    for (const accepted of [
      provider.requirements("echo", 5),
      { ...r, payTo: PAYER },
      { ...r, amount: (PRICE * 100n).toString() },
      { ...r, asset: PAYER },
    ]) {
      await assert.rejects(
        provider.execute("echo", 10, Buffer.alloc(0), { ...pay(r), accepted }),
        (e: unknown) => e instanceof ProviderError && e.status === 402,
      );
    }
    assert.equal(ran, false);
  });

  it("does not run when the facilitator rejects the authorization", async () => {
    const { provider, scheme } = setup({ runner: () => Promise.reject(new Error("must not run")) });
    scheme.valid = false;
    await assert.rejects(
      provider.execute("echo", 5, Buffer.alloc(0), pay(provider.requirements("echo", 5))),
      /payment refused: bad sig/,
    );
  });

  it("runs one authorization once, even when it is sent again", async () => {
    let runs = 0;
    const { provider, scheme } = setup({
      runner: (...a) => {
        runs++;
        return timed(1_000)(...a);
      },
    });
    const p = pay(provider.requirements("echo", 5));
    const [first, second] = await Promise.allSettled([
      provider.execute("echo", 5, Buffer.alloc(0), p),
      provider.execute("echo", 5, Buffer.alloc(0), p),
    ]);
    assert.equal(first.status, "fulfilled");
    assert.equal(second.status, "rejected");
    assert.ok(second.reason instanceof ProviderError && second.reason.status === 409);
    assert.equal(runs, 1);
    assert.equal(scheme.settled.length, 1);
  });

  it("withholds the output when the settlement fails", async () => {
    const { provider, scheme } = setup({ runner: timed(1_000) });
    scheme.settles = false;
    const out = await provider.execute(
      "echo",
      5,
      Buffer.alloc(0),
      pay(provider.requirements("echo", 5)),
    );
    assert.equal(out.settlement.success, false);
    assert.equal(out.stdout.length, 0);
  });

  it("refuses input above the limit", async () => {
    const { provider } = setup({ maxInputBytes: 4 });
    await assert.rejects(
      provider.execute("echo", 5, Buffer.from("12345"), pay(provider.requirements("echo", 5))),
      (e: unknown) => e instanceof ProviderError && e.status === 413,
    );
  });
});

describe("process runner", () => {
  it("passes the input and returns the output", async () => {
    const out = await runProcess(JOBS.echo, Buffer.from("hello"), {
      seconds: 10,
      maxOutputBytes: 100,
    });
    assert.equal(out.stdout.toString(), "hello");
    assert.equal(out.exitCode, 0);
    assert.equal(out.timedOut, false);
  });

  it("kills the job when the paid time runs out", async () => {
    const out = await runProcess(JOBS.sleep, Buffer.alloc(0), { seconds: 1, maxOutputBytes: 100 });
    assert.equal(out.timedOut, true);
    assert.ok(out.elapsedMs >= 1000 && out.elapsedMs < 5000);
    assert.equal(billedSeconds(out.elapsedMs) >= 1n, true);
  });

  it("gives the job none of the provider's environment", async () => {
    process.env.ARL_TEST_SECRET = "must-not-leak";
    const out = await runProcess(JOBS.env, Buffer.alloc(0), {
      seconds: 10,
      maxOutputBytes: 10_000,
    });
    delete process.env.ARL_TEST_SECRET;
    assert.equal(out.stdout.toString().includes("ARL_TEST_SECRET"), false);
  });

  it("caps the output", async () => {
    const out = await runProcess(JOBS.loud, Buffer.alloc(0), { seconds: 10, maxOutputBytes: 1000 });
    assert.equal(out.stdout.length, 1000);
    assert.equal(out.truncated, true);
  });

  it("reports a job that cannot start, and the provider bills nothing", async () => {
    const { provider, scheme } = setup({
      jobs: { missing: { command: "/nonexistent/arl", args: [] } },
    });
    await assert.rejects(
      provider.execute("missing", 5, Buffer.alloc(0), pay(provider.requirements("missing", 5))),
      (e: unknown) => e instanceof ProviderError && e.status === 500,
    );
    assert.deepEqual(scheme.settled, []);
  });
});

describe("x402 HTTP server", () => {
  it("answers 402 with requirements, then runs the job for a payment", async () => {
    const { provider, scheme } = setup();
    const server = createProviderServer(provider).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    try {
      const list = (await (await fetch(`${base}/jobs`)).json()) as {
        jobs: string[];
        maxSeconds: number;
      };
      assert.deepEqual(list.jobs, Object.keys(JOBS));
      assert.equal(list.maxSeconds, 120);

      const unpaid = await fetch(`${base}/jobs/echo?seconds=5`, { method: "POST", body: "hi" });
      assert.equal(unpaid.status, 402);
      const required = decodePaymentRequiredHeader(unpaid.headers.get("PAYMENT-REQUIRED") ?? "");
      const [accepted] = required.accepts;
      assert.ok(accepted);
      assert.equal(accepted.amount, (PRICE * 5n).toString());

      const paid = await fetch(`${base}/jobs/echo?seconds=5`, {
        method: "POST",
        body: "hi",
        headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(pay(accepted)) },
      });
      assert.equal(paid.status, 200);
      const body = (await paid.json()) as { stdout: string; amount: string; billedSeconds: string };
      assert.equal(Buffer.from(body.stdout, "base64").toString(), "hi");
      assert.equal(body.amount, (PRICE * BigInt(body.billedSeconds)).toString());
      const receipt = decodePaymentResponseHeader(paid.headers.get("PAYMENT-RESPONSE") ?? "");
      assert.equal(receipt.success, true);
      assert.deepEqual(scheme.settled, [body.amount]);

      assert.equal((await fetch(`${base}/jobs/nope?seconds=5`, { method: "POST" })).status, 404);
      assert.equal((await fetch(`${base}/jobs/echo?seconds=999`, { method: "POST" })).status, 400);
      const bad = await fetch(`${base}/jobs/echo?seconds=5`, {
        method: "POST",
        headers: { "PAYMENT-SIGNATURE": "not base64 json" },
      });
      assert.equal(bad.status, 400);
    } finally {
      server.close();
    }
  });
});
