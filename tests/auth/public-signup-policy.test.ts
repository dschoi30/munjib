import { describe, expect, it } from "vitest";
import { resolveDefaultRuntime } from "@/lib/auth/config";
import { resolvePublicSignupEnabled } from "@/lib/auth/signup-policy";
describe("public signup policy", () => {
  it.each([undefined, "false", "1", "TRUE", " true ", ""]) ("keeps malformed or absent opt-in closed: %s", (value) => {
    expect(resolvePublicSignupEnabled({ MUNJIB_PUBLIC_SIGNUP_ENABLED: value })).toBe(false);
  });
  it("projects the same opt-in into password and OAuth runtime", () => {
    const runtime = resolveDefaultRuntime({ NODE_ENV: "development", MUNJIB_PUBLIC_SIGNUP_ENABLED: "true" });
    expect(runtime.passwordSignupEnabled).toBe(true);
    expect(runtime.oauthSignupEnabled).toBe(true);
  });
});
