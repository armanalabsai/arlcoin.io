import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { THROTTLE_LIMIT, handle, parseRegistration } from "../../api/whitelist.mjs";

const VALID = {
  wallet: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  email: "Holder@Example.com",
  noticeVersion: "2026-11-12",
  privacyAccepted: true,
  transferConsent: true,
};

/** An in-memory stand-in for the D1 binding: the throttle count and the insert. */
function fakeDb(recent = 0) {
  const rows: unknown[][] = [];
  const db = {
    rows,
    prepare(sql: string) {
      return {
        first: () => Promise.resolve(sql.startsWith("SELECT") ? { n: recent } : null),
        bind: (...args: unknown[]) => ({
          run: () => {
            if (!rows.some((r) => r[0] === args[0] || r[1] === args[1])) rows.push(args);
            return Promise.resolve({ success: true });
          },
        }),
      };
    },
  };
  return db;
}

const post = (body: unknown) =>
  new Request("https://arlcoin.io/api/whitelist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("whitelist API", () => {
  it("normalises a valid registration", () => {
    assert.deepEqual(parseRegistration(VALID), {
      wallet: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
      email: "holder@example.com",
      notice: "2026-11-12",
    });
  });

  it("refuses missing consent, bad addresses and bad emails", () => {
    assert.equal(parseRegistration({ ...VALID, privacyAccepted: false }), null);
    assert.equal(parseRegistration({ ...VALID, transferConsent: "yes" }), null);
    assert.equal(parseRegistration({ ...VALID, wallet: "0x123" }), null);
    assert.equal(parseRegistration({ ...VALID, wallet: "0x" + "0".repeat(40) }), null);
    assert.equal(parseRegistration({ ...VALID, email: "not-an-email" }), null);
    assert.equal(parseRegistration({ ...VALID, noticeVersion: "" }), null);
    assert.equal(parseRegistration(null), null);
  });

  it("stores once and answers the same for a repeated registration", async () => {
    const db = fakeDb();
    const first = await handle(post(VALID), db);
    const again = await handle(post(VALID), db);
    assert.equal(first.status, 200);
    assert.equal(again.status, 200);
    assert.deepEqual(await first.json(), await again.json());
    assert.equal(db.rows.length, 1);
    assert.deepEqual(db.rows[0], [
      "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
      "holder@example.com",
      "2026-11-12",
    ]);
  });

  it("never returns stored data", async () => {
    const res = await handle(post(VALID), fakeDb());
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("refuses other methods, bad JSON, large bodies and a missing database", async () => {
    const get = new Request("https://arlcoin.io/api/whitelist");
    assert.equal((await handle(get, fakeDb())).status, 405);
    assert.equal((await handle(post("{"), fakeDb())).status, 400);
    assert.equal((await handle(post("x".repeat(3000)), fakeDb())).status, 413);
    assert.equal((await handle(post(VALID), undefined)).status, 503);
  });

  it("throttles when too many registrations arrived recently", async () => {
    const db = fakeDb(THROTTLE_LIMIT);
    assert.equal((await handle(post(VALID), db)).status, 429);
    assert.equal(db.rows.length, 0);
  });
});
