import { afterEach, describe, expect, it, vi } from "vitest";
import { authOptions, resolveAuthCookieSecure, resolveAuthSecret } from "@/lib/auth/config";

describe("authOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a stable fallback secret outside production", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveAuthSecret()).toBe("obsidian-clone-development-secret");
  });

  it("does not hardcode a fallback secret in production", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveAuthSecret()).toBeUndefined();
  });

  it("uses the current app-specific session cookie name", () => {
    expect(authOptions.cookies?.sessionToken?.name).toBe("munjib.session-token");
  });

  it("allows secure session cookies to be disabled for HTTP deployments", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_COOKIE_SECURE", "false");

    expect(resolveAuthCookieSecure()).toBe(false);
  });
});
