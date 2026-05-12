"use client";

import { useRouter } from "next/navigation";
import { DocumentTabs } from "@/components/document-tabs";
import { DocumentToolbar } from "@/components/document-toolbar";
import { useDocumentTabs } from "@/components/use-document-tabs";
import type { DocumentTabDocument } from "@/lib/document-tabs";

type WorkspaceCenterShellProps = {
  workspaceSlug: string;
  documents: DocumentTabDocument[];
  selectedDocument: DocumentTabDocument | null;
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
  const { tabs, activeTabId, closeTab, selectTab, createNewTab } = useDocumentTabs({
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

  function handleSelect(tabId: string) {
    openDocument(selectTab(tabId));
  }

  function handleClose(tabId: string) {
    const result = closeTab(tabId);
    if (result.closedWasActive) {
      openDocument(result.nextDocumentId);
    }
  }

  function handleAdd() {
    createNewTab();
    openDocument(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <DocumentTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={handleSelect}
        onClose={handleClose}
        onAdd={handleAdd}
      />
      <DocumentToolbar path={selectedDocument?.path ?? selectedFolder?.path ?? "/"} />
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </div>
  );
}
