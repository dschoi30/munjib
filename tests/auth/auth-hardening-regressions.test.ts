import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultAuthDownstreamHooks,
  type AuthDownstreamHooks,
} from "@/lib/auth/downstream/contract";

const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));
const readableAttachment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/attachments/service", () => ({ getReadableAttachment: readableAttachment }));

import {
  buildAuthOptions,
  projectGoogleOAuthCallback,
} from "@/lib/auth/config";

const runtime = {
  deploymentEnvironment: "development" as const,
  secret: "development-secret",
  canonicalOrigin: "http://localhost:3000",
  secureCookies: false,
  developmentLoginEnabled: false,
  passwordSignupEnabled: false as const,
  oauthSignupEnabled: false as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth callback hardening", () => {
  it("projects raw Google callback data before downstream hooks", async () => {
    const guardOAuthIdentity = vi.fn(() => ({ ok: true }));
    const authorizeCandidateGoogle = vi.fn(() => false);
    const hooks = {
      ...defaultAuthDownstreamHooks,
      guardOAuthIdentity,
      authorizeCandidateGoogle,
    } satisfies AuthDownstreamHooks;
    const options = buildAuthOptions(runtime, hooks);
    db.account.findUnique.mockResolvedValue(null);

    await options.callbacks?.signIn?.({
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: "subject-1",
        access_token: "secret",
        refresh_token: "refresh",
        picture: "https://evil.example/picture.png",
        unknown: "must-not-cross-boundary",
      } as never,
      profile: {
        email: "member@example.test",
        email_verified: true,
        picture: "https://evil.example/profile.png",
        unknown: "must-not-cross-boundary",
      } as never,
      user: undefined as never,
      credentials: undefined,
      email: undefined,
    });

    expect(projectGoogleOAuthCallback({
      account: { provider: "google", providerAccountId: "subject-1" },
      profile: { email: "member@example.test", email_verified: true },
    })).toEqual({
      account: { provider: "google", providerAccountId: "subject-1" },
      profile: { email: "member@example.test", email_verified: true },
    });
    expect((guardOAuthIdentity.mock.calls as unknown[][])[0]?.[0]).toEqual({
      account: { provider: "google", providerAccountId: "subject-1" },
      profile: { email: "member@example.test", email_verified: true },
    });
    expect((authorizeCandidateGoogle.mock.calls as unknown[][])[0]?.[0]).toMatchObject({
      account: { provider: "google", providerAccountId: "subject-1" },
      profile: { email: "member@example.test", email_verified: true },
    });
    expect(JSON.stringify((guardOAuthIdentity.mock.calls as unknown[][])[0])).not.toContain("secret");
    expect(JSON.stringify((authorizeCandidateGoogle.mock.calls as unknown[][])[0])).not.toContain("unknown");
  });

  it("runs durable-state guards for linked Google, JWT, and session surfaces", async () => {
    const assertDurableAuthState = vi.fn();
    const hooks = {
      ...defaultAuthDownstreamHooks,
      assertDurableAuthState,
      guardOAuthIdentity: vi.fn(() => ({ ok: true })),
      resolveJwtClaims: vi.fn((input: Record<string, unknown>) => input),
    } satisfies AuthDownstreamHooks;
    const options = buildAuthOptions(runtime, hooks);
    db.account.findUnique.mockResolvedValue({
      userId: "user-1",
      access_token: null,
      refresh_token: null,
      id_token: null,
      session_state: null,
      scope: null,
      token_type: null,
      expires_at: null,
    });

    await options.callbacks?.signIn?.({
      account: { provider: "google", providerAccountId: "subject-1" } as never,
      profile: { email: "member@example.test", email_verified: true } as never,
      user: undefined as never,
      credentials: undefined,
      email: undefined,
    });
    await options.callbacks?.jwt?.({ token: { sub: "user-1" }, user: undefined } as never);
    db.user.findUnique.mockResolvedValue({ image: null });
    await options.callbacks?.session?.({
      session: { user: { id: "user-1", email: "member@example.test", image: null } },
      token: { sub: "user-1" },
    } as never);

    expect(assertDurableAuthState).toHaveBeenCalledWith({
      userId: "user-1",
      surface: "GOOGLE_EXISTING",
    });
    expect(assertDurableAuthState).toHaveBeenCalledWith({ userId: "user-1", surface: "JWT" });
    expect(assertDurableAuthState).toHaveBeenCalledWith({ userId: "user-1", surface: "SESSION" });
  });

  it("keeps the original JWT subject and strips hook-added media claims", async () => {
    const hooks = {
      ...defaultAuthDownstreamHooks,
      assertDurableAuthState: vi.fn(),
      resolveJwtClaims: vi.fn(() => ({ sub: "attacker", picture: "evil", image: "evil" })),
    } satisfies AuthDownstreamHooks;
    const options = buildAuthOptions(runtime, hooks);
    const result = await options.callbacks?.jwt?.({ token: { sub: "user-1" }, user: undefined } as never);
    expect(result).toEqual({ sub: "user-1" });
  });

  it("fails closed for missing JWT subjects and ACL-denied session images", async () => {
    const hooks = {
      ...defaultAuthDownstreamHooks,
      assertDurableAuthState: vi.fn(),
      resolveJwtClaims: vi.fn(() => ({ sub: "attacker" })),
    } satisfies AuthDownstreamHooks;
    const options = buildAuthOptions(runtime, hooks);
    const jwtResult = await options.callbacks?.jwt?.({ token: {}, user: undefined } as never);
    expect(jwtResult).toEqual({});

    db.user.findUnique.mockResolvedValue({ image: "/api/attachments/private-1" });
    readableAttachment.mockRejectedValue(new Error("FORBIDDEN"));
    const session = await options.callbacks?.session?.({
      session: { user: { id: "user-1", email: "member@example.test", image: "https://evil" } },
      token: { sub: "user-1" },
    } as never);
    expect(session?.user?.image).toBeNull();
    expect(readableAttachment).toHaveBeenCalledWith("private-1", "user-1");

    const noSubjectSession = await options.callbacks?.session?.({
      session: { user: { id: "user-1", email: "member@example.test", image: "https://evil" } },
      token: {},
    } as never);
    expect(noSubjectSession?.user?.image).toBeNull();
  });
});
