import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Leaf 7's dependency-safe credential boundary.
 *
 * This module deliberately has no URL, cookie-header, database, route, or log
 * integration. Callers may hold a bearer briefly at the manager/exchange
 * boundary, while durable state receives only the domain-separated hashes.
 */

export const INVITATION_BEARER_BYTES = 32 as const;
export const ATTEMPT_SECRET_BYTES = 32 as const;

const INVITATION_BEARER_DOMAIN = Buffer.from("munjib/invitation-bearer/v1\0", "utf8");
const ATTEMPT_SECRET_DOMAIN = Buffer.from("munjib/invitation-attempt/v1\0", "utf8");
const OPAQUE_SECRET_LENGTH = 43;
const OPAQUE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

declare const invitationBearerBrand: unique symbol;
declare const invitationBearerHashBrand: unique symbol;
declare const attemptSecretBrand: unique symbol;
declare const attemptSecretHashBrand: unique symbol;

export type InvitationBearer = string & { readonly [invitationBearerBrand]: "InvitationBearer" };
export type InvitationBearerHash = string & { readonly [invitationBearerHashBrand]: "InvitationBearerHash" };
export type AttemptSecret = string & { readonly [attemptSecretBrand]: "AttemptSecret" };
export type AttemptSecretHash = string & { readonly [attemptSecretHashBrand]: "AttemptSecretHash" };

export type RandomBytesSource = (size: number) => Uint8Array;

export class InviteTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteTokenError";
  }
}

function fail(message: string): never {
  throw new InviteTokenError(message);
}

function encodeOpaqueSecret(bytes: Uint8Array, expectedBytes: number, label: string): string {
  if (bytes.byteLength !== expectedBytes) {
    fail(`${label} source returned an invalid length`);
  }
  return Buffer.from(bytes).toString("base64url");
}

function createOpaqueSecret<T extends string>(
  source: RandomBytesSource,
  expectedBytes: number,
  label: string,
): T {
  let bytes: Uint8Array;
  try {
    bytes = source(expectedBytes);
  } catch {
    fail(`${label} generation failed`);
  }
  const encoded = encodeOpaqueSecret(bytes, expectedBytes, label);
  if (encoded.length !== OPAQUE_SECRET_LENGTH || !OPAQUE_SECRET_PATTERN.test(encoded)) {
    fail(`${label} generation failed`);
  }
  return encoded as T;
}

function decodeOpaqueSecret(value: unknown, expectedBytes: number, label: string): Buffer {
  if (typeof value !== "string" || !OPAQUE_SECRET_PATTERN.test(value)) {
    fail(`${label} is invalid`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== expectedBytes || decoded.toString("base64url") !== value) {
    fail(`${label} is invalid`);
  }
  return decoded;
}

function digest(domain: Buffer, value: string, expectedBytes: number, label: string): string {
  const bytes = decodeOpaqueSecret(value, expectedBytes, label);
  return createHash("sha256").update(domain).update(bytes).digest("base64url");
}

function decodeHash(value: unknown, label: string): Buffer | null {
  if (typeof value !== "string" || !OPAQUE_SECRET_PATTERN.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== INVITATION_BEARER_BYTES || decoded.toString("base64url") !== value) {
    return null;
  }
  return decoded;
}

/** Generate a raw invitation bearer for the one-time manager response boundary. */
export function createInvitationBearer(source: RandomBytesSource = randomBytes): InvitationBearer {
  return createOpaqueSecret<InvitationBearer>(source, INVITATION_BEARER_BYTES, "invitation bearer");
}

/** Persist only this domain-separated digest; never persist the raw bearer. */
export function hashInvitationBearer(value: InvitationBearer | string): InvitationBearerHash {
  return digest(INVITATION_BEARER_DOMAIN, value, INVITATION_BEARER_BYTES, "invitation bearer") as InvitationBearerHash;
}

/** Generate the opaque secret carried by the short-lived attempt cookie. */
export function createAttemptSecret(source: RandomBytesSource = randomBytes): AttemptSecret {
  return createOpaqueSecret<AttemptSecret>(source, ATTEMPT_SECRET_BYTES, "attempt secret");
}

/** Persist only this domain-separated digest for an attempt. */
export function hashAttemptSecret(value: AttemptSecret): AttemptSecretHash {
  return digest(ATTEMPT_SECRET_DOMAIN, value, ATTEMPT_SECRET_BYTES, "attempt secret") as AttemptSecretHash;
}

/** Compare durable hashes without falling back to a non-constant-time string comparison. */
export function compareInvitationBearerHashes(
  left: InvitationBearerHash | string,
  right: InvitationBearerHash | string,
): boolean {
  const leftBytes = decodeHash(left, "invitation bearer hash");
  const rightBytes = decodeHash(right, "invitation bearer hash");
  return leftBytes !== null && rightBytes !== null && timingSafeEqual(leftBytes, rightBytes);
}

/** The cookie value is exactly one canonical opaque secret; attributes belong to the route layer. */
export function serializeAttemptCookie(value: AttemptSecret): string {
  decodeOpaqueSecret(value, ATTEMPT_SECRET_BYTES, "attempt cookie");
  return value;
}

export function parseAttemptCookie(value: unknown): AttemptSecret {
  decodeOpaqueSecret(value, ATTEMPT_SECRET_BYTES, "attempt cookie");
  return value as AttemptSecret;
}

export type InvitationExchangeBody = Readonly<{ bearer: InvitationBearer }>;

/** Parse the bounded exchange body without accepting ids, revisions, or URL-shaped metadata. */
export function parseInvitationExchangeBody(value: unknown): InvitationExchangeBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invitation exchange body must contain a bearer");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "bearer") {
    fail("invitation exchange body must contain only the bearer field (unknown field)");
  }
  const bearer = (value as { bearer?: unknown }).bearer;
  decodeOpaqueSecret(bearer, INVITATION_BEARER_BYTES, "invitation bearer");
  return Object.freeze({ bearer: bearer as InvitationBearer });
}
