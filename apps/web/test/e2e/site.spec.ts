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

test("the landing page shows the launch route, closed until the Base Mainnet token exists", async ({
  page,
}) => {
  await page.goto("/");
  const launch = page.locator("section", {
    has: page.getByRole("heading", { name: "Launch on Base." }),
  });
  await launch.scrollIntoViewIfNeeded();
  await expect(launch.getByTestId("launch-when-1")).toHaveText("Open now");
  await expect(launch.getByTestId("launch-when-2")).toHaveText("From 1 November 2026");
  await expect(launch.getByTestId("launch-when-3")).toHaveText("From 1 November 2026");
  await expect(launch.getByTestId("launch-when-4")).toHaveText("After launch");
  await expect(launch.getByRole("link", { name: "Open the claim ›" })).toHaveAttribute(
    "href",
    "/app/claim/",
  );
  await expect(launch.getByRole("button", { name: "Add ARL to your wallet" })).toHaveCount(0);
  await launch.getByRole("link", { name: "How to get ARL ›" }).click();
  await expect(page).toHaveURL(/\/buy\/?$/);
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
          // Layout size, so the scale-down of slides that are not in focus does not count.
          .filter((e) => {
            const el = e as HTMLElement;
            return el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetHeight < 44;
          })
          .map(
            (e) => `${e.textContent?.trim() ?? ""} ${String((e as HTMLElement).offsetHeight)}px`,
          ),
      );
    expect(small, path).toEqual([]);
  }
});

test("the technology previews swipe and run, and say they are simulated", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("group", { name: /1 of 4: AI Payments/ });
  await rail.scrollIntoViewIfNeeded();
  await expect(rail).toContainText("simulated");
  await rail.getByRole("button", { name: "Run a request" }).click();
  await expect(rail).toContainText("never left your wallet", { timeout: 5000 });
  await page.getByRole("button", { name: "Show ZK Privacy" }).click();
  const zk = page.getByRole("group", { name: /3 of 4: ZK Privacy/ });
  await expect(zk).toHaveAttribute("data-active", "true", { timeout: 5000 });
  await zk.getByRole("button", { name: "AI payments first" }).click();
  await expect(zk).toContainText("Proof verified", { timeout: 5000 });
});
