"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  DocumentListItem,
  FolderDocumentCounts,
  FolderListItem,
} from "@/components/document-list";
import {
  DocumentSection,
  sectionHeadingClassName,
} from "@/components/document-navigation/document-section";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import {
  emptyFavorites,
  parseFavorites,
  toggleListValue,
} from "@/components/document-navigation/favorites";
import { FavoriteSection } from "@/components/document-navigation/favorites-panel";
import { FolderToggleRow } from "@/components/document-navigation/folder-row";
import { getFolderTrashSummary } from "@/components/document-navigation/folder-trash";
import {
  type ActionMenuPlacement,
  chooseActionMenuPlacement,
} from "@/components/document-navigation/menu-placement";
import { SearchPanel } from "@/components/document-navigation/search-panel";
import { buildTreeItems, hasTreeChildren } from "@/components/document-navigation/tree";
import { useI18n } from "@/components/i18n-provider";
import type {
  ArchiveDocumentResult,
  ArchiveFolderResult,
  CreateDocumentAction,
  CreateFolderAction,
  FavoriteState,
  RenameFolderResult,
} from "@/components/document-navigation/types";
import { openDocumentInNewTab } from "@/components/use-document-tabs";
import type { MessageKey } from "@/lib/i18n/messages";
import { documentDisplayDescription, documentDisplayLabel } from "@/lib/workspace-tree";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

const folderErrorToastId = "folder-trash-error";
const folderCreateErrorToastId = "folder-create-error";
const folderErrorToastClassName =
  "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg";
const maxRecentDocuments = 5;

