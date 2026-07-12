import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.AUTH_RUNTIME_PORT ?? 3411);
const baseURL = process.env.AUTH_RUNTIME_BASE_URL ?? `http://127.0.0.1:${port}`;
const canonicalOrigin = process.env.NEXTAUTH_URL ?? "https://munjib.example.test";
const secretFile = process.env.NEXTAUTH_SECRET_FILE ?? "/run/secrets/munjib_nextauth_secret";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /auth-runtime\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: process.env.AUTH_RUNTIME_BASE_URL
    ? undefined
    : {
        // The strict production validator is exercised by the injected
        // preflight child. This host-local browser harness deliberately uses
        // the development deployment selector because fixed `/run/secrets`
        // mounts belong to the production container; NODE_ENV remains
        // production so provider discovery still omits development providers.
        command: `NODE_ENV=production MUNJIB_DEPLOYMENT_ENV=development NEXTAUTH_URL=${canonicalOrigin} NEXTAUTH_SECRET_FILE=${secretFile} NEXTAUTH_COOKIE_SECURE=true MUNJIB_ENABLE_DEV_LOGIN=false pnpm exec next start -H 127.0.0.1 -p ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
