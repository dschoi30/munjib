import { beforeEach, describe, expect, it } from "vitest";
import {
  admitTrialAiRequest,
  releaseTrialAiLease,
  startTrialAiLeaseHeartbeat,
  type TrialAiAdmissionInput,
} from "@/lib/rag/trial-ai-admission";

describe("trial AI admission ledger", () => {
  let database: ReturnType<typeof createAdmissionDatabase>;

  beforeEach(() => {
    database = createAdmissionDatabase();
  });

  it("admits three completed requests and denies the fourth for the visitor daily limit", async () => {
    const first = await admitTrialAiRequest(input(), dependencies(database));
    expect(first).toMatchObject({
      kind: "admitted",
      remaining: 2,
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    if (first.kind !== "admitted") throw new Error("expected admission");
    await releaseTrialAiLease(first.leaseId, dependencies(database));

    const second = await admitTrialAiRequest(input(), dependencies(database));
    expect(second).toMatchObject({ kind: "admitted", remaining: 1 });
    if (second.kind !== "admitted") throw new Error("expected admission");
    await releaseTrialAiLease(second.leaseId, dependencies(database));

    const third = await admitTrialAiRequest(input(), dependencies(database));
    expect(third).toMatchObject({ kind: "admitted", remaining: 0 });
    if (third.kind !== "admitted") throw new Error("expected admission");
    await releaseTrialAiLease(third.leaseId, dependencies(database));

    await expect(admitTrialAiRequest(input(), dependencies(database))).resolves.toEqual({
      kind: "denied",
      code: "TRIAL_AI_DAILY_LIMIT_REACHED",
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
  });

  it("denies a second active request from the same visitor without incrementing usage", async () => {
    const first = await admitTrialAiRequest(input(), dependencies(database));
    expect(first.kind).toBe("admitted");

    await expect(admitTrialAiRequest(input(), dependencies(database))).resolves.toEqual({
      kind: "denied",
      code: "TRIAL_AI_REQUEST_IN_PROGRESS",
    });
    expect(database.visitorCount("visitor-1", "2026-08-25")).toBe(1);
  });

  it("denies a second concurrent request from the same visitor across the KST date boundary", async () => {
    const results = await Promise.all([
      admitTrialAiRequest(input(), dependencies(database)),
      admitTrialAiRequest(input({ kstDate: "2026-08-26" }), dependencies(database)),
    ]);

    expect(results.filter((result) => result.kind === "admitted")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "denied")).toHaveLength(1);
    expect(results.find((result) => result.kind === "denied")).toMatchObject({
      code: "TRIAL_AI_REQUEST_IN_PROGRESS",
    });
  });

  it("atomically admits exactly three concurrent visitors before the global ceiling", async () => {
    const deps = dependencies(database, { globalDailyLimit: 3 });
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        admitTrialAiRequest(
          input({ actor: { kind: "anonymous-trial", trialVisitorSubject: `visitor-${index}` } }),
          deps,
        ),
      ),
    );

    expect(results.filter((result) => result.kind === "admitted")).toHaveLength(3);
    expect(results.filter((result) => result.kind === "denied")).toHaveLength(1);
    expect(results.find((result) => result.kind === "denied")).toMatchObject({
      code: "TRIAL_AI_GLOBAL_LIMIT_REACHED",
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    expect(database.globalCount("2026-08-25")).toBe(3);
  });

  it("uses one shared network daily row and denies the sixteenth visitor", async () => {
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        admitTrialAiRequest(
          input({ actor: { kind: "anonymous-trial", trialVisitorSubject: `network-visitor-${index}` } }),
          dependencies(database),
        ),
      ),
    );

    expect(results.filter((result) => result.kind === "admitted")).toHaveLength(15);
    expect(results.find((result) => result.kind === "denied")).toMatchObject({
      code: "TRIAL_AI_NETWORK_LIMIT_REACHED",
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    expect(database.networkCount("network-1", "2026-08-25")).toBe(15);
  });

  it("does not apply the ledger to authenticated users", async () => {
    await expect(
      admitTrialAiRequest(
        input({ actor: { kind: "authenticated-user", userId: "user-1" } }),
        dependencies(database),
      ),
    ).resolves.toEqual({ kind: "not-applicable" });
    expect(database.globalCount("2026-08-25")).toBe(0);
  });

  it("fails closed when the database is unavailable", async () => {
    database.failTransactions = true;

    await expect(admitTrialAiRequest(input(), dependencies(database))).resolves.toEqual({
      kind: "denied",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });
  });

  it("fails closed when the lease-id entropy source fails", async () => {
    await expect(
      admitTrialAiRequest(input(), {
        ...dependencies(database),
        createLeaseId: () => {
          throw new Error("entropy unavailable");
        },
      }),
    ).resolves.toEqual({
      kind: "denied",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });
  });

  it("fails closed for a non-calendar KST date instead of moving it into another day", async () => {
    await expect(
      admitTrialAiRequest(input({ kstDate: "2026-02-31" }), dependencies(database)),
    ).resolves.toEqual({
      kind: "denied",
      code: "TRIAL_AI_ADMISSION_UNAVAILABLE",
    });
  });

  it("renews an admitted lease while provider work remains active", async () => {
    const first = await admitTrialAiRequest(input(), dependencies(database));
    if (first.kind !== "admitted") throw new Error("expected admission");
    const heartbeat = startTrialAiLeaseHeartbeat(first.leaseId, {
      ...dependencies(database),
      heartbeatIntervalMs: 10,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    await heartbeat.stop();

    expect(database.renewedLeaseCount(first.leaseId)).toBeGreaterThanOrEqual(1);
    expect(heartbeat.signal.aborted).toBe(false);
  });

  it("aborts provider work when lease renewal fails closed", async () => {
    const first = await admitTrialAiRequest(input(), dependencies(database));
    if (first.kind !== "admitted") throw new Error("expected admission");
    database.failRenewals = true;
    const heartbeat = startTrialAiLeaseHeartbeat(first.leaseId, {
      ...dependencies(database),
      heartbeatIntervalMs: 1,
    });

    await new Promise((resolve) => heartbeat.signal.addEventListener("abort", resolve, { once: true }));
    await heartbeat.stop();

    expect(heartbeat.signal.aborted).toBe(true);
  });
});

function input(overrides: Partial<TrialAiAdmissionInput> = {}): TrialAiAdmissionInput {
  return {
    actor: { kind: "anonymous-trial", trialVisitorSubject: "visitor-1" },
    surface: "ask_document",
    workspaceId: "workspace-1",
    kstDate: "2026-08-25",
    networkBucketDigest: "network-1",
    ...overrides,
  };
}

function dependencies(
  database: ReturnType<typeof createAdmissionDatabase>,
  overrides: { globalDailyLimit?: number } = {},
) {
  return {
    database,
    globalDailyLimit: overrides.globalDailyLimit ?? 100,
    createLeaseId: (() => {
      let sequence = 0;
      return () => `lease-${++sequence}`;
    })(),
  };
}

function createAdmissionDatabase() {
  const visitors = new Map<string, number>();
  const networks = new Map<string, number>();
  const globals = new Map<string, number>();
  const leases = new Map<string, { visitorDigest: string; kstDate: string; releasedAt: Date | null }>();
  const renewals = new Map<string, number>();
  let transactionTail = Promise.resolve();

  const database = {
    failTransactions: false,
    failRenewals: false,
    async transaction<T>(callback: (tx: AdmissionTransaction) => Promise<T>) {
      if (database.failTransactions) throw new Error("database unavailable");
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(transaction);
      } finally {
        release();
      }
    },
    visitorCount(visitorDigest: string, kstDate: string) {
      return visitors.get(`${visitorDigest}:${kstDate}`) ?? 0;
    },
    globalCount(kstDate: string) {
      return globals.get(kstDate) ?? 0;
    },
    networkCount(networkDigest: string, kstDate: string) {
      return networks.get(`${networkDigest}:${kstDate}`) ?? 0;
    },
    renewedLeaseCount(leaseId: string) {
      return renewals.get(leaseId) ?? 0;
    },
  };

  const transaction: AdmissionTransaction = {
    async lockVisitorAdmission() {},
    async ensureDailyRows({ visitorDigest, networkDigest, kstDate }) {
      visitors.set(`${visitorDigest}:${kstDate}`, database.visitorCount(visitorDigest, kstDate));
      networks.set(`${networkDigest}:${kstDate}`, networks.get(`${networkDigest}:${kstDate}`) ?? 0);
      globals.set(kstDate, database.globalCount(kstDate));
    },
    async lockDailyRows() {},
    async releaseExpiredLeases() {},
    async getDailyCounts({ visitorDigest, networkDigest, kstDate }) {
      return {
        visitor: database.visitorCount(visitorDigest, kstDate),
        network: networks.get(`${networkDigest}:${kstDate}`) ?? 0,
        global: database.globalCount(kstDate),
      };
    },
    async hasActiveLease(visitorDigest) {
      return [...leases.values()].some(
        (lease) =>
          lease.visitorDigest === visitorDigest && lease.releasedAt === null,
      );
    },
    async recordAdmission({ visitorDigest, networkDigest, kstDate, leaseId }) {
      visitors.set(`${visitorDigest}:${kstDate}`, database.visitorCount(visitorDigest, kstDate) + 1);
      networks.set(
        `${networkDigest}:${kstDate}`,
        (networks.get(`${networkDigest}:${kstDate}`) ?? 0) + 1,
      );
      globals.set(kstDate, database.globalCount(kstDate) + 1);
      leases.set(leaseId, { visitorDigest, kstDate, releasedAt: null });
    },
    async releaseLease(leaseId) {
      const lease = leases.get(leaseId);
      if (lease) lease.releasedAt = new Date();
    },
    async renewLease(leaseId) {
      if (database.failRenewals) throw new Error("renewal unavailable");
      const lease = leases.get(leaseId);
      if (!lease || lease.releasedAt) return false;
      renewals.set(leaseId, (renewals.get(leaseId) ?? 0) + 1);
      return true;
    },
  };

  return database;
}

type AdmissionTransaction = {
  lockVisitorAdmission(visitorDigest: string): Promise<void>;
  ensureDailyRows(input: { visitorDigest: string; networkDigest: string; kstDate: string }): Promise<void>;
  lockDailyRows(): Promise<void>;
  releaseExpiredLeases(): Promise<void>;
  getDailyCounts(input: { visitorDigest: string; networkDigest: string; kstDate: string }): Promise<{
    visitor: number;
    network: number;
    global: number;
  }>;
  hasActiveLease(visitorDigest: string): Promise<boolean>;
  recordAdmission(input: {
    visitorDigest: string;
    networkDigest: string;
    kstDate: string;
    leaseId: string;
  }): Promise<void>;
  releaseLease(leaseId: string): Promise<void>;
  renewLease(leaseId: string): Promise<boolean>;
};
