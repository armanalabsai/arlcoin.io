import { defineConfig } from "@playwright/test";

import base from "./playwright.config.ts";

// Temporary: records the app's own end-to-end flows on the local chain for the product tour.
export default defineConfig({
  ...base,
  outputDir: process.env.TOUR_OUT ?? "C:/projeler/ARL-video/tour/e2e",
  reporter: "line",
  timeout: 300_000,
  use: { ...base.use, trace: "off", video: { mode: "on", size: { width: 1280, height: 900 } } },
});
