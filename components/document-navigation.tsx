"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { DocumentListItem, FolderListItem } from "@/components/document-list";
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
import { SearchPanel } from "@/components/document-navigation/search-panel";
import { buildTreeItems, hasTreeChildren } from "@/components/document-navigation/tree";
import type {
  ArchiveDocumentResult,
  ArchiveFolderResult,
  CreateDocumentAction,
  CreateFolderAction,
  FavoriteState,
  RenameFolderResult,
} from "@/components/document-navigation/types";
import { openDocumentInNewTab } from "@/components/use-document-tabs";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

const folderErrorToastId = "folder-trash-error";
const folderErrorToastClassName =
  "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg";

export function DocumentNavigation({
  workspaceSlug,
  folders,
  documents,
  activePanel,
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
  activePanel: "documents" | "search" | "favorites";
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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [favorites, setFavorites] = useState<FavoriteState>(emptyFavorites);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [pendingFolderCreateAction, setPendingFolderCreateAction] = useState<string | null>(
    null,
  );
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(folders.map((folder) => folder.id)),
  );

  const favoriteDocumentIds = useMemo(
    () => new Set(favorites.documents),
    [favorites.documents],
  );
  const favoriteFolderIds = useMemo(() => new Set(favorites.folders), [favorites.folders]);
  const favoriteDocuments = documents.filter((document) => favoriteDocumentIds.has(document.id));
  const favoriteFolders = folders.filter((folder) => favoriteFolderIds.has(folder.id));
  const recentDocuments = documents
    .filter((document) => !favoriteDocumentIds.has(document.id))
    .slice(0, 5);
  const searchResults = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return documents;
    return documents.filter(
      (document) =>
        document.title.toLowerCase().includes(query) ||
        document.path.toLowerCase().includes(query) ||
        document.contentText.toLowerCase().includes(query),
    );
  }, [documents, searchQuery]);
  const folderErrorText = folderErrorMessage(folderError);
  useEffect(() => {
    const raw = window.localStorage.getItem(`munjib:favorites:${workspaceSlug}`);
    setFavorites(parseFavorites(raw));
  }, [workspaceSlug]);

  useEffect(() => {
    window.localStorage.setItem(`munjib:favorites:${workspaceSlug}`, JSON.stringify(favorites));
  }, [favorites, workspaceSlug]);

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
        if (activePanel !== "documents") {
          onOpenDocuments();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, onOpenDocuments, onOpenSearch]);

  function toggleFavoriteDocument(documentId: string) {
    setFavorites((current) => ({
      ...current,
      documents: toggleListValue(current.documents, documentId),
    }));
    setOpenMenuId(null);
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
      startTransition(() => {
        if (result?.folderId) {
          router.push(`/workspaces/${workspaceSlug}?folder=${result.folderId}`);
          return;
        }
        router.refresh();
      });
    } finally {
      setPendingFolderCreateAction(null);
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
      startTransition(() => {
        if (result?.documentId) {
          router.push(workspaceDocumentHref({ workspaceSlug, documentId: result.documentId }));
          return;
        }
        router.refresh();
      });
    } finally {
      setPendingFolderCreateAction(null);
    }
  }

  async function archiveFolderFromMenu(formData: FormData) {
    const result = await archiveFolderAction(formData);
    if (result.error) {
      setOpenMenuId(null);
      toast(folderErrorMessage(result.error), {
        id: folderErrorToastId,
        className: folderErrorToastClassName,
        unstyled: true,
      });
      return;
    }

    setOpenMenuId(null);
    startTransition(() => {
      if (result.folderId === selectedFolderId) {
        router.push(`/workspaces/${workspaceSlug}`);
        return;
      }
      router.refresh();
    });
  }

  async function renameFolderFromMenu(formData: FormData) {
    const result = await renameFolderAction(formData);
    if (result.error) {
      toast(folderErrorMessage(result.error), {
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
        return (
          <DocumentLinkRow
            key={item.document.id}
            rowId={`tree-document:${item.document.id}`}
            workspaceSlug={workspaceSlug}
            document={item.document}
            isFavorite={favoriteDocumentIds.has(item.document.id)}
            selected={item.document.id === selectedDocumentId}
            openMenuId={openMenuId}
            onOpenMenu={setOpenMenuId}
            onToggleFavorite={toggleFavoriteDocument}
            onOpenInNewTab={openDocumentRowInNewTab}
            archiveDocumentAction={archiveDocumentFromMenu}
          />
        );
      }

      const isExpanded = expandedFolderIds.has(item.folder.id);
      const hasChildren = hasTreeChildren(folders, documents, item.folder.id);

      return (
        <div key={item.folder.id}>
          <FolderToggleRow
            folder={item.folder}
            expanded={isExpanded}
            selected={item.folder.id === selectedFolderId}
            canWrite={canWrite}
            renameFolderAction={renameFolderFromMenu}
            archiveFolderAction={archiveFolderFromMenu}
            isFavorite={favoriteFolderIds.has(item.folder.id)}
            isRenaming={renamingFolderId === item.folder.id}
            pendingCreateAction={pendingFolderCreateAction}
            openMenuId={openMenuId}
            onOpenMenu={setOpenMenuId}
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
            onOpenMenu={setOpenMenuId}
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
            onOpenMenu={setOpenMenuId}
            onToggleFavorite={toggleFavoriteDocument}
            onToggleFavoriteFolder={toggleFavoriteFolder}
            onOpenInNewTab={openDocumentRowInNewTab}
            archiveDocumentAction={archiveDocumentFromMenu}
          />
        ) : null}
        {activePanel === "documents" ? (
          <>
            <DocumentSection
              title="Recents"
              workspaceSlug={workspaceSlug}
              documents={recentDocuments}
              menuScope="recent-document"
              favoriteDocumentIds={favoriteDocumentIds}
              selectedDocumentId={selectedDocumentId}
              openMenuId={openMenuId}
              onOpenMenu={setOpenMenuId}
              onToggleFavorite={toggleFavoriteDocument}
              onOpenInNewTab={openDocumentRowInNewTab}
              archiveDocumentAction={archiveDocumentFromMenu}
            />
            <nav className="space-y-1" aria-label="All documents">
              <p className={sectionHeadingClassName}>Documents</p>
              {documents.length === 0 && folders.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
                  No documents found.
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

function folderErrorMessage(folderError: string) {
  if (!folderError) return "";
  if (folderError === "FOLDER_NOT_EMPTY") return "Empty this folder before moving it to trash.";
  if (folderError === "FOLDER_NAME_REQUIRED") return "Folder name is required.";
  return "The folder action could not be completed.";
}
