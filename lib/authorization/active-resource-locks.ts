import { Prisma, type Prisma as PrismaNamespace } from "@prisma/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";

type LockDatabase = PrismaNamespace.TransactionClient;

export async function lockActorArchiveBoundary(tx: LockDatabase, actorId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        pg_catalog.concat('munjib-archive-actor-v1:', ${actorId}),
        0
      )
    )
  `);
}

export async function lockWorkspaceBoundary(db: LockDatabase, workspaceId: string) {
  const rows = await db.$queryRaw<Array<{ id: string; archivedAt: Date | null }>>(Prisma.sql`
    SELECT "id", "archivedAt"
    FROM "Workspace"
    WHERE "id" = ${workspaceId}
    FOR UPDATE
  `);
  const row = rows[0];
  if (!row || row.archivedAt) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  return row;
}

export async function lockFolderBoundaries(
  tx: LockDatabase,
  workspaceId: string,
  folderIds: readonly string[],
) {
  const ids = [...new Set(folderIds)].sort();
  if (ids.length === 0) return [] as Array<{ id: string; status: string; archivedAt: Date | null }>;

  const rows = await tx.$queryRaw<Array<{ id: string; status: string; archivedAt: Date | null }>>(Prisma.sql`
    SELECT "id", "status"::text AS "status", "archivedAt"
    FROM "Folder"
    WHERE "workspaceId" = ${workspaceId}
      AND "id" IN (${Prisma.join(ids)})
    ORDER BY "id" ASC
    FOR UPDATE
  `);
  if (
    rows.length !== ids.length ||
    rows.some((row) => row.status !== "ACTIVE" || row.archivedAt !== null)
  ) {
    throw new Error(SERVICE_ERROR_CODES.FOLDER_NOT_FOUND);
  }
  return rows;
}

export async function lockDocumentBoundary(
  db: LockDatabase,
  documentId: string,
  lockedWorkspaceId: string,
) {
  const rows = await db.$queryRaw<Array<{
    documentId: string;
    workspaceId: string;
    status: string;
    documentArchivedAt: Date | null;
  }>>(Prisma.sql`
    SELECT d."id" AS "documentId",
           d."workspaceId" AS "workspaceId",
           d."status"::text AS "status",
           d."archivedAt" AS "documentArchivedAt"
    FROM "Document" d
    WHERE d."id" = ${documentId}
      AND d."workspaceId" = ${lockedWorkspaceId}
    FOR UPDATE OF d
  `);
  const row = rows[0];
  if (!row || row.status !== "ACTIVE" || row.documentArchivedAt) {
    throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  }
  return row;
}
