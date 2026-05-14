"use client";

import { DocumentNavigation } from "@/components/document-navigation";
import { DocumentCreateControls } from "@/components/document-create-controls";
import { useState } from "react";

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
  renameFolderAction,
  archiveFolderAction,
  archiveDocumentAction,
  folderError,
  selectedFolderId,
  selectedDocumentId,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveDocumentAction: (formData: FormData) => Promise<{ documentId: string }>;
  folderError: string;
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
}) {
  const [activePanel, setActivePanel] = useState<"documents" | "search" | "favorites">(
    "documents",
  );
  const [searchQuery, setSearchQuery] = useState("");

  function openSearch() {
    setActivePanel("search");
  }

  function openDocuments() {
    setActivePanel("documents");
  }

  function openFavorites() {
    setActivePanel((current) => (current === "favorites" ? "documents" : "favorites"));
  }

  return (
    <div>
      <div className="flex h-11 items-center">
        <h1 className="truncate text-sm font-medium">Company Handbook</h1>
      </div>
      <DocumentCreateControls
        selectedFolderId={selectedFolderId}
        canWrite={canWrite}
        createAction={createAction}
        createFolderAction={createFolderAction}
        activePanel={activePanel}
        onOpenDocuments={openDocuments}
        onOpenSearch={openSearch}
        onOpenFavorites={openFavorites}
      />
      <DocumentNavigation
        workspaceSlug={workspaceSlug}
        folders={folders}
        documents={documents}
        activePanel={activePanel}
        searchQuery={searchQuery}
        onOpenSearch={openSearch}
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
    </div>
  );
}
