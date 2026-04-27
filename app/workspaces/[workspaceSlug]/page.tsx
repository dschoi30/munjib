import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentList } from "@/components/document-list";
import { MetadataPanel } from "@/components/metadata-panel";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { canWriteWorkspace } from "@/lib/permissions/workspace";
import { getDocumentLinkPanels } from "@/lib/wiki-links/service";
import {
  createDocumentAction,
  createDocumentFromBrokenLinkAction,
  updateDocumentAction,
} from "./actions";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ document?: string }>;
}) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;
  const { document: selectedDocumentId } = await searchParams;

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

  const selectedDocument =
    workspace.documents.find((document) => document.id === selectedDocumentId) ??
    workspace.documents[0] ??
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

  const linkPanels = selectedDocument
    ? await getDocumentLinkPanels(selectedDocument.id, user.id)
    : { outgoing: [], backlinks: [], brokenLinks: [] };

  const role = workspace.members[0].role;
  const canWrite = canWriteWorkspace(role);
  const createAction = createDocumentAction.bind(null, workspaceSlug);
  const createFromBrokenLinkAction = createDocumentFromBrokenLinkAction.bind(
    null,
    workspaceSlug,
  );

  return (
    <AppShell
      left={
        <DocumentList
          workspaceSlug={workspaceSlug}
          documents={workspace.documents}
          canWrite={canWrite}
          createAction={createAction}
        />
      }
      center={
        <DocumentEditor
          document={selectedDocument}
          canWrite={canWrite}
          action={updateDocumentAction}
        />
      }
      right={
        <MetadataPanel
          versions={versions}
          auditLogs={auditLogs}
          linkPanels={linkPanels}
          canWrite={canWrite}
          createFromBrokenLinkAction={createFromBrokenLinkAction}
        />
      }
    />
  );
}
