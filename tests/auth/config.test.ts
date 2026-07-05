import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authOptions,
  resolveAuthCookieSecure,
  resolveGoogleAuthCredentials,
  resolveAuthSecret,
  resolveDevLoginEnabled,
} from "@/lib/auth/config";

type CredentialsAuthorizeForTest = (
  credentials: Record<string, string> | undefined,
  req: unknown,
) => unknown | Promise<unknown>;

type CredentialsProviderForTest = {
  authorize?: CredentialsAuthorizeForTest;
  options?: {
    authorize?: CredentialsAuthorizeForTest;
  };
};

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

const passwordMock = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/passwords", () => ({
  verifyPassword: passwordMock.verifyPassword,
}));

describe("authOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    prismaMock.user.findUnique.mockReset();
    passwordMock.verifyPassword.mockReset();
  });

  function getCredentialsProvider(providerId: string) {
    const provider = authOptions.providers.find((candidate) => candidate.id === providerId) as
      | CredentialsProviderForTest
      | undefined;
    if (!provider) {
      throw new Error(`Credentials provider ${providerId} was not found.`);
    }
    const authorize = provider.options?.authorize ?? provider.authorize;
    if (typeof authorize !== "function") {
      throw new Error(`Credentials provider ${providerId} authorize function was not found.`);
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
      image: null,
    });

    const provider = getCredentialsProvider("development-login");
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
      image: null,
    });

    const provider = getCredentialsProvider("development-login");
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

  it("authenticates password credentials with the stored password hash", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      image: null,
      passwordHash: "scrypt:salt:key",
    });
    passwordMock.verifyPassword.mockResolvedValue(true);

    const provider = getCredentialsProvider("password");
    const result = await provider.authorize?.(
      { email: " MEMBER@example.com ", password: "correct horse" },
      {} as never,
    );

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "member@example.com" },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        passwordHash: true,
      },
    });
    expect(passwordMock.verifyPassword).toHaveBeenCalledWith("correct horse", "scrypt:salt:key");
    expect(result).toEqual({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      image: null,
    });
  });

  it("rejects password credentials when the user has no password hash", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      image: null,
      passwordHash: null,
    });

    const provider = getCredentialsProvider("password");
    const result = await provider.authorize?.(
      { email: "member@example.com", password: "correct horse" },
      {} as never,
    );

    expect(result).toBeNull();
    expect(passwordMock.verifyPassword).not.toHaveBeenCalled();
  });

  it("rejects password credentials when the password does not verify", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      image: null,
      passwordHash: "scrypt:salt:key",
    });
    passwordMock.verifyPassword.mockResolvedValue(false);

    const provider = getCredentialsProvider("password");
    const result = await provider.authorize?.(
      { email: "member@example.com", password: "wrong" },
      {} as never,
    );

    expect(result).toBeNull();
  });

  it("signs in the seeded trial user without browser-visible secrets", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "trial-user",
      email: "mjtrial@munjib.com",
      name: "Munjib Trial",
      image: null,
    });

    const provider = getCredentialsProvider("trial");
    const result = await provider.authorize?.({}, {} as never);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "mjtrial@munjib.com" },
      select: { id: true, email: true, name: true, image: true },
    });
    expect(result).toEqual({
      id: "trial-user",
      email: "mjtrial@munjib.com",
      name: "Munjib Trial",
      image: null,
    });
  });

  it("resolves Google auth credentials only when both env values are present", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", " google-client ");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", " google-secret ");

    expect(resolveGoogleAuthCredentials()).toEqual({
      clientId: "google-client",
      clientSecret: "google-secret",
    });

    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    expect(resolveGoogleAuthCredentials()).toBeNull();
  });

  it("rejects Google sign-ins when Google did not verify the email", async () => {
    const result = await authOptions.callbacks?.signIn?.({
      account: { provider: "google", type: "oauth", providerAccountId: "google-1" },
      profile: { email_verified: false } as never,
      user: { id: "user-1", email: "member@example.com", name: "Member" },
      credentials: undefined,
      email: undefined,
    });

    expect(result).toBe(false);
  });
});
