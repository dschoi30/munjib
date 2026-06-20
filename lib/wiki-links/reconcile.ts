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
  const [target, targets, brokenLinks] = await Promise.all([
    tx.document.findFirst({
      where: {
        id: input.targetDocumentId,
        workspaceId: input.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
    tx.document.findMany({
      where: {
        workspaceId: input.workspaceId,
        status: "ACTIVE",
      },
      select: { id: true, path: true, title: true },
    }),
    tx.documentLink.findMany({
      where: {
        workspaceId: input.workspaceId,
        targetDocumentId: null,
        isBroken: true,
      },
      select: { id: true, targetTitleRaw: true },
    }),
  ]);

  if (!target || brokenLinks.length === 0) return;

  const repairableLinkIds = brokenLinks
    .filter((link) => {
      const resolved = resolveWikiLinkTarget(targets, link.targetTitleRaw);
      return (
        !resolved.isBroken &&
        !resolved.isAmbiguous &&
        resolved.targetDocumentId === input.targetDocumentId
      );
    })
    .map((link) => link.id);

  if (repairableLinkIds.length === 0) return;

  await tx.documentLink.updateMany({
    where: { id: { in: repairableLinkIds } },
    data: {
      targetDocumentId: input.targetDocumentId,
      isBroken: false,
      isAmbiguous: false,
    },
  });
}
