import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";

const VISITOR_DAILY_LIMIT = 3;
const NETWORK_DAILY_LIMIT = 15;

export type TrialAiAdmissionInput = Readonly<{
  actor: Readonly<{
    kind: "authenticated-user" | "anonymous-trial";
    userId?: string;
    trialVisitorSubject?: string;
  }>;
  surface: "ask_document" | "workspace_chat";
  workspaceId: string;
  kstDate: string;
  networkBucketDigest?: string;
}>;

export type TrialAiAdmission =
  | Readonly<{ kind: "not-applicable" }>
  | Readonly<{ kind: "admitted"; leaseId: string; remaining: 0 | 1 | 2; resetsAt: string }>
  | Readonly<{
      kind: "denied";
      code:
        | "TRIAL_AI_DAILY_LIMIT_REACHED"
        | "TRIAL_AI_NETWORK_LIMIT_REACHED"
        | "TRIAL_AI_GLOBAL_LIMIT_REACHED"
        | "TRIAL_AI_REQUEST_IN_PROGRESS"
        | "TRIAL_AI_ADMISSION_UNAVAILABLE";
      resetsAt?: string;
    }>;

export type TrialAiAdmissionTransaction = {
  lockVisitorAdmission(visitorDigest: string): Promise<void>;
  ensureDailyRows(input: TrialAiAdmissionLedgerKey): Promise<void>;
  lockDailyRows(input: TrialAiAdmissionLedgerKey): Promise<void>;
  releaseExpiredLeases(visitorDigest: string): Promise<void>;
  getDailyCounts(input: TrialAiAdmissionLedgerKey): Promise<TrialAiAdmissionCounts>;
  hasActiveLease(visitorDigest: string): Promise<boolean>;
  recordAdmission(
    input: TrialAiAdmissionLedgerKey & Readonly<{ leaseId: string }>,
  ): Promise<void>;
  releaseLease(leaseId: string): Promise<void>;
  renewLease(leaseId: string): Promise<boolean>;
};

export type TrialAiAdmissionDatabase = {
  transaction<T>(callback: (tx: TrialAiAdmissionTransaction) => Promise<T>): Promise<T>;
};

export type TrialAiAdmissionDependencies = Readonly<{
  database?: TrialAiAdmissionDatabase;
  globalDailyLimit?: number;
  createLeaseId?: () => string;
  heartbeatIntervalMs?: number;
}>;

type TrialAiAdmissionLedgerKey = Readonly<{
  visitorDigest: string;
  networkDigest: string;
  kstDate: string;
}>;

type TrialAiAdmissionCounts = Readonly<{
  visitor: number;
  network: number;
  global: number;
}>;

export async function admitTrialAiRequest(
  input: TrialAiAdmissionInput,
  deps: TrialAiAdmissionDependencies = {},
): Promise<TrialAiAdmission> {
  if (input.actor.kind === "authenticated-user") return { kind: "not-applicable" };

  const visitorDigest = nonEmpty(input.actor.trialVisitorSubject);
  const networkDigest = nonEmpty(input.networkBucketDigest);
  const globalDailyLimit = validPositiveInteger(
    deps.globalDailyLimit ?? Number(process.env.MUNJIB_TRIAL_AI_GLOBAL_DAILY_LIMIT),
  );
  const resetsAt = nextKstMidnight(input.kstDate);
  if (!visitorDigest || !networkDigest || !globalDailyLimit || !resetsAt) {
    return { kind: "denied", code: "TRIAL_AI_ADMISSION_UNAVAILABLE" };
  }

  const key = { visitorDigest, networkDigest, kstDate: input.kstDate };
  try {
    const leaseId = (deps.createLeaseId ?? randomUUID)();
    return await (deps.database ?? prismaAdmissionDatabase).transaction(async (tx) => {
      await tx.lockVisitorAdmission(visitorDigest);
      await tx.ensureDailyRows(key);
      await tx.lockDailyRows(key);
      await tx.releaseExpiredLeases(visitorDigest);

      const counts = await tx.getDailyCounts(key);
      if (counts.global >= globalDailyLimit) {
        return denied("TRIAL_AI_GLOBAL_LIMIT_REACHED", resetsAt);
      }
      if (counts.network >= NETWORK_DAILY_LIMIT) {
        return denied("TRIAL_AI_NETWORK_LIMIT_REACHED", resetsAt);
      }
      if (counts.visitor >= VISITOR_DAILY_LIMIT) {
        return denied("TRIAL_AI_DAILY_LIMIT_REACHED", resetsAt);
      }
      if (await tx.hasActiveLease(visitorDigest)) {
        return { kind: "denied", code: "TRIAL_AI_REQUEST_IN_PROGRESS" };
      }

      await tx.recordAdmission({ ...key, leaseId });
      return {
        kind: "admitted",
        leaseId,
        remaining: (VISITOR_DAILY_LIMIT - counts.visitor - 1) as 0 | 1 | 2,
        resetsAt,
      };
    });
  } catch {
    return { kind: "denied", code: "TRIAL_AI_ADMISSION_UNAVAILABLE" };
  }
}

