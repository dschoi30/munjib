import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as signupPost } from "@/app/api/auth/signup/route";
import {
  buildAuthOptions,
  projectGoogleOAuthCallback,
  resolveDefaultRuntime,
} from "@/lib/auth/config";
import { authorizePasswordCredential } from "@/lib/auth/password-credentials";
import { hashPassword, parsePasswordHash } from "@/lib/auth/passwords";
import { minimalGooglePersistenceAdapter } from "@/lib/auth/minimal-google-account";

const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  attachment: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/attachments/service", () => ({
  getReadableAttachment: vi.fn(),
}));

const productionRuntime = {
  deploymentEnvironment: "production" as const,
  secret: "A".repeat(43),
  canonicalOrigin: "https://munjib.example.test",
  secureCookies: true,
  developmentLoginEnabled: false,
  passwordSignupEnabled: false as const,
  oauthSignupEnabled: false as const,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("production auth runtime oracle", () => {
  it("keeps development providers absent and password signup closed", async () => {
    const options = buildAuthOptions(productionRuntime);
    expect(options.providers.map((provider) => provider.id)).toEqual(["password"]);

    const response = await signupPost();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "SIGNUP_NOT_ALLOWED" });
  });

  it("guards adapter creation and linking before delegate persistence", async () => {
    const options = buildAuthOptions(productionRuntime);
    const adapter = options.adapter!;
    await expect(adapter.createUser?.({
      id: "candidate",
      email: "candidate@example.test",
      emailVerified: null,
      name: null,
      image: null,
    })).rejects.toThrow("AUTH_SIGNUP_CLOSED");
    await expect(adapter.linkAccount?.({
      userId: "candidate",
      type: "oauth",
      provider: "google",
      providerAccountId: "subject-unclaimed",
    })).rejects.toThrow("AUTH_SIGNUP_CLOSED");
  });

  it("allows only an exact linked, verified Google account", async () => {
    const options = buildAuthOptions(productionRuntime);
    const callback = options.callbacks?.signIn!;
    const input = {
      account: { provider: "google", providerAccountId: "linked-subject" },
      profile: { email: "member@example.test", email_verified: true },
      user: undefined,
      credentials: undefined,
      email: undefined,
    };

    db.account.findUnique.mockResolvedValueOnce({
      userId: "member-1",
      access_token: null,
      refresh_token: null,
      id_token: null,
      session_state: null,
      scope: null,
      token_type: null,
      expires_at: null,
    });
    await expect(callback(input as never)).resolves.toBe(true);

    db.account.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(callback({
      ...input,
      account: { provider: "google", providerAccountId: "unlinked-subject" },
    } as never)).resolves.toBe(false);
    expect(db.account.findUnique).toHaveBeenCalledTimes(3);
  });

  it("keeps provider token/profile media out of writes and session output", async () => {
    const delegate = { linkAccount: vi.fn().mockResolvedValue(undefined) };
    const adapter = minimalGooglePersistenceAdapter(delegate as never);
    await adapter.linkAccount?.({
      userId: "member-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "linked-subject",
      access_token: "token-secret",
      refresh_token: "refresh-secret",
      id_token: "id-secret",
      image: "https://accounts.google.com/avatar.png",
      picture: "https://accounts.google.com/avatar.png",
    } as never);
    expect(delegate.linkAccount).toHaveBeenCalledWith({
      userId: "member-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "linked-subject",
    });
    expect(JSON.stringify(delegate.linkAccount.mock.calls)).not.toContain("token-secret");

    const options = buildAuthOptions(productionRuntime);
    const token = await options.callbacks?.jwt?.({
      token: { sub: "member-1", picture: "https://accounts.google.com/avatar.png", image: "evil" },
      user: undefined,
    } as never);
    expect(token).toEqual({ sub: "member-1" });

    db.user.findUnique.mockResolvedValue({ image: "https://accounts.google.com/avatar.png" });
    const session = await options.callbacks?.session?.({
      session: { user: { id: "member-1", image: "https://accounts.google.com/avatar.png" } },
      token: { sub: "member-1" },
    } as never);
    expect(session?.user?.image).toBeNull();
    expect(JSON.stringify(session)).not.toContain("accounts.google.com");
  });

  it("accepts current and legacy password envelopes but never issues a session after CAS loss", async () => {
    const current = await hashPassword("correct horse");
    const parsed = parsePasswordHash(current)!;
    const legacy = `scrypt:${parsed.saltToken}:${parsed.keyToken}`;
    const hooks = {
      assertDurableAuthState: vi.fn(),
      admitPasswordCredentials: vi.fn().mockResolvedValue(true),
    };

    const currentDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "current-user",
          email: "current@example.test",
          name: "Current",
          image: "https://external.example/avatar.png",
          passwordHash: current,
        }),
        updateMany: vi.fn(),
      },
    };
    await expect(authorizePasswordCredential(
      { email: "current@example.test", password: "correct horse" },
      { db: currentDb, downstreamHooks: hooks },
    )).resolves.toMatchObject({ id: "current-user", image: null });
    expect(currentDb.user.updateMany).not.toHaveBeenCalled();

    const legacyDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "legacy-user",
          email: "legacy@example.test",
          name: "Legacy",
          image: null,
          passwordHash: legacy,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    await expect(authorizePasswordCredential(
      { email: "legacy@example.test", password: "correct horse" },
      { db: legacyDb, downstreamHooks: hooks },
    )).resolves.toMatchObject({ id: "legacy-user" });
    expect(legacyDb.user.updateMany).toHaveBeenCalledTimes(1);

    const lostDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "lost-user",
          email: "lost@example.test",
          name: "Lost",
          image: null,
          passwordHash: legacy,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    await expect(authorizePasswordCredential(
      { email: "lost@example.test", password: "correct horse" },
      { db: lostDb, downstreamHooks: hooks },
    )).resolves.toBeNull();
  });

  it("projects only the canonical origin and secure cookie contract", () => {
    const options = buildAuthOptions(productionRuntime);
    expect(options.cookies?.sessionToken?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    expect(projectGoogleOAuthCallback({
      account: { provider: "google", providerAccountId: "subject-1", access_token: "secret" },
      profile: { email: "member@example.test", email_verified: true, picture: "https://evil.example/a" },
    })).toEqual({
      account: { provider: "google", providerAccountId: "subject-1" },
      profile: { email: "member@example.test", email_verified: true },
    });
    expect(productionRuntime.canonicalOrigin).toBe("https://munjib.example.test");
  });

  it("hydrates production auth options from fixed file-only secrets", () => {
    const signingSecret = randomBytes(32).toString("base64url");
    const env = {
      MUNJIB_DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      NEXTAUTH_SECRET_FILE: "/run/secrets/munjib_nextauth_secret",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET_FILE: "/run/secrets/munjib_google_client_secret",
      NEXTAUTH_URL: "https://munjib.example.test",
      NEXTAUTH_COOKIE_SECURE: "true",
      MUNJIB_ENABLE_DEV_LOGIN: "false",
    };
    const runtime = resolveDefaultRuntime(env, {
      readStrictSecretFile: ({ logicalName }) =>
        logicalName === "NEXTAUTH_SECRET"
          ? signingSecret
          : "provider-secret-abcdefghijkl",
    });
    expect(runtime).toMatchObject({
      deploymentEnvironment: "production",
      secret: signingSecret,
      googleClientId: "client-id",
      googleClientSecret: "provider-secret-abcdefghijkl",
      canonicalOrigin: "https://munjib.example.test",
      secureCookies: true,
      developmentLoginEnabled: false,
    });
  });
});
