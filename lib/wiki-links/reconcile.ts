import type { Prisma } from "@prisma/client";
import { parseFrontmatterWikiLinks } from "@/lib/wiki-links/parser";
import { resolveWikiLinkTarget } from "@/lib/wiki-links/resolve";

export async function reconcileDocumentLinks(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    sourceDocumentId: string;
    contentMarkdown: string;
  },
) {
  await tx.documentLink.deleteMany({
    where: { sourceDocumentId: input.sourceDocumentId },
  });

  const parsedLinks = parseFrontmatterWikiLinks(input.contentMarkdown);
  if (parsedLinks.length === 0) return;

  const targets = await tx.document.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "ACTIVE",
    },
    select: { id: true, path: true, title: true },
  });

  await tx.documentLink.createMany({
    data: parsedLinks.map((link, index) => {
      const resolved = resolveWikiLinkTarget(targets, link.targetTitleRaw);
      return {
        workspaceId: input.workspaceId,
        sourceDocumentId: input.sourceDocumentId,
        targetDocumentId: resolved.targetDocumentId,
        targetTitleRaw: link.targetTitleRaw,
        alias: link.alias,
        isBroken: resolved.isBroken,
        isAmbiguous: resolved.isAmbiguous,
        sortOrder: index,
      };
    }),
  });
}

export async function repairBrokenLinksForTarget(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    targetDocumentId: string;
    targetTitle: string;
  },
) {
  await tx.documentLink.updateMany({
    where: {
      workspaceId: input.workspaceId,
      targetTitleRaw: input.targetTitle,
      isBroken: true,
    },
    data: {
      targetDocumentId: input.targetDocumentId,
      isBroken: false,
    },
  });
}

export async function repairResolvableBrokenLinksForTarget(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    targetDocumentId: string;
  },
) {
  await repairResolvableBrokenLinksForTargets(tx, {
    workspaceId: input.workspaceId,
    targetDocumentIds: [input.targetDocumentId],
  });
}

export async function repairResolvableBrokenLinksForTargets(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    targetDocumentIds: string[];
  },
) {
  const targetDocumentIds = [...new Set(input.targetDocumentIds)];
  if (targetDocumentIds.length === 0) return;

  const activeRepairTargets = await tx.document.findMany({
    where: {
      id: { in: targetDocumentIds },
      workspaceId: input.workspaceId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const activeRepairTargetIds = new Set(activeRepairTargets.map((target) => target.id));
  if (activeRepairTargetIds.size === 0) return;

  const brokenLinks = await tx.documentLink.findMany({
    where: {
      workspaceId: input.workspaceId,
      targetDocumentId: null,
      isBroken: true,
    },
    select: {
      id: true,
      targetTitleRaw: true,
      sourceDocument: { select: { contentMarkdown: true } },
    },
  });
  if (brokenLinks.length === 0) return;

  const targets = await tx.document.findMany({
    where: {
      workspaceId: input.workspaceId,
      status: "ACTIVE",
    },
    select: { id: true, path: true, title: true },
  });

  const repairableLinkIds = new Map<string, string[]>();
  for (const link of brokenLinks) {
    if (!frontmatterStillReferencesTarget(link.sourceDocument.contentMarkdown, link.targetTitleRaw)) {
      continue;
    }

    const resolved = resolveWikiLinkTarget(targets, link.targetTitleRaw);
    if (
      resolved.isBroken ||
      resolved.isAmbiguous ||
      resolved.targetDocumentId == null ||
      !activeRepairTargetIds.has(resolved.targetDocumentId)
    ) {
      continue;
    }

    const linkIds = repairableLinkIds.get(resolved.targetDocumentId) ?? [];
    linkIds.push(link.id);
    repairableLinkIds.set(resolved.targetDocumentId, linkIds);
  }

  if (repairableLinkIds.size === 0) return;

  for (const [targetDocumentId, linkIds] of repairableLinkIds) {
    await tx.documentLink.updateMany({
      where: { id: { in: linkIds } },
      data: {
        targetDocumentId,
        isBroken: false,
        isAmbiguous: false,
      },
    });
  }
}

function frontmatterStillReferencesTarget(contentMarkdown: string, targetTitleRaw: string) {
  const targetKey = targetTitleRaw.toLowerCase();
  return parseFrontmatterWikiLinks(contentMarkdown).some(
    (link) => link.targetTitleRaw.toLowerCase() === targetKey,
  );
}
