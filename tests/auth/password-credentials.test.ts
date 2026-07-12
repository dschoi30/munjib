import { describe, expect, it, vi } from "vitest";
import {
  authorizePasswordCredential,
  getPasswordDummyHash,
} from "@/lib/auth/password-credentials";
import { hashPassword, parsePasswordHash } from "@/lib/auth/passwords";

const hooks = {
  assertDurableAuthState: vi.fn(),
  admitPasswordCredentials: vi.fn().mockResolvedValue(true),
};

function dbFor(user: unknown) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("password credential authorization", () => {
  it("uses a process-random valid dummy envelope for an unknown account", async () => {
    const db = dbFor(null);
    const result = await authorizePasswordCredential(
      { email: "missing@example.com", password: "correct horse" },
      { db, downstreamHooks: hooks },
    );

    expect(result).toBeNull();
    expect(parsePasswordHash(getPasswordDummyHash())?.format).toBe("v1");
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("verifies a current hash without rewriting it", async () => {
    const current = await hashPassword("correct horse");
    const db = dbFor({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      image: null,
      passwordHash: current,
    });
    const result = await authorizePasswordCredential(
      { email: " MEMBER@example.com ", password: "correct horse" },
      { db, downstreamHooks: hooks },
    );

    expect(result).toEqual({ id: "user-1", email: "member@example.com", name: "Member", image: null });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("conditionally upgrades a verified legacy hash before returning a user", async () => {
    const current = await hashPassword("correct horse");
    const parsed = parsePasswordHash(current)!;
    const legacy = `scrypt:${parsed.saltToken}:${parsed.keyToken}`;
    const db = dbFor({
      id: "user-1",
      email: "member@example.com",
      name: "Member",
      image: null,
      passwordHash: legacy,
    });
    const result = await authorizePasswordCredential(
      { email: "member@example.com", password: "correct horse" },
      { db, downstreamHooks: hooks },
    );

    expect(result?.id).toBe("user-1");
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", passwordHash: legacy },
      data: { passwordHash: current.replace(/^munjib-scrypt/, "munjib-scrypt") },
    });
  });

  it("returns no user when the legacy compare-and-swap loses", async () => {
    const current = await hashPassword("correct horse");
    const parsed = parsePasswordHash(current)!;
    const legacy = `scrypt:${parsed.saltToken}:${parsed.keyToken}`;
    const db = dbFor({ id: "user-1", email: "member@example.com", name: "Member", image: null, passwordHash: legacy });
    db.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      authorizePasswordCredential(
        { email: "member@example.com", password: "correct horse" },
        { db, downstreamHooks: hooks },
      ),
    ).resolves.toBeNull();
  });
});
