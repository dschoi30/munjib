import { createHmac } from "node:crypto";
import { parseDeploymentEnvironment, type DeploymentEnvironment } from "@/lib/runtime/deployment-env";
import { readStrictSecretFile, type StrictSecretFileInput } from "@/lib/security/strict-secret-file";

export const AUTH_GUARD_SECRET_PATH = "/run/secrets/munjib_auth_guard_secret";
const MAX_HEADER_BYTES = 256;
const MAX_BUCKET_BYTES = 128;
const MAX_SCOPE_BYTES = 32;
const MAX_VALUE_BYTES = 191;
const FALLBACK_MARKERS = [
  "obsidian-clone-development-secret",
  "development-secret",
  "local-development-only",
  "change-me",
];

export type AuthGuardRuntimeErrorCode =
  | "DEPLOYMENT_ENV_REQUIRED"
  | "DEPLOYMENT_ENV_INVALID"
  | "AUTH_GUARD_SECRET_FILE_REQUIRED"
  | "AUTH_GUARD_SECRET_FILE_INVALID"
  | "AUTH_GUARD_SECRET_ENV_FORBIDDEN"
  | "AUTH_GUARD_SECRET_REQUIRED"
  | "AUTH_GUARD_SECRET_FORMAT_INVALID"
  | "AUTH_GUARD_SECRET_FALLBACK"
  | "AUTH_GUARD_SECRET_LOW_ENTROPY"
  | "AUTH_GUARD_ORIGIN_REQUIRED"
  | "AUTH_GUARD_ORIGIN_INVALID"
  | "AUTH_GUARD_ORIGIN_HTTPS_REQUIRED";

export type AuthGuardDecisionCode =
  | "AUTH_GUARD_UNAVAILABLE"
  | "AUTH_GUARD_METHOD_INVALID"
  | "AUTH_GUARD_HEADER_INVALID"
  | "AUTH_GUARD_HEADER_TOO_LARGE"
  | "AUTH_GUARD_ORIGIN_REQUIRED"
  | "AUTH_GUARD_ORIGIN_INVALID"
  | "AUTH_GUARD_ORIGIN_MISMATCH"
  | "AUTH_GUARD_FETCH_METADATA_REQUIRED"
  | "AUTH_GUARD_FETCH_SITE_CROSS_ORIGIN"
  | "AUTH_GUARD_FETCH_SITE_INVALID"
  | "AUTH_GUARD_FETCH_MODE_INVALID"
  | "AUTH_GUARD_FETCH_DEST_INVALID"
  | "AUTH_GUARD_BUCKET_INVALID"
  | "AUTH_GUARD_STORE_UNAVAILABLE"
  | "AUTH_GUARD_RATE_LIMITED";

export type AuthGuardRuntime = Readonly<{
  deploymentEnvironment: DeploymentEnvironment;
  canonicalOrigin: string;
  /** Kept in-memory only; never include this value in logs or persistence. */
  secret: string;
}>;

export class AuthGuardRuntimeConfigurationError extends Error {
  readonly code = "AUTH_GUARD_UNAVAILABLE" as const;
  readonly codes: AuthGuardRuntimeErrorCode[];

  constructor(codes: AuthGuardRuntimeErrorCode[]) {
    super("AUTH_GUARD_UNAVAILABLE");
    this.name = "AuthGuardRuntimeConfigurationError";
    this.codes = codes;
  }
}

export type AuthGuardRuntimeDependencies = {
  readStrictSecretFile: (input: StrictSecretFileInput) => string;
};

const defaultDependencies: AuthGuardRuntimeDependencies = { readStrictSecretFile };

export type AuthGuardHeaders =
  | Headers
  | Readonly<Record<string, string | readonly string[] | undefined>>;

export type AuthGuardRequest = Readonly<{
  method: string;
  headers?: AuthGuardHeaders;
  /** Opaque, already-bounded store bucket. Raw identifiers do not belong here. */
  bucket: string;
}>;

