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

  const editor = page.locator(".cm-content").first();
  await editor.fill("# Welcome\n\nSee [[Eng");
  await page.getByRole("button", { name: "Engineering Runbook" }).click();
  await expect(page.locator("[name='contentMarkdown']")).toHaveValue(
    "# Welcome\n\nSee [[Engineering Runbook]]",
  );
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByText("See [[Engineering Runbook]]")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
