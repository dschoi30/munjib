import { describe, expect, it, vi } from "vitest";
import { minimalGooglePersistenceAdapter } from "@/lib/auth/minimal-google-account";

describe("Google token-zero adapter", () => {
  it("never exposes token, expiry, or media fields to delegate writes", async () => {
    const delegate = {
      createUser: vi.fn().mockResolvedValue({ id: "user-1" }),
      linkAccount: vi.fn().mockResolvedValue(undefined),
      updateUser: vi.fn(),
      unlinkAccount: vi.fn(),
      deleteUser: vi.fn(),
      getUser: vi.fn().mockResolvedValue({ id: "user-1" }),
    };
    const adapter = minimalGooglePersistenceAdapter(delegate as never);
    await adapter.linkAccount?.({
      userId: "user-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "subject-1",
      access_token: "token",
      refresh_token: "refresh",
      id_token: "id",
      expires_at: 123,
      token_type: "Bearer",
      scope: "openid",
      session_state: "state",
      image: "https://evil.example/picture.png",
      picture: "https://evil.example/picture.png",
    } as never);
    expect(delegate.linkAccount.mock.calls[0]?.[0]).toEqual({
      userId: "user-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "subject-1",
    });
    expect(delegate.updateUser).not.toHaveBeenCalled();
  });
});
