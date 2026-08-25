import { prisma } from "@/lib/db/client";

export type TrialAiRetentionCounts = Readonly<{
  visitorDaily: number;
  networkDaily: number;
  globalDaily: number;
  admissionLease: number;
}>;

export type TrialAiRetentionTransaction = Readonly<{
  getDatabaseClock(): Promise<{ now: Date; kstDate: string }>;
  countVisitorDaily(beforeKstDate: string): Promise<number>;
  countNetworkDaily(beforeKstDate: string): Promise<number>;
  countGlobalDaily(beforeKstDate: string): Promise<number>;
  countExpiredLeases(expiresBefore: Date): Promise<number>;
  deleteVisitorDaily(beforeKstDate: string): Promise<number>;
  deleteNetworkDaily(beforeKstDate: string): Promise<number>;
  deleteGlobalDaily(beforeKstDate: string): Promise<number>;
  deleteExpiredLeases(expiresBefore: Date): Promise<number>;
}>;

export type TrialAiRetentionDatabase = Readonly<{
  transaction<T>(callback: (tx: TrialAiRetentionTransaction) => Promise<T>): Promise<T>;
}>;

export type PurgeExpiredTrialAiDataResult = Readonly<{
  dryRun: boolean;
  databaseNow: string;
  databaseKstDate: string;
  cutoffs: Readonly<{
    visitorBeforeKstDate: string;
    sharedBeforeKstDate: string;
    leaseExpiresBefore: string;
  }>;
  candidates: TrialAiRetentionCounts;
  deleted: TrialAiRetentionCounts;
}>;

const ZERO_COUNTS: TrialAiRetentionCounts = {
  visitorDaily: 0,
  networkDaily: 0,
  globalDaily: 0,
  admissionLease: 0,
};

export async function purgeExpiredTrialAiData(
  input: Readonly<{ execute?: boolean }> = {},
  deps: Readonly<{ database?: TrialAiRetentionDatabase }> = {},
): Promise<PurgeExpiredTrialAiDataResult> {
  const execute = input.execute === true;
  const database = deps.database ?? prismaTrialAiRetentionDatabase;

  return database.transaction(async (tx) => {
    const clock = await tx.getDatabaseClock();
    const visitorBeforeKstDate = shiftIsoDate(clock.kstDate, -34);
    const sharedBeforeKstDate = shiftIsoDate(clock.kstDate, -7);
    const leaseExpiresBefore = new Date(clock.now.valueOf() - 24 * 60 * 60 * 1000);

    const candidates: TrialAiRetentionCounts = {
      visitorDaily: await tx.countVisitorDaily(visitorBeforeKstDate),
      networkDaily: await tx.countNetworkDaily(sharedBeforeKstDate),
      globalDaily: await tx.countGlobalDaily(sharedBeforeKstDate),
      admissionLease: await tx.countExpiredLeases(leaseExpiresBefore),
    };

    let deleted = ZERO_COUNTS;
    if (execute) {
      deleted = {
        admissionLease: await tx.deleteExpiredLeases(leaseExpiresBefore),
        visitorDaily: await tx.deleteVisitorDaily(visitorBeforeKstDate),
        networkDaily: await tx.deleteNetworkDaily(sharedBeforeKstDate),
        globalDaily: await tx.deleteGlobalDaily(sharedBeforeKstDate),
      };
    }

    return {
      dryRun: !execute,
      databaseNow: clock.now.toISOString(),
      databaseKstDate: clock.kstDate,
      cutoffs: {
        visitorBeforeKstDate,
        sharedBeforeKstDate,
        leaseExpiresBefore: leaseExpiresBefore.toISOString(),
      },
      candidates,
      deleted,
    };
  });
}

function shiftIsoDate(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error("Trial AI retention received an invalid database KST date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new Error("Trial AI retention received an invalid database KST date");
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type PrismaRawTransaction = Pick<typeof prisma, "$queryRawUnsafe" | "$executeRawUnsafe">;

const prismaTrialAiRetentionDatabase: TrialAiRetentionDatabase = {
  transaction(callback) {
    return prisma.$transaction((tx) => callback(prismaRetentionTransaction(tx)));
  },
};

function prismaRetentionTransaction(tx: PrismaRawTransaction): TrialAiRetentionTransaction {
  return {
    async getDatabaseClock() {
      const rows = await tx.$queryRawUnsafe<Array<{ now: Date; kstDate: string }>>(DATABASE_CLOCK_SQL);
      const clock = rows[0];
      if (!clock) throw new Error("Trial AI retention could not read the database clock");
      return clock;
    },
    countVisitorDaily: (cutoff) => queryCount(tx, COUNT_VISITOR_SQL, cutoff),
    countNetworkDaily: (cutoff) => queryCount(tx, COUNT_NETWORK_SQL, cutoff),
    countGlobalDaily: (cutoff) => queryCount(tx, COUNT_GLOBAL_SQL, cutoff),
    countExpiredLeases: (cutoff) => queryCount(tx, COUNT_LEASE_SQL, cutoff),
    deleteVisitorDaily: (cutoff) => executeCount(tx, DELETE_VISITOR_SQL, cutoff),
    deleteNetworkDaily: (cutoff) => executeCount(tx, DELETE_NETWORK_SQL, cutoff),
    deleteGlobalDaily: (cutoff) => executeCount(tx, DELETE_GLOBAL_SQL, cutoff),
    deleteExpiredLeases: (cutoff) => executeCount(tx, DELETE_LEASE_SQL, cutoff),
  };
}

async function queryCount(tx: PrismaRawTransaction, sql: string, cutoff: string | Date) {
  const rows = await tx.$queryRawUnsafe<Array<{ count: number }>>(sql, cutoff);
  return rows[0]?.count ?? 0;
}

async function executeCount(tx: PrismaRawTransaction, sql: string, cutoff: string | Date) {
  return tx.$executeRawUnsafe(sql, cutoff);
}

const DATABASE_CLOCK_SQL = `
SELECT CURRENT_TIMESTAMP AS "now",
       to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS "kstDate"
`;

const COUNT_VISITOR_SQL = `SELECT COUNT(*)::int AS "count" FROM "TrialAiVisitorDailyUsage" WHERE "kstDate" < $1`;
const COUNT_NETWORK_SQL = `SELECT COUNT(*)::int AS "count" FROM "TrialAiNetworkDailyUsage" WHERE "kstDate" < $1`;
const COUNT_GLOBAL_SQL = `SELECT COUNT(*)::int AS "count" FROM "TrialAiGlobalDailyUsage" WHERE "kstDate" < $1`;
const COUNT_LEASE_SQL = `
SELECT COUNT(*)::int AS "count"
FROM "TrialAiAdmissionLease"
WHERE "expiresAt" <= $1 AND "expiresAt" < CURRENT_TIMESTAMP
`;
const DELETE_VISITOR_SQL = `DELETE FROM "TrialAiVisitorDailyUsage" WHERE "kstDate" < $1`;
const DELETE_NETWORK_SQL = `DELETE FROM "TrialAiNetworkDailyUsage" WHERE "kstDate" < $1`;
const DELETE_GLOBAL_SQL = `DELETE FROM "TrialAiGlobalDailyUsage" WHERE "kstDate" < $1`;
const DELETE_LEASE_SQL = `
DELETE FROM "TrialAiAdmissionLease"
WHERE "expiresAt" <= $1 AND "expiresAt" < CURRENT_TIMESTAMP
`;
