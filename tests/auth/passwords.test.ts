import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";

describe("password helpers", () => {
  it("hashes passwords without storing the plain text", async () => {
    const passwordHash = await hashPassword("local-only-fixture-1");

    expect(passwordHash).toMatch(/^scrypt:/);
    expect(passwordHash).not.toContain("local-only-fixture-1");
    await expect(verifyPassword("local-only-fixture-1", passwordHash)).resolves.toBe(true);
  });

  it("rejects wrong, missing, and malformed password hashes", async () => {
    const passwordHash = await hashPassword("local-only-fixture-2");

    await expect(verifyPassword("wrong", passwordHash)).resolves.toBe(false);
    await expect(verifyPassword("local-only-fixture-2", null)).resolves.toBe(false);
    await expect(verifyPassword("local-only-fixture-2", "plain-text")).resolves.toBe(false);
  });
});
