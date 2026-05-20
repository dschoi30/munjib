"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { FileText, Settings, Upload, X } from "lucide-react";
import { DocumentNavigation } from "@/components/document-navigation";
import { DocumentCreateControls } from "@/components/document-create-controls";
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
  importMarkdownAction: (formData: FormData) => Promise<{ documentId: string }>;
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
          workspaceSlug={workspaceSlug}
          canWrite={canWrite}
          importMarkdownAction={importMarkdownAction}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSettingsPanel({
  workspaceSlug,
  canWrite,
  importMarkdownAction,
  onClose,
}: {
  workspaceSlug: string;
  canWrite: boolean;
  importMarkdownAction: (formData: FormData) => Promise<{ documentId: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isImportPending, startImportTransition] = useTransition();

  const handleImportMarkdown = useCallback((formData: FormData) => {
    startImportTransition(async () => {
      const { documentId } = await importMarkdownAction(formData);
      onClose();
      router.push(workspaceDocumentHref({ workspaceSlug, documentId }));
    });
  }, [importMarkdownAction, onClose, router, workspaceSlug]);

  return (
    <div
      data-testid="workspace-settings-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-6 py-16"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Workspace settings"
        className="grid max-h-[min(42rem,calc(100vh-8rem))] w-full max-w-4xl grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <aside className="border-r border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex h-9 items-center">
            <h2 className="text-sm font-semibold text-ink">Settings</h2>
          </div>
          <nav aria-label="Settings menu" className="space-y-1">
            <Button
              type="button"
              aria-label="Import"
              aria-pressed="true"
              className="h-9 w-full justify-start gap-2 bg-slate-200 px-2 text-sm text-ink"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import
            </Button>
          </nav>
        </aside>
        <div className="min-w-0 overflow-y-auto p-8">
          <div className="mb-8 flex items-start gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Workspace</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">Import your contents</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Markdown files become documents.
              </p>
            </div>
            <Button
              type="button"
              aria-label="Close settings"
              onClick={onClose}
              className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-100 hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <form action={handleImportMarkdown} className="space-y-4">
            <label
              htmlFor="markdownFile"
              className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-sky-400 bg-sky-50/70 px-6 py-8 text-center"
            >
              <FileText className="h-8 w-8 text-sky-400" aria-hidden="true" />
              <span className="mt-4 text-base font-semibold text-ink">Markdown file</span>
              <span className="mt-2 text-sm leading-6 text-slate-600">.md or .markdown</span>
              <input
                id="markdownFile"
                name="markdownFile"
                type="file"
                aria-label="Markdown file"
                accept=".md,.markdown,text/markdown,text/x-markdown"
                disabled={!canWrite || isImportPending}
                className="mt-5 w-full max-w-md text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
              />
            </label>
            <Button
              type="submit"
              disabled={!canWrite || isImportPending}
              className="h-10 w-full max-w-md"
            >
              Import Markdown
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
