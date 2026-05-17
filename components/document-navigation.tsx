"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import {
  emptyFavorites,
  parseFavorites,
  toggleListValue,
} from "@/components/document-navigation/favorites";
import { buildTreeItems, hasTreeChildren } from "@/components/document-navigation/tree";
import type {
  ArchiveDocumentResult,
  ArchiveFolderResult,
  FavoriteState,
  RenameFolderResult,
} from "@/components/document-navigation/types";
import { openDocumentInNewTab } from "@/components/use-document-tabs";
import { documentDisplayLabel } from "@/lib/workspace-tree";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

const folderErrorToastId = "folder-trash-error";
const folderErrorToastClassName =
  "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg";
const sectionHeadingClassName =
  "mb-2 text-[0.68rem] font-medium uppercase tracking-wide text-slate-500";

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
  createAction: (formData: FormData) => Promise<void>;
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
            createAction={createAction}
            renameFolderAction={renameFolderFromMenu}
            archiveFolderAction={archiveFolderFromMenu}
            isFavorite={favoriteFolderIds.has(item.folder.id)}
            isRenaming={renamingFolderId === item.folder.id}
            openMenuId={openMenuId}
            onOpenMenu={setOpenMenuId}
            onStartRename={startFolderRename}
            onCancelRename={() => setRenamingFolderId(null)}
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

