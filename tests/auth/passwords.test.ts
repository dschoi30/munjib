import { describe, expect, it } from "vitest";
import {
  hashPassword,
  parsePasswordHash,
  setPasswordCryptoForTests,
  resetPasswordCryptoForTests,
  verifyPasswordHash,
} from "@/lib/auth/passwords";
import { afterEach } from "vitest";

describe("password helpers", () => {
  afterEach(() => resetPasswordCryptoForTests());
  it("hashes passwords without storing the plain text", async () => {
    const passwordHash = await hashPassword("mjadmin");

    expect(passwordHash).toMatch(
      /^munjib-scrypt\$v=1\$N=16384\$r=8\$p=1\$dk=64\$se=b64url-ascii\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/,
    );
    expect(passwordHash).not.toContain("mjadmin");
    await expect(verifyPasswordHash("mjadmin", passwordHash)).resolves.toBe(true);
  });

  it("rejects wrong, missing, and malformed password hashes", async () => {
    const passwordHash = await hashPassword("mjtrial");

    await expect(verifyPasswordHash("wrong", passwordHash)).resolves.toBe(false);
    await expect(verifyPasswordHash("mjtrial", null)).resolves.toBe(false);
    await expect(verifyPasswordHash("mjtrial", "plain-text")).resolves.toBe(false);
  });

  it("parses only canonical current and legacy envelopes", async () => {
    const current = await hashPassword("known password");
    const parsed = parsePasswordHash(current);
    expect(parsed?.format).toBe("v1");
    expect(parsePasswordHash(current.replace("$N=16384$", "$r=8$N=16384$"))).toBeNull();
    expect(parsePasswordHash(`scrypt:${parsed?.saltToken}:${parsed?.keyToken}`)?.format).toBe("legacy");
  });

  it("uses password bytes exactly and rejects invalid lengths", async () => {
    await expect(hashPassword("\u00e9")).resolves.toMatch(/^munjib-scrypt\$/);
    await expect(hashPassword(" ")).resolves.toMatch(/^munjib-scrypt\$/);
    await expect(hashPassword("\u0000")).resolves.toMatch(/^munjib-scrypt\$/);
    await expect(hashPassword("a".repeat(257))).rejects.toThrow("PASSWORD_INPUT_INVALID");
  });

  it("does one fixed derivation and one equal-length compare for malformed stored state", async () => {
    const current = await hashPassword("correct horse");
    const calls = { scrypt: 0, compare: 0 };
    setPasswordCryptoForTests({
      scrypt: (_password, salt, keyLength, options) => {
        calls.scrypt += 1;
        expect(salt).toHaveLength(22);
        expect(keyLength).toBe(64);
        expect(options).toEqual({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        return Buffer.alloc(64);
      },
      timingSafeEqual: (left, right) => {
        calls.compare += 1;
        expect(left).toHaveLength(64);
        expect(right).toHaveLength(64);
        return false;
      },
    });
    await expect(verifyPasswordHash("correct horse", current)).resolves.toBe(false);
    await expect(verifyPasswordHash("correct horse", "not-a-hash")).resolves.toBe(false);
    expect(calls).toEqual({ scrypt: 2, compare: 2 });
  });
});
