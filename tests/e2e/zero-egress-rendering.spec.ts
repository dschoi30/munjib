import { expect, test as base } from "@playwright/test";
import {
  startEgressProbeServer,
  type EgressProbe,
} from "./fixtures/egress-probe-server";
import { installZeroEgressAppFixture } from "./fixtures/zero-egress-app-fixture";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const test = base.extend<{ egressProbe: EgressProbe }>({
  egressProbe: async ({}, use) => {
    const probe = await startEgressProbeServer();
    try {
      await use(probe);
    } finally {
      await probe.close();
    }
  },
});

test("real saved preview and the real Workspace AI route make zero attacker requests", async ({
  page,
  egressProbe,
}) => {
  const attackerOrigin = egressProbe.browserAndServerReachableOrigin;
  await egressProbe.calibrateBrowserAndServer(page);
  expect(egressProbe.calibration()).toEqual({ browser: 1, server: 1 });
  egressProbe.reset();
  const appFixture = await installZeroEgressAppFixture({
    savedDocumentMarkdown: `# Egress check\n\n![remote](${attackerOrigin}/document.png)`,
    completedWorkspaceAiAnswer: `![completed](${attackerOrigin}/answer.png)`,
  });
  const attackerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(attackerOrigin)) attackerRequests.push(request.url());
  });

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(appFixture.ownerEmail);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.goto(appFixture.savedDocumentUrl);
    const previewButton = page.getByRole("button", { name: "Preview", exact: true });
    if (await previewButton.count()) await previewButton.click();

    const originLabel = new URL(attackerOrigin).host;
    const savedExternal = page.getByRole("button", {
      name: new RegExp(`remote.*${escapeRegExp(originLabel)}`, "i"),
    });
    await expect(savedExternal).toBeVisible();
    await expect(page.getByRole("img", { name: "remote" })).toHaveCount(0);
    await expect(savedExternal).not.toHaveAttribute("href", /.+/);
    await expect(page.locator("html")).not.toContainText(`${attackerOrigin}/document.png`);

    await page.getByRole("button", { name: /Open workspace AI chat/i }).click();
    const completedExternal = page.getByRole("button", {
      name: new RegExp(`completed.*${escapeRegExp(originLabel)}`, "i"),
    });
    await expect(completedExternal).toBeVisible();
    await expect(page.getByRole("img", { name: "completed" })).toHaveCount(0);
    await expect(completedExternal).not.toHaveAttribute("href", /.+/);
    const chatInput = page.getByRole("textbox", { name: /Workspace chat message/i });
    await chatInput.fill("show it");
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect(page.locator("link[rel='dns-prefetch'], link[rel='preconnect'], link[rel='prefetch'], link[rel='preload']")).toHaveCount(0);
    expect(await page.locator("body").evaluate(
      (body, forbiddenHost) =>
        [...body.querySelectorAll("*")].some((element) =>
          [...element.attributes].some((attribute) => attribute.value.includes(forbiddenHost)),
        ),
      originLabel,
    )).toBe(false);
    expect(attackerRequests).toEqual([]);
    expect(egressProbe.requests()).toEqual([]);
  } finally {
    await appFixture.cleanup();
  }
});
