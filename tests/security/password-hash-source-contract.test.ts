import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../lib/auth/passwords.ts", import.meta.url), "utf8");
const credentialsSource = readFileSync(
  new URL("../../lib/auth/password-credentials.ts", import.meta.url),
  "utf8",
);

describe("password hash source contract", () => {
  it("pins one reviewed KDF parameter set", () => {
    expect(source).toContain('const SCRYPT_N = 16_384');
    expect(source).toContain('const SCRYPT_R = 8');
    expect(source).toContain('const SCRYPT_P = 1');
    expect(source).toContain('const KEY_LENGTH = 64');
    expect(source).toContain('const MAXMEM = 64 * 1024 * 1024');
    expect(source).toContain('Buffer.from(saltToken, "utf8")');
  });

  it("never executes stored work factors and gates credentials through the permit", () => {
    expect(source).not.toMatch(/parseInt\([^)]*N|options\s*=\s*[^)]*stored/i);
    expect(credentialsSource).toContain("withPasswordWorkPermit");
    expect(credentialsSource).toContain("updateMany");
    expect(credentialsSource).toContain("passwordHash: parsed.envelope");
  });
});
