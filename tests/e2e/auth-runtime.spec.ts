import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { buildAuthOptions, projectGoogleOAuthCallback } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { authorizePasswordCredential } from "@/lib/auth/password-credentials";
import { hashPassword, parsePasswordHash } from "@/lib/auth/passwords";
import { sanitizeInternalSessionImage } from "@/lib/auth/session-image";

const canonicalOrigin = process.env.NEXTAUTH_URL ?? "https://munjib.example.test";
const runtime = {
  deploymentEnvironment: "production" as const,
  secret: "A".repeat(43),
  canonicalOrigin,
  secureCookies: true,
  developmentLoginEnabled: false,
  passwordSignupEnabled: false as const,
  oauthSignupEnabled: false as const,
};

test("production-like browser auth stays closed and media-free", async ({ page, request }) => {
  const providersResponse = await request.get("/api/auth/providers");
  expect(providersResponse.ok()).toBeTruthy();
  const providers = (await providersResponse.json()) as Record<string, unknown>;
  expect(providers.password).toBeTruthy();
  expect(Object.keys(providers).some((key) => key.includes("development"))).toBe(false);

  const signup = await request.post("/api/auth/signup", {
    data: { email: `synthetic-${randomUUID()}@example.test`, password: "not-used" },
  });
  expect(signup.status()).toBe(403);
  await expect(signup.json()).resolves.toEqual({ ok: false, code: "SIGNUP_NOT_ALLOWED" });

  const consoleErrors: string[] = [];
  const remoteRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (requestEvent) => {
    if (requestEvent.url().includes("accounts.google.com") || requestEvent.url().includes("evil.example")) {
      remoteRequests.push(requestEvent.url());
    }
  });
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await page.content()).not.toContain("accounts.google.com");
  expect(await page.content()).not.toContain("evil.example");
  expect(remoteRequests).toEqual([]);
  expect(consoleErrors.filter((line) => line.includes("accounts.google.com"))).toEqual([]);

  // The callback harness runs in this test process with synthetic example.test
  // identities; it never contacts Google's network.
  const options = buildAuthOptions(runtime);
  const callback = options.callbacks?.signIn!;
  const subject = `linked-${randomUUID()}`;
  const email = `auth-runtime-${randomUUID()}@example.test`;
  let linkedUserId: string | null = null;

  if (process.env.DATABASE_URL) {
    const beforeUsers = await prisma.user.count({ where: { email } });
    const beforeAccounts = await prisma.account.count({ where: { provider: "google", providerAccountId: subject } });
    await expect(callback({
      account: { provider: "google", providerAccountId: subject },
      profile: { email, email_verified: true },
      user: undefined,
      credentials: undefined,
      email: undefined,
    } as never)).resolves.toBe(false);
    expect(await prisma.user.count({ where: { email } })).toBe(beforeUsers);
    expect(await prisma.account.count({ where: { provider: "google", providerAccountId: subject } })).toBe(beforeAccounts);

    const linkedUser = await prisma.user.create({
      data: { email, name: "Synthetic linked user", image: "https://evil.example/avatar.png" },
    });
    linkedUserId = linkedUser.id;
    await prisma.account.create({
      data: {
        userId: linkedUser.id,
        type: "oauth",
        provider: "google",
        providerAccountId: subject,
      },
    });
    await expect(callback({
      account: { provider: "google", providerAccountId: subject },
      profile: { email, email_verified: true },
      user: undefined,
      credentials: undefined,
      email: undefined,
    } as never)).resolves.toBe(true);

    const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: subject } } });
    expect(linked).toMatchObject({ access_token: null, refresh_token: null, id_token: null });

    const session = await options.callbacks?.session?.({
      session: { user: { id: linkedUser.id, image: "https://evil.example/avatar.png" } },
      token: { sub: linkedUser.id, picture: "https://accounts.google.com/avatar.png" },
    } as never);
    expect(session?.user?.image).toBeNull();
    expect(JSON.stringify(session)).not.toContain("evil.example");
    expect(sanitizeInternalSessionImage("/api/attachments/internal-1", new Set(["internal-1"]))).toBe(
      "/api/attachments/internal-1",
    );
  }

  const current = await hashPassword("correct horse");
  const parsed = parsePasswordHash(current)!;
  const legacy = `scrypt:${parsed.saltToken}:${parsed.keyToken}`;
  const hooks = { assertDurableAuthState: () => undefined, admitPasswordCredentials: () => true };
  const login = await authorizePasswordCredential(
    { email: "member@example.test", password: "correct horse" },
    {
      db: {
        user: {
          findUnique: async () => ({ id: "member", email: "member@example.test", name: "Member", image: null, passwordHash: current }),
          updateMany: async () => ({ count: 0 }),
        },
      },
      downstreamHooks: hooks,
    },
  );
  expect(login).toMatchObject({ id: "member", image: null });

  let updates = 0;
  const legacyLogin = await authorizePasswordCredential(
    { email: "legacy@example.test", password: "correct horse" },
    {
      db: {
        user: {
          findUnique: async () => ({ id: "legacy", email: "legacy@example.test", name: "Legacy", image: null, passwordHash: legacy }),
          updateMany: async () => { updates += 1; return { count: 1 }; },
        },
      },
      downstreamHooks: hooks,
    },
  );
  expect(legacyLogin).toMatchObject({ id: "legacy" });
  expect(updates).toBe(1);

  const lost = await authorizePasswordCredential(
    { email: "lost@example.test", password: "correct horse" },
    {
      db: {
        user: {
          findUnique: async () => ({ id: "lost", email: "lost@example.test", name: "Lost", image: null, passwordHash: legacy }),
          updateMany: async () => ({ count: 0 }),
        },
      },
      downstreamHooks: hooks,
    },
  );
  expect(lost).toBeNull();
  expect(options.cookies?.sessionToken?.options).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
  expect(projectGoogleOAuthCallback({
    account: { provider: "google", providerAccountId: subject, access_token: "secret" },
    profile: { email, email_verified: true, picture: "https://evil.example/avatar.png" },
  })).toEqual({
    account: { provider: "google", providerAccountId: subject },
    profile: { email, email_verified: true },
  });

  if (linkedUserId && process.env.DATABASE_URL) {
    await prisma.user.delete({ where: { id: linkedUserId } });
  }
});
