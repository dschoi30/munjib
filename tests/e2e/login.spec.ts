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
  page.on("dialog", (dialog) => dialog.accept());
  const openEditMode = async () => {
    const editButton = page.getByRole("button", { name: "Edit", exact: true });
    await expect(async () => {
      await editButton.click();
      await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeVisible({
        timeout: 1000,
      });
      await expect(page.locator(".cm-content").first()).toBeVisible({ timeout: 1000 });
    }).toPass();
  };
  const openPreviewMode = async () => {
    const previewButton = page.getByRole("button", { name: "Preview", exact: true });
    if ((await previewButton.count()) > 0) {
      await previewButton.click();
    }
  };

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Development login" })).toBeVisible();

  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/workspaces\/company-handbook/);
  await expect(page.getByRole("heading", { name: "Company Handbook" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        bodyFitsViewport: document.body.scrollHeight <= document.body.clientHeight,
        documentFitsViewport: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      })),
    )
    .toEqual({ bodyFitsViewport: true, documentFitsViewport: true });
  await expect(page.getByRole("button", { name: "Navigate forward" })).toBeDisabled();
  const documentList = page.getByRole("navigation");
  await expect(documentList.getByRole("link", { name: "Welcome" })).toBeVisible();
  await documentList.getByRole("link", { name: "Welcome" }).first().click();
  await expect(page).toHaveURL(/document=/);
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");
  await expect(page.getByRole("button", { name: "Welcome", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("welcome", { exact: true })).toBeVisible();
  await openEditMode();
  await expect(page.locator(".cm-content").first()).toBeVisible();
  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.getByText("Graph view")).toBeVisible();
  await expect(page.getByText("Filters", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close graph settings" }).click();
  await expect(page.getByText("Wiki links", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open graph settings" }).click();
  await expect(page.getByText("Wiki links", { exact: true })).toBeVisible();
  await documentList.getByRole("link", { name: "Welcome" }).first().click();
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");
  await expect(page.locator(".cm-content").first()).toBeVisible();
  await expect(documentList.getByRole("button", { name: "Add Welcome to favorites" })).toHaveCount(0);
  await expect(documentList.getByRole("button", { name: "Remove Welcome from favorites" })).toHaveCount(0);
  await documentList.getByRole("button", { name: "Open actions for Welcome" }).first().click();
  await page.getByRole("menuitem", { name: "Add to favorites" }).click();
  await expect(page.getByText("Favorites")).toHaveCount(0);
  await page.getByRole("button", { name: "Favorites" }).click();
  await expect(page.getByText("Favorites")).toBeVisible();
  await expect(page.getByRole("link", { name: "Welcome" })).toBeVisible();
  await expect(documentList.getByRole("button", { name: "Add Welcome to favorites" })).toHaveCount(0);
  await expect(documentList.getByRole("button", { name: "Remove Welcome from favorites" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open actions for Welcome" }).first().click();
  await expect(page.getByRole("menuitem", { name: "Remove from favorites" })).toBeVisible();
  await page.getByRole("heading", { name: "Company Handbook" }).click();
  await expect(page.getByRole("menuitem", { name: "Remove from favorites" })).toHaveCount(0);
  await page.getByRole("button", { name: "Favorites" }).click();

  await page.goto("/workspaces/company-handbook");
  await page.getByRole("button", { name: "Add tab" }).click();
  await page.getByRole("navigation").getByRole("link", { name: /Engineering Runbook/ }).click();
  await expect(
    documentList.getByRole("link", { name: "Engineering Runbook" }).first().locator(".."),
  ).toHaveClass(/bg-slate-200/);

  await expect(page.locator("[name='title']")).toHaveValue("Engineering Runbook");
  await expect(page.getByRole("button", { name: "Welcome", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Engineering Runbook", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const engineeringTabBox = await page
    .getByRole("button", { name: "Engineering Runbook", exact: true })
    .locator("..")
    .boundingBox();
  const addTabBox = await page.getByRole("button", { name: "Add tab" }).boundingBox();
  expect(engineeringTabBox).toBeTruthy();
  expect(addTabBox).toBeTruthy();
  expect(Math.abs((engineeringTabBox?.x ?? 0) + (engineeringTabBox?.width ?? 0) - (addTabBox?.x ?? 0))).toBeLessThan(
    4,
  );
  await expect(page.getByText("engineering-runbook", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Welcome", exact: true }).click();
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");
  await page.getByRole("button", { name: "Engineering Runbook", exact: true }).click();
  await expect(page.locator("[name='title']")).toHaveValue("Engineering Runbook");
  await page.getByRole("button", { name: "Close Engineering Runbook" }).click();
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");
  await documentList.getByRole("button", { name: "Open actions for Engineering Runbook" }).first().click();
  await page.getByRole("menuitem", { name: "Open in new tab" }).click();
  await expect(page.locator("[name='title']")).toHaveValue("Engineering Runbook");
  await expect(page.getByRole("button", { name: "Welcome", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Engineering Runbook", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.locator("[name='title']").fill("Draft title that was not saved");
  await documentList.getByRole("link", { name: "Welcome" }).first().click();
  await expect(page.locator("[name='title']")).toHaveValue("Welcome");
  await openEditMode();

  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible();
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
  await metadataPanel.getByRole("button", { name: "Attachments" }).click();
  await expect(metadataPanel.getByRole("link", { name: "notes.txt" }).first()).toBeVisible();
  await expect(page.locator("[name='contentMarkdown']")).toHaveValue(/notes\.txt/);
  await page.getByLabel("Add comment").fill(commentBody);
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(properties.getByText(commentBody)).toBeVisible();
  await openPreviewMode();
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
  const folderDisplayLabel = `${folderLabel} ${folderPath ?? ""}`;
  const folderAction = documentList
    .getByRole("button", { name: `Open actions for ${folderDisplayLabel}` })
    .last();
  const folderRow = folderAction.locator("..").locator("..");
  await folderAction.click();
  await page.getByRole("menuitem", { name: "Add to favorites" }).click();
  await page.getByRole("button", { name: "Favorites" }).click();
  const favoritesSection = page.locator("section").filter({ has: page.getByText("Favorites", { exact: true }) });
  await expect(favoritesSection.getByRole("link", { name: `${folderLabel} ${folderPath ?? ""}` })).toBeVisible();
  await favoritesSection
    .getByRole("button", { name: `Open actions for ${folderDisplayLabel}` })
    .click();
  await page.getByRole("menuitem", { name: "Remove from favorites" }).click();
  await expect(favoritesSection.getByRole("link", { name: `${folderLabel} ${folderPath ?? ""}` })).toHaveCount(0);
  await page.getByRole("button", { name: "Favorites" }).click();
  await folderRow.getByRole("button", { name: `Open actions for ${folderDisplayLabel}` }).click();
  await page.getByRole("menuitem", { name: "Add to favorites" }).click();
  await page.getByRole("button", { name: "Favorites" }).click();
  await expect(favoritesSection.getByRole("link", { name: `${folderLabel} ${folderPath ?? ""}` })).toBeVisible();
  await page.getByRole("button", { name: "Favorites" }).click();

  await folderRow.getByRole("button", { name: `Open actions for ${folderDisplayLabel}` }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel(`Rename ${folderDisplayLabel}`).fill("Product Notes");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { name: "Product Notes" })).toBeVisible();
  const productNotesPathLocator = page.getByText(/^\/product-notes(?:-\d+)?$/).first();
  await expect(productNotesPathLocator).toBeVisible();
  const productNotesPath = await productNotesPathLocator.textContent();
  expect(productNotesPath).toBeTruthy();
  const productNotesDisplayLabel = `Product Notes ${productNotesPath ?? ""}`;
  const productNotesAction = documentList
    .getByRole("button", { name: `Open actions for ${productNotesDisplayLabel}` })
    .last();
  const productNotesRow = productNotesAction.locator("..").locator("..");

  await page.getByRole("button", { name: "New folder" }).click();
  await expect(page.getByRole("heading", { name: /^Untitled folder/ })).toBeVisible();
  const emptyFolderPathLocator = page
    .getByText(/^\/product-notes(?:-\d+)?\/untitled-folder(?:-\d+)?$/)
    .first();
  await expect(emptyFolderPathLocator).toBeVisible();
  const emptyFolderPath = await emptyFolderPathLocator.textContent();
  expect(emptyFolderPath).toBeTruthy();
  const emptyFolderName = await page.getByRole("heading", { name: /^Untitled folder/ }).textContent();
  const emptyFolderDisplayLabel = `${emptyFolderName ?? "Untitled folder"} ${emptyFolderPath ?? ""}`;
  const emptyFolderAction = documentList
    .getByRole("button", { name: `Open actions for ${emptyFolderDisplayLabel}` })
    .last();
  await emptyFolderAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(
    documentList.getByRole("button", { name: `Open actions for ${emptyFolderDisplayLabel}` }),
  ).toHaveCount(0);

  await productNotesRow
    .getByRole("button", { name: `Open actions for ${productNotesDisplayLabel}` })
    .click();
  await page.getByRole("menuitem", { name: "Add document" }).click();
  await expect(page.locator("[name='title']")).toHaveValue("Untitled");
  const productNotesDocumentId = new URL(page.url()).searchParams.get("document");
  expect(productNotesDocumentId).toBeTruthy();
  await productNotesRow.getByRole("button", { name: "Product Notes", exact: true }).click();

  await productNotesAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  const folderTrashToast = page.getByText("Empty this folder before moving it to trash.", {
    exact: true,
  });
  await expect(folderTrashToast).toBeVisible();
  await expect(folderTrashToast).toBeHidden({ timeout: 4000 });
  await expect(page).not.toHaveURL(/folderError=/);
  const productNotesDocumentLink = page.locator(
    `a[href*="document=${productNotesDocumentId}"]`,
  );
  const productNotesDocumentRow = productNotesDocumentLink.locator("..");
  const productNotesDocumentAction = productNotesDocumentRow.getByRole("button", {
    name: /^Open actions for Untitled · \/product-notes(?:-\d+)?\/untitled(?:-\d+)?$/,
  });
  await productNotesDocumentAction.click();
  await productNotesDocumentRow.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(productNotesDocumentLink).toHaveCount(0);
  await productNotesAction.click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(
    documentList.getByRole("button", { name: `Open actions for ${productNotesDisplayLabel}` }),
  ).toHaveCount(0);
  const childDocumentUrl = page.url();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(page).not.toHaveURL(childDocumentUrl);
  await expect(page.locator("[name='title']")).toHaveValue("Untitled");
  await openEditMode();
  await expect(page.locator(".cm-editor").first()).not.toHaveCSS("height", "520px");

  expect(consoleErrors).toEqual([]);
});
