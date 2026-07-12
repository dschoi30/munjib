import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixtureEmail = process.env.SECURITY_RUNTIME_FIXTURE_EMAIL?.trim();
const fixturePasswordFile = process.env.SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE?.trim();
if (!fixtureEmail || !fixturePasswordFile) throw new Error("SECURITY_RUNTIME_FIXTURE_REQUIRED");
const fixturePassword = readFileSync(fixturePasswordFile, "utf8").trim();
if (!fixturePassword) throw new Error("SECURITY_RUNTIME_FIXTURE_PASSWORD_REQUIRED");

test("auth providers and the login shell remain available", async ({ page, request }) => {
  const providersResponse = await request.get("/api/auth/providers");
  expect(providersResponse.ok()).toBe(true);
  const providers = (await providersResponse.json()) as Record<string, { id: string }>;
  expect(providers.password?.id).toBe("password");

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByText("Development login", { exact: true })).toHaveCount(0);
});

test("App Router navigation returns a bounded RSC response and keeps the server healthy", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(fixtureEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspaces\/security-runtime-/);

  let rscBodyLength: number | undefined;
  await page.route("**/*_rsc=*", async (route) => {
    const upstream = await route.fetch();
    const body = await upstream.body();
    if (route.request().resourceType() === "fetch") {
      rscBodyLength = body.byteLength;
    }
    await route.fulfill({ response: upstream, body });
  });

  const navigationResponse = page.waitForResponse((response) => {
    return (
      response.request().resourceType() === "fetch" &&
      response.url().includes("_rsc=") &&
      response.status() === 200 &&
      response.headers()["content-type"]?.includes("text/x-component") === true
    );
  });
  await page.getByRole("navigation").getByRole("link", { name: "Runtime Smoke" }).first().click();
  const response = await navigationResponse;

  expect(response.ok()).toBe(true);
  expect(rscBodyLength).toBeDefined();
  expect(rscBodyLength).toBeLessThan(5 * 1024 * 1024);
  await expect(page.locator("[name='title']")).toHaveValue("Runtime Smoke");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
});
