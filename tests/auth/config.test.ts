import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authOptions,
  resolveAuthCookieSecure,
  resolveAuthSecret,
  resolveDevLoginEnabled,
} from "@/lib/auth/config";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: prismaMock,
}));

describe("authOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    prismaMock.user.findUnique.mockReset();
  });

  function getCredentialsProvider() {
    const providerFactory = authOptions.providers[0];
    const provider =
      typeof providerFactory === "function"
        ? providerFactory({} as never)
        : providerFactory;
    const options = "options" in provider ? provider.options : provider;
    const authorize =
      options && typeof options === "object" && "authorize" in options
        ? options.authorize
        : undefined;
    if (typeof authorize !== "function") {
      throw new Error("Credentials provider authorize function was not found.");
    }
    return { authorize };
  }

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

  it("does not query users when development login is disabled", async () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "false");
    vi.stubEnv("NODE_ENV", "development");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      avatarUrl: null,
    });

    const provider = getCredentialsProvider();
    const result = await provider.authorize?.({ email: "owner@example.com" }, {} as never);

    expect(result).toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("queries users when development login is enabled", async () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "true");
    vi.stubEnv("NODE_ENV", "production");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      avatarUrl: null,
    });

    const provider = getCredentialsProvider();
    const result = await provider.authorize?.({ email: " OWNER@example.com " }, {} as never);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
    });
    expect(result).toEqual({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
  });
});
