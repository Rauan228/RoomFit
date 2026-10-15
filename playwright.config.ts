import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./platform/tests",
  // Photo generation has its own isolated API with a mocked, non-billable provider.
  testIgnore: "**/photo-furniture.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:4181",
    channel: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "npm run dev:platform",
      url: "http://127.0.0.1:4181",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node scripts/python.mjs dev",
      url: "http://127.0.0.1:4182/api/health",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
