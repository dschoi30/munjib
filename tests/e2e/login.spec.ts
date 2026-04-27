import { expect, test } from "@playwright/test";

test("development credentials login opens the workspace", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Development login" })).toBeVisible();

  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/workspaces\/company-handbook/);
  await expect(page.getByRole("heading", { name: "Company Handbook" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Welcome" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
