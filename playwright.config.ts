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
        command:
          "MUNJIB_E2E_PROVIDER_TRANSPORT=true " +
          "NEXTAUTH_URL=http://localhost:3000 " +
          // The auth runtime parser intentionally accepts only the deployment
          // environments used by the application. Keep the harness in the
          // parsed development lane; the explicit test transport flag below
          // remains the separate gate for deterministic local provider routes.
          "MUNJIB_DEPLOYMENT_ENV=development " +
          "MUNJIB_RAG_CHAT_PROVIDER=openai-compatible " +
          "MUNJIB_RAG_CHAT_MODEL=zero-egress-fixture " +
          "MUNJIB_RAG_EMBED_PROVIDER=ollama " +
          "MUNJIB_RAG_EMBED_MODEL=bge-m3 " +
          "MUNJIB_RAG_EMBED_DIMENSIONS=1024 " +
          "MUNJIB_OLLAMA_BASE_URL=http://localhost:3000/api/test/provider " +
          "MUNJIB_OPENAI_COMPATIBLE_BASE_URL=http://localhost:3000/api/test/provider/v1 " +
          "MUNJIB_OPENAI_COMPATIBLE_API_KEY=test-only " +
          "MUNJIB_E2E_ATTACKER_ORIGIN=http://localhost:39158 " +
          "MUNJIB_EGRESS_PROBE_SERVER_ORIGIN=http://127.0.0.1:39158 " +
          "pnpm exec next dev --turbo",
        url: "http://localhost:3000/login",
        // The zero-egress routes are enabled only by this command's explicit
        // environment. Never reuse an unrelated localhost app that lacks the
        // test transport gate or could point the oracle at the wrong server.
        reuseExistingServer: false,
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
