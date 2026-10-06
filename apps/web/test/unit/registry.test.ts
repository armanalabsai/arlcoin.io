import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_SUPPLY } from "../../../../packages/tokenomics/src/index.ts";
import {
  HOME,
  LAYERS,
  allPaths,
  nextLayer,
  parsePath,
  pathFor,
} from "../../src/content/registry.ts";
import { TEAM } from "../../src/content/team/registry.ts";
import { DOCS, docPath } from "../../src/content/docs.ts";
import type { Card, Layer } from "../../src/content/types.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function texts(layer: Layer): string[] {
  const out = [layer.title, layer.description, layer.disclaimer ?? ""];
  for (const c of layer.cards) out.push(...cardTexts(c));
  return out;
}

function cardTexts(c: Card): string[] {
  const out = [c.title, c.shortDescription, c.detail.summary];
  if (c.metric?.kind === "static") out.push(c.metric.value, c.metric.unit ?? "");
  if (c.metric?.kind === "unavailable") out.push(c.metric.label);
  for (const f of c.detail.facts ?? []) out.push(f.label, f.value);
  for (const s of c.detail.sections ?? []) out.push(s.heading, s.body ?? "", ...(s.items ?? []));
  for (const l of c.links ?? []) out.push(l.label);
  return out;
}

