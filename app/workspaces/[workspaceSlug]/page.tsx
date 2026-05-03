import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentList } from "@/components/document-list";
import { MetadataPanel } from "@/components/metadata-panel";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  canReadDocument,
  canWriteDocument,
  highestPermissionLevel,
} from "@/lib/permissions/document";
import { canWriteWorkspace } from "@/lib/permissions/workspace";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import {
  createDocumentAction,
  createCommentAction,
  createDocumentFromBrokenLinkAction,
  restoreDocumentVersionAction,
  updateDocumentAction,
  uploadDocumentAttachmentAction,
} from "./actions";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ document?: string; q?: string }>;
}) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;
  const { document: selectedDocumentId, q } = await searchParams;
  const searchQuery = q?.trim() ?? "";

  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug },
    include: {
      members: { where: { userId: user.id }, take: 1 },
      documents: {
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!workspace || !workspace.members[0]) notFound();

  const role = workspace.members[0].role;
  const documentIds = workspace.documents.map((document) => document.id);
  const [documentsWithExplicitPermissions, userDocumentPermissions] =
    documentIds.length > 0
      ? await Promise.all([
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
              subjectId: user.id,
            },
            select: { resourceId: true, permission: true },
          }),
        ])
      : [[], []];
  const explicitDocumentIds = new Set(
    documentsWithExplicitPermissions.map((permission) => permission.resourceId),
  );
  const permissionsByDocumentId = new Map<string, typeof userDocumentPermissions>();
  for (const permission of userDocumentPermissions) {
    const permissions = permissionsByDocumentId.get(permission.resourceId) ?? [];
    permissions.push(permission);
    permissionsByDocumentId.set(permission.resourceId, permissions);
  }
  const userPermissionByDocumentId = new Map(
    documentIds.map((documentId) => [
      documentId,
      highestPermissionLevel(
        (permissionsByDocumentId.get(documentId) ?? []).map((permission) => permission.permission),
      ),
    ]),
  );
  const readableDocuments = workspace.documents.filter((document) =>
    canReadDocument({
      workspaceRole: role,
      explicitPermissionCount: explicitDocumentIds.has(document.id) ? 1 : 0,
      userPermission: userPermissionByDocumentId.get(document.id),
    }),
  );
  const visibleDocuments = searchQuery
    ? readableDocuments.filter((document) => {
        const normalizedQuery = searchQuery.toLowerCase();
        return (
          document.title.toLowerCase().includes(normalizedQuery) ||
          document.contentText.toLowerCase().includes(normalizedQuery)
        );
      })
    : readableDocuments;
  const selectedDocument =
    readableDocuments.find((document) => document.id === selectedDocumentId) ??
    visibleDocuments[0] ??
    readableDocuments[0] ??
    null;

  const versions = selectedDocument
    ? await prisma.documentVersion.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: { versionNumber: "desc" },
      })
    : [];

  const auditLogs = selectedDocument
    ? await prisma.auditLog.findMany({
        where: { resourceType: "document", resourceId: selectedDocument.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];
  const documentTags = selectedDocument
    ? await prisma.documentTag.findMany({
        where: { documentId: selectedDocument.id },
        include: { tag: true },
        orderBy: { tag: { name: "asc" } },
      })
    : [];
  const documentProperties = selectedDocument
    ? await prisma.documentProperty.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: { key: "asc" },
      })
    : [];
  const attachments = selectedDocument
    ? await prisma.attachment.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const comments = selectedDocument
    ? await prisma.comment.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true, email: true } } },
      })
    : [];

  const linkPanels = selectedDocument
    ? await getDocumentLinkPanels(selectedDocument.id, user.id)
    : { outgoing: [], backlinks: [], brokenLinks: [] };

  const canWrite = canWriteWorkspace(role);
  const canWriteSelectedDocument = selectedDocument
    ? canWriteDocument({
        workspaceRole: role,
        explicitPermissionCount: explicitDocumentIds.has(selectedDocument.id) ? 1 : 0,
        userPermission: userPermissionByDocumentId.get(selectedDocument.id),
      })
    : canWrite;
  const createAction = createDocumentAction.bind(null, workspaceSlug);
  const updateAction = updateDocumentAction.bind(null, workspaceSlug);
  const createFromBrokenLinkAction = createDocumentFromBrokenLinkAction.bind(
    null,
    workspaceSlug,
  );
  const restoreVersionAction = restoreDocumentVersionAction.bind(null, workspaceSlug);
  const uploadAttachmentAction = uploadDocumentAttachmentAction.bind(null, workspaceSlug);
  const commentAction = createCommentAction.bind(null, workspaceSlug);

  return (
    <AppShell
      left={
        <DocumentList
          workspaceSlug={workspaceSlug}
          documents={visibleDocuments.map((document) => ({
            id: document.id,
            title: document.title,
            contentText: document.contentText,
          }))}
          canWrite={canWrite}
          createAction={createAction}
          searchQuery={searchQuery}
        />
      }
      center={
        <DocumentEditor
          document={
            selectedDocument
              ? {
                  id: selectedDocument.id,
                  title: selectedDocument.title,
                  contentMarkdown: selectedDocument.contentMarkdown,
                }
              : null
          }
          canWrite={canWriteSelectedDocument}
          action={updateAction}
          uploadAttachmentAction={uploadAttachmentAction}
          linkCandidates={readableDocuments.map((document) => ({
            id: document.id,
            title: document.title,
          }))}
          tags={documentTags.map((documentTag) => documentTag.tag)}
          properties={documentProperties}
          comments={comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            user: comment.user,
          }))}
          linkPanels={linkPanels}
          createFromBrokenLinkAction={createFromBrokenLinkAction}
          createCommentAction={commentAction}
        />
      }
      right={
        <MetadataPanel
          currentDocument={
            selectedDocument ? { id: selectedDocument.id, title: selectedDocument.title } : null
          }
          versions={versions}
          auditLogs={auditLogs}
          attachments={attachments}
          linkPanels={linkPanels}
          canWrite={canWriteSelectedDocument}
          restoreVersionAction={restoreVersionAction}
        />
      }
    />
  );
}
