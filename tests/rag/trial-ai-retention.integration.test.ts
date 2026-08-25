import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/client";
import { purgeExpiredTrialAiData } from "@/lib/rag/trial-ai-retention";

const runIntegration =
  process.env.DATABASE_URL && process.env.MUNJIB_RUN_TRIAL_AI_RETENTION_DB_TESTS === "1"
    ? describe
    : describe.skip;
const PREFIX = "retention-it-";

runIntegration("Trial AI retention PostgreSQL integration", () => {
  beforeAll(async () => {
    await assertMigratedSchema();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("uses PostgreSQL time, deletes exact expired boundaries, and preserves active leases", async () => {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "TrialAiVisitorDailyUsage" ("id", "visitorDigest", "kstDate", "admittedCount", "updatedAt")
      VALUES
        ('${PREFIX}visitor-expired', '${PREFIX}visitor-expired', to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 35, 'YYYY-MM-DD'), 1, CURRENT_TIMESTAMP),
        ('${PREFIX}visitor-kept', '${PREFIX}visitor-kept', to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 34, 'YYYY-MM-DD'), 1, CURRENT_TIMESTAMP)
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "TrialAiNetworkDailyUsage" ("id", "networkDigest", "kstDate", "admittedCount", "updatedAt")
      VALUES
        ('${PREFIX}network-expired', '${PREFIX}network-expired', to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 8, 'YYYY-MM-DD'), 1, CURRENT_TIMESTAMP),
        ('${PREFIX}network-kept', '${PREFIX}network-kept', to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 7, 'YYYY-MM-DD'), 1, CURRENT_TIMESTAMP)
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "TrialAiGlobalDailyUsage" ("kstDate", "admittedCount", "updatedAt")
      VALUES (to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 8, 'YYYY-MM-DD'), 1, CURRENT_TIMESTAMP)
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "TrialAiAdmissionLease" ("id", "visitorDigest", "kstDate", "expiresAt")
      VALUES
        ('${PREFIX}lease-expired', '${PREFIX}lease-expired', '2000-01-01', CURRENT_TIMESTAMP - INTERVAL '24 hours 1 second'),
        ('${PREFIX}lease-active', '${PREFIX}lease-active', '2000-01-01', CURRENT_TIMESTAMP + INTERVAL '2 minutes')
    `);

    const result = await purgeExpiredTrialAiData({ execute: true });

    expect(result.deleted).toEqual({
      visitorDaily: 1,
      networkDaily: 1,
      globalDaily: 1,
      admissionLease: 1,
    });
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TrialAiAdmissionLease" WHERE "id" LIKE $1 ORDER BY "id"`,
      `${PREFIX}%`,
    );
    expect(rows).toEqual([{ id: `${PREFIX}lease-active` }]);
    await expect(
      prisma.trialAiVisitorDailyUsage.findMany({
        where: { visitorDigest: { startsWith: PREFIX } },
        select: { visitorDigest: true },
      }),
    ).resolves.toEqual([{ visitorDigest: `${PREFIX}visitor-kept` }]);
    await expect(
      prisma.trialAiNetworkDailyUsage.findMany({
        where: { networkDigest: { startsWith: PREFIX } },
        select: { networkDigest: true },
      }),
    ).resolves.toEqual([{ networkDigest: `${PREFIX}network-kept` }]);

    await expect(purgeExpiredTrialAiData({ execute: true })).resolves.toMatchObject({
      deleted: {
        visitorDaily: 0,
        networkDaily: 0,
        globalDaily: 0,
        admissionLease: 0,
      },
    });
  });
});

async function assertMigratedSchema() {
  await prisma.$queryRawUnsafe('SELECT 1 FROM "TrialAiAdmissionLease" LIMIT 1');
}

async function cleanup() {
  await prisma.$executeRawUnsafe('DELETE FROM "TrialAiAdmissionLease" WHERE "id" LIKE $1', `${PREFIX}%`);
  await prisma.$executeRawUnsafe(
    'DELETE FROM "TrialAiVisitorDailyUsage" WHERE "visitorDigest" LIKE $1',
    `${PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    'DELETE FROM "TrialAiNetworkDailyUsage" WHERE "networkDigest" LIKE $1',
    `${PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(`
    DELETE FROM "TrialAiGlobalDailyUsage"
    WHERE "kstDate" = to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 8, 'YYYY-MM-DD')
  `);
}
