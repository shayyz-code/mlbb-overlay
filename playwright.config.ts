import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3190",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command:
      "SHAYYZ_PORT=3190 SHAYYZ_RUNTIME_DIR=runtime/e2e bun run start",
    url: "http://127.0.0.1:3190/api/v1/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
