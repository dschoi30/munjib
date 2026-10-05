import { resolvePublicSignupEnabled } from "@/lib/auth/signup-policy";
import { createHmac } from "node:crypto";
import { parseDeploymentEnvironment } from "@/lib/runtime/deployment-env";
import {
  readStrictSecretFile,
  type StrictSecretFileInput,
} from "@/lib/security/strict-secret-file";

type Env = Record<string, string | undefined>;

export type AuthRuntimeErrorCode =
  | "DEPLOYMENT_ENV_REQUIRED"
  | "DEPLOYMENT_ENV_INVALID"
  | "AUTH_SECRET_FILE_REQUIRED"
  | "AUTH_SECRET_FILE_INVALID"
  | "AUTH_SECRET_ENV_FORBIDDEN"
  | "AUTH_SECRET_REQUIRED"
  | "AUTH_SECRET_FORMAT_INVALID"
  | "AUTH_SECRET_FALLBACK"
  | "AUTH_SECRET_LOW_ENTROPY"
  | "AUTH_URL_REQUIRED"
  | "AUTH_URL_INVALID"
  | "AUTH_URL_HTTPS_REQUIRED"
  | "AUTH_COOKIE_FLAG_INVALID"
  | "AUTH_COOKIE_NOT_SECURE"
  | "DEVELOPMENT_LOGIN_FLAG_INVALID"
  | "DEVELOPMENT_LOGIN_ENABLED"
  | "GOOGLE_CLIENT_SECRET_FILE_REQUIRED"
  | "GOOGLE_CLIENT_SECRET_FILE_INVALID"
  | "GOOGLE_CLIENT_SECRET_ENV_FORBIDDEN";

export type AuthRuntimeConfig = {
  deploymentEnvironment: "development" | "staging" | "production";
  secret: string;
  googleClientId?: string;
  googleClientSecret?: string;
  canonicalOrigin: string;
  secureCookies: boolean;
  developmentLoginEnabled: boolean;
  passwordSignupEnabled: boolean;
  oauthSignupEnabled: boolean;
};

export class AuthRuntimeConfigurationError extends Error {
  readonly codes: AuthRuntimeErrorCode[];

  constructor(codes: AuthRuntimeErrorCode[]) {
    super(`AUTH_RUNTIME_INVALID:${codes.join(",")}`);
    this.name = "AuthRuntimeConfigurationError";
    this.codes = codes;
  }
}

const NEXTAUTH_SECRET_PATH = "/run/secrets/munjib_nextauth_secret";
const GOOGLE_SECRET_PATH = "/run/secrets/munjib_google_client_secret";
const knownFallbacks = [
  ["obsidian", "clone", "development", "secret"].join("-"),
  ["development", "secret"].join("-"),
  ["local", "development", "only"].join("-"),
  ["change", "me"].join("-"),
];

