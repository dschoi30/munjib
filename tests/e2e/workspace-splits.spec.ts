import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
let ids: string[];
test.beforeAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "owner@example.com" } });
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { slug: "company-handbook" } });
  ids = [];
  for (const name of ["A", "B", "C"]) {
    const slug = `split-test-${name.toLowerCase()}`;
    const doc = await prisma.document.upsert({ where: { id: `split-test-${workspace.id}-${name}` },
      create: { id: `split-test-${workspace.id}-${name}`, workspaceId: workspace.id, slug, path: `/${slug}`, title: `Split ${name}`, contentMarkdown: `# Same heading\n\nDocument ${name}`, contentText: `Document ${name}`, createdById: user.id, updatedById: user.id },
      update: { status: "ACTIVE", title: `Split ${name}`, contentMarkdown: `# Same heading\n\nDocument ${name}` } });
    ids.push(doc.id);
  }
});
test.afterAll(() => prisma.$disconnect());
async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /owner@example.com/ }).click();
  await expect(page).toHaveURL(/workspaces/);
}
async function dragTab(page: Page, name: string, targetId: string, edge: "right" | "left" | "bottom" | "center") {
  const tab = page.locator('[data-pane-header]').getByRole("button", { name, exact: true });
  const target = page.locator(`[data-document-pane="${targetId}"]:visible`);
  const rect = await target.boundingBox(); if (!rect) throw new Error("Missing pane");
  await tab.dragTo(target, { targetPosition: { x: edge === "right" ? rect.width - 20 : edge === "left" ? 20 : rect.width / 2,
    y: edge === "bottom" ? rect.height - 20 : rect.height / 2 } });
}
test("nested split layout, live editors and document sidebar survive reload and re-login", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /hydration|did not match|server rendered/i.test(message.text())) browserErrors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  const sidebar = page.getByRole("navigation", { name: "All documents", exact: true });
  for (const name of ["Split A", "Split B"]) {
    await sidebar.getByRole("link", { name, exact: true }).click();
    await expect(page.locator("[data-document-pane]:visible [name=title]")).toHaveValue(name);
  }
  await page.locator('[data-pane-header]').getByRole("button", { name: "Split A", exact: true }).click();
  await dragTab(page, "Split B", ids[0], "right");
  await expect(page.locator('[data-pane-header]')).toHaveCount(2);
  await sidebar.getByRole("link", { name: "Split C", exact: true }).click();
  await expect(page.locator(`[data-document-pane="${ids[2]}"]`)).toBeVisible();
  await dragTab(page, "Split C", ids[2], "bottom");
  await expect(page.locator('[data-pane-header]')).toHaveCount(3);
  for (const id of ids) await expect(page.locator(`[data-document-pane="${id}"]`)).toBeVisible();
  const a = await page.locator(`[data-document-pane="${ids[0]}"]`).boundingBox();
  const b = await page.locator(`[data-document-pane="${ids[1]}"]`).boundingBox();
  const c = await page.locator(`[data-document-pane="${ids[2]}"]`).boundingBox();
  expect(a!.x).toBeLessThan(b!.x); expect(b!.x).toBe(c!.x); expect(b!.y).toBeLessThan(c!.y);
  const right = page.locator("aside").last();
  for (const name of ["Split A", "Split B", "Split C"]) await expect(right.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "true");
  await right.getByRole("button", { name: "Split A", exact: true }).click();
  await page.getByRole("separator").first().focus();
  await page.getByRole("separator").first().press("ArrowLeft");
  await page.reload();
  await expect(page.locator('[data-pane-header]')).toHaveCount(3);
  await expect(right.getByRole("button", { name: "Split A", exact: true })).toHaveAttribute("aria-expanded", "false");
  for (const category of ["Attachments", "Versions", "Audit log"]) {
    await right.getByRole("button", { name: category, exact: true }).click();
    for (const name of ["Split A", "Split B", "Split C"]) await expect(right.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "true");
  }
  await right.getByRole("button", { name: "Outline", exact: true }).click();
  const bGroup = right.locator("section").filter({ has: page.getByRole("button", { name: "Split B", exact: true }) });
  await bGroup.getByRole("button", { name: "Go to heading Same heading", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`document=${ids[1]}`));
  const aPane = page.locator(`[data-document-pane="${ids[0]}"]`);
  const bPane = page.locator(`[data-document-pane="${ids[1]}"]`);
  const aHeader = page.locator('[data-pane-header]').nth(0);
  const bHeader = page.locator('[data-pane-header]').nth(1);
  await aHeader.getByRole("button", { name: "Edit", exact: true }).click();
  await aPane.locator('.cm-content').fill("# Same heading\n\nUnsaved A");
  await expect(aPane.locator('[name="contentMarkdown"]')).toHaveValue("# Same heading\n\nUnsaved A");
  await aPane.locator('.cm-content').press("ArrowLeft");
  await aPane.locator('.cm-content').press("ControlOrMeta+End");
  await page.keyboard.insertText(" marker");
  await dragTab(page, "Split A", ids[1], "center");
  await expect(page.locator('[data-pane-header]')).toHaveCount(2);
  await page.locator('[data-pane-header]').filter({ has: page.getByRole("button", { name: "Split A", exact: true }) }).getByRole("button", { name: "Pane actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Split left", exact: true }).click();
  await expect(page.locator('[data-pane-header]')).toHaveCount(3);
  await aPane.locator('.cm-content').press("ControlOrMeta+z");
  await expect(aPane.locator('[name="contentMarkdown"]')).toHaveValue("# Same heading\n\nUnsaved A");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(aPane.locator('.cm-content')).toContainText("Unsaved A");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await bHeader.getByRole("button", { name: "Edit", exact: true }).click();
  await bPane.locator('.cm-content').fill("# Same heading\n\nSaved B");
  await expect(bPane.locator('[name="contentMarkdown"]')).toHaveValue("# Same heading\n\nSaved B");
  await bPane.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await prisma.document.findUnique({ where: { id: ids[1] } }))?.contentMarkdown).toContain("Saved B");
  await expect(aPane.locator('.cm-content')).toContainText("Unsaved A");
  await bPane.locator('.cm-content').fill("Discard B draft");
  await right.getByRole("button", { name: "Versions", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await bGroup.getByRole("button", { name: "Restore", exact: true }).first().click();
  await expect(bPane.locator('[name="contentMarkdown"]')).toHaveValue(/# Same heading\r?\n\r?\nSaved B/);
  await expect(aPane.locator('[name="contentMarkdown"]')).toHaveValue("# Same heading\n\nUnsaved A");
  await aPane.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await prisma.document.findUnique({ where: { id: ids[0] } }))?.contentMarkdown).toContain("Unsaved A");
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(page).toHaveURL(/graph=1/);
  await expect(page.locator('[data-pane-header]:visible')).toHaveCount(0);
  await sidebar.getByRole("link", { name: "Split A", exact: true }).click();
  await expect(page.locator('[data-pane-header]:visible')).toHaveCount(3);
  await page.goBack();
  await expect(page).toHaveURL(/graph=1/);
  await page.goForward();
  await expect(page.locator('[data-pane-header]:visible')).toHaveCount(3);
  // Signing out keeps this account's layout storage; next login revalidates its document IDs.
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await login(page);
  await expect(page.locator('[data-pane-header]')).toHaveCount(3);
  await expect(right.getByRole("button", { name: "Split A", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: "test-results/workspace-nested-splits-wide.png", fullPage: true });
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(page.locator('[data-pane-header]')).toHaveCount(3);
  await expect.poll(() => page.getByTestId("split-workspace").evaluate(host => host.parentElement!.scrollWidth > host.parentElement!.clientWidth)).toBe(true);
  for (const pane of await page.locator('[data-pane-header]').all()) expect((await pane.boundingBox())!.width).toBeGreaterThanOrEqual(320);
  for (const pane of await page.locator('[data-document-pane]:visible').all()) expect((await pane.boundingBox())!.height + 88).toBeGreaterThanOrEqual(240);
  expect(browserErrors).toEqual([]);
  await page.screenshot({ path: "test-results/workspace-nested-splits.png", fullPage: true });
});
