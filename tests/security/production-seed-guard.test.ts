import { describe, expect, it } from "vitest";
import { assertProductionSeedForbidden } from "@/lib/security/production-seed-guard";
import { configureLocalSeedEnvironment } from "@/lib/security/seed-environment";

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

  it("defaults the local wrapper to development without overriding an explicit environment", () => {
    const localEnv: Record<string, string | undefined> = {};
    expect(configureLocalSeedEnvironment(localEnv)).toBe("development");
    expect(localEnv.MUNJIB_DEPLOYMENT_ENV).toBe("development");
    expect(() => assertProductionSeedForbidden(localEnv)).not.toThrow();

    const productionEnv: Record<string, string | undefined> = {
      MUNJIB_DEPLOYMENT_ENV: "production",
    };
    expect(configureLocalSeedEnvironment(productionEnv)).toBe("production");
    expect(() => assertProductionSeedForbidden(productionEnv)).toThrow(
      "PRODUCTION_SEED_FORBIDDEN",
    );
  });
});
