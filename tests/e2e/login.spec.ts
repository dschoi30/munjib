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
  await expect(page.locator(".cm-content").first()).toBeVisible();
  await page.getByRole("button", { name: /Quick switcher/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add Welcome to favorites" }).first().click();
  await expect(page.getByText("Favorites")).toBeVisible();

  await page.getByLabel("Search documents").fill("Backlinked");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=Backlinked/);
  await expect(page.getByRole("navigation").getByRole("link", { name: /Engineering Runbook/ })).toBeVisible();
  await expect(page.getByText("Search results")).toBeVisible();
  await page.goto("/workspaces/company-handbook");

  await expect(page.locator("[name='title']")).toHaveValue("Engineering Runbook");
  await expect(page.getByRole("img", { name: "Local graph for Engineering Runbook" })).toBeVisible();
  await page.locator("[name='title']").fill("Draft title that was not saved");
  await documentList.getByRole("link", { name: "Welcome" }).first().click();
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");

  const editor = page.locator(".cm-content").first();
  await editor.fill("# Welcome\n\nSee [[Eng");
  await page.getByRole("button", { name: "Engineering Runbook", exact: true }).click();
  await expect(page.locator("[name='contentMarkdown']")).toHaveValue("# Welcome\n\nSee [[Engineering Runbook]]");
  await editor.fill(
    "---\nowner: Platform\nstatus: draft\n---\n\n# Welcome\n\nSee [[Engineering Runbook]] #review",
  );
  await page.getByRole("button", { name: "Save" }).click();
  const metadataPanel = page.locator("aside").last();
  await expect(metadataPanel.getByText("#review", { exact: true })).toBeVisible();
  await expect(metadataPanel.getByText("Platform")).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByText("See [[Engineering Runbook]] #review")).toBeVisible();
  await page.keyboard.press("Control+K");
  await page.getByLabel("Quick switcher search").fill("Engineering");
  await expect(page.getByRole("dialog").getByRole("link", { name: "Engineering Runbook" }).first()).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
