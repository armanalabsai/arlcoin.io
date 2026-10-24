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
import { DOCS, docPath } from "../../src/content/docs.ts";
import { SITE } from "../../src/content/site.ts";
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
  it("has the five approved layers in order", () => {
    assert.deepEqual(
      LAYERS.map((l) => l.id),
      ["token", "technology", "security", "roadmap", "ecosystem"],
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

  it("serves home, 5 layers and every card", () => {
    const cards = LAYERS.reduce((n, l) => n + l.cards.length, 0);
    assert.equal(allPaths().length, 1 + LAYERS.length + cards);
  });

  it("rejects unknown and malformed paths", () => {
    for (const p of [
      "/",
      "/core/nope",
      "/core/token/nope",
      "/core/token/max-supply/x",
      "/team",
      "/core/team",
    ]) {
      assert.equal(parsePath(p), null, p);
    }
    assert.deepEqual(parsePath("/core/token/"), parsePath("/core/token"));
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

  it("names Base as the network", () => {
    const card = token?.cards.find((c) => c.id === "network");
    assert.deepEqual(card?.metric, { kind: "static", value: "Base" });
  });

  it("shows the Base Mainnet contract address", () => {
    const card = token?.cards.find((c) => c.id === "contract-address");
    assert.deepEqual(card?.metric, { kind: "static", value: "0xde91…aDb4" });
    assert.match(card?.detail.summary ?? "", /0xde91E6f39D50bBd875f831dcc1134A3D7f3aaDb4/);
  });

  it("never gives a guessed value to metrics that change on chain", () => {
    const deploymentDependent = ["circulating-supply", "staked", "liquidity"];
    for (const id of deploymentDependent) {
      const card = token?.cards.find((c) => c.id === id);
      assert.equal(card?.metric?.kind, "unavailable", id);
    }
  });

  it("marks as LIVE only what Base Mainnet shows: the contract, the network and the pools", () => {
    const live = new Set(["contract-address", "network", "liquidity"]);
    for (const layer of LAYERS) {
      for (const card of layer.cards) {
        if (card.status === "LIVE") assert.ok(layer.id === "token" && live.has(card.id), card.id);
      }
    }
  });

  it("gives every roadmap phase a progress state and no other card one", () => {
    for (const layer of LAYERS) {
      for (const card of layer.cards) {
        if (layer.id === "roadmap") assert.ok(card.progress, card.id);
        else assert.equal(card.progress, undefined, card.id);
      }
    }
    const roadmap = LAYERS.find((l) => l.id === "roadmap");
    const progress = Object.fromEntries((roadmap?.cards ?? []).map((c) => [c.id, c.progress]));
    // Only phases with evidence are done; Base Mainnet was deployed and verified on 2026-10-24.
    assert.equal(progress.testnet, "done");
    assert.equal(progress.mainnet, "done");
  });

  it("contains no addresses other than the official contracts, and no prices or market data", () => {
    const official = new Set(
      [SITE.mainnet.token, SITE.mainnet.timelock, SITE.testnet.token].map((a) => a.toLowerCase()),
    );
    for (const layer of LAYERS) {
      for (const text of texts(layer)) {
        for (const a of text.match(/0x[0-9a-fA-F]{6,}/g) ?? []) {
          assert.ok(official.has(a.toLowerCase()), text);
        }
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
