import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runAuthPreflight } from "@/scripts/security/auth-preflight";

const syntheticGeneratedSecret = () => randomBytes(32).toString("base64url");

describe("auth preflight", () => {
  it("writes only redacted state", () => {
    const lines: string[] = [];
    runAuthPreflight({
      env: {
        MUNJIB_DEPLOYMENT_ENV: "production",
        NEXTAUTH_SECRET_FILE: "/run/secrets/munjib_nextauth_secret",
        NEXTAUTH_URL: "https://munjib.example",
        NEXTAUTH_COOKIE_SECURE: "true",
        MUNJIB_ENABLE_DEV_LOGIN: "false",
      },
      deps: {
        readStrictSecretFile: () => syntheticGeneratedSecret(),
      },
      write: (line) => lines.push(line),
    });
    expect(lines).toEqual([
      "AUTH_PREFLIGHT_OK deployment=production secureCookies=true developmentLogin=false passwordSignup=false oauthSignup=false",
    ]);
  });
});
