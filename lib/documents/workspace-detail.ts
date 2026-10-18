import { prisma } from "@/lib/db/client";
import { canReadDocument, canWriteDocument, highestPermissionLevel } from "@/lib/permissions/document";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import type { WorkspaceDocumentDetail } from "@/lib/documents/workspace-detail-types";

/** The route and the initial server render share this exact authorization boundary. */
export async function loadWorkspaceDocument(
  workspaceSlug: string, documentId: string, actorId: string,
): Promise<WorkspaceDocumentDetail | null> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, status: "ACTIVE", workspace: {
      slug: workspaceSlug, archivedAt: null, members: { some: { userId: actorId } },
    } },
    include: { workspace: { select: { members: { where: { userId: actorId }, take: 1 } } } },
  });
  if (!document) return null;
  const [count, grants] = await Promise.all([
    prisma.permission.count({ where: { resourceType: "DOCUMENT", resourceId: documentId } }),
    prisma.permission.findMany({ where: { resourceType: "DOCUMENT", resourceId: documentId,
      subjectType: "USER", subjectId: actorId }, select: { permission: true } }),
  ]);
  const access = { workspaceRole: document.workspace.members[0]?.role,
    explicitPermissionCount: count, userPermission: highestPermissionLevel(grants.map(g => g.permission)) };
  if (!canReadDocument(access)) return null;
  const [versions, auditLogs, attachments, tags, properties, comments, linkPanels] = await Promise.all([
    prisma.documentVersion.findMany({ where: { documentId }, orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, title: true, changeSummary: true } }),
    prisma.auditLog.findMany({ where: { resourceType: "document", resourceId: documentId },
      orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true } }),
    prisma.attachment.findMany({ where: { documentId }, orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, mimeType: true, size: true } }),
    prisma.documentTag.findMany({ where: { documentId }, include: { tag: true }, orderBy: { tag: { name: "asc" } } }),
    prisma.documentProperty.findMany({ where: { documentId }, orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
      select: { id: true, key: true, valueJson: true } }),
    prisma.comment.findMany({ where: { documentId }, orderBy: { createdAt: "asc" },
      select: { id: true, body: true, user: { select: { name: true, email: true } } } }),
    getDocumentLinkPanels(documentId, actorId),
  ]);
  return {
    document: { id: document.id, title: document.title, path: document.path, contentMarkdown: document.contentMarkdown },
    canWrite: canWriteDocument(access), versions, auditLogs, attachments,
    tags: tags.map(({ tag }) => ({ id: tag.id, name: tag.name })), properties, comments, linkPanels,
  };
}
