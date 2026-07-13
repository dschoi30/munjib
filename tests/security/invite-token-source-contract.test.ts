import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const source = readFileSync(join(process.cwd(), "lib/auth/invite-token.ts"), "utf8");

describe("invite token source boundary", () => {
  test("does not acquire route, persistence, URL, telemetry, or logging capabilities", () => {
    expect(source).not.toMatch(/from ["'](?:@prisma\/client|next\/headers|next\/server)/);
    expect(source).not.toMatch(/\b(?:fetch|console|Sentry|Prisma)\s*\(/);
    expect(source).not.toMatch(/\b(?:new\s+URL|URLSearchParams|Request\s*\(|Response\s*\(|Headers\s*\()/);
    expect(source).not.toMatch(/(?:Set-Cookie|cookieHeader|searchParams|location\.hash)/);
  });

  test("keeps invitation and attempt hash domains explicit and distinct", () => {
    expect(source).toContain("munjib/invitation-bearer/v1");
    expect(source).toContain("munjib/invitation-attempt/v1");
    expect(source).not.toContain("invitation-bearer/v1\\0\";\nconst ATTEMPT_SECRET_DOMAIN = Buffer.from(\"munjib/invitation-bearer");
  });
});