export function DocumentNavigation({
  workspaceSlug,
  folders,
  documents,
  folderDocumentCounts,
  activePanel,
  isWorkspaceMenuOpen,
  searchQuery,
  onOpenSearch,
  onOpenDocuments,
  onSearchQueryChange,
  selectedFolderId,
  canWrite,
  createAction,
  createFolderAction,
  renameFolderAction,
  archiveFolderAction,
  archiveDocumentAction,
  folderError,
  selectedDocumentId,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  folderDocumentCounts?: FolderDocumentCounts;
  activePanel: "documents" | "search" | "favorites";
  isWorkspaceMenuOpen: boolean;
  searchQuery: string;
  onOpenSearch: () => void;
  onOpenDocuments: () => void;
  onSearchQueryChange: (query: string) => void;
  selectedFolderId: string | null;
  canWrite: boolean;
  createAction: CreateDocumentAction;
  createFolderAction: CreateFolderAction;
  renameFolderAction: (formData: FormData) => Promise<RenameFolderResult>;
  archiveFolderAction: (formData: FormData) => Promise<ArchiveFolderResult>;
  archiveDocumentAction: (formData: FormData) => Promise<ArchiveDocumentResult>;
  folderError: string;
  selectedDocumentId: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isCreateTransitionPending, startCreateTransition] = useTransition();
  const [favorites, setFavorites] = useState<FavoriteState>(emptyFavorites);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPlacements, setMenuPlacements] = useState<Record<string, ActionMenuPlacement>>({});
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [pendingFolderCreateAction, setPendingFolderCreateAction] = useState<string | null>(
    null,
  );
  const [recentDocumentIds, setRecentDocumentIds] = useState<string[]>([]);
  const [clearCreatePendingAfterTransition, setClearCreatePendingAfterTransition] =
    useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(folders.map((folder) => folder.id)),
  );
  const recentDocumentStorageKey = `munjib:recents:${workspaceSlug}`;
  const untitledDocumentLabel = t("nav.untitledDocument");

  const favoriteDocumentIds = useMemo(
    () => new Set(favorites.documents),
    [favorites.documents],
  );
  const favoriteFolderIds = useMemo(() => new Set(favorites.folders), [favorites.folders]);
  const favoriteDocuments = useMemo(
    () => documents.filter((document) => favoriteDocumentIds.has(document.id)),
    [documents, favoriteDocumentIds],
  );
  const favoriteFolders = useMemo(
    () => folders.filter((folder) => favoriteFolderIds.has(folder.id)),
    [folders, favoriteFolderIds],
  );
  const documentsById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  );
  const recentDocuments = useMemo(() => {
    const orderedDocumentIds = [
      ...recentDocumentIds,
      ...documents.map((document) => document.id),
    ];
    const seenDocumentIds = new Set<string>();
    const orderedDocuments: DocumentListItem[] = [];

    for (const documentId of orderedDocumentIds) {
      if (seenDocumentIds.has(documentId)) continue;
      if (documentId === selectedDocumentId) continue;
      const document = documentsById.get(documentId);
      if (!document) continue;

      seenDocumentIds.add(documentId);
      orderedDocuments.push(document);
      if (orderedDocuments.length === maxRecentDocuments) break;
    }

    return orderedDocuments;
  }, [documents, documentsById, recentDocumentIds, selectedDocumentId]);
  const searchResults = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    const tagQuery = parseTagSearchQuery(trimmedQuery);
    if (tagQuery !== null) {
      if (!tagQuery) return [];
      return documents.filter((document) =>
        document.tagNames.some((tagName) => normalizeTagName(tagName) === tagQuery),
      );
    }

    const query = trimmedQuery.toLowerCase();
    if (!query) return documents;
    return documents.filter(
      (document) => {
        const displayLabel = documentDisplayLabel(document, untitledDocumentLabel);
        const displayDescription = documentDisplayDescription(document, untitledDocumentLabel);

        return (
          displayLabel.toLowerCase().includes(query) ||
          document.path.toLowerCase().includes(query) ||
          (displayDescription?.toLowerCase().includes(query) ?? false) ||
          document.contentText.toLowerCase().includes(query)
        );
      },
    );
  }, [documents, searchQuery, untitledDocumentLabel]);
  const folderErrorText = folderErrorMessage(folderError, t);
  useEffect(() => {
    const raw = window.localStorage.getItem(`munjib:favorites:${workspaceSlug}`);
    setFavorites(parseFavorites(raw));
  }, [workspaceSlug]);

  useEffect(() => {
    window.localStorage.setItem(`munjib:favorites:${workspaceSlug}`, JSON.stringify(favorites));
  }, [favorites, workspaceSlug]);

  useEffect(() => {
    const loadedDocumentIds = parseRecentDocumentIds(
      window.localStorage.getItem(recentDocumentStorageKey),
    );
    const readableLoadedDocumentIds = filterReadableRecentDocumentIds(
      loadedDocumentIds,
      documentsById,
    );
    const nextDocumentIds = [
      ...(selectedDocumentId ? [selectedDocumentId] : []),
      ...readableLoadedDocumentIds,
    ]
      .filter(uniqueDocumentId)
      .slice(0, maxRecentDocuments);
    setRecentDocumentIds(nextDocumentIds);

    if (!areDocumentIdsEqual(nextDocumentIds, loadedDocumentIds)) {
      window.localStorage.setItem(
        recentDocumentStorageKey,
        JSON.stringify(nextDocumentIds),
      );
    }
  }, [documentsById, recentDocumentStorageKey, selectedDocumentId]);

  useEffect(() => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      for (const folderId of current) {
        if (!folders.some((folder) => folder.id === folderId)) next.delete(folderId);
      }
      return next;
    });
  }, [folders]);

  useEffect(() => {
    if (!clearCreatePendingAfterTransition || isCreateTransitionPending) return;
    setPendingFolderCreateAction(null);
    setClearCreatePendingAfterTransition(false);
  }, [clearCreatePendingAfterTransition, isCreateTransitionPending]);

  useEffect(() => {
    if (!folderErrorText) return;
    toast(folderErrorText, {
      id: folderErrorToastId,
      className: folderErrorToastClassName,
      unstyled: true,
    });
    const url = new URL(window.location.href);
    if (url.searchParams.has("folderError")) {
      url.searchParams.delete("folderError");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [folderErrorText]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-row-action-menu]")) return;
      setOpenMenuId(null);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenSearch();
      }
      if (event.key === "Escape") {
        setOpenMenuId(null);
        setRenamingFolderId(null);
        if (!isWorkspaceMenuOpen && activePanel !== "documents") {
          onOpenDocuments();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, isWorkspaceMenuOpen, onOpenDocuments, onOpenSearch]);

  function toggleFavoriteDocument(documentId: string) {
    setFavorites((current) => ({
      ...current,
      documents: toggleListValue(current.documents, documentId),
    }));
    setOpenMenuId(null);
  }

  function openActionMenu(menuId: string | null, trigger?: HTMLElement | null) {
    setOpenMenuId(menuId);

    if (!menuId) return;

    setMenuPlacements((current) => ({
      ...current,
      [menuId]: chooseActionMenuPlacement(trigger),
    }));
  }

  function menuPlacement(menuId: string): ActionMenuPlacement {
    return menuPlacements[menuId] ?? "down";
  }

  function openDocumentRowInNewTab(document: DocumentListItem) {
    openDocumentInNewTab(workspaceSlug, {
      id: document.id,
      title: document.title,
      path: document.path,
    });
    setOpenMenuId(null);
    router.push(workspaceDocumentHref({ workspaceSlug, documentId: document.id }));
  }

  function toggleFavoriteFolder(folderId: string) {
    setFavorites((current) => ({
      ...current,
      folders: toggleListValue(current.folders, folderId),
    }));
    setOpenMenuId(null);
  }

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function startFolderRename(folderId: string) {
    setRenamingFolderId(folderId);
    setOpenMenuId(null);
  }

  async function addFolderChild(folderId: string) {
    if (pendingFolderCreateAction) return;

    const pendingKey = `folder:${folderId}`;
    const formData = new FormData();
    formData.set("parentFolderId", folderId);
    formData.set("redirect", "false");

    setPendingFolderCreateAction(pendingKey);
    setOpenMenuId(null);
    try {
      const result = await createFolderAction(formData);
      setClearCreatePendingAfterTransition(true);
      startCreateTransition(() => {
        if (result?.folderId) {
          router.push(`/workspaces/${workspaceSlug}?folder=${result.folderId}`);
          return;
        }
        router.refresh();
      });
    } catch {
      setClearCreatePendingAfterTransition(false);
      setPendingFolderCreateAction(null);
      toast(t("nav.folderCreateFailed"), {
        id: folderCreateErrorToastId,
        className: folderErrorToastClassName,
        unstyled: true,
      });
    }
  }

  async function addFolderDocument(folderId: string) {
    if (pendingFolderCreateAction) return;

    const pendingKey = `document:${folderId}`;
    const formData = new FormData();
    formData.set("folderId", folderId);
    formData.set("redirect", "false");

    setPendingFolderCreateAction(pendingKey);
    setOpenMenuId(null);
    try {
      const result = await createAction(formData);
      setClearCreatePendingAfterTransition(true);
      startCreateTransition(() => {
        if (result?.documentId) {
          router.push(workspaceDocumentHref({ workspaceSlug, documentId: result.documentId }));
          return;
        }
        router.refresh();
      });
    } catch {
      setClearCreatePendingAfterTransition(false);
      setPendingFolderCreateAction(null);
      toast(t("nav.folderCreateFailed"), {
        id: folderCreateErrorToastId,
        className: folderErrorToastClassName,
        unstyled: true,
      });
    }
  }

  async function archiveFolderFromMenu(formData: FormData) {
    const folderId = String(formData.get("folderId"));
    const trashSummary = getFolderTrashSummary({
      folderId,
      folders,
      documents,
      folderDocumentCounts,
      selectedFolderId,
      selectedDocumentId,
    });
    const result = await archiveFolderAction(formData);
    if (result.error) {
      setOpenMenuId(null);
      toast(folderErrorMessage(result.error, t), {
        id: folderErrorToastId,
        className: folderErrorToastClassName,
        unstyled: true,
      });
      return;
    }

    setOpenMenuId(null);
    startTransition(() => {
      if (
        result.folderId === selectedFolderId ||
        trashSummary.selectedFolderWillBeArchived ||
        trashSummary.selectedDocumentWillBeArchived
      ) {
        router.push(`/workspaces/${workspaceSlug}`);
        return;
      }
      router.refresh();
    });
  }

  async function renameFolderFromMenu(formData: FormData) {
    const result = await renameFolderAction(formData);
    if (result.error) {
      toast(folderErrorMessage(result.error, t), {
        id: folderErrorToastId,
        className: folderErrorToastClassName,
        unstyled: true,
      });
      return;
    }

    setRenamingFolderId(null);
    startTransition(() => {
      router.refresh();
    });
  }

  async function archiveDocumentFromMenu(formData: FormData) {
    const result = await archiveDocumentAction(formData);
    setOpenMenuId(null);
    startTransition(() => {
      if (result.documentId === selectedDocumentId) {
        router.push(`/workspaces/${workspaceSlug}`);
        return;
      }
      router.refresh();
    });
  }

  function renderTreeItems(parentFolderId: string | null) {
    const items = buildTreeItems(folders, documents, parentFolderId);

    return items.map((item) => {
      if (item.kind === "document") {
        const menuId = `tree-document:${item.document.id}`;

        return (
          <DocumentLinkRow
            key={item.document.id}
            rowId={menuId}
            workspaceSlug={workspaceSlug}
            document={item.document}
            isFavorite={favoriteDocumentIds.has(item.document.id)}
            selected={item.document.id === selectedDocumentId}
            showDescription={false}
            openMenuId={openMenuId}
            menuPlacement={menuPlacement(menuId)}
            onOpenMenu={openActionMenu}
            onToggleFavorite={toggleFavoriteDocument}
            onOpenInNewTab={openDocumentRowInNewTab}
            archiveDocumentAction={archiveDocumentFromMenu}
          />
        );
      }

      const isExpanded = expandedFolderIds.has(item.folder.id);
      const menuId = `folder:${item.folder.id}`;
      const hasChildren = hasTreeChildren(folders, documents, item.folder.id);
      const trashSummary = getFolderTrashSummary({
        folderId: item.folder.id,
        folders,
        documents,
        folderDocumentCounts,
        selectedFolderId,
        selectedDocumentId,
      });

      return (
        <div key={item.folder.id}>
          <FolderToggleRow
            folder={item.folder}
            expanded={isExpanded}
            selected={item.folder.id === selectedFolderId}
            canWrite={canWrite}
            renameFolderAction={renameFolderFromMenu}
            archiveFolderAction={archiveFolderFromMenu}
            trashSummary={trashSummary}
            isFavorite={favoriteFolderIds.has(item.folder.id)}
            isRenaming={renamingFolderId === item.folder.id}
            pendingCreateAction={pendingFolderCreateAction}
            openMenuId={openMenuId}
            menuPlacement={menuPlacement(menuId)}
            onOpenMenu={openActionMenu}
            onStartRename={startFolderRename}
            onCancelRename={() => setRenamingFolderId(null)}
            onAddFolder={addFolderChild}
            onAddDocument={addFolderDocument}
            onToggleFavorite={toggleFavoriteFolder}
            onToggle={() => {
              setOpenMenuId(null);
              toggleFolder(item.folder.id);
            }}
          />
          {isExpanded && hasChildren ? (
            <div className="ml-3 border-l border-slate-200 pl-2">
              {renderTreeItems(item.folder.id)}
            </div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <>
      <div>
        {activePanel === "search" ? (
          <SearchPanel
            workspaceSlug={workspaceSlug}
            documents={searchResults}
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            selectedDocumentId={selectedDocumentId}
            favoriteDocumentIds={favoriteDocumentIds}
            openMenuId={openMenuId}
            menuPlacements={menuPlacements}
            onOpenMenu={openActionMenu}
            onToggleFavorite={toggleFavoriteDocument}
            onOpenInNewTab={openDocumentRowInNewTab}
            archiveDocumentAction={archiveDocumentFromMenu}
          />
        ) : null}
        {activePanel === "favorites" ? (
          <FavoriteSection
            workspaceSlug={workspaceSlug}
            folders={favoriteFolders}
            documents={favoriteDocuments}
            favoriteDocumentIds={favoriteDocumentIds}
            selectedDocumentId={selectedDocumentId}
            openMenuId={openMenuId}
            menuPlacements={menuPlacements}
            onOpenMenu={openActionMenu}
            onToggleFavorite={toggleFavoriteDocument}
            onToggleFavoriteFolder={toggleFavoriteFolder}
            onOpenInNewTab={openDocumentRowInNewTab}
            archiveDocumentAction={archiveDocumentFromMenu}
          />
        ) : null}
        {activePanel === "documents" ? (
          <>
            <DocumentSection
              title={t("nav.recents")}
              workspaceSlug={workspaceSlug}
              documents={recentDocuments}
              menuScope="recent-document"
              favoriteDocumentIds={favoriteDocumentIds}
              selectedDocumentId={selectedDocumentId}
              showDescription={false}
              openMenuId={openMenuId}
              menuPlacements={menuPlacements}
              onOpenMenu={openActionMenu}
              onToggleFavorite={toggleFavoriteDocument}
              onOpenInNewTab={openDocumentRowInNewTab}
              archiveDocumentAction={archiveDocumentFromMenu}
            />
            <nav className="space-y-1" aria-label={t("nav.allDocuments")}>
              <p className={sectionHeadingClassName}>{t("nav.documents")}</p>
              {documents.length === 0 && folders.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
                  {t("nav.noDocuments")}
                </p>
              ) : null}
              {renderTreeItems(null)}
            </nav>
          </>
        ) : null}
      </div>
    </>
  );
}

function uniqueDocumentId(documentId: string, index: number, documentIds: string[]) {
  return documentIds.indexOf(documentId) === index;
}

function folderErrorMessage(
  folderError: string,
  t: (key: MessageKey) => string,
) {
  if (!folderError) return "";
  if (folderError === "FOLDER_NOT_EMPTY") return t("nav.folderError.notEmpty");
  if (folderError === "FOLDER_NAME_REQUIRED") return t("nav.folderError.nameRequired");
  return t("nav.folderError.generic");
}

function parseTagSearchQuery(query: string) {
  const match = query.match(/^tag:\s*#?(.+)$/i);
  if (!match) return null;

  return normalizeTagName(match[1] ?? "");
}

function normalizeTagName(tagName: string) {
  return tagName.trim().replace(/^#/, "").toLowerCase();
}

function parseRecentDocumentIds(raw: string | null) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((documentId): documentId is string => typeof documentId === "string");
  } catch {
    return [];
  }
}

function filterReadableRecentDocumentIds(
  documentIds: string[],
  documentsById: Map<string, DocumentListItem>,
) {
  const seenDocumentIds = new Set<string>();
  const readableDocumentIds: string[] = [];

  for (const documentId of documentIds) {
    if (seenDocumentIds.has(documentId)) continue;
    if (!documentsById.has(documentId)) continue;

    seenDocumentIds.add(documentId);
    readableDocumentIds.push(documentId);
    if (readableDocumentIds.length === maxRecentDocuments) break;
  }

  return readableDocumentIds;
}

function areDocumentIdsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((documentId, index) => documentId === right[index])
  );
}
