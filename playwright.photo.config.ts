import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "photo-furniture.spec.ts",
  timeout: 90000,
  use: { ...base.use, baseURL: "http://127.0.0.1:4193" },
  webServer: [
    {
      command: "npm run preview --workspace @roomfit/platform -- --port 4193",
      url: "http://127.0.0.1:4193",
      reuseExistingServer: !process.env.CI,
      env: { ROOMFIT_DEV_API_PROXY: "http://127.0.0.1:4192" },
    },
    {
      command: "node scripts/photo-e2e-server.mjs",
      cwd: ".",
      url: "http://127.0.0.1:4192/api/health",
      reuseExistingServer: !process.env.CI,
      env: { ROOMFIT_PHOTO_E2E: "1" },
    },
  ],
});
