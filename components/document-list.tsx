"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { PanelLeftClose, Settings } from "lucide-react";
import { useLeftPanel, useTagSearch } from "@/components/app-shell";
import { DocumentNavigation } from "@/components/document-navigation";
import { DocumentCreateControls } from "@/components/document-create-controls";
import { useI18n } from "@/components/i18n-provider";
import {
  DocumentNavigationBodySkeleton,
  WorkspaceSidebarLoadingSkeleton,
} from "@/components/sidebar-loading-skeleton";
import type {
  CreateDocumentAction,
  CreateFolderAction,
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
import type { ClientRagChatProviderAvailability } from "@/lib/rag/client-model-settings";
import type { ArchivedDocumentRetentionPolicyValue } from "@/lib/workspaces/retention-policy";

const createErrorToastId = "folder-create-error";
const createErrorToastClassName =
  "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg";

type TopLevelCreateKind = "document" | "folder";
type CreatedTarget = { kind: TopLevelCreateKind; id: string };

export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  displayPath?: string;
  displayPathNeedsStoredPath?: boolean;
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
  availableChatProviders,
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
  availableChatProviders: ClientRagChatProviderAvailability;
  isGraphView?: boolean;
}) {
  const { isHydrated: languageHydrated, t } = useI18n();
  const router = useRouter();
  const [isTopLevelCreateTransitionPending, startTopLevelCreateTransition] = useTransition();
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
  const [topLevelCreatePending, setTopLevelCreatePending] = useState<TopLevelCreateKind | null>(
    null,
  );
  const [clearTopLevelCreatePendingAfterTransition, setClearTopLevelCreatePendingAfterTransition] =
    useState(false);
  const [pendingCreatedTarget, setPendingCreatedTarget] = useState<CreatedTarget | null>(null);
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

  const showCreateFailedToast = useCallback(() => {
    toast(t("nav.folderCreateFailed"), {
      id: createErrorToastId,
      className: createErrorToastClassName,
      unstyled: true,
    });
  }, [t]);

  const createTopLevelDocument = useCallback(async () => {
    if (topLevelCreatePending) return;

    const formData = new FormData();
    formData.set("folderId", "");
    formData.set("redirect", "false");

    setTopLevelCreatePending("document");
    try {
      const result = await createAction(formData);
      setClearTopLevelCreatePendingAfterTransition(true);
      startTopLevelCreateTransition(() => {
        if (result?.documentId) {
          setPendingCreatedTarget({ kind: "document", id: result.documentId });
          router.push(workspaceDocumentHref({ workspaceSlug, documentId: result.documentId }));
          return;
        }
        router.refresh();
      });
    } catch {
      setClearTopLevelCreatePendingAfterTransition(false);
      setTopLevelCreatePending(null);
      showCreateFailedToast();
    }
  }, [
    createAction,
    router,
    showCreateFailedToast,
    startTopLevelCreateTransition,
    topLevelCreatePending,
    workspaceSlug,
  ]);

  const createTopLevelFolder = useCallback(async () => {
    if (topLevelCreatePending) return;

    const formData = new FormData();
    formData.set("parentFolderId", "");
    formData.set("redirect", "false");

    setTopLevelCreatePending("folder");
    try {
      const result = await createFolderAction(formData);
      setClearTopLevelCreatePendingAfterTransition(true);
      startTopLevelCreateTransition(() => {
        if (result?.folderId) {
          setPendingCreatedTarget({ kind: "folder", id: result.folderId });
          router.push(`/workspaces/${workspaceSlug}?folder=${result.folderId}`);
          return;
        }
        router.refresh();
      });
    } catch {
      setClearTopLevelCreatePendingAfterTransition(false);
      setTopLevelCreatePending(null);
      showCreateFailedToast();
    }
  }, [
    createFolderAction,
    router,
    showCreateFailedToast,
    startTopLevelCreateTransition,
    topLevelCreatePending,
    workspaceSlug,
  ]);

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
    if (!clearTopLevelCreatePendingAfterTransition || isTopLevelCreateTransitionPending) return;
    setTopLevelCreatePending(null);
    setClearTopLevelCreatePendingAfterTransition(false);
  }, [clearTopLevelCreatePendingAfterTransition, isTopLevelCreateTransitionPending]);

  useEffect(() => {
    if (!pendingCreatedTarget) return;

    const target =
      pendingCreatedTarget.kind === "document"
        ? findCreatedDocumentRow(pendingCreatedTarget.id)
        : findCreatedFolderRow(pendingCreatedTarget.id);

    if (!target) return;

    target.scrollIntoView({ block: "nearest" });
    setPendingCreatedTarget(null);
  }, [documents, folders, pendingCreatedTarget]);

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

  const activePanelHydrated = activePanelHydratedWorkspace === workspaceSlug;

  if (!languageHydrated) {
    return <WorkspaceSidebarLoadingSkeleton side="left" />;
  }

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
          onCreateDocument={createTopLevelDocument}
          onCreateFolder={createTopLevelFolder}
          isCreatingDocument={topLevelCreatePending !== null}
          isCreatingFolder={topLevelCreatePending !== null}
          activeView={isGraphView ? "graph" : activePanel}
          onOpenDocuments={openDocuments}
          onOpenSearch={openSearch}
          onOpenFavorites={openFavorites}
          onOpenGraph={openGraph}
        />
      </div>
      <div data-testid="document-list-navigation-body" className="pt-3">
        {activePanelHydrated ? (
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
        ) : (
          <DocumentNavigationBodySkeleton />
        )}
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
          availableChatProviders={availableChatProviders}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function findCreatedDocumentRow(documentId: string) {
  return document.querySelector<HTMLElement>(
    rowIdSelector("data-document-row-id", documentId),
  );
}

function findCreatedFolderRow(folderId: string) {
  return document.querySelector<HTMLElement>(
    rowIdSelector("data-folder-row-id", folderId),
  );
}

function rowIdSelector(attribute: "data-document-row-id" | "data-folder-row-id", value: string) {
  return `[${attribute}="${escapeCssString(value)}"]`;
}

function escapeCssString(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\A ")
    .replace(/\r/g, "\\D ")
    .replace(/\f/g, "\\C ");
}
