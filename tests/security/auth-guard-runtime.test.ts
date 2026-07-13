import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AUTH_GUARD_SECRET_PATH,
  assertValidAuthGuardRuntimeEnv,
  authorizeAuthRequest,
  deriveAuthGuardBucket,
  evaluateAuthOrigin,
  evaluateFetchMetadata,
  inspectAuthGuardRuntimeEnv,
  type AuthGuardRequest,
} from "@/lib/auth/abuse/runtime";

const generatedSecret = () => randomBytes(32).toString("base64url");
const productionEnv = () => ({
  MUNJIB_DEPLOYMENT_ENV: "production",
  MUNJIB_AUTH_GUARD_SECRET_FILE: AUTH_GUARD_SECRET_PATH,
  NEXTAUTH_URL: "https://munjib.example",
});
const productionDeps = (secret = generatedSecret()) => ({
  readStrictSecretFile: ({ path }: { path: string }) => {
    if (path !== AUTH_GUARD_SECRET_PATH) throw new Error("SECRET_FILE_UNAVAILABLE");
    return secret;
  },
});
function request(overrides: Partial<AuthGuardRequest> = {}): AuthGuardRequest {
  return {
    method: "POST",
    headers: {
      origin: "https://munjib.example",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
    },
    bucket: "login-bucket-1",
    ...overrides,
  };
}

