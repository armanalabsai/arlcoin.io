import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { HTTPFacilitatorClient } from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";

import {
  ArlUptoFacilitator,
  BASE_SEPOLIA,
  FileAuthorizationStore,
  PaymentNetworkLocked,
  buildUptoRequirements,
  createFacilitatorServer,
  type UptoScheme,
} from "../src/index.ts";

// Test addresses only; ARL is not deployed.
const ARL = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x2222222222222222222222222222222222222222";
const FACILITATOR = "0x3333333333333333333333333333333333333333";
const PAYER = "0x4444444444444444444444444444444444444444";
const NOW = 1_800_000_000;

const tempFile = () => join(mkdtempSync(join(tmpdir(), "arl-store-")), "authorizations.jsonl");

class FakeScheme implements UptoScheme {
  settled: string[] = [];
  verify() {
    return Promise.resolve({ isValid: true, payer: PAYER });
  }
  settle(_p: PaymentPayload, r: PaymentRequirements): Promise<SettleResponse> {
    this.settled.push(r.amount);
    return Promise.resolve({
      success: true,
      transaction: `0x${"ab".repeat(32)}`,
      network: r.network,
      amount: r.amount,
    });
  }
}

const requirements = buildUptoRequirements({
  chainId: 84_532,
  arlToken: ARL,
  maxAmount: 1000n,
  payTo: PAY_TO,
  facilitator: FACILITATOR,
  maxTimeoutSeconds: 300,
});

let nonce = 0;
const payment = (): PaymentPayload => ({
  x402Version: 2,
  accepted: requirements,
  payload: {
    signature: "0x",
    permit2Authorization: {
      from: PAYER,
      spender: BASE_SEPOLIA.uptoProxy,
      nonce: String(++nonce),
      deadline: String(NOW + 300),
      permitted: { token: ARL, amount: "1000" },
      witness: { to: PAY_TO, facilitator: FACILITATOR, validAfter: "0" },
    },
  },
});

describe("file authorization store", () => {
  it("keeps every state across a restart", async () => {
    const path = tempFile();
    const a = new FileAuthorizationStore(path);
    await a.claim("k1", "settling");
    await a.finish("k1", "settled");
    await a.claim("k2", "retired");
    await a.claim("k3", "settling");

    const b = new FileAuthorizationStore(path);
    assert.equal(await b.get("k1"), "settled");
    assert.equal(await b.get("k2"), "retired");
    // In progress when the process stopped: never sent again.
    assert.equal(await b.get("k3"), "settling");
    await assert.rejects(b.claim("k1", "settling"), /already settled/);
    await assert.rejects(b.finish("k2", "settled"), /not being settled/);
  });

  it("drops a last record cut short by a crash and keeps appending cleanly", async () => {
    const path = tempFile();
    await new FileAuthorizationStore(path).claim("k1", "retired");
    appendFileSync(path, '{"key":"k2","sta');
    const b = new FileAuthorizationStore(path);
    assert.equal(await b.get("k1"), "retired");
    assert.equal(await b.get("k2"), undefined);
    await b.claim("k2", "retired");
    assert.equal(await new FileAuthorizationStore(path).get("k2"), "retired");
    assert.equal(readFileSync(path, "utf8").split("\n").length, 3);
  });

  it("refuses a file with a damaged record in the middle", () => {
    const path = tempFile();
    writeFileSync(path, 'nonsense\n{"key":"k","state":"settled"}\n');
    assert.throws(() => new FileAuthorizationStore(path), /line 1 is not a record/);
    writeFileSync(path, '{"key":"k","state":"paid"}\n');
    assert.throws(() => new FileAuthorizationStore(path), /line 1 is not a record/);
  });

  it("makes a restarted facilitator refuse an authorization it already settled", async () => {
    const path = tempFile();
    const scheme = new FakeScheme();
    const make = () =>
      new ArlUptoFacilitator({
        chainId: 84_532,
        arlToken: ARL,
        scheme,
        store: new FileAuthorizationStore(path),
        nowSeconds: () => NOW,
      });
    const p = payment();
    assert.equal((await make().settle(p, { ...requirements, amount: "400" })).success, true);
    const again = await make().settle(p, { ...requirements, amount: "400" });
    assert.equal(again.success, false);
    assert.match(again.errorReason ?? "", /already settled/);
    assert.deepEqual(scheme.settled, ["400"]);
  });
});