function inspectSecret(value: string | undefined) {
  const secret = value;
  if (!secret) return { secret: "", error: "AUTH_SECRET_REQUIRED" as const };
  if (secret !== secret.trim()) {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(secret, "base64url");
  } catch {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  if (decoded.length < 32 || decoded.toString("base64url") !== secret) {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  const decodedText = decoded.toString("utf8").toLowerCase();
  if (knownFallbacks.some((fallback) => decodedText.includes(fallback))) {
    return { secret, error: "AUTH_SECRET_FALLBACK" as const };
  }
  if (new Set(secret).size < 12 || /^(.)\1+$/.test(secret)) {
    return { secret, error: "AUTH_SECRET_LOW_ENTROPY" as const };
  }
  return { secret };
}

function parseBoolean(
  raw: string | undefined,
  fallback: boolean,
  invalid: AuthRuntimeErrorCode,
  errors: AuthRuntimeErrorCode[],
): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (raw.trim().toLowerCase() === "true") return true;
  if (raw.trim().toLowerCase() === "false") return false;
  errors.push(invalid);
  return fallback;
}

export type AuthRuntimeDependencies = {
  readStrictSecretFile: (input: StrictSecretFileInput) => string;
};

const defaultDeps: AuthRuntimeDependencies = { readStrictSecretFile };

function effectiveUid(): number {
  if (typeof process.geteuid === "function") return process.geteuid();
  if (typeof process.getuid === "function") return process.getuid();
  return 0;
}

export function inspectAuthRuntimeEnv(
  env: Env,
  deps: AuthRuntimeDependencies = defaultDeps,
): { config: AuthRuntimeConfig; errors: AuthRuntimeErrorCode[] } {
  const errors: AuthRuntimeErrorCode[] = [];
  let deploymentEnvironment: AuthRuntimeConfig["deploymentEnvironment"] = "development";
  try {
    deploymentEnvironment = parseDeploymentEnvironment(env);
  } catch (error) {
    errors.push(
      error instanceof Error && error.message === "DEPLOYMENT_ENV_INVALID"
        ? "DEPLOYMENT_ENV_INVALID"
        : "DEPLOYMENT_ENV_REQUIRED",
    );
  }

  const strict = deploymentEnvironment !== "development";
  let loadedNextAuthSecret: string | undefined;
  let loadedGoogleSecret: string | undefined;
  if (strict) {
    if (env.NEXTAUTH_SECRET !== undefined) errors.push("AUTH_SECRET_ENV_FORBIDDEN");
    if (env.GOOGLE_CLIENT_SECRET !== undefined) {
      errors.push("GOOGLE_CLIENT_SECRET_ENV_FORBIDDEN");
    }
    if (env.NEXTAUTH_SECRET_FILE !== NEXTAUTH_SECRET_PATH) {
      errors.push("AUTH_SECRET_FILE_REQUIRED");
    } else {
      try {
        loadedNextAuthSecret = deps.readStrictSecretFile({
          logicalName: "NEXTAUTH_SECRET",
          path: NEXTAUTH_SECRET_PATH,
          expectedUid: effectiveUid(),
          maximumBytes: 128,
        });
      } catch {
        errors.push("AUTH_SECRET_FILE_INVALID");
      }
    }
    if (env.GOOGLE_CLIENT_ID) {
      if (env.GOOGLE_CLIENT_SECRET_FILE !== GOOGLE_SECRET_PATH) {
        errors.push("GOOGLE_CLIENT_SECRET_FILE_REQUIRED");
      } else {
        try {
          loadedGoogleSecret = deps.readStrictSecretFile({
            logicalName: "GOOGLE_CLIENT_SECRET",
            path: GOOGLE_SECRET_PATH,
            expectedUid: effectiveUid(),
            maximumBytes: 256,
          });
        } catch {
          errors.push("GOOGLE_CLIENT_SECRET_FILE_INVALID");
        }
      }
    }
  } else {
    loadedNextAuthSecret = env.NEXTAUTH_SECRET;
    const directGoogleSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    loadedGoogleSecret = directGoogleSecret || undefined;
  }

  const secretResult = inspectSecret(loadedNextAuthSecret);
  if (strict && secretResult.error) errors.push(secretResult.error);
  if (
    loadedGoogleSecret !== undefined &&
    (!/^[\x21-\x7e]{16,256}$/.test(loadedGoogleSecret) ||
      /change.?me|development|example/i.test(loadedGoogleSecret))
  ) {
    errors.push("GOOGLE_CLIENT_SECRET_FILE_INVALID");
  }

  const rawOrigin = env.NEXTAUTH_URL?.trim();
  let canonicalOrigin = "";
  if (!rawOrigin) {
    errors.push("AUTH_URL_REQUIRED");
  } else {
    try {
      const parsed = new URL(rawOrigin);
      if (
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash ||
        parsed.username ||
        parsed.password
      ) {
        errors.push("AUTH_URL_INVALID");
      }
      if (strict && parsed.protocol !== "https:") errors.push("AUTH_URL_HTTPS_REQUIRED");
      canonicalOrigin = parsed.origin;
    } catch {
      errors.push("AUTH_URL_INVALID");
    }
  }

  const secureCookies = parseBoolean(
    env.NEXTAUTH_COOKIE_SECURE,
    strict,
    "AUTH_COOKIE_FLAG_INVALID",
    errors,
  );
  const requestedDevelopmentLogin = parseBoolean(
    env.MUNJIB_ENABLE_DEV_LOGIN,
    deploymentEnvironment === "development",
    "DEVELOPMENT_LOGIN_FLAG_INVALID",
    errors,
  );
  if (strict && !secureCookies) errors.push("AUTH_COOKIE_NOT_SECURE");
  if (deploymentEnvironment !== "development" && requestedDevelopmentLogin) {
    errors.push("DEVELOPMENT_LOGIN_ENABLED");
  }

  return {
    config: {
      deploymentEnvironment,
      secret: secretResult.secret,
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleClientSecret: loadedGoogleSecret,
      canonicalOrigin,
      secureCookies,
      developmentLoginEnabled:
        deploymentEnvironment === "development" && requestedDevelopmentLogin,
      passwordSignupEnabled: resolvePublicSignupEnabled(env),
      oauthSignupEnabled: resolvePublicSignupEnabled(env),
    },
    errors: Array.from(new Set(errors)),
  };
}

export function assertValidAuthRuntimeEnv(
  env: Env,
  deps: AuthRuntimeDependencies = defaultDeps,
): AuthRuntimeConfig {
  const inspection = inspectAuthRuntimeEnv(env, deps);
  if (inspection.errors.length > 0) {
    throw new AuthRuntimeConfigurationError(inspection.errors);
  }
  return inspection.config;
}

/** Derive a purpose-specific key without consulting environment or files. */
export function deriveAuthRuntimeSubkey(
  runtime: AuthRuntimeConfig,
  domain: string,
): Buffer {
  if (!runtime || typeof runtime.secret !== "string" || !domain) {
    throw new TypeError("AUTH_RUNTIME_SUBKEY_INPUT_INVALID");
  }
  return createHmac("sha256", runtime.secret)
    .update(`munjib-auth-runtime-subkey-v1\0${domain}`, "utf8")
    .digest();
}
