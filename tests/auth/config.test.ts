import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authOptions,
  resolveAuthCookieSecure,
  resolveAuthSecret,
  resolveDevLoginEnabled,
} from "@/lib/auth/config";

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
    vi.stubEnv("NEXTAUTH_COOKIE_SECURE", " FALSE ");

    expect(resolveAuthCookieSecure()).toBe(false);
  });

  it("allows secure session cookies to be forced in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXTAUTH_COOKIE_SECURE", " TRUE ");

    expect(resolveAuthCookieSecure()).toBe(true);
  });

  it("defaults to secure cookies in production when no override is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_COOKIE_SECURE", "");

    expect(resolveAuthCookieSecure()).toBe(true);
  });

  it("enables development login by default outside production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDevLoginEnabled()).toBe(true);
  });

  it("disables development login by default in production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveDevLoginEnabled()).toBe(false);
  });

  it.each([
    ["true"],
    [" TRUE "],
    ["1"],
    ["yes"],
  ])("enables development login with %s", (value) => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", value);
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveDevLoginEnabled()).toBe(true);
  });

  it.each([
    ["false"],
    [" FALSE "],
    ["0"],
    ["no"],
  ])("disables development login with %s", (value) => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", value);
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDevLoginEnabled()).toBe(false);
  });

  it("fails closed for invalid development login flags in production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "sometimes");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveDevLoginEnabled()).toBe(false);
  });

  it("keeps invalid development login flags local-friendly outside production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "sometimes");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDevLoginEnabled()).toBe(true);
  });
});
