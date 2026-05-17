import { expect, test } from "@playwright/test";

test("preview mode renders edit-mode soft line breaks", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/workspaces\/company-handbook/);
  await page.getByRole("navigation").getByRole("link", { name: "Welcome" }).first().click();
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");

  const editor = page.locator(".cm-content").first();
  await expect(async () => {
    const editButton = page.getByRole("button", { name: "Edit", exact: true });
    if ((await editButton.count()) > 0) {
      await editButton.click();
    }
    await expect(editor).toBeVisible({ timeout: 1000 });
  }).toPass();
  await editor.fill("# Line Break Check\nFirst line\nSecond line");
  await expect(page.locator("[name='contentMarkdown']")).toHaveValue(
    "# Line Break Check\nFirst line\nSecond line",
  );

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Line Break Check" })).toBeVisible();

  const paragraph = page.locator(".markdown-preview section p").filter({ hasText: "First line" }).first();
  await expect(paragraph).toContainText("Second line");
  await expect(paragraph.locator("br")).toHaveCount(1);
});
