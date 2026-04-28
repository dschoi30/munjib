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
  const documentList = page.getByRole("navigation");
  await expect(documentList.getByRole("link", { name: "Welcome" })).toBeVisible();

  await expect(page.locator("[name='title']")).toHaveValue("Engineering Runbook");
  await page.locator("[name='title']").fill("Draft title that was not saved");
  await documentList.getByRole("link", { name: "Welcome" }).click();
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");

  await page.locator("[name='contentMarkdown']").fill("# Welcome\n\nSaved content from e2e.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("[name='contentMarkdown']")).toHaveValue(
    "# Welcome\n\nSaved content from e2e.",
  );

  expect(consoleErrors).toEqual([]);
});
