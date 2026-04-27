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
  for (const parsedLink of parsedLinks) {
    const target = await tx.document.findFirst({
      where: {
        workspaceId: input.workspaceId,
        slug: slugifyTitle(parsedLink.targetTitleRaw),
        status: "ACTIVE",
      },
      select: { id: true },
    });

    await tx.documentLink.create({
      data: {
        workspaceId: input.workspaceId,
        sourceDocumentId: input.sourceDocumentId,
        targetDocumentId: target?.id ?? null,
        targetTitleRaw: parsedLink.targetTitleRaw,
        alias: parsedLink.alias,
        isBroken: !target,
      },
    });
  }
}
