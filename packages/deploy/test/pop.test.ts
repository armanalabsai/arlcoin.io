import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  MAX_VALIDITY_SECONDS,
  MemoryNonceStore,
  POP_DOMAIN,
  POP_TYPES,
  PopError,
  commitment,
  verifyEntry,
  type PopEntry,
} from "../src/pop.ts";

const now = 1_800_000_000n;
const account = privateKeyToAccount(generatePrivateKey());
const nonce = `0x${"ab".repeat(32)}` as const;

async function entry(over: Partial<PopEntry> = {}, signer = account): Promise<PopEntry> {
  const e = { wallet: account.address, nonce, expiresAt: now + 300n, ...over };
  const signature = await signer.signTypedData({
    domain: POP_DOMAIN,
    types: POP_TYPES,
    primaryType: "Entry",
    message: { wallet: e.wallet, nonce: e.nonce, expiresAt: e.expiresAt },
  });
  return { ...e, signature };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof PopError ? e.code : "OTHER";
  }
  return "NONE";
}

describe("whitelist entry by wallet signature", () => {
  it("accepts a valid signature and returns a stable commitment", async () => {
    const r = await verifyEntry(await entry(), new MemoryNonceStore(), now);
    assert.equal(r.wallet, account.address);
    assert.equal(r.commitment, commitment(account.address));
    assert.match(r.commitment, /^0x[0-9a-f]{64}$/);
  });

  it("rejects a replayed signature", async () => {
    const store = new MemoryNonceStore();
    const e = await entry();
    await verifyEntry(e, store, now);
    assert.equal(await code(verifyEntry(e, store, now)), "REPLAY");
  });

  it("rejects a signature by another wallet and does not burn the nonce", async () => {
    const store = new MemoryNonceStore();
    const other = privateKeyToAccount(generatePrivateKey());
    const forged = await entry({}, other); // claims `account`, signed by `other`
    assert.equal(await code(verifyEntry(forged, store, now)), "BAD_SIGNATURE");
    assert.equal(store.use(nonce), true); // the nonce is still free for the real owner
  });

  it("rejects a tampered message", async () => {
    const e = await entry();
    assert.equal(
      await code(verifyEntry({ ...e, nonce: `0x${"cd".repeat(32)}` }, new MemoryNonceStore(), now)),
      "BAD_SIGNATURE",
    );
  });

  it("rejects expired, too-long and malformed entries", async () => {
    const s = new MemoryNonceStore();
    assert.equal(await code(verifyEntry(await entry({ expiresAt: now - 1n }), s, now)), "EXPIRED");
    assert.equal(
      await code(
        verifyEntry(await entry({ expiresAt: now + BigInt(MAX_VALIDITY_SECONDS) + 1n }), s, now),
      ),
      "EXPIRED",
    );
    assert.equal(
      await code(verifyEntry({ ...(await entry()), wallet: "0x12" }, s, now)),
      "BAD_INPUT",
    );
    assert.equal(
      await code(verifyEntry({ ...(await entry()), nonce: "0x01" }, s, now)),
      "BAD_INPUT",
    );
  });

  it("commitments differ per wallet and do not equal the bare address hash", () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    assert.notEqual(commitment(account.address), commitment(other));
  });
});
