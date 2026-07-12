import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const CURRENT_PREFIX = "munjib-scrypt";
const LEGACY_PREFIX = "scrypt";
const VERSION = 1 as const;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const SALT_TOKEN_LENGTH = 22;
const KEY_TOKEN_LENGTH = 86;
const MAX_PASSWORD_BYTES = 256;
const MAX_STORED_HASH_BYTES = 256;
const MAXMEM = 64 * 1024 * 1024;

const PROCESS_DUMMY_HASH = (() => {
  const saltToken = randomBytes(SALT_BYTES).toString("base64url");
  const keyToken = randomBytes(KEY_LENGTH).toString("base64url");
  return `munjib-scrypt$v=1$N=16384$r=8$p=1$dk=64$se=b64url-ascii$${saltToken}$${keyToken}`;
})();

export const PASSWORD_HASH_FORMAT =
  "munjib-scrypt$v=1$N=16384$r=8$p=1$dk=64$se=b64url-ascii" as const;

export type PasswordHashFormat = "v1" | "legacy";

export type ParsedPasswordHash = {
  format: PasswordHashFormat;
  envelope: string;
  saltToken: string;
  keyToken: string;
  key: Buffer;
};

export type PasswordCryptoDependencies = {
  scrypt?: (
    password: Buffer,
    salt: Buffer,
    keyLength: number,
    options: { N: number; r: number; p: number; maxmem: number },
  ) => Promise<Buffer> | Buffer;
  timingSafeEqual?: (left: Buffer, right: Buffer) => boolean;
};

const defaultScrypt: PasswordCryptoDependencies["scrypt"] = (
  password,
  salt,
  keyLength,
  options,
) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });

const defaultCrypto: Required<PasswordCryptoDependencies> = {
  scrypt: defaultScrypt,
  timingSafeEqual,
};

let testCrypto: PasswordCryptoDependencies = {};

/** Test-only dependency seam. Production callers should leave this untouched. */
export function setPasswordCryptoForTests(dependencies: PasswordCryptoDependencies) {
  testCrypto = { ...dependencies };
}

/** Test-only reset for the process-local crypto seam. */
export function resetPasswordCryptoForTests() {
  testCrypto = {};
}

export function setPasswordScryptForTests(scrypt: NonNullable<PasswordCryptoDependencies["scrypt"]>) {
  testCrypto = { ...testCrypto, scrypt };
}

export function resetPasswordScryptForTests() {
  testCrypto = { ...testCrypto, scrypt: undefined };
}

function cryptoFor(dependencies?: PasswordCryptoDependencies): Required<PasswordCryptoDependencies> {
  return {
    scrypt: dependencies?.scrypt ?? testCrypto.scrypt ?? defaultCrypto.scrypt,
    timingSafeEqual:
      dependencies?.timingSafeEqual ?? testCrypto.timingSafeEqual ?? defaultCrypto.timingSafeEqual,
  };
}

function isAsciiEnvelope(value: string) {
  return Buffer.byteLength(value, "utf8") <= MAX_STORED_HASH_BYTES && /^[\x00-\x7f]*$/.test(value);
}

function decodeCanonicalToken(value: string, expectedLength: number, expectedBytes: number) {
  if (value.length !== expectedLength || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== expectedBytes || decoded.toString("base64url") !== value) return null;
  return decoded;
}

function parseEnvelope(
  format: PasswordHashFormat,
  envelope: string,
  saltToken: string,
  keyToken: string,
) {
  const salt = decodeCanonicalToken(saltToken, SALT_TOKEN_LENGTH, SALT_BYTES);
  const key = decodeCanonicalToken(keyToken, KEY_TOKEN_LENGTH, KEY_LENGTH);
  if (!salt || !key) return null;
  return {
    format,
    envelope,
    saltToken,
    keyToken,
    key,
  } satisfies ParsedPasswordHash;
}

/**
 * Parses the one reviewed v1 envelope or the exact legacy envelope.
 * Stored fields are data only; no stored work factor is ever executed.
 */
