"use client";

import { useRouter } from "next/navigation";
import { DocumentTabs } from "@/components/document-tabs";
import { DocumentToolbar } from "@/components/document-toolbar";
import { useDocumentTabs } from "@/components/use-document-tabs";
import type { DocumentTab } from "@/lib/document-tabs";

type WorkspaceCenterShellProps = {
  workspaceSlug: string;
  documents: DocumentTab[];
  selectedDocument: DocumentTab | null;
  selectedFolder: { path: string } | null;
  children: React.ReactNode;
};

export function WorkspaceCenterShell({
  workspaceSlug,
  documents,
  selectedDocument,
  selectedFolder,
  children,
}: WorkspaceCenterShellProps) {
  const router = useRouter();
  const { tabs, activeDocumentId, closeTab } = useDocumentTabs({
    workspaceSlug,
    documents,
    selectedDocument,
  });

  function openDocument(documentId: string | null) {
    if (!documentId) {
      router.push(`/workspaces/${workspaceSlug}`);
      return;
    }

    router.push(`/workspaces/${workspaceSlug}?document=${documentId}`);
  }

  function handleClose(documentId: string) {
    const nextDocumentId = closeTab(documentId);
    if (documentId === activeDocumentId) {
      openDocument(nextDocumentId);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <DocumentTabs
        tabs={tabs}
        activeDocumentId={activeDocumentId}
        onSelect={openDocument}
        onClose={handleClose}
      />
      <DocumentToolbar path={selectedDocument?.path ?? selectedFolder?.path ?? "/"} />
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </div>
  );
}
