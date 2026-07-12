import { describe, expect, it, vi } from "vitest";
import { authorizePasswordCredential } from "@/lib/auth/password-credentials";
import { hashPassword, parsePasswordHash } from "@/lib/auth/passwords";

describe("legacy password rehash race", () => {
  it("allows only the compare-and-swap winner to create a session user", async () => {
    const current = await hashPassword("correct horse");
    const parsed = parsePasswordHash(current)!;
    const legacy = `scrypt:${parsed.saltToken}:${parsed.keyToken}`;
    let casCount = 0;
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "member@example.com",
          name: "Member",
          image: null,
          passwordHash: legacy,
        }),
        updateMany: vi.fn(async () => ({ count: (casCount += 1) === 1 ? 1 : 0 })),
      },
    };
    const hooks = {
      assertDurableAuthState: vi.fn(),
      admitPasswordCredentials: vi.fn().mockResolvedValue(true),
    };

    const results = await Promise.all([
      authorizePasswordCredential(
        { email: "member@example.com", password: "correct horse" },
        { db, downstreamHooks: hooks },
      ),
      authorizePasswordCredential(
        { email: "member@example.com", password: "correct horse" },
        { db, downstreamHooks: hooks },
      ),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(db.user.updateMany).toHaveBeenCalledTimes(2);
    expect(hooks.admitPasswordCredentials).toHaveBeenCalledTimes(1);
  });
});
