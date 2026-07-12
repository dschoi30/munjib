import { describe, expect, it } from "vitest";
import { assertProductionSeedForbidden } from "@/lib/security/production-seed-guard";

describe("production seed guard", () => {
  it("rejects staging and production", () => {
    expect(() =>
      assertProductionSeedForbidden({ MUNJIB_DEPLOYMENT_ENV: "production" }),
    ).toThrow("PRODUCTION_SEED_FORBIDDEN");
    expect(() =>
      assertProductionSeedForbidden({ MUNJIB_DEPLOYMENT_ENV: "staging" }),
    ).toThrow("PRODUCTION_SEED_FORBIDDEN");
  });

  it("accepts only explicit development", () => {
    expect(() =>
      assertProductionSeedForbidden({ MUNJIB_DEPLOYMENT_ENV: "development" }),
    ).not.toThrow();
    expect(() => assertProductionSeedForbidden({})).toThrow(
      "PRODUCTION_SEED_FORBIDDEN",
    );
  });
});
