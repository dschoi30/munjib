import { DocumentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import {
  archivedDocumentRetentionCutoff,
  type ArchivedDocumentRetentionPolicyValue,
} from "@/lib/workspaces/retention-policy";

export type PurgeExpiredArchivedDocumentsInput = {
  now?: Date;
  dryRun?: boolean;
  workspaceSlug?: string;
};

export type PurgeExpiredArchivedDocumentsWorkspaceResult = {
  workspaceId: string;
  workspaceSlug: string;
  count: number;
};

export type PurgeExpiredArchivedDocumentsResult = {
  dryRun: boolean;
  totalCount: number;
  workspaces: PurgeExpiredArchivedDocumentsWorkspaceResult[];
};

export async function purgeExpiredArchivedDocuments(
  input: PurgeExpiredArchivedDocumentsInput = {},
): Promise<PurgeExpiredArchivedDocumentsResult> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? false;
  const hasWorkspaceScope = input.workspaceSlug !== undefined;
  const workspaceSlug = input.workspaceSlug?.trim();
  let scopedWorkspaceId: string | undefined;

  if (hasWorkspaceScope && !workspaceSlug) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  if (hasWorkspaceScope) {
    const scopedWorkspaces = await prisma.workspace.findMany({
      where: { slug: workspaceSlug },
      select: { id: true },
      take: 2,
    });

    if (scopedWorkspaces.length === 0) {
      throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
    }

    if (scopedWorkspaces.length > 1) {
      throw new Error(SERVICE_ERROR_CODES.WORKSPACE_SLUG_AMBIGUOUS);
    }

    scopedWorkspaceId = scopedWorkspaces[0].id;
  }

  const workspaces = await prisma.workspace.findMany({
    where: {
      archivedDocumentRetentionPolicy: { not: "NEVER" },
      ...(scopedWorkspaceId ? { id: scopedWorkspaceId } : {}),
    },
    orderBy: { slug: "asc" },
    select: {
      id: true,
      slug: true,
      archivedDocumentRetentionPolicy: true,
    },
  });

  if (hasWorkspaceScope && workspaces.length === 0) {
    return { dryRun, totalCount: 0, workspaces: [] };
  }

  const workspaceResults: PurgeExpiredArchivedDocumentsWorkspaceResult[] = [];
  let totalCount = 0;

  for (const workspace of workspaces) {
    const cutoff = archivedDocumentRetentionCutoff(
      workspace.archivedDocumentRetentionPolicy as ArchivedDocumentRetentionPolicyValue,
      now,
    );

    if (!cutoff) {
      continue;
    }

    const where = {
      workspaceId: workspace.id,
      status: DocumentStatus.ARCHIVED,
      archivedAt: { not: null, lte: cutoff },
    };

    const count = dryRun
      ? await prisma.document.count({ where })
      : await prisma.$transaction(async (tx) => {
          const expiredDocuments = await tx.document.findMany({
            where,
            select: { id: true },
          });
          const expiredDocumentIds = expiredDocuments.map((document) => document.id);
          if (expiredDocumentIds.length === 0) {
            return 0;
          }

          await tx.documentLink.updateMany({
            where: {
              workspaceId: workspace.id,
              targetDocumentId: { in: expiredDocumentIds },
            },
            data: {
              targetDocumentId: null,
              isBroken: true,
              isAmbiguous: false,
            },
          });

          return (
            await tx.document.deleteMany({
              where: {
                ...where,
                id: { in: expiredDocumentIds },
              },
            })
          ).count;
        });

    if (count === 0) {
      continue;
    }

    workspaceResults.push({
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      count,
    });
    totalCount += count;
  }

  return { dryRun, totalCount, workspaces: workspaceResults };
}
