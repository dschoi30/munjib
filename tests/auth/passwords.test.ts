import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";

describe("password helpers", () => {
  it("hashes passwords without storing the plain text", async () => {
    const passwordHash = await hashPassword("mjadmin");

    expect(passwordHash).toMatch(/^scrypt:/);
    expect(passwordHash).not.toContain("mjadmin");
    await expect(verifyPassword("mjadmin", passwordHash)).resolves.toBe(true);
  });

  it("rejects wrong, missing, and malformed password hashes", async () => {
    const passwordHash = await hashPassword("mjtrial");

    await expect(verifyPassword("wrong", passwordHash)).resolves.toBe(false);
    await expect(verifyPassword("mjtrial", null)).resolves.toBe(false);
    await expect(verifyPassword("mjtrial", "plain-text")).resolves.toBe(false);
  });
});