export type AuthGuardStore = Readonly<{
  check(input: Readonly<{ bucket: string }>): Promise<"allow" | "deny">;
}>;

export type AuthGuardDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; code: AuthGuardDecisionCode }>;

function effectiveUid(): number {
  if (typeof process.geteuid === "function") return process.geteuid();
  if (typeof process.getuid === "function") return process.getuid();
  return 0;
}

function inspectSecret(value: string | undefined) {
  if (!value) return { secret: "", error: "AUTH_GUARD_SECRET_REQUIRED" as const };
  if (value !== value.trim() || !/^[A-Za-z0-9_-]{43,128}$/.test(value)) {
    return { secret: value, error: "AUTH_GUARD_SECRET_FORMAT_INVALID" as const };
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    return { secret: value, error: "AUTH_GUARD_SECRET_FORMAT_INVALID" as const };
  }
  if (decoded.length < 32 || decoded.toString("base64url") !== value) {
    return { secret: value, error: "AUTH_GUARD_SECRET_FORMAT_INVALID" as const };
  }
  const decodedText = decoded.toString("utf8").toLowerCase();
  if (FALLBACK_MARKERS.some((marker) => decodedText.includes(marker))) {
    return { secret: value, error: "AUTH_GUARD_SECRET_FALLBACK" as const };
  }
  if (new Set(value).size < 12 || /^(.)\1+$/.test(value)) {
    return { secret: value, error: "AUTH_GUARD_SECRET_LOW_ENTROPY" as const };
  }
  return { secret: value };
}

function parseOrigin(value: string | undefined): { origin: string; error?: AuthGuardRuntimeErrorCode } {
  if (!value || !value.trim()) return { origin: "", error: "AUTH_GUARD_ORIGIN_REQUIRED" };
  try {
    const parsed = new URL(value.trim());
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return { origin: "", error: "AUTH_GUARD_ORIGIN_INVALID" };
    }
    return { origin: parsed.origin };
  } catch {
    return { origin: "", error: "AUTH_GUARD_ORIGIN_INVALID" };
  }
}

export function inspectAuthGuardRuntimeEnv(
  env: Record<string, string | undefined>,
  deps: AuthGuardRuntimeDependencies = defaultDependencies,
): { runtime: AuthGuardRuntime; errors: AuthGuardRuntimeErrorCode[] } {
  const errors: AuthGuardRuntimeErrorCode[] = [];
  let deploymentEnvironment: DeploymentEnvironment = "development";
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
  let loadedSecret: string | undefined;
  if (strict) {
    if (env.MUNJIB_AUTH_GUARD_SECRET !== undefined) {
      errors.push("AUTH_GUARD_SECRET_ENV_FORBIDDEN");
    }
    if (env.MUNJIB_AUTH_GUARD_SECRET_FILE !== AUTH_GUARD_SECRET_PATH) {
      errors.push("AUTH_GUARD_SECRET_FILE_REQUIRED");
    } else {
      try {
        loadedSecret = deps.readStrictSecretFile({
          logicalName: "MUNJIB_AUTH_GUARD_SECRET",
          path: AUTH_GUARD_SECRET_PATH,
          expectedUid: effectiveUid(),
          maximumBytes: 128,
        });
      } catch {
        errors.push("AUTH_GUARD_SECRET_FILE_INVALID");
      }
    }
  } else {
    loadedSecret = env.MUNJIB_AUTH_GUARD_SECRET;
  }

  const secretResult = inspectSecret(loadedSecret);
  if (secretResult.error) errors.push(secretResult.error);

  const parsedOrigin = parseOrigin(env.NEXTAUTH_URL);
  if (parsedOrigin.error) errors.push(parsedOrigin.error);
  if (strict && parsedOrigin.origin && !parsedOrigin.origin.startsWith("https://")) {
    errors.push("AUTH_GUARD_ORIGIN_HTTPS_REQUIRED");
  }

  return {
    runtime: {
      deploymentEnvironment,
      canonicalOrigin: parsedOrigin.origin,
      secret: secretResult.secret,
    },
    errors: Array.from(new Set(errors)),
  };
}

