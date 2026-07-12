import { describe, expect, it, vi } from "vitest";
import {
  minimalGoogleAccountData,
  minimalGooglePersistenceAdapter,
} from "@/lib/auth/minimal-google-account";

describe("minimal Google account persistence", () => {
  it("returns exactly the identity allowlist", () => {
    expect(
      minimalGoogleAccountData({
        userId: "user-1",
        type: "oauth",
        provider: "google",
        providerAccountId: "subject-1",
        access_token: "secret",
        picture: "https://evil.example/a.png",
      } as never),
    ).toEqual({
      userId: "user-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "subject-1",
    });
  });

  it("rejects non-Google or non-OAuth identities", () => {
    expect(() =>
      minimalGoogleAccountData({
        userId: "user-1",
        type: "oauth",
        provider: "github",
        providerAccountId: "subject-1",
      }),
    ).toThrow("GOOGLE_ACCOUNT_IDENTITY_INVALID");
  });

  it("uses explicit safe shapes for adapter writes", async () => {
    const delegate = {
      createUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      linkAccount: vi.fn().mockResolvedValue(undefined),
      getUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      unlinkAccount: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = minimalGooglePersistenceAdapter(delegate as never);
    await adapter.createUser?.({
      email: "member@example.test",
      name: "Ignored",
      image: "https://evil.example/a.png",
      emailVerified: new Date(),
    } as never);
    expect(delegate.createUser).toHaveBeenCalledWith({
      email: "member@example.test",
      name: null,
      emailVerified: null,
      image: null,
    });
    await adapter.linkAccount?.({
      userId: "user-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "subject-1",
      access_token: "secret",
      refresh_token: "secret",
      image: "https://evil.example/a.png",
    } as never);
    expect(delegate.linkAccount).toHaveBeenCalledWith({
      userId: "user-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "subject-1",
    });
  });
});
