import { expect, test } from "@playwright/test";

test("secure runtime keeps the App Router health surface available", async ({ page }) => {
  test.skip(!process.env.SECURITY_RUNTIME_SMOKE_BASE_URL, "production smoke supplies the base URL");
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
});
