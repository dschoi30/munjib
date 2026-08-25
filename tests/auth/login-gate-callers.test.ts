import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("development login gate callers", () => {
  it.each([
    "app/page.tsx",
    "app/login/page.tsx",
    "app/workspaces/[workspaceSlug]/page.tsx",
  ])("%s passes the server gate to LoginForm", (path) => {
    const source = read(path);

    expect(source).toContain("resolveDevLoginEnabled");
    expect(source).toContain("isDevLoginEnabled={resolveDevLoginEnabled()}");
    expect(source).toContain("isSignupEnabled={false}");
  });

  it("passes the closed signup gate from the login page", () => {
    expect(read("app/login/page.tsx")).toContain("isSignupEnabled={false}");
  });

  it.each([
    "app/page.tsx",
    "app/login/page.tsx",
    "app/workspaces/[workspaceSlug]/page.tsx",
  ])("%s passes the validated public Turnstile site key to LoginForm", (path) => {
    const source = read(path);

    expect(source).toContain("resolveTrialTurnstileSiteKey");
    expect(source).toContain("trialTurnstileSiteKey={resolveTrialTurnstileSiteKey()}");
  });
});
