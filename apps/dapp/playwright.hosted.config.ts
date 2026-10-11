import { defineConfig, devices } from "@playwright/test";

// The hosted test: the site as arlcoin.io serves it, built by scripts/build-site.sh into
// .hosted-stage (npm run test:hosted builds it first), with the app under /app.
// No chain is needed: before the launch the public app reads nothing from Base Mainnet.
const executablePath = process.env.PW_CHROMIUM_PATH;
const PORT = 3219;

export default defineConfig({
  testDir: "test/hosted",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `node test/hosted/serve.mjs .hosted-stage/apps/web ${String(PORT)}`,
    url: `http://127.0.0.1:${String(PORT)}/app/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