export function assertValidAuthGuardRuntimeEnv(
  env: Record<string, string | undefined>,
  deps: AuthGuardRuntimeDependencies = defaultDependencies,
): AuthGuardRuntime {
  const inspection = inspectAuthGuardRuntimeEnv(env, deps);
  if (inspection.errors.length > 0) throw new AuthGuardRuntimeConfigurationError(inspection.errors);
  return inspection.runtime;
}

function isUnsafeMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function normalizeMethod(method: unknown): string | null {
  if (typeof method !== "string" || method.length < 1 || method.length > 16 || !/^[A-Za-z]+$/.test(method)) {
    return null;
  }
  const normalized = method.toUpperCase();
  return ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(normalized)
    ? normalized
    : null;
}

function runtimeIsUsable(runtime: AuthGuardRuntime | null | undefined): runtime is AuthGuardRuntime {
  return Boolean(
    runtime &&
      typeof runtime.secret === "string" &&
      runtime.secret.length >= 43 &&
      typeof runtime.canonicalOrigin === "string" &&
      runtime.canonicalOrigin.length > 0,
  );
}

function readHeader(headers: AuthGuardHeaders | undefined, name: string): string | undefined | null {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Readonly<Record<string, string | readonly string[] | undefined>>;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const value = record[key];
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : value === undefined ? undefined : null;
}

function boundedHeader(
  headers: AuthGuardHeaders | undefined,
  name: string,
): { value?: string; code?: AuthGuardDecisionCode } {
  const value = readHeader(headers, name);
  if (value === null) return { code: "AUTH_GUARD_HEADER_INVALID" };
  if (value !== undefined && Buffer.byteLength(value, "utf8") > MAX_HEADER_BYTES) {
    return { code: "AUTH_GUARD_HEADER_TOO_LARGE" };
  }
  return { value };
}

function methodDecision(method: unknown): { method: string } | { code: AuthGuardDecisionCode } {
  const normalized = normalizeMethod(method);
  return normalized ? { method: normalized } : { code: "AUTH_GUARD_METHOD_INVALID" };
}

export function evaluateAuthOrigin(input: {
  runtime: AuthGuardRuntime | null | undefined;
  request: Pick<AuthGuardRequest, "method" | "headers">;
}): AuthGuardDecision {
  if (!runtimeIsUsable(input.runtime)) return { allowed: false, code: "AUTH_GUARD_UNAVAILABLE" };
  const method = methodDecision(input.request.method);
  if ("code" in method) return { allowed: false, code: method.code };
  if (!isUnsafeMethod(method.method)) return { allowed: true };

  const header = boundedHeader(input.request.headers, "origin");
  if (header.code) return { allowed: false, code: header.code };
  if (!header.value) return { allowed: false, code: "AUTH_GUARD_ORIGIN_REQUIRED" };
  let parsed: URL;
  try {
    parsed = new URL(header.value);
  } catch {
    return { allowed: false, code: "AUTH_GUARD_ORIGIN_INVALID" };
  }
  if (parsed.origin !== header.value || parsed.origin !== input.runtime.canonicalOrigin) {
    return { allowed: false, code: "AUTH_GUARD_ORIGIN_MISMATCH" };
  }
  return { allowed: true };
}

