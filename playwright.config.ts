import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL?.trim();
const baseURL = externalBaseUrl || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