async function serve(bearerToken?: string) {
  const scheme = new FakeScheme();
  const server = createFacilitatorServer({
    chainId: 84_532,
    signer: FACILITATOR,
    ...(bearerToken === undefined ? {} : { bearerToken }),
    facilitator: new ArlUptoFacilitator({
      chainId: 84_532,
      arlToken: ARL,
      scheme,
      store: new FileAuthorizationStore(tempFile()),
      nowSeconds: () => NOW,
    }),
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return { scheme, url, close: () => server.close() };
}

describe("facilitator HTTP service", () => {
  it("serves the SDK's facilitator client: supported, verify, settle", async () => {
    const { scheme, url, close } = await serve();
    try {
      const client = new HTTPFacilitatorClient({ url });
      const supported = await client.getSupported();
      assert.deepEqual(supported.kinds, [
        { x402Version: 2, scheme: "upto", network: "eip155:84532" },
      ]);
      assert.deepEqual(supported.signers, { "eip155:84532": [FACILITATOR] });

      const p = payment();
      assert.equal((await client.verify(p, requirements)).isValid, true);
      const settled = await client.settle(p, { ...requirements, amount: "250" });
      assert.equal(settled.success, true);
      assert.deepEqual(scheme.settled, ["250"]);

      const replay = await client.settle(p, { ...requirements, amount: "250" });
      assert.equal(replay.success, false);
      assert.deepEqual(scheme.settled, ["250"]);
    } finally {
      close();
    }
  });

  it("applies ARL's checks: another asset is refused", async () => {
    const { url, close } = await serve();
    try {
      const client = new HTTPFacilitatorClient({ url });
      const other = { ...requirements, asset: PAYER };
      const r = await client.verify({ ...payment(), accepted: other }, other);
      assert.equal(r.isValid, false);
      assert.equal(r.invalidReason, "arl_asset");
    } finally {
      close();
    }
  });

  it("requires the bearer token for verify and settle when one is set", async () => {
    const { scheme, url, close } = await serve("s3cret-token");
    try {
      const anonymous = new HTTPFacilitatorClient({ url });
      await assert.rejects(anonymous.settle(payment(), requirements), /401/);
      const wrong = await fetch(`${url}/settle`, {
        method: "POST",
        headers: { authorization: "Bearer wrong-token!", "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(wrong.status, 401);
      assert.equal((await anonymous.getSupported()).kinds.length, 1);

      const client = new HTTPFacilitatorClient({
        url,
        createAuthHeaders: () => {
          const headers = { Authorization: "Bearer s3cret-token" };
          return Promise.resolve({ verify: headers, settle: headers, supported: {} });
        },
      });
      const settled = await client.settle(payment(), { ...requirements, amount: "1" });
      assert.equal(settled.success, true);
      assert.deepEqual(scheme.settled, ["1"]);
    } finally {
      close();
    }
  });

  it("rejects malformed bodies without echoing details", async () => {
    const { url, close } = await serve();
    try {
      for (const body of [
        "not json",
        "{}",
        JSON.stringify({ paymentPayload: {}, paymentRequirements: {} }),
      ]) {
        const r = await fetch(`${url}/verify`, { method: "POST", body });
        assert.equal(r.status, 400);
      }
      assert.equal((await fetch(`${url}/anything`)).status, 404);
    } finally {
      close();
    }
  });

  it("refuses to start for Base Mainnet", () => {
    assert.throws(
      () =>
        createFacilitatorServer({
          chainId: 8453,
          signer: FACILITATOR,
          facilitator: new FakeScheme(),
        }),
      PaymentNetworkLocked,
    );
  });
});
