import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ account: { findUnique: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  authorizeExistingGoogleAccount,
  isGoogleProviderAccountUnclaimed,
} from "@/lib/auth/google-existing-account";

beforeEach(() => vi.clearAllMocks());

describe("closed Google login", () => {
  it("allows only an exact already-linked provider account with all token columns null", async () => {
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
    await expect(
      authorizeExistingGoogleAccount({
        account: { provider: "google", providerAccountId: "google-subject-1" },
        profile: { email: "member@example.test", email_verified: true },
      }),
    ).resolves.toBe(true);
    expect(db.account.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: "google-subject-1",
        },
      },
      select: {
        userId: true,
        access_token: true,
        refresh_token: true,
        id_token: true,
        session_state: true,
        scope: true,
        token_type: true,
        expires_at: true,
      },
    });
  });

  it("denies verified email when the exact account is not linked", async () => {
    db.account.findUnique.mockResolvedValue(null);
    await expect(
      authorizeExistingGoogleAccount({
        account: { provider: "google", providerAccountId: "unlinked-subject" },
        profile: { email: "member@example.test", email_verified: true },
      }),
    ).resolves.toBe(false);
  });

  it("denies an unverified Google profile before lookup", async () => {
    await expect(
      authorizeExistingGoogleAccount({
        account: { provider: "google", providerAccountId: "google-subject-1" },
        profile: { email: "member@example.test", email_verified: false },
      }),
    ).resolves.toBe(false);
    expect(db.account.findUnique).not.toHaveBeenCalled();
  });

  it("checks unclaimed status with an exact provider identity query", async () => {
    db.account.findUnique.mockResolvedValue(null);
    await expect(
      isGoogleProviderAccountUnclaimed({
        provider: "google",
        providerAccountId: "candidate-1",
      }),
    ).resolves.toBe(true);
    expect(db.account.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: "candidate-1",
        },
      },
      select: { id: true },
    });
  });
});
