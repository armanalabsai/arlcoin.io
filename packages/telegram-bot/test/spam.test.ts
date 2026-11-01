import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Cooldown, FloodLimiter, NewMembers, decide, hasLink, isScam } from "../src/spam.ts";

function clock() {
  const c = { t: 1000, now: () => c.t };
  return c;
}

describe("spam rules", () => {
  it("catches scam phrases", () => {
    for (const text of [
      "Please share your seed phrase to restore access",
      "DM me for a listing",
      "Send me this post",
      "Validate your wallet here",
      "Claim your airdrop now",
      "Our support team will fix it",
      "100x gains guaranteed",
      "We can promote your project",
      "type your 12 words",
    ])
      assert.ok(isScam(text), text);
  });

  it("lets normal messages pass", () => {
    for (const text of [
      "How does the ceiling work in x402 upto?",
      "When is mainnet planned?",
      "Is the token contract upgradeable?",
      "",
      null,
    ])
      assert.ok(!isScam(text), String(text));
  });

  it("detects links", () => {
    assert.ok(hasLink("see https://example.com"));
    assert.ok(hasLink("join t.me/somegroup"));
    assert.ok(hasLink("visit scam.xyz now"));
    assert.ok(hasLink("plain text", true));
    assert.ok(!hasLink("no links here at all"));
  });

  it("flags a flood inside the window only", () => {
    const c = clock();
    const f = new FloodLimiter(5, 10, 10_000, c.now);
    for (let i = 0; i < 5; i++) assert.ok(!f.hit(1, 2));
    assert.ok(f.hit(1, 2));
    assert.ok(!f.hit(1, 3));
    c.t += 11;
    assert.ok(!f.hit(1, 2));
  });

  it("keeps the flood memory bounded", () => {
    const c = clock();
    const f = new FloodLimiter(5, 10, 100, c.now);
    for (let uid = 0; uid < 1000; uid++) {
      f.hit(1, uid);
      c.t += 11;
    }
    assert.ok(f.events.size <= 100);
  });

  it("ends the new-member probation", () => {
    const c = clock();
    const m = new NewMembers(60, 50_000, c.now);
    assert.ok(!m.onProbation(1, 2));
    m.joined(1, 2);
    assert.ok(m.onProbation(1, 2));
    c.t += 61;
    assert.ok(!m.onProbation(1, 2));
  });

  it("applies the command cooldown per chat and command", () => {
    const c = clock();
    const cd = new Cooldown(30, c.now);
    assert.ok(cd.ready(1, "help"));
    assert.ok(!cd.ready(1, "help"));
    assert.ok(cd.ready(1, "start"));
    assert.ok(cd.ready(2, "help"));
    c.t += 31;
    assert.ok(cd.ready(1, "help"));
  });

  it("decides the action for a message", () => {
    const base = {
      text: "hello",
      isAdmin: false,
      isForward: false,
      hasLinkEntity: false,
      onProbation: false,
      flooding: false,
    };
    assert.equal(decide(base), null);
    assert.equal(decide({ ...base, flooding: true }), "flood");
    assert.equal(decide({ ...base, text: "dm me" }), "scam");
    assert.equal(decide({ ...base, text: "https://x.io", onProbation: true }), "delete");
    assert.equal(decide({ ...base, isForward: true, onProbation: true }), "delete");
    assert.equal(decide({ ...base, text: "https://x.io" }), null);
    assert.equal(decide({ ...base, text: "dm me", isAdmin: true, flooding: true }), null);
  });
});
