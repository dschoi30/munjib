import { expect, test } from "@playwright/test";

test("development credentials login opens the workspace", async ({ page }) => {
  const missingRunbookTitle = `Missing Runbook ${Date.now()}`;
  const commentBody = `Please review this document ${Date.now()}.`;
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
  await expect(documentList.getByRole("button", { name: "Add Welcome to favorites" })).toHaveCount(0);
  await expect(documentList.getByRole("button", { name: "Remove Welcome from favorites" })).toHaveCount(0);
  await documentList.getByRole("button", { name: "Open actions for Welcome" }).first().click();
  await page.getByRole("menuitem", { name: "Add to favorites" }).click();
  await expect(page.getByText("Favorites")).toBeVisible();
  await expect(documentList.getByRole("button", { name: "Add Welcome to favorites" })).toHaveCount(0);
  await expect(documentList.getByRole("button", { name: "Remove Welcome from favorites" })).toHaveCount(0);

  await page.getByLabel("Search documents").fill("Backlinked");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=Backlinked/);
  await expect(page.getByRole("navigation").getByRole("link", { name: /Engineering Runbook/ })).toBeVisible();
  await expect(page.getByText("Search results")).toBeVisible();
  await page.goto("/workspaces/company-handbook");
  await page.getByRole("navigation").getByRole("link", { name: /Engineering Runbook/ }).click();

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
    `---\nowner: Platform\nstatus: draft\nlinks:\n  - "[[Engineering Runbook]]"\n  - "[[${missingRunbookTitle}]]"\n---\n\n# Welcome\n\nSee [[Engineering Runbook]] and [[${missingRunbookTitle}]] #review`,
  );
  await page.getByRole("button", { name: "Save" }).click();
  const properties = page.getByRole("region", { name: "Document properties" });
  await expect(properties.getByText("#review", { exact: true })).toBeVisible();
  await expect(properties.getByText("Platform")).toBeVisible();
  await expect(properties.getByRole("link", { name: "Engineering Runbook" }).first()).toBeVisible();
  await expect(properties.getByRole("button", { name: missingRunbookTitle })).toBeVisible();
  await page.getByLabel("Upload attachment").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("attachment from e2e"),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const metadataPanel = page.locator("aside").last();
  await expect(metadataPanel.getByRole("link", { name: "notes.txt" }).first()).toBeVisible();
  await expect(page.locator("[name='contentMarkdown']")).toHaveValue(/notes\.txt/);
  await page.getByLabel("Add comment").fill(commentBody);
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(properties.getByText(commentBody)).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Engineering Runbook" }).first()).toBeVisible();
  await expect(page.getByText(`and ${missingRunbookTitle} #review`)).toBeVisible();
  await properties.getByRole("button", { name: missingRunbookTitle }).click();
  await expect(page.locator("[name='title']")).toHaveValue(missingRunbookTitle);
  await expect(page.locator("[name='contentMarkdown']")).toHaveValue("");
  await page.getByRole("button", { name: "New folder" }).click();
  await expect(page.getByRole("heading", { name: "Untitled folder" })).toBeVisible();
  const folderPathLocator = page.getByText(/^\/untitled-folder(?:-\d+)?$/);
  await expect(folderPathLocator).toBeVisible();
  const folderPath = await folderPathLocator.textContent();
  expect(folderPath).toBeTruthy();
  const folderName = await page.getByRole("heading", { name: /^Untitled folder/ }).textContent();
  expect(folderName).toBeTruthy();
  const folderLabel = folderName ?? "Untitled folder";
  const folderAction = documentList.getByRole("button", { name: `Open actions for ${folderLabel}` }).last();
  const folderRow = folderAction.locator("..").locator("..");
  await folderAction.click();
  await page.getByRole("menuitem", { name: "Add to favorites" }).click();
  const favoritesSection = page.locator("section").filter({ has: page.getByText("Favorites", { exact: true }) });
  await expect(favoritesSection.getByRole("link", { name: `${folderLabel} ${folderPath ?? ""}` })).toBeVisible();

  await folderRow.getByRole("button", { name: `Open actions for ${folderLabel}` }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel(`Rename ${folderLabel}`).fill("Product Notes");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { name: "Product Notes" })).toBeVisible();
  const productNotesAction = documentList.getByRole("button", { name: "Open actions for Product Notes" }).last();
  const productNotesRow = productNotesAction.locator("..").locator("..");

  await productNotesRow.getByRole("button", { name: "New document in Product Notes" }).click();
  await expect(page.locator("[name='title']")).toHaveValue("Untitled");
  await productNotesRow.getByRole("button", { name: "Product Notes", exact: true }).click();

  await productNotesAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page.getByText("Empty this folder before moving it to trash.")).toBeVisible();
  const childDocumentUrl = page.url();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(page).not.toHaveURL(childDocumentUrl);
  await expect(page.locator("[name='title']")).toHaveValue("Untitled");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".cm-editor").first()).not.toHaveCSS("height", "520px");
  await page.keyboard.press("Control+K");
  await page.getByLabel("Quick switcher search").fill("Engineering");
  await expect(page.getByRole("dialog").getByRole("link", { name: "Engineering Runbook" }).first()).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
