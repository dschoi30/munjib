import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "MUNJIB_E2E_PROVIDER_TRANSPORT=true " +
      "MUNJIB_DEPLOYMENT_ENV=test " +
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
      "pnpm run dev",
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
