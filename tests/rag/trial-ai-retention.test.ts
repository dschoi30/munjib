import { describe, expect, it } from "vitest";
import {
  purgeExpiredTrialAiData,
  type TrialAiRetentionDatabase,
  type TrialAiRetentionTransaction,
} from "@/lib/rag/trial-ai-retention";

const DB_NOW = new Date("2026-08-25T12:34:56.000Z");

describe("purgeExpiredTrialAiData", () => {
  it("uses the database KST date and preserves rows exactly on each daily retention boundary", async () => {
    const database = new FakeRetentionDatabase({
      visitorDates: ["2026-07-20", "2026-07-21", "2026-07-22"],
      networkDates: ["2026-08-16", "2026-08-17", "2026-08-18"],
      globalDates: ["2026-08-16", "2026-08-17", "2026-08-18"],
    });

    await expect(purgeExpiredTrialAiData({ execute: true }, { database })).resolves.toMatchObject({
      dryRun: false,
      databaseKstDate: "2026-08-25",
      deleted: { visitorDaily: 2, networkDaily: 2, globalDaily: 2, admissionLease: 0 },
    });

    expect(database.state.visitorDates).toEqual(["2026-07-22"]);
    expect(database.state.networkDates).toEqual(["2026-08-18"]);
    expect(database.state.globalDates).toEqual(["2026-08-18"]);
  });

  it("deletes leases only after the 24-hour expiry boundary and never deletes an active lease", async () => {
    const database = new FakeRetentionDatabase({
      leases: [
        { id: "old", expiresAt: new Date("2026-08-24T12:34:55.999Z") },
        { id: "boundary", expiresAt: new Date("2026-08-24T12:34:56.000Z") },
        { id: "recent-expired", expiresAt: new Date("2026-08-25T12:34:55.999Z") },
        { id: "active", expiresAt: new Date("2026-08-25T12:36:56.000Z") },
      ],
    });

    const result = await purgeExpiredTrialAiData({ execute: true }, { database });

    expect(result.deleted.admissionLease).toBe(2);
    expect(database.state.leases.map(({ id }) => id)).toEqual([
      "recent-expired",
      "active",
    ]);
  });

  it("dry-run reports candidates without changing any row", async () => {
    const database = new FakeRetentionDatabase({
      visitorDates: ["2026-07-20"],
      networkDates: ["2026-08-16"],
      globalDates: ["2026-08-16"],
      leases: [{ id: "old", expiresAt: new Date("2026-08-24T12:34:55.999Z") }],
    });
    const before = structuredClone(database.state);

    const result = await purgeExpiredTrialAiData({}, { database });

    expect(result).toMatchObject({
      dryRun: true,
      candidates: { visitorDaily: 1, networkDaily: 1, globalDaily: 1, admissionLease: 1 },
      deleted: { visitorDaily: 0, networkDaily: 0, globalDaily: 0, admissionLease: 0 },
    });
    expect(database.state).toEqual(before);
  });

  it("deletes leases before daily rows and rolls back every deletion when a later step fails", async () => {
    const database = new FakeRetentionDatabase(
      {
        visitorDates: ["2026-07-20"],
        networkDates: ["2026-08-16"],
        globalDates: ["2026-08-16"],
        leases: [{ id: "old", expiresAt: new Date("2026-08-24T12:34:55.999Z") }],
      },
      "networkDates",
    );
    const before = structuredClone(database.state);

    await expect(purgeExpiredTrialAiData({ execute: true }, { database })).rejects.toThrow(
      "forced networkDaily failure",
    );

    expect(database.operations).toEqual(["admissionLease", "visitorDaily", "networkDaily"]);
    expect(database.state).toEqual(before);
  });
});

type Lease = { id: string; expiresAt: Date };
type State = {
  visitorDates: string[];
  networkDates: string[];
  globalDates: string[];
  leases: Lease[];
};

class FakeRetentionDatabase implements TrialAiRetentionDatabase {
  state: State;
  operations: string[] = [];

  constructor(
    input: Partial<State> = {},
    private readonly failOn?: keyof Omit<State, "leases">,
  ) {
    this.state = {
      visitorDates: input.visitorDates ?? [],
      networkDates: input.networkDates ?? [],
      globalDates: input.globalDates ?? [],
      leases: input.leases ?? [],
    };
  }

  async transaction<T>(callback: (tx: TrialAiRetentionTransaction) => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.state);
    const deleteDaily = async (
      kind: "visitorDaily" | "networkDaily" | "globalDaily",
      key: "visitorDates" | "networkDates" | "globalDates",
      beforeKstDate: string,
    ) => {
      this.operations.push(kind);
      if (this.failOn === key) throw new Error(`forced ${kind} failure`);
      const expired = this.state[key].filter((date) => date < beforeKstDate);
      this.state[key] = this.state[key].filter((date) => date >= beforeKstDate);
      return expired.length;
    };
    const countDaily = (key: "visitorDates" | "networkDates" | "globalDates", cutoff: string) =>
      Promise.resolve(this.state[key].filter((date) => date < cutoff).length);

    try {
      return await callback({
        getDatabaseClock: async () => ({ now: DB_NOW, kstDate: "2026-08-25" }),
        countVisitorDaily: (cutoff) => countDaily("visitorDates", cutoff),
        countNetworkDaily: (cutoff) => countDaily("networkDates", cutoff),
        countGlobalDaily: (cutoff) => countDaily("globalDates", cutoff),
        countExpiredLeases: async (cutoff) =>
          this.state.leases.filter(({ expiresAt }) => expiresAt <= cutoff && expiresAt < DB_NOW).length,
        deleteVisitorDaily: (cutoff) => deleteDaily("visitorDaily", "visitorDates", cutoff),
        deleteNetworkDaily: (cutoff) => deleteDaily("networkDaily", "networkDates", cutoff),
        deleteGlobalDaily: (cutoff) => deleteDaily("globalDaily", "globalDates", cutoff),
        deleteExpiredLeases: async (cutoff) => {
          this.operations.push("admissionLease");
          const expired = this.state.leases.filter(
            ({ expiresAt }) => expiresAt <= cutoff && expiresAt < DB_NOW,
          );
          this.state.leases = this.state.leases.filter(
            ({ expiresAt }) => expiresAt > cutoff || expiresAt >= DB_NOW,
          );
          return expired.length;
        },
      });
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }
}
