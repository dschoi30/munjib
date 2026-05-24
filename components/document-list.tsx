"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Settings } from "lucide-react";
import { DocumentNavigation } from "@/components/document-navigation";
import { DocumentCreateControls } from "@/components/document-create-controls";
import {
  type MarkdownImportActionResult,
  WorkspaceSettingsPanel,
} from "@/components/workspace-settings-panel";
import { Button } from "@/components/ui/button";
import { workspaceDocumentHref, workspaceGraphHref } from "@/lib/workspace-routes";

export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  contentText: string;
  canWrite: boolean;
};

export type FolderListItem = {
  id: string;
  parentFolderId: string | null;
  name: string;
  path: string;
};

export function DocumentList({
  workspaceSlug,
  folders,
  documents,
  canWrite,
  createAction,
  createFolderAction,
  importMarkdownAction,
  renameFolderAction,
  archiveFolderAction,
  archiveDocumentAction,
  folderError,
  selectedFolderId,
  selectedDocumentId,
  isGraphView = false,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  importMarkdownAction: (formData: FormData) => Promise<MarkdownImportActionResult>;
  renameFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveDocumentAction: (formData: FormData) => Promise<{ documentId: string }>;
  folderError: string;
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
  isGraphView?: boolean;
}) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<"documents" | "search" | "favorites">(
    "documents",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const iconButtonClassName =
    "h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink";

  const clearGraphRoute = useCallback(() => {
    if (!isGraphView) return;

    router.push(
      selectedDocumentId
        ? workspaceDocumentHref({ workspaceSlug, documentId: selectedDocumentId })
        : `/workspaces/${workspaceSlug}`,
    );
  }, [isGraphView, router, selectedDocumentId, workspaceSlug]);

  const openSearch = useCallback(() => {
    setSettingsOpen(false);
    setActivePanel("search");
    clearGraphRoute();
  }, [clearGraphRoute]);

  const openDocuments = useCallback(() => {
    setSettingsOpen(false);
    setActivePanel("documents");
    clearGraphRoute();
  }, [clearGraphRoute]);

  const openFavorites = useCallback(() => {
    setSettingsOpen(false);
    setActivePanel((current) => (current === "favorites" ? "documents" : "favorites"));
    clearGraphRoute();
  }, [clearGraphRoute]);

  const openGraph = useCallback(() => {
    setSettingsOpen(false);
    router.push(workspaceGraphHref({ workspaceSlug, documentId: selectedDocumentId }));
  }, [router, selectedDocumentId, workspaceSlug]);

  return (
    <div>
      <div className="flex h-11 items-center gap-2">
        <h1 className="truncate text-sm font-medium">Company Handbook</h1>
        <div className="ml-auto">
          <Button
            type="button"
            aria-label="Workspace settings"
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            className={settingsOpen ? "h-8 w-8 bg-slate-200 p-0 text-ink" : iconButtonClassName}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <DocumentCreateControls
        selectedFolderId={selectedFolderId}
        canWrite={canWrite}
        createAction={createAction}
        createFolderAction={createFolderAction}
        activeView={isGraphView ? "graph" : activePanel}
        onOpenDocuments={openDocuments}
        onOpenSearch={openSearch}
        onOpenFavorites={openFavorites}
        onOpenGraph={openGraph}
      />
      <DocumentNavigation
        workspaceSlug={workspaceSlug}
        folders={folders}
        documents={documents}
        activePanel={activePanel}
        searchQuery={searchQuery}
        onOpenSearch={openSearch}
        onOpenDocuments={openDocuments}
        onSearchQueryChange={setSearchQuery}
        selectedFolderId={selectedFolderId}
        canWrite={canWrite}
        createAction={createAction}
        renameFolderAction={renameFolderAction}
        archiveFolderAction={archiveFolderAction}
        archiveDocumentAction={archiveDocumentAction}
        folderError={folderError}
        selectedDocumentId={selectedDocumentId}
      />
      {settingsOpen ? (
        <WorkspaceSettingsPanel
          canWrite={canWrite}
          folders={folders}
          importMarkdownAction={importMarkdownAction}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