export function evaluateFetchMetadata(input: {
  runtime: AuthGuardRuntime | null | undefined;
  request: Pick<AuthGuardRequest, "method" | "headers">;
}): AuthGuardDecision {
  if (!runtimeIsUsable(input.runtime)) return { allowed: false, code: "AUTH_GUARD_UNAVAILABLE" };
  const method = methodDecision(input.request.method);
  if ("code" in method) return { allowed: false, code: method.code };
  if (!isUnsafeMethod(method.method)) return { allowed: true };

  const site = boundedHeader(input.request.headers, "sec-fetch-site");
  if (site.code) return { allowed: false, code: site.code };
  if (!site.value) return { allowed: false, code: "AUTH_GUARD_FETCH_METADATA_REQUIRED" };
  if (site.value !== "same-origin" && site.value !== "same-site") {
    return {
      allowed: false,
      code: site.value === "cross-site" ? "AUTH_GUARD_FETCH_SITE_CROSS_ORIGIN" : "AUTH_GUARD_FETCH_SITE_INVALID",
    };
  }

  const mode = boundedHeader(input.request.headers, "sec-fetch-mode");
  if (mode.code) return { allowed: false, code: mode.code };
  if (mode.value && !["cors", "same-origin", "navigate"].includes(mode.value)) {
    return { allowed: false, code: "AUTH_GUARD_FETCH_MODE_INVALID" };
  }
  const dest = boundedHeader(input.request.headers, "sec-fetch-dest");
  if (dest.code) return { allowed: false, code: dest.code };
  if (dest.value && !["empty", "document"].includes(dest.value)) {
    return { allowed: false, code: "AUTH_GUARD_FETCH_DEST_INVALID" };
  }
  return { allowed: true };
}

function isValidBucket(bucket: unknown): bucket is string {
  return typeof bucket === "string" &&
    Buffer.byteLength(bucket, "utf8") > 0 &&
    Buffer.byteLength(bucket, "utf8") <= MAX_BUCKET_BYTES &&
    /^[A-Za-z0-9._:-]+$/.test(bucket);
}

export async function authorizeAuthRequest(input: {
  runtime: AuthGuardRuntime | null | undefined;
  request: AuthGuardRequest;
  store: AuthGuardStore | null | undefined;
}): Promise<AuthGuardDecision> {
  if (!runtimeIsUsable(input.runtime)) return { allowed: false, code: "AUTH_GUARD_UNAVAILABLE" };
  if (!isValidBucket(input.request.bucket)) return { allowed: false, code: "AUTH_GUARD_BUCKET_INVALID" };
  const origin = evaluateAuthOrigin({ runtime: input.runtime, request: input.request });
  if (!origin.allowed) return origin;
  const metadata = evaluateFetchMetadata({ runtime: input.runtime, request: input.request });
  if (!metadata.allowed) return metadata;
  if (!input.store || typeof input.store.check !== "function") {
    return { allowed: false, code: "AUTH_GUARD_STORE_UNAVAILABLE" };
  }
  let result: "allow" | "deny";
  try {
    result = await input.store.check({ bucket: input.request.bucket });
  } catch {
    return { allowed: false, code: "AUTH_GUARD_STORE_UNAVAILABLE" };
  }
  if (result === "deny") return { allowed: false, code: "AUTH_GUARD_RATE_LIMITED" };
  if (result !== "allow") return { allowed: false, code: "AUTH_GUARD_STORE_UNAVAILABLE" };
  return { allowed: true };
}

export function deriveAuthGuardBucket(
  runtime: AuthGuardRuntime | null | undefined,
  input: { scope: string; value: string },
): string {
  if (!runtimeIsUsable(runtime)) throw new Error("AUTH_GUARD_UNAVAILABLE");
  if (
    !input ||
    typeof input.scope !== "string" ||
    typeof input.value !== "string" ||
    input.scope.length < 1 ||
    Buffer.byteLength(input.scope, "utf8") > MAX_SCOPE_BYTES ||
    input.value.length < 1 ||
    Buffer.byteLength(input.value, "utf8") > MAX_VALUE_BYTES ||
    /[\u0000-\u001f\u007f]/.test(input.scope) ||
    /[\u0000-\u001f\u007f]/.test(input.value)
  ) {
    throw new Error("AUTH_GUARD_BUCKET_INVALID");
  }
  return createHmac("sha256", runtime.secret)
    .update(`munjib-auth-guard-bucket-v1\0${input.scope}\0${input.value}`, "utf8")
    .digest("base64url");
}
