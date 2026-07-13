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

export function createDurableAuthStateHook(
  db: DurableAuthDatabase,
): (input: { userId: string; surface: DurableAuthSurface }) => Promise<void> {
  return async (input) => {
    await assertCurrentUserAuthEnabled({ db, userId: input.userId, surface: input.surface });
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
  try {
    const parsed = typeof value === "bigint" ? value : BigInt(value as string | number);
    if (parsed < BigInt(0)) throw new Error("negative");
    return parsed;
  } catch {
    throw new Error("AUTH_STATE_UNAVAILABLE");
  }
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