export async function releaseTrialAiLease(
  leaseId: string,
  deps: TrialAiAdmissionDependencies = {},
): Promise<void> {
  await (deps.database ?? prismaAdmissionDatabase).transaction((tx) => tx.releaseLease(leaseId));
}

export type TrialAiLeaseHeartbeat = Readonly<{
  signal: AbortSignal;
  stop(): Promise<Readonly<{ ok: boolean }>>;
}>;

export function startTrialAiLeaseHeartbeat(
  leaseId: string,
  deps: TrialAiAdmissionDependencies = {},
): TrialAiLeaseHeartbeat {
  const controller = new AbortController();
  const intervalMs = deps.heartbeatIntervalMs ?? 30_000;
  let stopped = false;
  let renewalFailed = false;
  let inFlight: Promise<void> | undefined;

  const renew = () => {
    if (stopped || inFlight) return;
    inFlight = (deps.database ?? prismaAdmissionDatabase)
      .transaction(async (tx) => {
        if (!(await tx.renewLease(leaseId))) {
          throw new Error("Trial AI lease is no longer active");
        }
      })
      .catch(() => {
        renewalFailed = true;
        controller.abort();
      })
      .finally(() => {
        inFlight = undefined;
      });
  };

  const timer = setInterval(renew, intervalMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
      return { ok: !renewalFailed };
    },
  };
}

function denied(
  code: Extract<TrialAiAdmission, { kind: "denied" }>["code"],
  resetsAt: string,
): TrialAiAdmission {
  return { kind: "denied", code, resetsAt };
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function nextKstMidnight(kstDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(kstDate);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return undefined;
  }
  const nextMidnightUtc = calendarDate.valueOf() + 24 * 60 * 60 * 1000 - 9 * 60 * 60 * 1000;
  const date = new Date(nextMidnightUtc);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

const prismaAdmissionDatabase: TrialAiAdmissionDatabase = {
  transaction(callback) {
    return prisma.$transaction((tx) => callback(prismaAdmissionTransaction(tx)));
  },
};

type PrismaRawTransaction = Pick<typeof prisma, "$executeRawUnsafe" | "$queryRawUnsafe">;

function prismaAdmissionTransaction(tx: PrismaRawTransaction): TrialAiAdmissionTransaction {
  return {
    async lockVisitorAdmission(visitorDigest) {
      await tx.$queryRawUnsafe(LOCK_VISITOR_ADMISSION_SQL, visitorDigest);
    },
    async ensureDailyRows({ visitorDigest, networkDigest, kstDate }) {
      await tx.$executeRawUnsafe(UPSERT_GLOBAL_DAILY_USAGE_SQL, kstDate);
      await tx.$executeRawUnsafe(
        UPSERT_NETWORK_DAILY_USAGE_SQL,
        randomUUID(),
        networkDigest,
        kstDate,
      );
      await tx.$executeRawUnsafe(
        UPSERT_VISITOR_DAILY_USAGE_SQL,
        randomUUID(),
        visitorDigest,
        kstDate,
      );
    },
    async lockDailyRows({ visitorDigest, networkDigest, kstDate }) {
      await tx.$queryRawUnsafe(LOCK_GLOBAL_DAILY_USAGE_SQL, kstDate);
      await tx.$queryRawUnsafe(LOCK_NETWORK_DAILY_USAGE_SQL, networkDigest, kstDate);
      await tx.$queryRawUnsafe(LOCK_VISITOR_DAILY_USAGE_SQL, visitorDigest, kstDate);
    },
    async releaseExpiredLeases(visitorDigest) {
      await tx.$executeRawUnsafe(RELEASE_EXPIRED_LEASES_SQL, visitorDigest);
    },
    async getDailyCounts({ visitorDigest, networkDigest, kstDate }) {
      const [globalRows, networkRows, visitorRows] = await Promise.all([
        tx.$queryRawUnsafe<Array<{ admittedCount: number }>>(GLOBAL_DAILY_COUNT_SQL, kstDate),
        tx.$queryRawUnsafe<Array<{ admittedCount: number }>>(
          NETWORK_DAILY_COUNT_SQL,
          networkDigest,
          kstDate,
        ),
        tx.$queryRawUnsafe<Array<{ admittedCount: number }>>(
          VISITOR_DAILY_COUNT_SQL,
          visitorDigest,
          kstDate,
        ),
      ]);
      return {
        global: globalRows[0]?.admittedCount ?? 0,
        network: networkRows[0]?.admittedCount ?? 0,
        visitor: visitorRows[0]?.admittedCount ?? 0,
      };
    },
    async hasActiveLease(visitorDigest) {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        LOCK_ACTIVE_LEASE_SQL,
        visitorDigest,
      );
      return rows.length > 0;
    },
    async recordAdmission({ visitorDigest, networkDigest, kstDate, leaseId }) {
      await tx.$executeRawUnsafe(INCREMENT_GLOBAL_DAILY_USAGE_SQL, kstDate);
      await tx.$executeRawUnsafe(INCREMENT_NETWORK_DAILY_USAGE_SQL, networkDigest, kstDate);
      await tx.$executeRawUnsafe(INCREMENT_VISITOR_DAILY_USAGE_SQL, visitorDigest, kstDate);
      await tx.$executeRawUnsafe(
        CREATE_ADMISSION_LEASE_SQL,
        leaseId,
        visitorDigest,
        kstDate,
      );
    },
    async releaseLease(leaseId) {
      await tx.$executeRawUnsafe(RELEASE_LEASE_SQL, leaseId);
    },
    async renewLease(leaseId) {
      return (await tx.$executeRawUnsafe(RENEW_LEASE_SQL, leaseId)) === 1;
    },
  };

}

