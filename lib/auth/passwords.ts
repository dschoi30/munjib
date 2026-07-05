import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const encoding = "base64url";
const version = "scrypt";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString(encoding);
  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
  return `${version}:${salt}:${derivedKey.toString(encoding)}`;
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false;

  const [storedVersion, salt, storedKey] = passwordHash.split(":");
  if (storedVersion !== version || !salt || !storedKey) return false;

  const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
  const storedBuffer = Buffer.from(storedKey, encoding);

  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(storedBuffer, derivedKey);
}