describe("auth guard runtime", () => {
  it("requires a strict file-backed guard secret in staging and production", () => {
    expect(assertValidAuthGuardRuntimeEnv(productionEnv(), productionDeps())).toMatchObject({
      deploymentEnvironment: "production",
      canonicalOrigin: "https://munjib.example",
      secret: expect.any(String),
    });
  });

  it("rejects direct secret values, missing file paths, and unreadable files", () => {
    expect(
      inspectAuthGuardRuntimeEnv(
        { ...productionEnv(), MUNJIB_AUTH_GUARD_SECRET: generatedSecret() },
        productionDeps(),
      ).errors,
    ).toContain("AUTH_GUARD_SECRET_ENV_FORBIDDEN");
    expect(
      inspectAuthGuardRuntimeEnv(
        { ...productionEnv(), MUNJIB_AUTH_GUARD_SECRET_FILE: undefined },
        productionDeps(),
      ).errors,
    ).toContain("AUTH_GUARD_SECRET_FILE_REQUIRED");
    expect(
      inspectAuthGuardRuntimeEnv(productionEnv(), {
        readStrictSecretFile: () => {
          throw new Error("SECRET_FILE_UNAVAILABLE");
        },
      }).errors,
    ).toContain("AUTH_GUARD_SECRET_FILE_INVALID");
    expect(() => assertValidAuthGuardRuntimeEnv(productionEnv(), {
      readStrictSecretFile: () => {
        throw new Error("SECRET_FILE_UNAVAILABLE");
      },
    })).toThrowError("AUTH_GUARD_UNAVAILABLE");
  });

  it("rejects low-entropy and fallback guard secrets", () => {
    const fallback = Buffer.from("obsidian-clone-development-secret!!").toString("base64url");
    expect(inspectAuthGuardRuntimeEnv(productionEnv(), productionDeps(fallback)).errors).toContain(
      "AUTH_GUARD_SECRET_FALLBACK",
    );
    expect(inspectAuthGuardRuntimeEnv(productionEnv(), productionDeps("A".repeat(43))).errors).toContain(
      "AUTH_GUARD_SECRET_LOW_ENTROPY",
    );
  });

  it("requires a canonical HTTPS origin for strict deployments", () => {
    expect(
      inspectAuthGuardRuntimeEnv({ ...productionEnv(), NEXTAUTH_URL: "http://munjib.example" }, productionDeps())
        .errors,
    ).toContain("AUTH_GUARD_ORIGIN_HTTPS_REQUIRED");
    expect(
      inspectAuthGuardRuntimeEnv({ ...productionEnv(), NEXTAUTH_URL: "https://munjib.example/auth" }, productionDeps())
        .errors,
    ).toContain("AUTH_GUARD_ORIGIN_INVALID");
  });

  it("allows same-origin unsafe requests and denies foreign or missing origins", () => {
    const runtime = assertValidAuthGuardRuntimeEnv(productionEnv(), productionDeps());
    expect(evaluateAuthOrigin({ runtime, request: request() })).toEqual({ allowed: true });
    expect(
      evaluateAuthOrigin({ runtime, request: request({ headers: { ...request().headers, origin: "https://evil.example" } }) }),
    ).toEqual({ allowed: false, code: "AUTH_GUARD_ORIGIN_MISMATCH" });
    expect(
      evaluateAuthOrigin({ runtime, request: request({ headers: { ...request().headers, origin: undefined } }) }),
    ).toEqual({ allowed: false, code: "AUTH_GUARD_ORIGIN_REQUIRED" });
  });

  it("keeps safe reads compatible with top-level navigation while guarding unsafe methods", () => {
    const runtime = assertValidAuthGuardRuntimeEnv(productionEnv(), productionDeps());
    expect(
      evaluateAuthOrigin({ runtime, request: request({ method: "GET", headers: { "sec-fetch-site": "cross-site" } }) }),
    ).toEqual({ allowed: true });
    expect(
      evaluateFetchMetadata({
        runtime,
        request: request({ headers: { ...request().headers, "sec-fetch-site": "cross-site" } }),
      }),
    ).toEqual({ allowed: false, code: "AUTH_GUARD_FETCH_SITE_CROSS_ORIGIN" });
    expect(
      evaluateFetchMetadata({
        runtime,
        request: request({ headers: { ...request().headers, "sec-fetch-site": undefined } }),
      }),
    ).toEqual({ allowed: false, code: "AUTH_GUARD_FETCH_METADATA_REQUIRED" });
  });

  it("bounds request metadata before comparing it", () => {
    const runtime = assertValidAuthGuardRuntimeEnv(productionEnv(), productionDeps());
    expect(
      evaluateAuthOrigin({
        runtime,
        request: request({ headers: { ...request().headers, origin: `https://munjib.example/${"x".repeat(300)}` } }),
      }),
    ).toEqual({ allowed: false, code: "AUTH_GUARD_HEADER_TOO_LARGE" });
    expect(
      evaluateFetchMetadata({
        runtime,
        request: request({ headers: { ...request().headers, "sec-fetch-mode": "x".repeat(300) } }),
      }),
    ).toEqual({ allowed: false, code: "AUTH_GUARD_HEADER_TOO_LARGE" });
  });

  it("delegates bounded bucket checks to the durable store and fails closed on store errors", async () => {
    const runtime = assertValidAuthGuardRuntimeEnv(productionEnv(), productionDeps());
    const store = { check: vi.fn(async () => "allow" as const) };
    expect(await authorizeAuthRequest({ runtime, request: request(), store })).toEqual({ allowed: true });
    expect(store.check).toHaveBeenCalledWith({ bucket: "login-bucket-1" });
    const failingStore = { check: vi.fn(async () => { throw new Error("store unavailable"); }) };
    expect(await authorizeAuthRequest({ runtime, request: request(), store: failingStore })).toEqual({
      allowed: false,
      code: "AUTH_GUARD_STORE_UNAVAILABLE",
    });
    const denyingStore = { check: vi.fn(async () => "deny" as const) };
    expect(await authorizeAuthRequest({ runtime, request: request(), store: denyingStore })).toEqual({
      allowed: false,
      code: "AUTH_GUARD_RATE_LIMITED",
    });
    expect(await authorizeAuthRequest({ runtime: null, request: request(), store: denyingStore })).toEqual({
      allowed: false,
      code: "AUTH_GUARD_UNAVAILABLE",
    });
  });

  it("uses a domain-separated digest for bounded store buckets", () => {
    const runtime = assertValidAuthGuardRuntimeEnv(productionEnv(), productionDeps());
    const bucket = deriveAuthGuardBucket(runtime, { scope: "login", value: "opaque-client-key" });
    expect(bucket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(bucket).toBe(deriveAuthGuardBucket(runtime, { scope: "login", value: "opaque-client-key" }));
    expect(bucket).not.toBe(deriveAuthGuardBucket(runtime, { scope: "oauth", value: "opaque-client-key" }));
  });

  it("does not include local-memory limiters or process environment reads", () => {
    const source = readFileSync("lib/auth/abuse/runtime.ts", "utf8");
    expect(source).not.toMatch(/new (Map|WeakMap)\s*\(/);
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("console.");
  });
});
