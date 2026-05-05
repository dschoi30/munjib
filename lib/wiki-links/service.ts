import { prisma } from "@/lib/db/client";
import {
  assertCanReadDocument,
  canReadDocument,
  highestPermissionLevel,
} from "@/lib/permissions/document";
import { assertCanReadWorkspace } from "@/lib/permissions/workspace";
import { parseFrontmatterWikiLinks } from "@/lib/wiki-links/parser";
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
  const access = await getDocumentAccess(document.id, actorId);
  assertCanReadDocument({
    workspaceRole: role,
    explicitPermissionCount: access.explicitPermissionCount,
    userPermission: access.userPermission,
  });
  return document;
}

async function getDocumentAccess(documentId: string, actorId: string) {
  const [explicitPermissionCount, userPermissions] = await Promise.all([
    prisma.permission.count({ where: { resourceType: "DOCUMENT", resourceId: documentId } }),
    prisma.permission.findMany({
      where: {
        resourceType: "DOCUMENT",
        resourceId: documentId,
        subjectType: "USER",
        subjectId: actorId,
      },
      select: { permission: true },
    }),
  ]);

  return {
    explicitPermissionCount,
    userPermission: highestPermissionLevel(
      userPermissions.map((permission) => permission.permission),
    ),
  };
}

async function getReadableDocumentIdSet(documentIds: string[], actorId: string) {
  if (documentIds.length === 0) return new Set<string>();

  const documents = await prisma.document.findMany({
    where: { id: { in: documentIds } },
    include: {
      workspace: {
        include: {
          members: { where: { userId: actorId }, take: 1 },
        },
      },
    },
  });
  const [documentsWithExplicitPermissions, userDocumentPermissions] = await Promise.all([
    prisma.permission.findMany({
      where: { resourceType: "DOCUMENT", resourceId: { in: documentIds } },
      distinct: ["resourceId"],
      select: { resourceId: true },
    }),
    prisma.permission.findMany({
      where: {
        resourceType: "DOCUMENT",
        resourceId: { in: documentIds },
        subjectType: "USER",
        subjectId: actorId,
      },
      select: { resourceId: true, permission: true },
    }),
  ]);
  const explicitDocumentIds = new Set(
    documentsWithExplicitPermissions.map((permission) => permission.resourceId),
  );

  return new Set(
    documents
      .filter((document) =>
        canReadDocument({
          workspaceRole: document.workspace.members[0]?.role,
          explicitPermissionCount: explicitDocumentIds.has(document.id) ? 1 : 0,
          userPermission: highestPermissionLevel(
            userDocumentPermissions
              .filter((permission) => permission.resourceId === document.id)
              .map((permission) => permission.permission),
          ),
        }),
      )
      .map((document) => document.id),
  );
}

export async function getDocumentLinkPanels(
  documentId: string,
  actorId: string,
): Promise<DocumentLinkPanels> {
  const document = await getReadableDocument(documentId, actorId);
  const frontmatterLinks = parseFrontmatterWikiLinks(document.contentMarkdown);
  const frontmatterOrderByTarget = new Map(
    frontmatterLinks.map((link, index) => [link.targetTitleRaw.toLowerCase(), index]),
  );

  const [outgoing, backlinks] = await Promise.all([
    prisma.documentLink.findMany({
      where: { sourceDocumentId: documentId },
      orderBy: [{ sortOrder: "asc" }, { targetTitleRaw: "asc" }],
      include: { targetDocument: { select: { id: true, title: true, slug: true, path: true } } },
    }),
    prisma.documentLink.findMany({
      where: { targetDocumentId: documentId, isBroken: false },
      orderBy: { createdAt: "desc" },
      include: { sourceDocument: { select: { id: true, title: true, slug: true, path: true } } },
    }),
  ]);

  const readableTargetIds = await getReadableDocumentIdSet(
    outgoing
      .map((link) => link.targetDocument?.id)
      .filter((documentId): documentId is string => Boolean(documentId)),
    actorId,
  );
  const readableSourceIds = await getReadableDocumentIdSet(
    backlinks.map((link) => link.sourceDocument.id),
    actorId,
  );
  const readableOutgoing = outgoing.filter(
    (link) =>
      frontmatterOrderByTarget.has(link.targetTitleRaw.toLowerCase()) &&
      (!link.targetDocument || readableTargetIds.has(link.targetDocument.id)),
  ).sort((left, right) => {
    const leftOrder = frontmatterOrderByTarget.get(left.targetTitleRaw.toLowerCase()) ?? 0;
    const rightOrder = frontmatterOrderByTarget.get(right.targetTitleRaw.toLowerCase()) ?? 0;
    return leftOrder - rightOrder;
  });
  const readableBacklinks = backlinks.filter((link) =>
    readableSourceIds.has(link.sourceDocument.id),
  );

  return {
    outgoing: readableOutgoing.map((link) => ({
      id: link.id,
      targetTitleRaw: link.targetTitleRaw,
      alias: link.alias,
      isBroken: link.isBroken,
      isAmbiguous: link.isAmbiguous,
      targetDocument: link.targetDocument,
    })),
    backlinks: readableBacklinks.map((link) => ({
      id: link.id,
      sourceDocument: link.sourceDocument,
    })),
    brokenLinks: readableOutgoing
      .filter((link) => link.isBroken)
      .map((link) => ({
        id: link.id,
        targetTitleRaw: link.targetTitleRaw,
        alias: link.alias,
      })),
    ambiguousLinks: readableOutgoing
      .filter((link) => link.isAmbiguous)
      .map((link) => ({
        id: link.id,
        targetTitleRaw: link.targetTitleRaw,
        alias: link.alias,
      })),
  };
}
