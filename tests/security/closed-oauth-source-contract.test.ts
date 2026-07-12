import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("closed OAuth source contract", () => {
  it("uses callback identity policy and adapter persistence guard", () => {
    const config = readFileSync("lib/auth/config.ts", "utf8");
    expect(config).toContain("resolveExistingGoogleAccount");
    expect(config).toContain("projectGoogleOAuthCallback");
    expect(config).toContain("closedSignupAdapter");
    expect(config).toContain("sanitizeGoogleJwtToken");
    expect(config).toContain("assertDurableAuthState");
    expect(config).not.toContain("return profile.email_verified");
    expect(config).not.toContain("allowDangerousEmailAccountLinking");
    expect(config).not.toContain("process.env.NEXTAUTH_SECRET");
    expect(config).not.toContain("process.env.GOOGLE_CLIENT_SECRET");
  });
});
