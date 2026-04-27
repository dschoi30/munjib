import { prisma } from "@/lib/db/client";
import { assertCanReadWorkspace } from "@/lib/permissions/workspace";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

async function getReadableDocument(documentId: string, actorId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      workspace: {
        include: {
          members: { where: { userId: actorId }, take: 1 },
        },
      },
    },
  });

  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  const role = document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);
  return document;
}

export async function getDocumentLinkPanels(
  documentId: string,
  actorId: string,
): Promise<DocumentLinkPanels> {
  await getReadableDocument(documentId, actorId);

  const [outgoing, backlinks] = await Promise.all([
    prisma.documentLink.findMany({
      where: { sourceDocumentId: documentId },
      orderBy: { targetTitleRaw: "asc" },
      include: { targetDocument: { select: { id: true, title: true, slug: true } } },
    }),
    prisma.documentLink.findMany({
      where: { targetDocumentId: documentId, isBroken: false },
      orderBy: { createdAt: "desc" },
      include: { sourceDocument: { select: { id: true, title: true, slug: true } } },
    }),
  ]);

  return {
    outgoing: outgoing.map((link) => ({
      id: link.id,
      targetTitleRaw: link.targetTitleRaw,
      alias: link.alias,
      isBroken: link.isBroken,
      targetDocument: link.targetDocument,
    })),
    backlinks: backlinks.map((link) => ({
      id: link.id,
      sourceDocument: link.sourceDocument,
    })),
    brokenLinks: outgoing
      .filter((link) => link.isBroken)
      .map((link) => ({
        id: link.id,
        targetTitleRaw: link.targetTitleRaw,
        alias: link.alias,
      })),
  };
}
