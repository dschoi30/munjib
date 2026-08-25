import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentList } from "@/components/document-list";
import { FolderDetail } from "@/components/folder-detail";
import { KnowledgeGraphView } from "@/components/knowledge-graph-view";
import { MetadataPanel } from "@/components/metadata-panel";
import { WorkspaceCenterShell } from "@/components/workspace-center-shell";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
import { LoginForm } from "@/app/login/login-form";
import {
  resolveDevLoginEnabled,
  resolveGoogleAuthCredentials,
  resolveTrialLoginEnabled,
  resolveTrialTurnstileSiteKey,
} from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { normalizeTag, parseDocumentMetadata } from "@/lib/document-metadata/parser";
import { buildKnowledgeGraph } from "@/lib/knowledge-graph/model";
import {
  getDefaultRagChatModel,
  getDefaultRagChatProvider,
  getRagChatProviderAvailability,
} from "@/lib/rag/model-config";
import {
  canWriteDocument,
  highestPermissionLevel,
} from "@/lib/permissions/document";
import { canManageWorkspace, canWriteWorkspace } from "@/lib/permissions/workspace";
import { listReadableWorkspacesForUser } from "@/lib/workspaces/management-service";
import { buildWorkspacePageWhere } from "@/lib/workspaces/page-query";
import {
  buildDocumentDisplayPathMap,
  buildFolderDisplayPathMap,
  countFolderChildren,
  filterReadableDocuments,
  folderDisplayPath,
} from "@/lib/workspace-tree";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import {
  archiveWorkspaceAction,
  createFolderAction,
  archiveDocumentAction,
  archiveFolderAction,
  createWorkspaceAction,
  createDocumentAction,
  createCommentAction,
  createDocumentFromBrokenLinkAction,
  importMarkdownDocumentAction,
  pasteDocumentImageAttachmentAction,
  renameWorkspaceAction,
  renameFolderAction,
  restoreDocumentVersionAction,
  updateDocumentAction,
  updateWorkspaceRetentionPolicyAction,
  uploadDocumentAttachmentAction,
} from "./actions";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    document?: string;
    folder?: string;
    folderError?: string;
    graph?: string;
  }>;
}) {
  const { workspaceSlug } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-page px-6">
        <LoginForm
          callbackUrl={`/workspaces/${workspaceSlug}`}
          isDevLoginEnabled={resolveDevLoginEnabled()}
          isGoogleLoginEnabled={resolveGoogleAuthCredentials() !== null}
          isTrialLoginEnabled={resolveTrialLoginEnabled()}
          trialTurnstileSiteKey={resolveTrialTurnstileSiteKey()}
          isSignupEnabled={false}
        />
      </main>
    );
  }
  const {
    document: selectedDocumentId,
    folder: selectedFolderIdParam,
    folderError,
    graph,
  } = await searchParams;
  const isGraphView = graph === "1";
  const hasRequestedDocument = typeof selectedDocumentId === "string";
  const hasRequestedFolder = typeof selectedFolderIdParam === "string";

  const workspace = await prisma.workspace.findFirst({
    where: buildWorkspacePageWhere({ workspaceSlug, actorId: user.id }),
    include: {
      members: { where: { userId: user.id }, take: 1 },
      documents: {
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      },
      folders: {
        where: { status: "ACTIVE" },
        orderBy: { path: "asc" },
      },
    },
  });

  if (!workspace || !workspace.members[0]) notFound();

  const role = workspace.members[0].role;
  const readableWorkspaces = await listReadableWorkspacesForUser(user.id);
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
  const readableDocuments = filterReadableDocuments({
    documents: workspace.documents,
    role,
    explicitDocumentIds,
    userPermissionsByDocumentId: userPermissionByDocumentId,
  });
  const folderDisplayPaths = buildFolderDisplayPathMap(workspace.folders);
  const documentDisplayPaths = buildDocumentDisplayPathMap(readableDocuments, folderDisplayPaths);
  const activeDocumentCountsByFolderId = workspace.documents.reduce<Record<string, number>>(
    (counts, document) => {
      if (!document.folderId) return counts;
      counts[document.folderId] = (counts[document.folderId] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const readableDocumentIds = new Set(readableDocuments.map((document) => document.id));
  const readableDocumentIdList = Array.from(readableDocumentIds);
  const documentTagsForList = readableDocuments.flatMap((document) =>
    parseDocumentMetadata(document.contentMarkdown).tags.map((tagName) => ({
      documentId: document.id,
      tag: { name: tagName, normalizedName: normalizeTag(tagName) },
    })),
  );
  const tagNamesByDocumentId = new Map<string, string[]>();
  for (const documentTag of documentTagsForList) {
    const tagNames = tagNamesByDocumentId.get(documentTag.documentId) ?? [];
    tagNames.push(documentTag.tag.normalizedName);
    tagNamesByDocumentId.set(documentTag.documentId, tagNames);
  }
  const selectedFolder =
    workspace.folders.find((folder) => folder.id === selectedFolderIdParam) ?? null;
  const selectedDocument =
    isGraphView || !selectedFolder
      ? (readableDocuments.find((document) => document.id === selectedDocumentId) ?? null)
      : null;

  const graphLinks = isGraphView
    ? await prisma.documentLink.findMany({
        where: {
          workspaceId: workspace.id,
          sourceDocumentId: { in: readableDocumentIdList },
        },
        select: {
          id: true,
          sourceDocumentId: true,
          targetDocumentId: true,
          targetTitleRaw: true,
          isBroken: true,
          isAmbiguous: true,
        },
        orderBy: [
          { sourceDocumentId: "asc" },
          { sortOrder: "asc" },
          { id: "asc" },
        ],
      })
    : [];
  const graphTags = isGraphView ? documentTagsForList : [];
  const graphData = isGraphView
    ? buildKnowledgeGraph({
        documents: readableDocuments.map((document) => ({
          id: document.id,
          title: document.title,
          path: document.path,
          contentMarkdown: document.contentMarkdown,
        })),
        links: graphLinks,
        tags: graphTags,
      })
    : { nodes: [], links: [] };

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
  const documentTags = selectedDocument && !isGraphView
    ? await prisma.documentTag.findMany({
        where: { documentId: selectedDocument.id },
        include: { tag: true },
        orderBy: { tag: { name: "asc" } },
      })
    : [];
  const documentProperties = selectedDocument && !isGraphView
    ? await prisma.documentProperty.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
      })
    : [];
  const attachments = selectedDocument
    ? await prisma.attachment.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const comments = selectedDocument && !isGraphView
    ? await prisma.comment.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true, email: true } } },
      })
    : [];

  const linkPanels = selectedDocument
    ? await getDocumentLinkPanels(selectedDocument.id, user.id)
    : { outgoing: [], backlinks: [], brokenLinks: [], ambiguousLinks: [] };

  const canWrite = canWriteWorkspace(role);
  const canWriteSelectedDocument = selectedDocument
    ? canWriteDocument({
        workspaceRole: role,
        explicitPermissionCount: explicitDocumentIds.has(selectedDocument.id) ? 1 : 0,
        userPermission: userPermissionByDocumentId.get(selectedDocument.id),
      })
    : canWrite;
  const createAction = createDocumentAction.bind(null, workspaceSlug);
  const createFolder = createFolderAction.bind(null, workspaceSlug);
  const importMarkdown = importMarkdownDocumentAction.bind(null, workspaceSlug);
  const renameFolder = renameFolderAction.bind(null, workspaceSlug);
  const archiveFolder = archiveFolderAction.bind(null, workspaceSlug);
  const archiveDocument = archiveDocumentAction.bind(null, workspaceSlug);
  const updateAction = updateDocumentAction.bind(null, workspaceSlug);
  const createFromBrokenLinkAction = createDocumentFromBrokenLinkAction.bind(
    null,
    workspaceSlug,
  );
  const restoreVersionAction = restoreDocumentVersionAction.bind(null, workspaceSlug);
  const uploadAttachmentAction = uploadDocumentAttachmentAction.bind(null, workspaceSlug);
  const pasteImageAttachmentAction = pasteDocumentImageAttachmentAction.bind(null, workspaceSlug);
  const updateRetentionPolicy = updateWorkspaceRetentionPolicyAction.bind(null, workspaceSlug);
  const createWorkspace = createWorkspaceAction.bind(null, workspaceSlug);
  const renameWorkspace = renameWorkspaceAction.bind(null, workspaceSlug);
  const archiveWorkspace = archiveWorkspaceAction.bind(null, workspaceSlug);
  const commentAction = createCommentAction.bind(null, workspaceSlug);
  const defaultChatModel = getDefaultRagChatModel();
  const defaultChatProvider = getDefaultRagChatProvider();
  const availableChatProviders = getRagChatProviderAvailability();
  function documentDisplayPathProps(document: (typeof readableDocuments)[number]) {
    const displayPath = documentDisplayPaths.get(document.id);
    return {
      displayPath: displayPath?.path ?? document.path,
      displayPathNeedsStoredPath: displayPath?.needsStoredPathDisambiguation ?? false,
    };
  }

  const selectedCenterFolder = selectedFolder
    ? {
        id: selectedFolder.id,
        name: selectedFolder.name,
        path: selectedFolder.path,
        displayPath: folderDisplayPath(selectedFolder, folderDisplayPaths),
        childCount: countFolderChildren({
          folderId: selectedFolder.id,
          folders: workspace.folders,
          documents: readableDocuments,
        }),
      }
    : null;

  return (
    <>
      <AppShell
        workspaceSlug={workspaceSlug}
        left={
          <DocumentList
            workspaceSlug={workspaceSlug}
            workspaceName={workspace.name}
            currentUser={{ name: user.name ?? null, email: user.email ?? "" }}
            readableWorkspaces={readableWorkspaces}
            folders={workspace.folders.map((folder) => ({
              id: folder.id,
              parentFolderId: folder.parentFolderId,
              name: folder.name,
              path: folder.path,
              displayPath: folderDisplayPath(folder, folderDisplayPaths),
            }))}
            documents={readableDocuments.map((document) => ({
              id: document.id,
              folderId: document.folderId,
              title: document.title,
              path: document.path,
              ...documentDisplayPathProps(document),
              contentText: document.contentText,
              tagNames: tagNamesByDocumentId.get(document.id) ?? [],
              canWrite: canWriteDocument({
                workspaceRole: role,
                explicitPermissionCount: explicitDocumentIds.has(document.id) ? 1 : 0,
                userPermission: userPermissionByDocumentId.get(document.id),
              }),
            }))}
            folderDocumentCounts={activeDocumentCountsByFolderId}
            canWrite={canWrite}
            canManageWorkspace={canManageWorkspace(role)}
            createAction={createAction}
            createFolderAction={createFolder}
            createWorkspaceAction={createWorkspace}
            renameWorkspaceAction={renameWorkspace}
            archiveWorkspaceAction={archiveWorkspace}
            importMarkdownAction={importMarkdown}
            renameFolderAction={renameFolder}
            archiveFolderAction={archiveFolder}
            archiveDocumentAction={archiveDocument}
            archivedDocumentRetentionPolicy={workspace.archivedDocumentRetentionPolicy}
            updateRetentionPolicyAction={updateRetentionPolicy}
            folderError={folderError ?? ""}
            selectedFolderId={selectedFolder?.id ?? selectedDocument?.folderId ?? null}
            selectedDocumentId={selectedDocument?.id ?? null}
            defaultChatModel={defaultChatModel}
            defaultChatProvider={defaultChatProvider}
            availableChatProviders={availableChatProviders}
            isGraphView={isGraphView}
          />
        }
        center={
          <WorkspaceCenterShell
            workspaceSlug={workspaceSlug}
            documents={readableDocuments.map((document) => ({
              id: document.id,
              title: document.title,
              path: document.path,
              ...documentDisplayPathProps(document),
            }))}
            selectedDocument={
              selectedDocument
                ? {
                    id: selectedDocument.id,
                    title: selectedDocument.title,
                    path: selectedDocument.path,
                    ...documentDisplayPathProps(selectedDocument),
                  }
                : null
            }
            selectedFolder={selectedCenterFolder}
            isGraphView={isGraphView}
            restoreStoredActiveTab={!hasRequestedDocument && !hasRequestedFolder && !isGraphView}
          >
            {isGraphView ? (
              <KnowledgeGraphView
                workspaceSlug={workspaceSlug}
                graph={graphData}
                selectedDocumentId={selectedDocument?.id ?? null}
              />
            ) : selectedFolder ? (
              <FolderDetail
                folder={selectedCenterFolder}
                canWrite={canWrite}
              />
            ) : (
              <DocumentEditor
                workspaceSlug={workspaceSlug}
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
                pasteImageAttachmentAction={pasteImageAttachmentAction}
                attachmentIds={attachments.map((attachment) => attachment.id)}
                linkCandidates={readableDocuments.map((document) => ({
                  id: document.id,
                  slug: document.slug,
                  title: document.title,
                  path: document.path,
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
                defaultChatModel={defaultChatModel}
                defaultChatProvider={defaultChatProvider}
                availableChatProviders={availableChatProviders}
              />
            )}
          </WorkspaceCenterShell>
        }
        right={
          <MetadataPanel
            document={
              selectedDocument
                ? { id: selectedDocument.id, contentMarkdown: selectedDocument.contentMarkdown }
                : null
            }
            versions={versions}
            auditLogs={auditLogs}
            attachments={attachments}
            canWrite={canWriteSelectedDocument}
            restoreVersionAction={restoreVersionAction}
          />
        }
      />
      <WorkspaceChatbot
        key={workspaceSlug}
        workspaceSlug={workspaceSlug}
        selectedDocumentId={selectedDocument?.id ?? null}
        defaultChatProvider={defaultChatProvider}
        defaultChatModel={defaultChatModel}
        availableChatProviders={availableChatProviders}
      />
    </>
  );
}
