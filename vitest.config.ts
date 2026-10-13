import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["packages/core/src/**/*.test.ts", "landing/src/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
