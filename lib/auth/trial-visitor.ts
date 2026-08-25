import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SUBJECT_BYTES = 32;
const SIGNATURE_BYTES = 32;
const DEFAULT_TTL_SECONDS = 180 * 24 * 60 * 60;
const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const TOKEN_DOMAIN = "munjib/trial-visitor-token/v1\0";
const DIGEST_DOMAIN = "munjib/trial-visitor-digest/v1\0";

export type RandomBytesSource = (size: number) => Uint8Array;

export type TrialVisitorTokenIssueOptions = Readonly<{
  key: string | Uint8Array;
  now?: Date;
  ttlSeconds?: number;
  randomBytesSource?: RandomBytesSource;
}>;

export type TrialVisitorTokenVerification =
  | Readonly<{ ok: false }>
  | Readonly<{
      ok: true;
      trialVisitorSubject: string;
      issuedAt: string;
      expiresAt: string;
    }>;

export type TrialVisitorTokenVerificationOptions = Readonly<{
  now?: Date;
  visitorDigestKey?: string | Uint8Array;
}>;

type TokenPayload = Readonly<{ v: 1; s: string; iat: number; exp: number }>;

function invalid(message: string): never {
  throw new Error(`trial visitor token ${message}`);
}

function requireKey(key: string | Uint8Array): string | Uint8Array {
  if (typeof key === "string") {
    if (key.length === 0) invalid("key is required");
    return key;
  }
  if (key instanceof Uint8Array && key.byteLength > 0) return key;
  invalid("key is required");
}

function requireValidDate(value: Date | undefined): Date {
  const now = value ?? new Date();
  if (Number.isNaN(now.getTime())) invalid("time is invalid");
  return now;
}

function encodeBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!BASE64URL_PATTERN.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

function sign(payload: string, key: string | Uint8Array): Buffer {
  return createHmac("sha256", requireKey(key)).update(TOKEN_DOMAIN).update(payload).digest();
}

function isSubject(value: unknown): value is string {
  if (typeof value !== "string" || !SUBJECT_PATTERN.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === SUBJECT_BYTES && decoded.toString("base64url") === value;
}

function parsePayload(encodedPayload: string): TokenPayload | null {
  const decoded = decodeCanonicalBase64Url(encodedPayload);
  if (decoded === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "exp,iat,s,v") return null;
  if (value.v !== 1 || !isSubject(value.s)) return null;
  const iat = value.iat;
  const exp = value.exp;
  if (
    typeof iat !== "number" ||
    typeof exp !== "number" ||
    !Number.isSafeInteger(iat) ||
    !Number.isSafeInteger(exp) ||
    exp <= iat
  ) return null;
  return { v: 1, s: value.s, iat, exp };
}

/** Creates the opaque signed cookie value; only its random subject can later identify a Trial visitor. */
export function issueTrialVisitorToken(options: TrialVisitorTokenIssueOptions): string {
  const key = requireKey(options.key);
  const now = requireValidDate(options.now);
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) invalid("ttl is invalid");

  let sourceBytes: Uint8Array;
  try {
    sourceBytes = (options.randomBytesSource ?? randomBytes)(SUBJECT_BYTES);
  } catch {
    invalid("generation failed");
  }
  if (sourceBytes.byteLength !== SUBJECT_BYTES) invalid("generation failed");

  const subject = encodeBase64Url(Buffer.from(sourceBytes));
  if (!isSubject(subject)) invalid("generation failed");
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + ttlSeconds;
  if (!Number.isSafeInteger(exp)) invalid("ttl is invalid");
  const payload: TokenPayload = { v: 1, s: subject, iat, exp };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${encodeBase64Url(sign(encodedPayload, key))}`;
}

/** Verifies a current or previous signing key and returns only a derived pseudonymous session subject. */
export function verifyTrialVisitorToken(
  token: unknown,
  keys: readonly (string | Uint8Array)[],
  options: TrialVisitorTokenVerificationOptions = {},
): TrialVisitorTokenVerification {
  if (typeof token !== "string" || !Array.isArray(keys) || keys.length === 0 || keys.length > 2) return { ok: false };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false };
  const [encodedPayload, encodedSignature] = parts;
  const receivedSignature = decodeCanonicalBase64Url(encodedSignature);
  const payload = parsePayload(encodedPayload);
  if (receivedSignature === null || receivedSignature.byteLength !== SIGNATURE_BYTES || payload === null) return { ok: false };

  let signatureMatches = false;
  for (const key of keys) {
    try {
      const expectedSignature = sign(encodedPayload, key);
      signatureMatches = timingSafeEqual(expectedSignature, receivedSignature) || signatureMatches;
    } catch {
      return { ok: false };
    }
  }
  const now = requireValidDate(options.now);
  if (!signatureMatches || payload.exp <= Math.floor(now.getTime() / 1000)) return { ok: false };
  if (options.visitorDigestKey === undefined) return { ok: false };

  let trialVisitorSubject: string;
  try {
    trialVisitorSubject = deriveTrialVisitorDigest(payload.s, options.visitorDigestKey);
  } catch {
    return { ok: false };
  }

  return {
    ok: true,
    trialVisitorSubject,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

/** Derives the hash-only durable identifier for a verified Trial visitor subject. */
export function deriveTrialVisitorDigest(subject: string, key: string | Uint8Array): string {
  if (!isSubject(subject)) invalid("subject is invalid");
  return createHmac("sha256", requireKey(key)).update(DIGEST_DOMAIN).update(subject, "utf8").digest("base64url");
}
