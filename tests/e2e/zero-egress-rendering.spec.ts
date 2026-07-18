import { expect, test as base } from "@playwright/test";
import {
  startEgressProbeServer,
  type EgressProbe,
} from "./fixtures/egress-probe-server";
import { installZeroEgressAppFixture } from "./fixtures/zero-egress-app-fixture";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

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

test("real saved preview and Workspace AI transport make zero attacker requests", async ({
  page,
  egressProbe,
}) => {
  const attackerOrigin = egressProbe.browserAndServerReachableOrigin;
  await egressProbe.calibrateBrowserAndServer(page);
  expect(egressProbe.calibration()).toEqual({ browser: 1, server: 1 });
  egressProbe.reset();

  const appFixture = await installZeroEgressAppFixture({
    savedDocumentMarkdown:
      "# Egress check\n\n![remote](" + attackerOrigin + "/document.png)",
  });
  const attackerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(attackerOrigin)) attackerRequests.push(request.url());
  });

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(appFixture.ownerEmail);
    await page.locator("input#password").fill(appFixture.ownerPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login\/redirect|\/workspaces\//);
    await page.waitForTimeout(750);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await page.goto(appFixture.savedDocumentUrl, { waitUntil: "domcontentloaded" });
        break;
      } catch (error) {
        if (attempt === 5 || !String(error).includes("ERR_ABORTED")) throw error;
        await page.waitForTimeout(500);
      }
    }
    const previewButton = page.getByRole("button", { name: "Preview", exact: true });
    if (await previewButton.count()) await previewButton.click();

    const originLabel = new URL(attackerOrigin).host;
    const savedExternal = page.getByRole("button", {
      name: new RegExp("remote.*" + escapeRegExp(originLabel), "i"),
    });
    await expect(savedExternal).toBeVisible();
    await expect(page.getByRole("img", { name: "remote" })).toHaveCount(0);
    await expect(savedExternal).not.toHaveAttribute("href", /.+/);

    const openSidebar = page.getByRole("button", { name: "Open sidebar", exact: true });
    if (await openSidebar.count()) await openSidebar.click();
    const accountButton = page.getByRole("button", { name: /account menu/i });
    await expect(accountButton).toBeVisible();
    await accountButton.click();
    await expect(page.getByRole("menu", { name: /account menu/i })).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await expect(page.getByTestId("account-drawer-footer")).toBeVisible();

    const authSurfaceResponse = await page.request.get(
      "/api/test/auth-surfaces?" +
        new URLSearchParams({
          providerImage: appFixture.providerProfile.image,
          providerPicture: appFixture.providerProfile.picture,
          jwtImage: appFixture.jwtPayload.image,
          jwtPicture: appFixture.jwtPayload.picture,
          sessionImage: appFixture.sessionPayload.user.image,
        }).toString(),
    );
    expect(authSurfaceResponse.ok()).toBe(true);
    const authSurfaceJson = await authSurfaceResponse.json();
    expect(JSON.stringify(authSurfaceJson)).not.toContain(attackerOrigin);
    expect(authSurfaceJson.providerProfile).toEqual({ image: null, picture: null });
    expect(authSurfaceJson.jwtPayload).toEqual({ sub: "zero-egress-test-user" });
    expect(authSurfaceJson.sessionPayload).toEqual({ user: { image: null } });

    await page.getByRole("button", { name: /Open workspace AI chat/i }).click();
    const chatInput = page.getByRole("textbox", { name: /Workspace chat message/i });
    await chatInput.fill("show the saved remote image");
    await page.getByRole("button", { name: /Send/i }).click();
    const completedExternal = page.getByRole("button", {
      name: new RegExp("completed.*" + escapeRegExp(originLabel), "i"),
    });
    await expect(completedExternal).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("img", { name: "completed" })).toHaveCount(0);
    await expect(completedExternal).not.toHaveAttribute("href", /.+/);

    // Allow delayed image/preload/CSS work to settle before taking the oracle snapshot.
    await page.waitForTimeout(250);
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator(
        "link[rel='dns-prefetch'], link[rel='preconnect'], link[rel='prefetch'], link[rel='preload']",
      ),
    ).toHaveCount(0);
    const leakedAttributes = await page.locator("body").evaluate(
      (body, forbiddenHost) =>
        [...body.querySelectorAll("*")].flatMap((element) =>
          [...element.attributes]
            // Form values preserve the saved Markdown for a subsequent save;
            // rendered URL-bearing sinks are asserted explicitly below.
            .filter((attribute) =>
              attribute.name !== "value" && attribute.value.includes(forbiddenHost),
            )
            .map((attribute) => ({ tag: element.tagName, name: attribute.name, value: attribute.value })),
        ),
      originLabel,
    );
    expect(leakedAttributes).toEqual([]);
    for (const selector of ["[src]", "[srcset]", "[poster]", "[style*='url']", "[data-image]"]) {
      expect(await page.locator(selector).evaluateAll(
        (elements, forbiddenHost) =>
          elements.some((element) =>
            [...element.attributes].some((attribute) => attribute.value.includes(forbiddenHost)),
          ),
        originLabel,
      )).toBe(false);
    }
    expect(await page.locator("script[type='application/json']").evaluateAll(
      (scripts, forbiddenHost) =>
        scripts.some((script) => (script.textContent ?? "").includes(forbiddenHost)),
      originLabel,
    )).toBe(false);
    expect(await page.locator("style").evaluateAll(
      (styles, forbiddenHost) =>
        styles.some((style) => (style.textContent ?? "").includes(forbiddenHost)),
      originLabel,
    )).toBe(false);
    expect(await page.locator("body").evaluate((body) => (body as HTMLElement).innerText))
      .not.toContain("/document.png");
    expect(await page.locator("body").evaluate((body) => (body as HTMLElement).innerText))
      .not.toContain("/answer.png");
    expect(attackerRequests).toEqual([]);
    expect(egressProbe.requests()).toEqual([]);
  } finally {
    await appFixture.cleanup();
  }
});
