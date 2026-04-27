import { describe, expect, it } from "vitest";
import { authOptions, resolveAuthSecret } from "@/lib/auth/config";

describe("authOptions", () => {
  it("uses a stable fallback secret outside production", () => {
    const previousSecret = process.env.NEXTAUTH_SECRET;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = "development";

    expect(resolveAuthSecret()).toBe("obsidian-clone-development-secret");

    if (previousSecret) process.env.NEXTAUTH_SECRET = previousSecret;
    else delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("does not hardcode a fallback secret in production", () => {
    const previousSecret = process.env.NEXTAUTH_SECRET;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = "production";

    expect(resolveAuthSecret()).toBeUndefined();

    if (previousSecret) process.env.NEXTAUTH_SECRET = previousSecret;
    else delete process.env.NEXTAUTH_SECRET;
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("uses an app-specific session cookie name", () => {
    expect(authOptions.cookies?.sessionToken?.name).toBe("obsidian-clone.session-token");
  });
});
