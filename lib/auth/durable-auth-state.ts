export type DurableAuthSurface =
  | "PASSWORD"
  | "GOOGLE_EXISTING"
  | "JWT"
  | "SESSION"
  | "PROVISIONING";

export type DurableAuthDatabase = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; authDisabledAt: true; sessionVersion: true };
    }): Promise<{
      id: string;
      authDisabledAt: Date | string | null;
      sessionVersion: bigint | number | string;
    } | null>;
  };
};

export type DurableAuthState = Readonly<{
  userId: string;
  sessionVersion: bigint;
}>;

export type DurableAuthStateInput = Readonly<{
  userId: string;
  surface: DurableAuthSurface;
  issuedSessionVersion?: unknown;
  issueSessionVersion?: boolean;
}>;

const MAX_SESSION_VERSION = BigInt("9223372036854775807");

export function createDurableAuthStateHook(
  db: DurableAuthDatabase,
): (input: DurableAuthStateInput) => Promise<DurableAuthState> {
  return async (input) => {
    const state = await assertCurrentUserAuthEnabled({
      db,
      userId: input.userId,
      surface: input.surface,
    });
    if (input.surface === "JWT" || input.surface === "SESSION") {
      if (input.issuedSessionVersion === undefined) {
        if (input.surface !== "JWT" || input.issueSessionVersion !== true) {
          throw new Error("AUTH_SESSION_VERSION_MISSING");
        }
      } else if (parseSessionVersion(input.issuedSessionVersion) !== state.sessionVersion) {
        throw new Error("AUTH_SESSION_REVOKED");
      }
    }
    return state;
  };
}

function assertUserId(userId: unknown): asserts userId is string {
  if (
    typeof userId !== "string" ||
    userId.length < 1 ||
    userId.length > 255 ||
    userId.trim() !== userId ||
    /[\u0000-\u001f\u007f]/.test(userId) ||
    userId.includes("@")
  ) {
    throw new Error("AUTH_USER_ID_INVALID");
  }
}

function parseSessionVersion(value: unknown): bigint {
  if (typeof value === "bigint") {
    if (value >= BigInt(0) && value <= MAX_SESSION_VERSION) return value;
  } else if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  } else if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed <= MAX_SESSION_VERSION) return parsed;
  }
  throw new Error("AUTH_STATE_UNAVAILABLE");
}

/**
 * Resolve durable auth state by immutable user id. The query deliberately
 * selects the Leaf 2 columns: before their migration exists, an unavailable
 * column is a fail-closed error rather than an implicit enabled state.
 */
export async function assertCurrentUserAuthEnabled(input: {
  db: DurableAuthDatabase;
  userId: string;
  surface?: DurableAuthSurface;
}): Promise<DurableAuthState> {
  assertUserId(input.userId);
  let user: Awaited<ReturnType<DurableAuthDatabase["user"]["findUnique"]>>;
  try {
    user = await input.db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, authDisabledAt: true, sessionVersion: true },
    });
  } catch {
    throw new Error("AUTH_STATE_UNAVAILABLE");
  }
  if (!user) throw new Error("AUTH_STATE_NOT_FOUND");
  if (user.id !== input.userId || user.authDisabledAt !== null) {
    throw new Error("AUTH_USER_DISABLED");
  }
  return { userId: user.id, sessionVersion: parseSessionVersion(user.sessionVersion) };
}
