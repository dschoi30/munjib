"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose, Settings } from "lucide-react";
import { useLeftPanel, useTagSearch } from "@/components/app-shell";
import { DocumentNavigation } from "@/components/document-navigation";
import { DocumentCreateControls } from "@/components/document-create-controls";
import { useI18n } from "@/components/i18n-provider";
import type {
  CreateDocumentAction,
  CreateDocumentFormAction,
  CreateFolderAction,
  CreateFolderFormAction,
} from "@/components/document-navigation/types";
import {
  type MarkdownImportActionResult,
  type RetentionPolicyActionResult,
  WorkspaceSettingsPanel,
} from "@/components/workspace-settings-panel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
  type WorkspaceSidebarPanel,
} from "@/lib/workspace-ui-state";
import { workspaceDocumentHref, workspaceGraphHref } from "@/lib/workspace-routes";
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";

export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  displayPath?: string;
  contentText: string;
  tagNames: string[];
  canWrite: boolean;
};

export type FolderListItem = {
  id: string;
  parentFolderId: string | null;
  name: string;
  path: string;
  displayPath?: string;
};

export type FolderDocumentCounts = Record<string, number>;

export function DocumentList({
  workspaceSlug,
  folders,
  documents,
  folderDocumentCounts,
  canWrite,
  createAction,
  createFolderAction,
  importMarkdownAction,
  renameFolderAction,
  archiveFolderAction,
  archiveDocumentAction,
  archivedDocumentRetentionPolicy,
  updateRetentionPolicyAction,
  folderError,
  selectedFolderId,
  selectedDocumentId,
  defaultChatModel,
  defaultChatProvider,
  isGraphView = false,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  folderDocumentCounts?: FolderDocumentCounts;
  canWrite: boolean;
  createAction: CreateDocumentAction;
  createFolderAction: CreateFolderAction;
  importMarkdownAction: (formData: FormData) => Promise<MarkdownImportActionResult>;
  renameFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveDocumentAction: (formData: FormData) => Promise<{ documentId: string }>;
  archivedDocumentRetentionPolicy: ArchivedDocumentRetentionPolicyValue;
  updateRetentionPolicyAction: (formData: FormData) => Promise<RetentionPolicyActionResult>;
  folderError: string;
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
  defaultChatModel: string;
  defaultChatProvider: "ollama" | "openai" | "openai-compatible";
  isGraphView?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const leftPanel = useLeftPanel();
  const tagSearch = useTagSearch();
  const [activePanel, setActivePanel] = useState<WorkspaceSidebarPanel>("documents");
  const [activePanelHydratedWorkspace, setActivePanelHydratedWorkspace] = useState<string | null>(
    null,
  );
  const [hasActivePanelInteraction, setHasActivePanelInteraction] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const handledTagSearchTokenRef = useRef<number | null>(null);
  const iconButtonClassName =
    "h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink";

  useEffect(() => {
    const storedState = readStoredWorkspaceUiState(workspaceSlug);
    setActivePanel(storedState.activeSidebarPanel ?? "documents");
    setHasActivePanelInteraction(false);
    setActivePanelHydratedWorkspace(workspaceSlug);
  }, [workspaceSlug]);

  useEffect(() => {
    if (activePanelHydratedWorkspace !== workspaceSlug) {
      return;
    }
    if (isGraphView && !hasActivePanelInteraction) {
      return;
    }

    updateStoredWorkspaceUiState(workspaceSlug, (current) => ({
      ...current,
      activeSidebarPanel: activePanel,
    }));
  }, [
    activePanel,
    activePanelHydratedWorkspace,
    hasActivePanelInteraction,
    isGraphView,
    workspaceSlug,
  ]);

  const clearGraphRoute = useCallback(() => {
    if (!isGraphView) return;

    router.push(
      selectedDocumentId
        ? workspaceDocumentHref({ workspaceSlug, documentId: selectedDocumentId })
        : `/workspaces/${workspaceSlug}`,
    );
  }, [isGraphView, router, selectedDocumentId, workspaceSlug]);

  const closeWorkspaceMenu = useCallback(() => {
    setWorkspaceMenuOpen(false);
  }, []);

  const openWorkspaceSettings = useCallback(() => {
    setWorkspaceMenuOpen(false);
    setSettingsOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setWorkspaceMenuOpen(false);
    setSettingsOpen(false);
    leftPanel?.collapse();
  }, [leftPanel]);

  const openSearch = useCallback(() => {
    setWorkspaceMenuOpen(false);
    setSettingsOpen(false);
    setHasActivePanelInteraction(true);
    setActivePanel("search");
    clearGraphRoute();
  }, [clearGraphRoute]);

  const openDocuments = useCallback(() => {
    setWorkspaceMenuOpen(false);
    setSettingsOpen(false);
    setHasActivePanelInteraction(true);
    setActivePanel("documents");
    clearGraphRoute();
  }, [clearGraphRoute]);

  const openFavorites = useCallback(() => {
    setWorkspaceMenuOpen(false);
    setSettingsOpen(false);
    setHasActivePanelInteraction(true);
    setActivePanel((current) =>
      !isGraphView && current === "favorites" ? "documents" : "favorites",
    );
    clearGraphRoute();
  }, [clearGraphRoute, isGraphView]);

  const openGraph = useCallback(() => {
    setWorkspaceMenuOpen(false);
    setSettingsOpen(false);
    router.push(workspaceGraphHref({ workspaceSlug, documentId: selectedDocumentId }));
  }, [router, selectedDocumentId, workspaceSlug]);

  useEffect(() => {
    const request = tagSearch?.latestTagSearchRequest;
    if (!request) return;
    if (handledTagSearchTokenRef.current === request.token) return;

    const tagName = request.tagName.trim().replace(/^#+/, "");
    if (!tagName) return;

    handledTagSearchTokenRef.current = request.token;
    setWorkspaceMenuOpen(false);
    setSettingsOpen(false);
    setHasActivePanelInteraction(true);
    setActivePanel("search");
    setSearchQuery(`tag:#${tagName}`);
  }, [tagSearch?.latestTagSearchRequest]);

  useEffect(() => {
    if (!workspaceMenuOpen) return;

    function handleMouseDown(event: MouseEvent) {
      if (!event.target) return;
      if (workspaceMenuRef.current?.contains(event.target as Node)) return;
      closeWorkspaceMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeWorkspaceMenu();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeWorkspaceMenu, workspaceMenuOpen]);

  return (
    <div>
      <div data-testid="document-list-sticky-chrome" className="sticky top-0 z-20 bg-muted pb-1">
        <div ref={workspaceMenuRef} className="relative">
          <TooltipProvider delayDuration={0}>
            <div className="flex h-11 items-center gap-2">
              <Button
                type="button"
                aria-label={t("app.workspaceMenu")}
                aria-expanded={workspaceMenuOpen}
                aria-haspopup="menu"
                onClick={() => setWorkspaceMenuOpen((open) => !open)}
                className="min-w-0 flex-1 justify-start bg-transparent p-0 text-left text-sm font-medium text-ink hover:bg-transparent hover:text-ink"
              >
                <span className="truncate">Company Handbook</span>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    aria-label={t("app.closeSidebar")}
                    onClick={closeSidebar}
                    className={iconButtonClassName}
                  >
                    <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t("app.closeSidebar")}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          {workspaceMenuOpen ? (
            <div
              role="menu"
              aria-label={t("app.workspaceMenu")}
              className="absolute left-0 right-0 top-11 z-30 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={openWorkspaceSettings}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-medium text-ink hover:bg-muted"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                {t("settings.title")}
              </button>
            </div>
          ) : null}
        </div>
        <DocumentCreateControls
          canWrite={canWrite}
          createAction={createAction as CreateDocumentFormAction}
          createFolderAction={createFolderAction as CreateFolderFormAction}
          activeView={isGraphView ? "graph" : activePanel}
          onOpenDocuments={openDocuments}
          onOpenSearch={openSearch}
          onOpenFavorites={openFavorites}
          onOpenGraph={openGraph}
        />
      </div>
      <div data-testid="document-list-navigation-body" className="pt-3">
        <DocumentNavigation
          workspaceSlug={workspaceSlug}
          folders={folders}
          documents={documents}
          folderDocumentCounts={folderDocumentCounts}
          activePanel={activePanel}
          isWorkspaceMenuOpen={workspaceMenuOpen}
          searchQuery={searchQuery}
          onOpenSearch={openSearch}
          onOpenDocuments={openDocuments}
          onSearchQueryChange={setSearchQuery}
          selectedFolderId={selectedFolderId}
          canWrite={canWrite}
          createAction={createAction}
          createFolderAction={createFolderAction}
          renameFolderAction={renameFolderAction}
          archiveFolderAction={archiveFolderAction}
          archiveDocumentAction={archiveDocumentAction}
          folderError={folderError}
          selectedDocumentId={selectedDocumentId}
        />
      </div>
      {settingsOpen ? (
        <WorkspaceSettingsPanel
          canWrite={canWrite}
          workspaceSlug={workspaceSlug}
          folders={folders}
          importMarkdownAction={importMarkdownAction}
          archivedDocumentRetentionPolicy={archivedDocumentRetentionPolicy}
          updateRetentionPolicyAction={updateRetentionPolicyAction}
          defaultChatModel={defaultChatModel}
          defaultChatProvider={defaultChatProvider}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
