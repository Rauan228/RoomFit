import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["landing.spec.ts", "seo.spec.ts"],
  fullyParallel: true,
  workers: 3,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4185", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: "node ../scripts/serve-static.mjs --port 4185",
    url: "http://127.0.0.1:4185",
    reuseExistingServer: false,
  },
});