const UPSERT_VISITOR_DAILY_USAGE_SQL = `
INSERT INTO "TrialAiVisitorDailyUsage" ("id", "visitorDigest", "kstDate", "admittedCount", "updatedAt")
VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("visitorDigest", "kstDate") DO NOTHING
`;

const LOCK_VISITOR_ADMISSION_SQL = `
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext(pg_catalog.concat('munjib-trial-ai-admission-v1:a:', $1)),
  pg_catalog.hashtext(pg_catalog.concat('munjib-trial-ai-admission-v1:b:', $1))
)::text AS "lockResult"
`;

const UPSERT_NETWORK_DAILY_USAGE_SQL = `
INSERT INTO "TrialAiNetworkDailyUsage" ("id", "networkDigest", "kstDate", "admittedCount", "updatedAt")
VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("networkDigest", "kstDate") DO NOTHING
`;

const UPSERT_GLOBAL_DAILY_USAGE_SQL = `
INSERT INTO "TrialAiGlobalDailyUsage" ("kstDate", "admittedCount", "updatedAt")
VALUES ($1, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("kstDate") DO NOTHING
`;

const LOCK_GLOBAL_DAILY_USAGE_SQL = `
SELECT "admittedCount"
FROM "TrialAiGlobalDailyUsage"
WHERE "kstDate" = $1
FOR UPDATE
`;

const LOCK_NETWORK_DAILY_USAGE_SQL = `
SELECT "admittedCount"
FROM "TrialAiNetworkDailyUsage"
WHERE "networkDigest" = $1 AND "kstDate" = $2
FOR UPDATE
`;

const LOCK_VISITOR_DAILY_USAGE_SQL = `
SELECT "admittedCount"
FROM "TrialAiVisitorDailyUsage"
WHERE "visitorDigest" = $1 AND "kstDate" = $2
FOR UPDATE
`;

const RELEASE_EXPIRED_LEASES_SQL = `
UPDATE "TrialAiAdmissionLease"
SET "releasedAt" = CURRENT_TIMESTAMP
WHERE "visitorDigest" = $1
  AND "releasedAt" IS NULL
  AND "expiresAt" <= CURRENT_TIMESTAMP
`;

const GLOBAL_DAILY_COUNT_SQL = `
SELECT "admittedCount"
FROM "TrialAiGlobalDailyUsage"
WHERE "kstDate" = $1
`;

const NETWORK_DAILY_COUNT_SQL = `
SELECT "admittedCount"
FROM "TrialAiNetworkDailyUsage"
WHERE "networkDigest" = $1 AND "kstDate" = $2
`;

const VISITOR_DAILY_COUNT_SQL = `
SELECT "admittedCount"
FROM "TrialAiVisitorDailyUsage"
WHERE "visitorDigest" = $1 AND "kstDate" = $2
`;

const LOCK_ACTIVE_LEASE_SQL = `
SELECT "id"
FROM "TrialAiAdmissionLease"
WHERE "visitorDigest" = $1
  AND "releasedAt" IS NULL
  AND "expiresAt" > CURRENT_TIMESTAMP
FOR UPDATE
`;

const INCREMENT_GLOBAL_DAILY_USAGE_SQL = `
UPDATE "TrialAiGlobalDailyUsage"
SET "admittedCount" = "admittedCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "kstDate" = $1
`;

const INCREMENT_NETWORK_DAILY_USAGE_SQL = `
UPDATE "TrialAiNetworkDailyUsage"
SET "admittedCount" = "admittedCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "networkDigest" = $1 AND "kstDate" = $2
`;

const INCREMENT_VISITOR_DAILY_USAGE_SQL = `
UPDATE "TrialAiVisitorDailyUsage"
SET "admittedCount" = "admittedCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "visitorDigest" = $1 AND "kstDate" = $2
`;

const CREATE_ADMISSION_LEASE_SQL = `
INSERT INTO "TrialAiAdmissionLease" ("id", "visitorDigest", "kstDate", "expiresAt")
VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '2 minutes')
`;

const RELEASE_LEASE_SQL = `
UPDATE "TrialAiAdmissionLease"
SET "releasedAt" = CURRENT_TIMESTAMP
WHERE "id" = $1 AND "releasedAt" IS NULL
`;

const RENEW_LEASE_SQL = `
UPDATE "TrialAiAdmissionLease"
SET "expiresAt" = CURRENT_TIMESTAMP + INTERVAL '2 minutes'
WHERE "id" = $1
  AND "releasedAt" IS NULL
  AND "expiresAt" > CURRENT_TIMESTAMP
`;
