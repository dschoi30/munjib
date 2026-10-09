import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authOptions,
  buildAuthOptions,
  resolveAuthCookieSecure,
  resolveGoogleAuthCredentials,
  resolveAuthSecret,
  resolveDevLoginEnabled,
  resolveDefaultRuntime,
  resolveTrialLoginEnabled,
  resolveTrialTurnstileSiteKey,
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
  account: {
    findUnique: vi.fn(),
  },
  attachment: {
    findMany: vi.fn(),
  },
}));

const passwordMock = vi.hoisted(() => ({
  verifyParsedPasswordHash: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/passwords", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/passwords")>()),
  verifyParsedPasswordHash: passwordMock.verifyParsedPasswordHash,
}));

describe("authOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    prismaMock.user.findUnique.mockReset();
    prismaMock.account.findUnique.mockReset();
    prismaMock.attachment.findMany.mockReset();
    passwordMock.verifyParsedPasswordHash.mockReset();
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

    expect(resolveAuthSecret()).toBe(["obsidian", "clone", "development", "secret"].join("-"));
  });

  it("does not hardcode a fallback secret in production", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveAuthSecret()).toBeUndefined();
  });

  it("uses the strict file reader by default for production runtime resolution", () => {
    const env = {
      MUNJIB_DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      NEXTAUTH_SECRET_FILE: "/run/secrets/munjib_nextauth_secret",
      NEXTAUTH_URL: "https://munjib.example",
      NEXTAUTH_COOKIE_SECURE: "true",
      MUNJIB_ENABLE_DEV_LOGIN: "false",
    };

    expect(resolveAuthSecret(env)).toBeUndefined();
    expect(resolveDefaultRuntime(env).secret).toBe("");
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
      passwordHash:
        "munjib-scrypt$v=1$N=16384$r=8$p=1$dk=64$se=b64url-ascii$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    passwordMock.verifyParsedPasswordHash.mockResolvedValue(true);

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
    expect(passwordMock.verifyParsedPasswordHash).toHaveBeenCalledWith(
      "correct horse",
      expect.objectContaining({ format: "v1" }),
      undefined,
    );
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
    expect(passwordMock.verifyParsedPasswordHash).toHaveBeenCalledTimes(1);
  });

  it("rejects password credentials when the password does not verify", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      image: null,
      passwordHash:
        "munjib-scrypt$v=1$N=16384$r=8$p=1$dk=64$se=b64url-ascii$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    passwordMock.verifyParsedPasswordHash.mockResolvedValue(false);

    const provider = getCredentialsProvider("password");
    const result = await provider.authorize?.(
      { email: "member@example.com", password: "wrong" },
      {} as never,
    );

    expect(result).toBeNull();
  });

  it("never registers or queries the legacy shared Trial provider", () => {
    const options = buildAuthOptions({
      deploymentEnvironment: "development",
      secret: "development-secret-placeholder",
      canonicalOrigin: "http://localhost:3000",
      secureCookies: false,
      developmentLoginEnabled: true,
      passwordSignupEnabled: false,
      oauthSignupEnabled: false,
    });

    expect(options.providers.map((provider) => provider.id)).not.toContain("trial");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "trial@example.invalid" } }),
    );
  });

  it("does not register or query the legacy Trial provider in production", () => {
    const options = buildAuthOptions({
      deploymentEnvironment: "production",
      secret: "production-secret-placeholder",
      canonicalOrigin: "https://munjib.example",
      secureCookies: true,
      developmentLoginEnabled: false,
      passwordSignupEnabled: false,
      oauthSignupEnabled: false,
    });

    expect(options.providers.map((provider) => provider.id)).not.toContain("trial");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
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

  it("resolves Google credentials from the validated production secret file", () => {
    const env = {
      MUNJIB_DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      NEXTAUTH_SECRET_FILE: "/run/secrets/munjib_nextauth_secret",
      GOOGLE_CLIENT_ID: " client-id ",
      GOOGLE_CLIENT_SECRET_FILE: "/run/secrets/munjib_google_client_secret",
      NEXTAUTH_URL: "https://munjib.example",
      NEXTAUTH_COOKIE_SECURE: "true",
      MUNJIB_ENABLE_DEV_LOGIN: "false",
    };
    const signingSecret = Buffer.from("signing-secret-with-more-than-32-bytes-123").toString("base64url");
    expect(resolveGoogleAuthCredentials(env, {
      readStrictSecretFile: ({ logicalName }) =>
        logicalName === "NEXTAUTH_SECRET" ? signingSecret : "provider-secret-abcdefghijkl",
    })).toEqual({ clientId: "client-id", clientSecret: "provider-secret-abcdefghijkl" });
  });

  it.each([
    [{ MUNJIB_ANONYMOUS_TRIAL_ENABLED: "true" }, true],
    [{ MUNJIB_ANONYMOUS_TRIAL_ENABLED: "false" }, false],
    [{ MUNJIB_ANONYMOUS_TRIAL_ENABLED: "TRUE" }, false],
    [{ NODE_ENV: "development" }, false],
  ])("gates the Trial entry on the anonymous capability flag", (env, expected) => {
    expect(resolveTrialLoginEnabled(env)).toBe(expected);
  });

  it("returns only a trimmed validated public Turnstile site key", () => {
    expect(resolveTrialTurnstileSiteKey({
      MUNJIB_TURNSTILE_SITE_KEY: " 0x4AAAAAAAtest-site-key ",
    })).toBe("0x4AAAAAAAtest-site-key");
    expect(resolveTrialTurnstileSiteKey({ MUNJIB_TURNSTILE_SITE_KEY: "short" })).toBeUndefined();
    expect(resolveTrialTurnstileSiteKey({
      MUNJIB_TURNSTILE_SITE_KEY: "invalid key with spaces",
    })).toBeUndefined();
  });

  it("keeps explicit development deployment ahead of NODE_ENV for trial registration", () => {
    expect(resolveDefaultRuntime({
      MUNJIB_DEPLOYMENT_ENV: "development",
      NODE_ENV: "production",
      NEXTAUTH_URL: "http://localhost:3000",
    }).deploymentEnvironment).toBe("development");
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

  it("accepts a verified new Google identity only when public signup is enabled", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);
    const runtime = { ...resolveDefaultRuntime({ NODE_ENV: "development" }), oauthSignupEnabled: true };
    const options = buildAuthOptions(runtime);
    const input = { account: { provider: "google", providerAccountId: "new-google-subject" }, profile: { email: "new@example.com", email_verified: true } };
    expect(await options.callbacks!.signIn!(input as never)).toBe(true);
    expect(await options.callbacks!.signIn!({ ...input, profile: { email: "new@example.com", email_verified: false } } as never)).toBe(false);
  });

  it("denies a verified but unlinked Google identity without candidate signup", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);
    const result = await authOptions.callbacks?.signIn?.({
      account: { provider: "google", type: "oauth", providerAccountId: "unlinked" },
      profile: { email: "member@example.com", email_verified: true } as never,
      user: { id: "user-1", email: "member@example.com", name: "Member" },
      credentials: undefined,
      email: undefined,
    });
    expect(result).toBe(false);
    expect(prismaMock.account.findUnique).toHaveBeenCalledTimes(2);
  });
});
