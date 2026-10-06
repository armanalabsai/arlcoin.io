import { expect, test } from "@playwright/test";

import { LAYERS, pathFor } from "../../src/content/registry.ts";

// Geometry regression test: on every layer and common viewport, cards must not
// overlap each other, the Core or the caption, slip under the header, or
// cause horizontal scrolling. Wide viewports use the orbit, the rest the grid.

const VIEWPORTS = [
  [1100, 760],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1470, 830],
  [1920, 1080],
  [1024, 700],
] as const;

test.skip(({ isMobile }) => isMobile, "desktop geometry only");

for (const [width, height] of VIEWPORTS) {
  test(`no collisions at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const path of [pathFor(), ...LAYERS.map((l) => pathFor(l.id))]) {
      await page.goto(path);
      const result = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-ring-card]")].map((e) =>
          e.getBoundingClientRect(),
        );
        const hit = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 1 &&
          b.left < a.right - 1 &&
          a.top < b.bottom - 1 &&
          b.top < a.bottom - 1;
        let overlaps = 0;
        for (let i = 0; i < cards.length; i++)
          for (let j = i + 1; j < cards.length; j++) if (hit(cards[i]!, cards[j]!)) overlaps++;
        const fixed = [
          document.querySelector('[data-testid="arl-core"]'),
          ...document.querySelectorAll(".orbit-caption p"),
        ].map((e) => e!.getBoundingClientRect());
        return {
          overlaps,
          coreOrCaption: cards.filter((c) => fixed.some((f) => hit(c, f))).length,
          underHeader: cards.filter((c) => c.top < 57).length,
          hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(result, `${path} at ${width}×${height}`).toEqual({
        overlaps: 0,
        coreOrCaption: 0,
        underHeader: 0,
        hscroll: 0,
      });
    }
  });
}
