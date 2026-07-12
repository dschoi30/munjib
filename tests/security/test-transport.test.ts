import { describe, expect, it } from "vitest";
import { isTestTransportEnabled } from "@/lib/security/test-transport";

describe("test-only transport environment gate", () => {
  const enabled = { MUNJIB_E2E_PROVIDER_TRANSPORT: "true" };

  it.each([
    {},
    { ...enabled, NODE_ENV: "production" },
    { ...enabled, NODE_ENV: "production", MUNJIB_DEPLOYMENT_ENV: "production" },
    { ...enabled, NODE_ENV: "staging", MUNJIB_DEPLOYMENT_ENV: "staging" },
  ])("denies an unapproved environment", (environment) => {
    expect(isTestTransportEnabled(environment)).toBe(false);
  });

  it.each([
    { ...enabled, NODE_ENV: "test" },
    { ...enabled, NODE_ENV: "development" },
    { ...enabled, NODE_ENV: "production", MUNJIB_DEPLOYMENT_ENV: "test" },
    { ...enabled, NODE_ENV: "production", MUNJIB_DEPLOYMENT_ENV: "development" },
  ])("allows an explicitly scoped test/development environment", (environment) => {
    expect(isTestTransportEnabled(environment)).toBe(true);
  });

  it("requires an explicit true opt-in", () => {
    expect(isTestTransportEnabled({ NODE_ENV: "test" })).toBe(false);
    expect(
      isTestTransportEnabled({
        ...enabled,
        NODE_ENV: "test",
        MUNJIB_E2E_PROVIDER_TRANSPORT: "TRUE ",
      }),
    ).toBe(true);
  });
});
