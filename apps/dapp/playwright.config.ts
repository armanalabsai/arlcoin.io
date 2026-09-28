import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the production build against a fresh local Anvil chain with the app's
// fixture deployed (test/e2e/chain.ts). `npm run test:e2e` builds with the matching RPC URL.
// PW_CHROMIUM_PATH lets environments with a preinstalled Chromium use it.
const executablePath = process.env.PW_CHROMIUM_PATH;
const PORT = 3218;

export default defineConfig({
  testDir: "test/e2e",
  globalSetup: "./test/e2e/chain.ts",
  // One chain is shared, and the tests change its state: run them in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `npx next start -p ${String(PORT)} -H 127.0.0.1`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
