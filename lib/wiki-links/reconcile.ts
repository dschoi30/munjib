import type { Prisma } from "@prisma/client";
import { slugifyTitle } from "@/lib/text/slug";
import { parseFrontmatterWikiLinks } from "@/lib/wiki-links/parser";
import { pathQualifiedTargetToDocumentPath } from "@/lib/wiki-links/targets";

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
      const resolved = resolveLinkTarget(targets, link.targetTitleRaw);
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

function resolveLinkTarget(
  targets: Array<{ id: string; path: string; title: string }>,
  targetTitleRaw: string,
) {
  if (targetTitleRaw.includes("/")) {
    const targetPath = pathQualifiedTargetToDocumentPath(targetTitleRaw);
    const target = targets.find((candidate) => candidate.path === targetPath);
    if (target) {
      return {
        targetDocumentId: target.id,
        isBroken: false,
        isAmbiguous: false,
      };
    }
  }

  const targetSlug = slugifyTitle(targetTitleRaw);
  const matches = targets.filter((candidate) => slugifyTitle(candidate.title) === targetSlug);
  if (matches.length === 1) {
    return {
      targetDocumentId: matches[0]?.id ?? null,
      isBroken: false,
      isAmbiguous: false,
    };
  }

  if (matches.length > 1) {
    return {
      targetDocumentId: null,
      isBroken: false,
      isAmbiguous: true,
    };
  }

  return {
    targetDocumentId: null,
    isBroken: true,
    isAmbiguous: false,
  };
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
