import { expect, test } from "@playwright/test";

import { DOCS, docPath } from "../../src/content/docs.ts";
import { FAQ } from "../../src/content/faq.ts";

// The landing page, the FAQ, the published documents and site-wide rules: no links to a code
// host, touch targets of at least 44px, no horizontal scroll.

const PAGES = ["/", "/faq", "/docs", ...DOCS.map((d) => docPath(d.slug))];

test("the landing page leads to the whitelist and the Core", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "ARL" })).toBeVisible();
  const cta = page.getByRole("main").getByRole("link", { name: "Join the whitelist" }).first();
  await cta.click();
  await expect(page).toHaveURL(/\/whitelist\/?$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Explore the Core ›" }).click();
  await expect(page).toHaveURL(/\/core\/?$/);
  await expect(page.getByTestId("arl-core")).toBeVisible();
});

test("the FAQ page lists every question and carries FAQPage markup", async ({ page }) => {
  await page.goto("/faq");
  for (const f of FAQ) await expect(page.locator("summary", { hasText: f.question })).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = ld
    .map((t) => JSON.parse(t) as { "@type": string })
    .find((d) => d["@type"] === "FAQPage");
  expect(faq).toBeTruthy();
});

test("every published document renders", async ({ page }) => {
  for (const d of DOCS) {
    const res = await page.goto(docPath(d.slug));
    expect(res?.status(), d.slug).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: d.title })).toBeVisible();
    await expect(page.locator(".doc-prose")).not.toBeEmpty();
  }
});

test("llms.txt is served", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("# ARL");
});

for (const path of PAGES) {
  test(`${path} has no broken code-host links and no horizontal scroll`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    // The project's own code host account is unavailable; links to it would be broken.
    for (const href of hrefs) expect(href, href).not.toMatch(/gokturkalazdaghan-dot/);
    const hscroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(hscroll).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("header, footer and landing controls are at least 44px tall", async ({ page }) => {
  for (const path of ["/", "/faq", "/whitelist"]) {
    await page.goto(path);
    const small = await page
      .locator("header a, header button, footer a, main a.inline-flex, main button")
      .evaluateAll((els) =>
        els
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.height < 44;
          })
          .map(
            (e) =>
              `${e.textContent?.trim() ?? ""} ${String(Math.round(e.getBoundingClientRect().height))}px`,
          ),
      );
    expect(small, path).toEqual([]);
  }
});