describe("registry structure", () => {
  it("has the six approved layers in order", () => {
    assert.deepEqual(
      LAYERS.map((l) => l.id),
      ["team", "token", "technology", "security", "roadmap", "ecosystem"],
    );
  });

  it("uses unique, URL-safe ids", () => {
    const layerIds = new Set<string>();
    for (const layer of LAYERS) {
      assert.match(layer.id, SLUG);
      assert.ok(!layerIds.has(layer.id), `duplicate layer ${layer.id}`);
      layerIds.add(layer.id);
      const cardIds = new Set<string>();
      for (const card of layer.cards) {
        assert.match(card.id, SLUG, `${layer.id}/${card.id}`);
        assert.ok(!cardIds.has(card.id), `duplicate card ${layer.id}/${card.id}`);
        cardIds.add(card.id);
      }
    }
  });

  it("keeps every layer between 1 and 12 cards so the orbit layout fits", () => {
    for (const layer of LAYERS) {
      assert.ok(layer.cards.length >= 1 && layer.cards.length <= 12, layer.id);
    }
  });

  it("links only to https URLs or to pages of this site that exist", () => {
    const docs = new Set(["/docs", ...DOCS.map((d) => docPath(d.slug))]);
    for (const layer of LAYERS) {
      for (const card of layer.cards) {
        for (const link of card.links ?? []) {
          if (link.href.startsWith("/")) assert.ok(docs.has(link.href), link.href);
          else assert.match(link.href, /^https:\/\//);
        }
      }
    }
  });
});

describe("routing", () => {
  it("round-trips every path", () => {
    for (const path of allPaths()) {
      const route = parsePath(path);
      assert.ok(route, path);
      assert.equal(pathFor(route.layer?.id, route.card?.id), path);
    }
  });

  it("serves home, 6 layers and every card", () => {
    const cards = LAYERS.reduce((n, l) => n + l.cards.length, 0);
    assert.equal(allPaths().length, 1 + LAYERS.length + cards);
  });

  it("rejects unknown and malformed paths", () => {
    for (const p of ["/", "/core/nope", "/core/team/nope", "/core/team/founder/x", "/team"]) {
      assert.equal(parsePath(p), null, p);
    }
    assert.deepEqual(parsePath("/core/team/"), parsePath("/core/team"));
    assert.deepEqual(parsePath("/core"), HOME);
    assert.deepEqual(parsePath("/core/"), HOME);
  });

  it("cycles home → every layer → home", () => {
    const seen: string[] = [];
    let current = nextLayer(null);
    while (current) {
      seen.push(current.id);
      current = nextLayer(current);
    }
    assert.deepEqual(
      seen,
      LAYERS.map((l) => l.id),
    );
  });
});

describe("content accuracy", () => {
  const token = LAYERS.find((l) => l.id === "token");

  it("states the 21,000,000 ARL maximum supply from packages/tokenomics", () => {
    assert.equal(MAX_SUPPLY, 21_000_000);
    const card = token?.cards.find((c) => c.id === "max-supply");
    assert.deepEqual(card?.metric, { kind: "static", value: "21,000,000", unit: "ARL" });
  });

  it("states 18 decimals", () => {
    const card = token?.cards.find((c) => c.id === "decimals");
    assert.deepEqual(card?.metric, { kind: "static", value: "18" });
  });

  it("never gives deployment-dependent metrics a value", () => {
    const deploymentDependent = [
      "circulating-supply",
      "contract-address",
      "staked",
      "liquidity",
      "network",
    ];
    for (const id of deploymentDependent) {
      const card = token?.cards.find((c) => c.id === id);
      assert.equal(card?.metric?.kind, "unavailable", id);
    }
  });

  it("marks nothing as LIVE", () => {
    for (const layer of LAYERS) {
      for (const card of layer.cards) assert.notEqual(card.status, "LIVE", card.id);
    }
  });

  it("contains no addresses, prices or market data", () => {
    for (const layer of LAYERS) {
      for (const text of texts(layer)) {
        assert.doesNotMatch(text, /0x[0-9a-fA-F]{6,}/, text);
        assert.doesNotMatch(text, /\$\s?\d|market cap|price target|holders:/i, text);
      }
    }
  });

  it("makes no partnership, sponsorship or endorsement claims", () => {
    const forbidden =
      /\b(partnered|partner with|partnership with|official partner|sponsor(ed|s)?|endorse(d|s)?|official integration)\b/i;
    for (const layer of LAYERS) {
      for (const text of texts(layer)) assert.doesNotMatch(text, forbidden, text);
    }
  });

  it("avoids the phrases the content standard rules out", () => {
    const hype =
      /revolution|cutting-edge|next-generation|seamless|unlock the|to the moon|limitless|game-chang|future of/i;
    for (const layer of LAYERS) {
      for (const text of texts(layer)) assert.doesNotMatch(text, hype, text);
    }
  });
});

describe("team publishing rule", () => {
  const teamLayer = LAYERS.find((l) => l.id === "team");
  const INSTITUTIONS =
    /Bitcoin Core|MIT\b|Stanford|KAIST|Harvard|Yale|Carnegie|Berkeley|Columbia|Barcelona|Madrid|Valencia|AGI Core|University|School|Laboratory|B\.S\.|M\.S\.|Doctorate/;

  it("lists only the founder, then the team-growing note and the open roles", () => {
    assert.deepEqual(
      TEAM.map((p) => p.id),
      ["alaz-daghan-gokturk"],
    );
    assert.deepEqual(
      teamLayer?.cards.map((c) => c.id),
      ["alaz-daghan-gokturk", "team-growing", "open-roles"],
    );
    const growing = teamLayer?.cards.find((c) => c.id === "team-growing");
    assert.equal(growing?.person, undefined);
    assert.match(growing?.detail.summary ?? "", /only once .* verified/);
  });

  it("describes open roles without people, employers or credentials", () => {
    const roles = teamLayer?.cards.find((c) => c.id === "open-roles");
    assert.equal(roles?.person, undefined);
    assert.equal(roles?.links, undefined);
    for (const text of cardTexts(roles!)) assert.doesNotMatch(text, INSTITUTIONS, text);
    assert.ok((roles?.detail.sections?.[0]?.items?.length ?? 0) >= 10);
  });

  it("does not show an empty focus line for a profile without expertise", () => {
    for (const card of teamLayer?.cards ?? [])
      assert.doesNotMatch(card.detail.summary, /^Focus: \.$/);
  });

  it("gives every profile a verification status", () => {
    for (const p of TEAM) {
      assert.ok(["verified", "unverified", "placeholder"].includes(p.verificationStatus), p.id);
    }
  });

  it("shows no education or career claims for profiles that are not verified", () => {
    for (const card of teamLayer?.cards ?? []) {
      if (card.person?.verificationStatus === "verified") continue;
      for (const text of cardTexts(card))
        assert.doesNotMatch(text, INSTITUTIONS, `${card.id}: ${text}`);
      assert.equal(card.links, undefined, `${card.id} must not show links`);
    }
  });

  it("marks unverified profiles as such in the detail", () => {
    for (const card of teamLayer?.cards ?? []) {
      if (card.person?.verificationStatus !== "unverified") continue;
      const facts = card.detail.facts ?? [];
      assert.ok(
        facts.some((f) => f.label === "Profile" && f.value === "Not yet verified"),
        card.id,
      );
    }
  });

  it("keeps expertise free of institution names", () => {
    for (const p of TEAM) {
      for (const e of p.expertise) assert.doesNotMatch(e, INSTITUTIONS, `${p.id}: ${e}`);
    }
  });

  it("records no nationality or ethnicity and no invented portraits or links", () => {
    for (const p of TEAM) {
      const keys = Object.keys(p);
      assert.ok(!keys.some((k) => /national|ethnic|race/i.test(k)), p.id);
      if (p.verificationStatus !== "verified") {
        assert.equal(p.portrait, undefined, p.id);
        assert.equal(p.links, undefined, p.id);
      }
    }
  });

  it("never displays birth years", () => {
    for (const card of teamLayer?.cards ?? []) {
      for (const text of cardTexts(card))
        assert.doesNotMatch(text, /\b(19|20)\d\d\b/, `${card.id}: ${text}`);
    }
  });
});
