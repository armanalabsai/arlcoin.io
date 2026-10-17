import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { DOCS } from "../../src/content/docs.ts";
import {
  clampDescription,
  descriptionFor,
  MAX_DESCRIPTION,
  titleFor,
} from "../../src/content/meta.ts";
import { HOME, LAYERS } from "../../src/content/registry.ts";
import { breadcrumbJsonLd, organizationJsonLd } from "../../src/content/seo.ts";
import { SITE } from "../../src/content/site.ts";

// Search snippets: titles up to 60 characters and descriptions up to 155 are shown in full.

const MAX_TITLE = 60;
const app = new URL("../../app/", import.meta.url).pathname;

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("seo: titles and descriptions", () => {
  it("keeps every static page title and description within the snippet limits", () => {
    for (const file of pages(app)) {
      const src = readFileSync(file, "utf8");
      const title = /const title = "([^"]+)"/.exec(src)?.[1];
      if (title) assert.ok(title.length <= MAX_TITLE, `${file}: title ${String(title.length)}`);
      const desc = /const description =\s*"([^"]+)"/.exec(src)?.[1];
      if (desc)
        assert.ok(desc.length <= MAX_DESCRIPTION, `${file}: description ${String(desc.length)}`);
    }
  });

  it("keeps the site description and every Core description within the limit", () => {
    assert.ok(SITE.description.length <= MAX_DESCRIPTION);
    for (const layer of LAYERS) {
      assert.ok(descriptionFor({ layer, card: null }).length <= MAX_DESCRIPTION, layer.id);
      for (const card of layer.cards)
        assert.ok(descriptionFor({ layer, card }).length <= MAX_DESCRIPTION, card.id);
    }
    assert.ok(titleFor(HOME).length <= MAX_TITLE);
    for (const layer of LAYERS) assert.ok(titleFor({ layer, card: null }).length <= MAX_TITLE);
  });

  it("gives every document a description", () => {
    for (const d of DOCS) assert.ok(d.description.length > 0, d.slug);
  });

  it("cuts long descriptions at a word boundary", () => {
    const long = "word ".repeat(60).trim();
    const cut = clampDescription(long);
    assert.ok(cut.length <= MAX_DESCRIPTION);
    assert.match(cut, /word…$/);
    assert.equal(clampDescription("short"), "short");
  });
});

describe("seo: structured data", () => {
  it("names only the official channels", () => {
    assert.deepEqual(organizationJsonLd.sameAs, [
      "https://x.com/arlprotocol",
      "https://t.me/arlcoin_community",
      "https://github.com/armanalabsai/arlcoin.io",
    ]);
    assert.equal(organizationJsonLd.email, "team@arlcoin.io");
    assert.equal(organizationJsonLd.url, "https://arlcoin.io");
  });

  it("builds breadcrumbs from the home page with absolute, slash-terminated URLs", () => {
    const b = breadcrumbJsonLd([["FAQ", "/faq"]]);
    assert.deepEqual(
      b.itemListElement.map((i) => [i.position, i.name, i.item]),
      [
        [1, "Home", "https://arlcoin.io/"],
        [2, "FAQ", "https://arlcoin.io/faq/"],
      ],
    );
  });
});
