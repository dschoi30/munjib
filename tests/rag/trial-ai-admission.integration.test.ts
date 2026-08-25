import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import {
  admitTrialAiRequest,
  type TrialAiAdmissionInput,
} from "@/lib/rag/trial-ai-admission";

const runDatabaseTests = process.env.MUNJIB_RUN_TRIAL_AI_ADMISSION_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const DATE = "2099-02-25";
const NEXT_DATE = "2099-02-26";
const prefix = "trial-ai-admission-integration-";
const overlapApplicationName = "munjib-trial-ai-overlap-test";

describeDatabase("trial AI admission PostgreSQL integration", () => {
  beforeAll(async () => {
    await prisma.$queryRawUnsafe('SELECT 1 FROM "TrialAiAdmissionLease" LIMIT 1');
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DELETE FROM "TrialAiAdmissionLease" WHERE "visitorDigest" LIKE $1',
      `${prefix}%`,
    );
    await prisma.$executeRawUnsafe(
      'DELETE FROM "TrialAiVisitorDailyUsage" WHERE "visitorDigest" LIKE $1',
      `${prefix}%`,
    );
    await prisma.$executeRawUnsafe(
      'DELETE FROM "TrialAiNetworkDailyUsage" WHERE "networkDigest" LIKE $1',
      `${prefix}%`,
    );
    await prisma.$executeRawUnsafe(
      'DELETE FROM "TrialAiGlobalDailyUsage" WHERE "kstDate" IN ($1, $2)',
      DATE,
      NEXT_DATE,
    );
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "trial_ai_admission_force_failure" ON "TrialAiAdmissionLease"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "trial_ai_admission_force_failure"()');
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "trial_ai_admission_overlap_barrier" ON "TrialAiAdmissionLease"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "trial_ai_admission_overlap_barrier"()');
  });

  it("admits exactly three concurrent visitors at the global ceiling", async () => {
    const visitors = Array.from({ length: 4 }, (_, index) => `${prefix}global-visitor-${index}`);
    await preseedDailyRows(DATE, visitors);

    const results = await Promise.all(
      visitors.map((visitor) =>
        admitTrialAiRequest(input(visitor, DATE), {
          globalDailyLimit: 3,
        }),
      ),
    );

    expect(results.filter((result) => result.kind === "admitted")).toHaveLength(3);
    expect(results.filter((result) => result.kind === "denied")).toHaveLength(1);
    expect(results.find((result) => result.kind === "denied")).toMatchObject({
      code: "TRIAL_AI_GLOBAL_LIMIT_REACHED",
    });
  });

  it("serializes cross-midnight admission after lease inspection for one visitor", async () => {
    const visitor = `${prefix}midnight-visitor`;
    await preseedDailyRows(DATE, [visitor]);
    await preseedDailyRows(NEXT_DATE, [visitor]);
    await installLeaseInsertionOverlapBarrier();

    const first = admitTrialAiRequest(input(visitor, DATE), { globalDailyLimit: 100 });
    await waitForLeaseInsertionOverlapBarrier();
    const second = admitTrialAiRequest(input(visitor, NEXT_DATE), { globalDailyLimit: 100 });
    const results = await Promise.all([first, second]);

    expect(results.filter((result) => result.kind === "admitted")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "denied")).toHaveLength(1);
    expect(results.find((result) => result.kind === "denied")).toMatchObject({
      code: "TRIAL_AI_REQUEST_IN_PROGRESS",
    });
  });

  it("rolls back every counter when lease insertion fails", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "trial_ai_admission_force_failure"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced lease failure';
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "trial_ai_admission_force_failure"
      BEFORE INSERT ON "TrialAiAdmissionLease"
      FOR EACH ROW EXECUTE FUNCTION "trial_ai_admission_force_failure"()
    `);

    await expect(
      admitTrialAiRequest(input(`${prefix}rollback-visitor`, DATE), { globalDailyLimit: 100 }),
    ).resolves.toEqual({ kind: "denied", code: "TRIAL_AI_ADMISSION_UNAVAILABLE" });

    const rows = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
      `
        SELECT
          (SELECT COUNT(*) FROM "TrialAiVisitorDailyUsage" WHERE "visitorDigest" = $1) +
          (SELECT COUNT(*) FROM "TrialAiNetworkDailyUsage" WHERE "networkDigest" = $2) +
          (SELECT COUNT(*) FROM "TrialAiGlobalDailyUsage" WHERE "kstDate" = $3) AS "total"
      `,
      `${prefix}rollback-visitor`,
      `${prefix}network`,
      DATE,
    );
    expect(Number(rows[0]?.total)).toBe(0);
  });
});

async function preseedDailyRows(kstDate: string, visitorDigests: string[]) {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "TrialAiGlobalDailyUsage" ("kstDate", "admittedCount", "updatedAt")
      VALUES ($1, 0, CURRENT_TIMESTAMP)
    `,
    kstDate,
  );
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "TrialAiNetworkDailyUsage" ("id", "networkDigest", "kstDate", "admittedCount", "updatedAt")
      VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
    `,
    randomUUID(),
    `${prefix}network`,
    kstDate,
  );
  for (const visitorDigest of visitorDigests) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "TrialAiVisitorDailyUsage" ("id", "visitorDigest", "kstDate", "admittedCount", "updatedAt")
        VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
      `,
      randomUUID(),
      visitorDigest,
      kstDate,
    );
  }
}

async function installLeaseInsertionOverlapBarrier() {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION "trial_ai_admission_overlap_barrier"()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM set_config('application_name', '${overlapApplicationName}', true);
      PERFORM pg_sleep(3);
      RETURN NEW;
    END;
    $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER "trial_ai_admission_overlap_barrier"
    BEFORE INSERT ON "TrialAiAdmissionLease"
    FOR EACH ROW EXECUTE FUNCTION "trial_ai_admission_overlap_barrier"()
  `);
}

async function waitForLeaseInsertionOverlapBarrier() {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRawUnsafe<Array<{ active: boolean }>>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_stat_activity
          WHERE "application_name" = $1
            AND "state" = 'active'
        ) AS "active"
      `,
      overlapApplicationName,
    );
    if (rows[0]?.active) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("lease insertion overlap barrier was not reached");
}

function input(trialVisitorSubject: string, kstDate: string): TrialAiAdmissionInput {
  return {
    actor: { kind: "anonymous-trial", trialVisitorSubject },
    surface: "ask_document",
    workspaceId: "workspace-1",
    kstDate,
    networkBucketDigest: `${prefix}network`,
  };
}
