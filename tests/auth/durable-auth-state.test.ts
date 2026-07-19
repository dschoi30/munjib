import { describe, expect, it, vi } from "vitest";
import {
  assertCurrentUserAuthEnabled,
  createDurableAuthStateHook,
  type DurableAuthDatabase,
} from "@/lib/auth/durable-auth-state";

function database(result: unknown): DurableAuthDatabase {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(result) },
  };
}

describe("durable auth state boundary", () => {
  it("reloads by immutable user id and returns the DB-owned session version", async () => {
    const db = database({ id: "user-1", authDisabledAt: null, sessionVersion: BigInt(4) });
    await expect(assertCurrentUserAuthEnabled({ db, userId: "user-1" })).resolves.toEqual({
      userId: "user-1",
      sessionVersion: BigInt(4),
    });
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { id: true, authDisabledAt: true, sessionVersion: true },
    });
  });

  it("rejects a durably disabled user and never accepts an email lookup", async () => {
    const db = database({ id: "user-1", authDisabledAt: new Date("2026-07-13T00:00:00Z"), sessionVersion: BigInt(5) });
    await expect(assertCurrentUserAuthEnabled({ db, userId: "user-1" })).rejects.toThrow(
      "AUTH_USER_DISABLED",
    );
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user-1" } }));
  });

  it("fails closed for missing, malformed, or unavailable durable state", async () => {
    await expect(assertCurrentUserAuthEnabled({ db: database(null), userId: "user-1" })).rejects.toThrow(
      "AUTH_STATE_NOT_FOUND",
    );
    await expect(assertCurrentUserAuthEnabled({
      db: database({ id: "user-1", authDisabledAt: null }),
      userId: "user-1",
    })).rejects.toThrow("AUTH_STATE_UNAVAILABLE");
    const db: DurableAuthDatabase = {
      user: { findUnique: vi.fn().mockRejectedValue(new Error("column missing")) },
    };
    await expect(assertCurrentUserAuthEnabled({ db, userId: "user-1" })).rejects.toThrow(
      "AUTH_STATE_UNAVAILABLE",
    );
  });

  it.each([null, undefined, "", " ", "+1", "01", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects noncanonical session version %p",
    async (sessionVersion) => {
      await expect(assertCurrentUserAuthEnabled({
        db: database({ id: "user-1", authDisabledAt: null, sessionVersion }),
        userId: "user-1",
      })).rejects.toThrow("AUTH_STATE_UNAVAILABLE");
    },
  );

  it("rejects caller-authored identity shapes before touching the database", async () => {
    const db = database({ id: "user-1", authDisabledAt: null, sessionVersion: BigInt(0) });
    await expect(assertCurrentUserAuthEnabled({ db, userId: " user-1 " })).rejects.toThrow(
      "AUTH_USER_ID_INVALID",
    );
    await expect(assertCurrentUserAuthEnabled({ db, userId: "member@example.com" })).rejects.toThrow(
      "AUTH_USER_ID_INVALID",
    );
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("exposes an injectable hook without changing the reserved Leaf 2 slot", async () => {
    const db = database({ id: "user-1", authDisabledAt: null, sessionVersion: BigInt(2) });
    const hook = createDurableAuthStateHook(db);
    await expect(hook({ userId: "user-1", surface: "JWT" })).resolves.toBeUndefined();
  });
});