function SearchPanel({
  workspaceSlug,
  documents,
  query,
  onQueryChange,
  selectedDocumentId,
  favoriteDocumentIds,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
  onOpenInNewTab,
  archiveDocumentAction,
}: {
  workspaceSlug: string;
  documents: DocumentListItem[];
  query: string;
  onQueryChange: (query: string) => void;
  selectedDocumentId: string | null;
  favoriteDocumentIds: Set<string>;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
  onOpenInNewTab: (document: DocumentListItem) => void;
  archiveDocumentAction: (formData: FormData) => Promise<void>;
}) {
  const resultLabel = `${documents.length} ${documents.length === 1 ? "result" : "results"}`;

  return (
    <section className="space-y-3" aria-label="Search results">
      <div className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 shadow-sm focus-within:border-ink">
        <label className="sr-only" htmlFor="document-list-search">
          Search documents
        </label>
        <input
          id="document-list-search"
          autoFocus
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search documents"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      <p className="text-[0.68rem] font-medium text-slate-400">{resultLabel}</p>
      <div className="space-y-1">
        {documents.map((document) => (
          <SearchResultRow
            key={`search-${document.id}`}
            rowId={`search-document:${document.id}`}
            workspaceSlug={workspaceSlug}
            document={document}
            isFavorite={favoriteDocumentIds.has(document.id)}
            selected={document.id === selectedDocumentId}
            openMenuId={openMenuId}
            onOpenMenu={onOpenMenu}
            onToggleFavorite={onToggleFavorite}
            onOpenInNewTab={onOpenInNewTab}
            archiveDocumentAction={archiveDocumentAction}
          />
        ))}
        {documents.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
            No documents found.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SearchResultRow({
  rowId,
  workspaceSlug,
  document,
  isFavorite,
  selected,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
  onOpenInNewTab,
  archiveDocumentAction,
}: {
  rowId: string;
  workspaceSlug: string;
  document: DocumentListItem;
  isFavorite: boolean;
  selected: boolean;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
  onOpenInNewTab: (document: DocumentListItem) => void;
  archiveDocumentAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <DocumentLinkRow
      rowId={rowId}
      workspaceSlug={workspaceSlug}
      document={document}
      isFavorite={isFavorite}
      selected={selected}
      description={document.path}
      openMenuId={openMenuId}
      onOpenMenu={onOpenMenu}
      onToggleFavorite={onToggleFavorite}
      onOpenInNewTab={onOpenInNewTab}
      archiveDocumentAction={archiveDocumentAction}
    />
  );
}

function FavoriteSection({
  workspaceSlug,
  folders,
  documents,
  favoriteDocumentIds,
  selectedDocumentId,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
  onToggleFavoriteFolder,
  onOpenInNewTab,
  archiveDocumentAction,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  favoriteDocumentIds: Set<string>;
  selectedDocumentId: string | null;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
  onToggleFavoriteFolder: (folderId: string) => void;
  onOpenInNewTab: (document: DocumentListItem) => void;
  archiveDocumentAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="mb-4">
      <p className={sectionHeadingClassName}>Favorites</p>
      <div className="space-y-1">
        {folders.length === 0 && documents.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
            No favorites yet.
          </p>
        ) : null}
        {folders.map((folder) => (
          <FavoriteFolderRow
            key={`Favorites-folder-${folder.id}`}
            rowId={`favorite-folder:${folder.id}`}
            workspaceSlug={workspaceSlug}
            folder={folder}
            openMenuId={openMenuId}
            onOpenMenu={onOpenMenu}
            onToggleFavorite={onToggleFavoriteFolder}
          />
        ))}
        {documents.map((document) => (
          <DocumentLinkRow
            key={`Favorites-${document.id}`}
            rowId={`favorite-document:${document.id}`}
            workspaceSlug={workspaceSlug}
            document={document}
            isFavorite={favoriteDocumentIds.has(document.id)}
            selected={document.id === selectedDocumentId}
            openMenuId={openMenuId}
            onOpenMenu={onOpenMenu}
            onToggleFavorite={onToggleFavorite}
            onOpenInNewTab={onOpenInNewTab}
            archiveDocumentAction={archiveDocumentAction}
          />
        ))}
      </div>
    </section>
  );
}

function DocumentSection({
  title,
  workspaceSlug,
  documents,
  menuScope,
  favoriteDocumentIds,
  selectedDocumentId,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
  onOpenInNewTab,
  archiveDocumentAction,
}: {
  title: string;
  workspaceSlug: string;
  documents: DocumentListItem[];
  menuScope: string;
  favoriteDocumentIds: Set<string>;
  selectedDocumentId: string | null;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
  onOpenInNewTab: (document: DocumentListItem) => void;
  archiveDocumentAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="mb-4">
      <p className={sectionHeadingClassName}>{title}</p>
      <div className="space-y-1">
        {documents.map((document) => (
          <DocumentLinkRow
            key={`${title}-${document.id}`}
            rowId={`${menuScope}:${document.id}`}
            workspaceSlug={workspaceSlug}
            document={document}
            isFavorite={favoriteDocumentIds.has(document.id)}
            selected={document.id === selectedDocumentId}
            openMenuId={openMenuId}
            onOpenMenu={onOpenMenu}
            onToggleFavorite={onToggleFavorite}
            onOpenInNewTab={onOpenInNewTab}
            archiveDocumentAction={archiveDocumentAction}
          />
        ))}
      </div>
    </section>
  );
}

function DocumentLinkRow({
  rowId,
  workspaceSlug,
  document,
  isFavorite,
  selected,
  description,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
  onOpenInNewTab,
  archiveDocumentAction,
}: {
  rowId: string;
  workspaceSlug: string;
  document: DocumentListItem;
  isFavorite: boolean;
  selected: boolean;
  description?: string;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
  onOpenInNewTab: (document: DocumentListItem) => void;
  archiveDocumentAction: (formData: FormData) => Promise<void>;
}) {
  const menuId = rowId;
  const isMenuOpen = openMenuId === menuId;
  const displayLabel = documentDisplayLabel(document);
  const rowClassName = selected
    ? "group relative flex items-start gap-1 rounded-md bg-slate-200 focus-within:bg-slate-200"
    : "group relative flex items-start gap-1 rounded-md hover:bg-slate-200 focus-within:bg-slate-200";

  return (
    <div className={rowClassName}>
      <Link
        href={workspaceDocumentHref({ workspaceSlug, documentId: document.id })}
        onClick={() => onOpenMenu(null)}
        className="min-w-0 flex-1 px-2 py-1.5 text-[13px]"
      >
        <span className="block truncate">{documentDisplayLabel(document)}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{description}</span>
        ) : null}
      </Link>
      <button
        type="button"
        aria-label={`Open actions for ${displayLabel}`}
        aria-expanded={isMenuOpen}
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenu(isMenuOpen ? null : menuId);
        }}
        data-row-action-menu
        className={`mt-1 rounded p-1 text-slate-500 hover:bg-white hover:text-ink focus:bg-white focus:text-ink ${
          isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {isMenuOpen ? (
        <div
          role="menu"
          data-row-action-menu
          className="absolute right-0 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleFavorite(document.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenInNewTab(document)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            Open in new tab
          </button>
          <form action={archiveDocumentAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <button
              type="submit"
              role="menuitem"
              hidden={!document.canWrite}
              className="block w-full rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50"
            >
              Move to trash
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function FavoriteFolderRow({
  rowId,
  workspaceSlug,
  folder,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
}: {
  rowId: string;
  workspaceSlug: string;
  folder: FolderListItem;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (folderId: string) => void;
}) {
  const isMenuOpen = openMenuId === rowId;
  const displayLabel = folderDisplayLabel(folder);

  return (
    <div className="group relative flex items-start gap-1 rounded-md hover:bg-slate-200 focus-within:bg-slate-200">
      <Link
        href={`/workspaces/${workspaceSlug}?folder=${folder.id}`}
        onClick={() => onOpenMenu(null)}
        className="min-w-0 flex-1 px-2 py-1.5 text-[13px]"
      >
        <span className="block truncate">{folder.name}</span>
        <span className="mt-1 block truncate text-[11px] text-slate-500">{folder.path}</span>
      </Link>
      <button
        type="button"
        aria-label={`Open actions for ${displayLabel}`}
        aria-expanded={isMenuOpen}
        onClick={() => onOpenMenu(isMenuOpen ? null : rowId)}
        data-row-action-menu
        className={`mt-1 rounded p-1 text-slate-500 hover:bg-white hover:text-ink focus:bg-white focus:text-ink ${
          isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {isMenuOpen ? (
        <div
          role="menu"
          data-row-action-menu
          className="absolute right-0 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleFavorite(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            Remove from favorites
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FolderToggleRow({
  folder,
  expanded,
  selected,
  canWrite,
  createAction,
  renameFolderAction,
  archiveFolderAction,
  isFavorite,
  isRenaming,
  openMenuId,
  onOpenMenu,
  onStartRename,
  onCancelRename,
  onToggleFavorite,
  onToggle,
}: {
  folder: FolderListItem;
  expanded: boolean;
  selected: boolean;
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  isFavorite: boolean;
  isRenaming: boolean;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onStartRename: (folderId: string) => void;
  onCancelRename: () => void;
  onToggleFavorite: (folderId: string) => void;
  onToggle: () => void;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const menuId = `folder:${folder.id}`;
  const isMenuOpen = openMenuId === menuId;
  const displayLabel = folderDisplayLabel(folder);
  const rowClassName = selected
    ? "group relative flex w-full items-center gap-1 rounded-md bg-slate-200 px-2 py-1.5 text-left text-[13px] font-medium focus-within:bg-slate-200"
    : "group relative flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-slate-200 focus-within:bg-slate-200";

  if (isRenaming) {
    const renameInputId = `rename-folder-${folder.id}`;

    return (
      <form
        action={renameFolderAction}
        className={rowClassName}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancelRename();
        }}
        data-row-action-menu
      >
        <input type="hidden" name="folderId" value={folder.id} />
        <label className="sr-only" htmlFor={renameInputId}>
          Rename {displayLabel}
        </label>
        <input
          id={renameInputId}
          name="name"
          defaultValue={folder.name}
          required
          autoFocus
          className="min-w-0 flex-1 rounded border border-border bg-white px-2 py-1 text-[13px] outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="rounded px-2 py-1 text-xs font-medium text-ink hover:bg-muted"
        >
          Rename
        </button>
      </form>
    );
  }

  return (
    <div className={rowClassName}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left"
      >
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="min-w-0 truncate">{folder.name}</span>
      </button>
      <div
        className={`flex items-center gap-0.5 ${
          isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <form action={createAction}>
          <input type="hidden" name="folderId" value={folder.id} />
          <button
            type="submit"
            disabled={!canWrite}
            aria-label={`New document in ${displayLabel}`}
            className="rounded p-1 text-slate-500 hover:bg-white hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        <button
          type="button"
          aria-label={`Open actions for ${displayLabel}`}
          aria-expanded={isMenuOpen}
          onClick={() => onOpenMenu(isMenuOpen ? null : menuId)}
          data-row-action-menu
          className="rounded p-1 text-slate-500 hover:bg-white hover:text-ink focus:bg-white focus:text-ink"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {isMenuOpen ? (
        <div
          role="menu"
          data-row-action-menu
          className="absolute right-0 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canWrite}
            onClick={() => onStartRename(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            Rename
          </button>
          <form action={archiveFolderAction}>
            <input type="hidden" name="folderId" value={folder.id} />
            <button
              type="submit"
              role="menuitem"
              disabled={!canWrite}
              onClick={(event) => {
                if (!window.confirm("Move this folder to trash?")) {
                  event.preventDefault();
                }
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Move to trash
            </button>
          </form>
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleFavorite(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function folderDisplayLabel(folder: Pick<FolderListItem, "name" | "path">) {
  return `${folder.name} ${folder.path}`;
}

function folderErrorMessage(folderError: string) {
  if (!folderError) return "";
  if (folderError === "FOLDER_NOT_EMPTY") return "Empty this folder before moving it to trash.";
  if (folderError === "FOLDER_NAME_REQUIRED") return "Folder name is required.";
  return "The folder action could not be completed.";
}
