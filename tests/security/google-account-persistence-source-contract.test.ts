import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Google persistence source contract", () => {
  it("keeps provider writes behind the minimal adapter", () => {
    const source = readFileSync("lib/auth/minimal-google-account.ts", "utf8");
    expect(source).toContain("minimalGoogleAccountData");
    expect(source).not.toContain("access_token:");
    expect(source).not.toContain("refresh_token:");
    expect(source).not.toContain("id_token:");
    expect(source).not.toContain("expires_at:");
    expect(source).not.toContain("...account");
  });
});
