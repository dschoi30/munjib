import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertValidAuthRuntimeEnv,
  deriveAuthRuntimeSubkey,
  inspectAuthRuntimeEnv,
} from "@/lib/auth/runtime";
import { parseDeploymentEnvironment } from "@/lib/runtime/deployment-env";

const generatedSecret = () => randomBytes(32).toString("base64url");
const nextAuthSecretPath = "/run/secrets/munjib_nextauth_secret";
const knownDevelopmentFallback = ["obsidian", "clone", "development", "secret"].join("-");
const knownLocalFallback = ["local", "development", "only"].join("-");
const productionEnv = () => ({
  MUNJIB_DEPLOYMENT_ENV: "production",
  NEXTAUTH_SECRET_FILE: nextAuthSecretPath,
  NEXTAUTH_URL: "https://munjib.example",
  NEXTAUTH_COOKIE_SECURE: "true",
  MUNJIB_ENABLE_DEV_LOGIN: "false",
});
const deps = (secret = generatedSecret()) => ({
  readStrictSecretFile: ({ path }: { path: string }) => {
    if (path !== nextAuthSecretPath) throw new Error("SECRET_FILE_UNAVAILABLE");
    return secret;
  },
});

describe("auth runtime", () => {
  it("accepts only the explicit deployment environments", () => {
    expect(parseDeploymentEnvironment({ MUNJIB_DEPLOYMENT_ENV: " StAgInG " })).toBe("staging");
    expect(() => parseDeploymentEnvironment({})).toThrowError("DEPLOYMENT_ENV_REQUIRED");
    expect(() => parseDeploymentEnvironment({ MUNJIB_DEPLOYMENT_ENV: "preview" })).toThrowError(
      "DEPLOYMENT_ENV_INVALID",
    );
  });

  it("accepts a generated base64url secret and closes production signup", () => {
    expect(assertValidAuthRuntimeEnv(productionEnv(), deps())).toMatchObject({
      deploymentEnvironment: "production",
      canonicalOrigin: "https://munjib.example",
      secureCookies: true,
      developmentLoginEnabled: false,
      passwordSignupEnabled: false,
      oauthSignupEnabled: false,
    });
  });

  it.each([
    ["blank", "", "AUTH_SECRET_REQUIRED"],
    ["short", "c2hvcnQ", "AUTH_SECRET_FORMAT_INVALID"],
    [
      "known fallback",
      Buffer.from(knownDevelopmentFallback.padEnd(32, "!")).toString("base64url"),
      "AUTH_SECRET_FALLBACK",
    ],
    [
      "known local fallback",
      Buffer.from(knownLocalFallback.padEnd(32, "!")).toString("base64url"),
      "AUTH_SECRET_FALLBACK",
    ],
    ["repeated", "A".repeat(43), "AUTH_SECRET_LOW_ENTROPY"],
    ["non-canonical", `${generatedSecret()}=`, "AUTH_SECRET_FORMAT_INVALID"],
  ])("rejects %s production secret", (_label, secret, code) => {
    const inspection = inspectAuthRuntimeEnv(productionEnv(), deps(secret));
    expect(inspection.errors).toContain(code);
  });

  it("rejects direct production secret values and a missing secret-file path", () => {
    expect(
      inspectAuthRuntimeEnv(
        { ...productionEnv(), NEXTAUTH_SECRET: generatedSecret() },
        deps(),
      ).errors,
    ).toContain("AUTH_SECRET_ENV_FORBIDDEN");
    expect(
      inspectAuthRuntimeEnv(
        { ...productionEnv(), NEXTAUTH_SECRET_FILE: undefined },
        deps(),
      ).errors,
    ).toContain("AUTH_SECRET_FILE_REQUIRED");
  });

  it("requires a file-backed Google secret when Google is enabled", () => {
    expect(
      inspectAuthRuntimeEnv(
        { ...productionEnv(), GOOGLE_CLIENT_ID: "client-id" },
        deps(),
      ).errors,
    ).toContain("GOOGLE_CLIENT_SECRET_FILE_REQUIRED");
  });

  it("rejects insecure production origin, cookies, and development login", () => {
    expect(
      inspectAuthRuntimeEnv(
        {
          ...productionEnv(),
          NEXTAUTH_URL: "http://munjib.example",
          NEXTAUTH_COOKIE_SECURE: "false",
          MUNJIB_ENABLE_DEV_LOGIN: "true",
        },
        deps(),
      ).errors,
    ).toEqual(
      expect.arrayContaining([
        "AUTH_URL_HTTPS_REQUIRED",
        "AUTH_COOKIE_NOT_SECURE",
        "DEVELOPMENT_LOGIN_ENABLED",
      ]),
    );
  });

  it("accepts explicit development fixtures", () => {
    const secret = generatedSecret();
    expect(
      assertValidAuthRuntimeEnv(
        {
          MUNJIB_DEPLOYMENT_ENV: "development",
          NEXTAUTH_SECRET: secret,
          NEXTAUTH_URL: "http://localhost:3000",
          MUNJIB_ENABLE_DEV_LOGIN: "true",
        },
      ),
    ).toMatchObject({
      deploymentEnvironment: "development",
      secret,
      canonicalOrigin: "http://localhost:3000",
      secureCookies: false,
      developmentLoginEnabled: true,
    });
  });

  it("derives deterministic domain-separated runtime subkeys", () => {
    const runtime = assertValidAuthRuntimeEnv(productionEnv(), deps());
    const same = deriveAuthRuntimeSubkey(runtime, "document-cursor-v1");
    expect(same).toEqual(deriveAuthRuntimeSubkey(runtime, "document-cursor-v1"));
    expect(same).toBeInstanceOf(Buffer);
    expect(same).toHaveLength(32);
    expect(same).not.toEqual(deriveAuthRuntimeSubkey(runtime, "other-domain"));
    const otherRuntime = assertValidAuthRuntimeEnv(productionEnv(), deps(generatedSecret()));
    expect(same).not.toEqual(deriveAuthRuntimeSubkey(otherRuntime, "document-cursor-v1"));
  });

  it("keeps subkey derivation independent of environment and file access", () => {
    const source = readFileSync(new URL("../../lib/auth/runtime.ts", import.meta.url), "utf8");
    const start = source.indexOf("export function deriveAuthRuntimeSubkey");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = source.slice(start);
    expect(body).not.toContain("process.env");
    expect(body).not.toContain("readStrictSecretFile(");
  });
});