export function parsePasswordHash(value: unknown): ParsedPasswordHash | null {
  if (typeof value !== "string" || !isAsciiEnvelope(value)) return null;

  const currentParts = value.split("$");
  if (
    currentParts.length === 9 &&
    currentParts[0] === CURRENT_PREFIX &&
    currentParts[1] === "v=1" &&
    currentParts[2] === "N=16384" &&
    currentParts[3] === "r=8" &&
    currentParts[4] === "p=1" &&
    currentParts[5] === "dk=64" &&
    currentParts[6] === "se=b64url-ascii"
  ) {
    return parseEnvelope("v1", value, currentParts[7]!, currentParts[8]!);
  }

  const legacyParts = value.split(":");
  if (legacyParts.length === 3 && legacyParts[0] === LEGACY_PREFIX) {
    return parseEnvelope("legacy", value, legacyParts[1]!, legacyParts[2]!);
  }
  return null;
}

export function getProcessDummyPasswordHash() {
  return PROCESS_DUMMY_HASH;
}

function assertPasswordInput(password: unknown): asserts password is string {
  if (typeof password !== "string") throw new Error("PASSWORD_INPUT_INVALID");
  const bytes = Buffer.byteLength(password, "utf8");
  if (bytes < 1 || bytes > MAX_PASSWORD_BYTES) throw new Error("PASSWORD_INPUT_INVALID");
}

async function derivePasswordKey(
  password: string,
  saltToken: string,
  dependencies?: PasswordCryptoDependencies,
) {
  const crypto = cryptoFor(dependencies);
  const derivedKey = await crypto.scrypt(
    Buffer.from(password, "utf8"),
    Buffer.from(saltToken, "utf8"),
    KEY_LENGTH,
    { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM },
  );
  if (!Buffer.isBuffer(derivedKey) || derivedKey.length !== KEY_LENGTH) {
    throw new Error("PASSWORD_DERIVATION_INVALID");
  }
  return derivedKey;
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordInput(password);
  const saltToken = randomBytes(SALT_BYTES).toString("base64url");
  const derivedKey = await derivePasswordKey(password, saltToken);
  return `${PASSWORD_HASH_FORMAT}$${saltToken}$${derivedKey.toString("base64url")}`;
}

/** Converts verified legacy material without spending a second scrypt. */
export function upgradePasswordHash(parsed: ParsedPasswordHash): string {
  if (parsed.format !== "legacy") return parsed.envelope;
  return `${PASSWORD_HASH_FORMAT}$${parsed.saltToken}$${parsed.keyToken}`;
}

export async function verifyParsedPasswordHash(
  password: string,
  parsed: ParsedPasswordHash,
  dependencies?: PasswordCryptoDependencies,
): Promise<boolean> {
  assertPasswordInput(password);
  const derivedKey = await derivePasswordKey(password, parsed.saltToken, dependencies);
  const crypto = cryptoFor(dependencies);
  // Both sides are fixed 64-byte values for a syntactically valid envelope.
  return crypto.timingSafeEqual(parsed.key, derivedKey);
}

export async function verifyPasswordHash(
  password: string,
  passwordHash: string | null | undefined,
  dependencies?: PasswordCryptoDependencies,
): Promise<boolean> {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") < 1 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return false;
  }
  const parsedActual = parsePasswordHash(passwordHash);
  const parsed = parsedActual ?? parsePasswordHash(PROCESS_DUMMY_HASH)!;
  const verified = await verifyParsedPasswordHash(password, parsed, dependencies);
  // Dummy verification is intentionally never a successful credential.
  return parsedActual !== null && verified;
}

// Compatibility alias for callers outside the Task 2A seam.
export const verifyPassword = verifyPasswordHash;

export const passwordHashConstants = Object.freeze({
  currentPrefix: CURRENT_PREFIX,
  legacyPrefix: LEGACY_PREFIX,
  version: VERSION,
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  keyLength: KEY_LENGTH,
  saltBytes: SALT_BYTES,
  maxmem: MAXMEM,
  maxPasswordBytes: MAX_PASSWORD_BYTES,
  maxStoredHashBytes: MAX_STORED_HASH_BYTES,
});
