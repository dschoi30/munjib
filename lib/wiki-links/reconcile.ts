import type { Prisma } from "@prisma/client";
import { slugifyTitle } from "@/lib/text/slug";
import { parseWikiLinks } from "@/lib/wiki-links/parser";

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

  const parsedLinks = parseWikiLinks(input.contentMarkdown);
  if (parsedLinks.length === 0) return;

  const targetSlugs = parsedLinks.map((link) => slugifyTitle(link.targetTitleRaw));
  const targets = await tx.document.findMany({
    where: {
      workspaceId: input.workspaceId,
      slug: { in: targetSlugs },
      status: "ACTIVE",
    },
    select: { id: true, slug: true },
  });
  const targetIdBySlug = new Map(targets.map((target) => [target.slug, target.id]));

  await tx.documentLink.createMany({
    data: parsedLinks.map((link) => {
      const targetId = targetIdBySlug.get(slugifyTitle(link.targetTitleRaw));
      return {
        workspaceId: input.workspaceId,
        sourceDocumentId: input.sourceDocumentId,
        targetDocumentId: targetId ?? null,
        targetTitleRaw: link.targetTitleRaw,
        alias: link.alias,
        isBroken: !targetId,
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
