import { prisma } from "@/lib/db/client";
import {
  getProcessDummyPasswordHash,
  parsePasswordHash,
  upgradePasswordHash,
  verifyParsedPasswordHash,
  type ParsedPasswordHash,
  type PasswordCryptoDependencies,
} from "@/lib/auth/passwords";
import { withPasswordWorkPermit } from "@/lib/auth/password-work-limit";
import { authDownstreamHooks, type AuthDownstreamHooks } from "@/lib/auth/downstream/contract";

type PasswordUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  passwordHash: string | null;
};

type PasswordDatabase = {
  user: {
    findUnique(args: unknown): Promise<PasswordUser | null>;
    updateMany(args: unknown): Promise<{ count: number } | number>;
  };
};

export type AuthorizePasswordCredentialOptions = {
  db?: PasswordDatabase;
  /** Alias useful to callers that already name their Prisma client `prisma`. */
  prisma?: PasswordDatabase;
  downstreamHooks?: Pick<AuthDownstreamHooks, "assertDurableAuthState" | "admitPasswordCredentials">;
  crypto?: PasswordCryptoDependencies;
};

export function getPasswordDummyHash() {
  return getProcessDummyPasswordHash();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapCredentials(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) return null;
  if ("credentials" in input && !("password" in input)) {
    return isRecord(input.credentials) ? input.credentials : null;
  }
  return input;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.toLowerCase().trim();
  if (!email || email.length > 320 || /[\u0000-\u001f\u007f]/.test(email) || !email.includes("@")) return null;
  return email;
}

function isValidPasswordInput(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") >= 1 && Buffer.byteLength(value, "utf8") <= 256;
}

function isCurrentOrLegacyHash(value: unknown): value is string {
  return typeof value === "string" && parsePasswordHash(value) !== null;
}

function casUpdatedCount(result: { count: number } | number) {
  return typeof result === "number" ? result : result.count;
}

/**
 * Authorizes an email/password attempt with equal-shape dummy work and a
 * compare-and-swap migration for the reviewed legacy envelope.
 */
export async function authorizePasswordCredential(
  input: unknown,
  options: AuthorizePasswordCredentialOptions = {},
) {
  const credentials = unwrapCredentials(input);
  const email = normalizeEmail(credentials?.email);
  const password = credentials?.password;
  // Invalid request shape may reject before database lookup/KDF work.
  if (!email || !isValidPasswordInput(password)) return null;

  const db = options.db ?? options.prisma ?? (prisma as unknown as PasswordDatabase);
  const downstream = options.downstreamHooks ?? authDownstreamHooks;
  let user: PasswordUser | null = null;
  try {
    user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, image: true, passwordHash: true },
    });
  } catch {
    return null;
  }

  const parsed = parsePasswordHash(user?.passwordHash);
  const selectedHash = parsed ?? parsePasswordHash(getProcessDummyPasswordHash())!;
  let verified = false;
  try {
    verified = await withPasswordWorkPermit(() =>
      verifyParsedPasswordHash(password, selectedHash, options.crypto),
    );
  } catch {
    return null;
  }

  // A dummy record is never a credential, even if a test vector collides.
  if (!verified || !user || !parsed || !isCurrentOrLegacyHash(user.passwordHash)) return null;

  try {
    if (parsed.format === "legacy") {
      const updated = await db.user.updateMany({
        where: { id: user.id, passwordHash: parsed.envelope },
        data: { passwordHash: upgradePasswordHash(parsed) },
      });
      if (casUpdatedCount(updated) !== 1) return null;
    }
    await downstream.assertDurableAuthState({ userId: user.id, surface: "PASSWORD" });
    if (!(await downstream.admitPasswordCredentials({ userId: user.id, email }))) return null;
  } catch {
    return null;
  }

  return { id: user.id, email: user.email, name: user.name, image: null };
}

export type { ParsedPasswordHash };
