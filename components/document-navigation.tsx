"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import { documentDisplayLabel } from "@/lib/workspace-tree";

type FavoriteState = { documents: string[]; folders: string[] };

const emptyFavorites: FavoriteState = { documents: [], folders: [] };

export function DocumentNavigation({
  workspaceSlug,
  folders,
  documents,
  selectedFolderId,
  searchQuery,
  canWrite,
  createAction,
  renameFolderAction,
  archiveFolderAction,
  folderError,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  selectedFolderId: string | null;
  searchQuery: string;
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  folderError: string;
}) {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState("");
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
  const folderErrorText = folderErrorMessage(folderError);
  const switcherResults = useMemo(() => {
    const query = switcherQuery.toLowerCase().trim();
    if (!query) return documents.slice(0, 8);
    return documents
      .filter(
        (document) =>
          document.title.toLowerCase().includes(query) ||
          document.contentText.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [documents, switcherQuery]);

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
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSwitcherOpen(true);
      }
      if (event.key === "Escape") {
        setIsSwitcherOpen(false);
        setOpenMenuId(null);
        setRenamingFolderId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleFavoriteDocument(documentId: string) {
    setFavorites((current) => ({
      ...current,
      documents: toggleListValue(current.documents, documentId),
    }));
    setOpenMenuId(null);
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
            searchQuery={searchQuery}
            openMenuId={openMenuId}
            onOpenMenu={setOpenMenuId}
            onToggleFavorite={toggleFavoriteDocument}
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
            renameFolderAction={renameFolderAction}
            archiveFolderAction={archiveFolderAction}
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
      <button
        type="button"
        onClick={() => {
          setOpenMenuId(null);
          setIsSwitcherOpen(true);
        }}
        className="mb-4 flex h-9 w-full items-center justify-between rounded-md border border-border bg-white px-3 text-sm text-slate-500 hover:bg-muted"
      >
        <span className="inline-flex items-center gap-2">
          <Search className="h-4 w-4" aria-hidden="true" />
          Quick switcher
        </span>
        <span className="text-xs">Ctrl K</span>
      </button>
      {folderErrorText ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {folderErrorText}
        </p>
      ) : null}
      {favoriteDocuments.length > 0 || favoriteFolders.length > 0 ? (
        <FavoriteSection
          workspaceSlug={workspaceSlug}
          folders={favoriteFolders}
          documents={favoriteDocuments}
          favoriteDocumentIds={favoriteDocumentIds}
          searchQuery={searchQuery}
          openMenuId={openMenuId}
          onOpenMenu={setOpenMenuId}
          onToggleFavorite={toggleFavoriteDocument}
        />
      ) : null}
      {!searchQuery ? (
        <DocumentSection
          title="Recents"
          workspaceSlug={workspaceSlug}
          documents={recentDocuments}
          menuScope="recent-document"
          favoriteDocumentIds={favoriteDocumentIds}
          searchQuery={searchQuery}
          openMenuId={openMenuId}
          onOpenMenu={setOpenMenuId}
          onToggleFavorite={toggleFavoriteDocument}
        />
      ) : null}
      <nav className="space-y-1" aria-label={searchQuery ? "Search results" : "All documents"}>
        {!searchQuery ? (
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Documents
          </p>
        ) : null}
        {documents.length === 0 && (searchQuery || folders.length === 0) ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
            No documents found.
          </p>
        ) : null}
        {searchQuery
          ? documents.map((document) => (
              <DocumentLinkRow
                key={document.id}
                rowId={`search-document:${document.id}`}
                workspaceSlug={workspaceSlug}
                document={document}
                isFavorite={favoriteDocumentIds.has(document.id)}
                searchQuery={searchQuery}
                openMenuId={openMenuId}
                onOpenMenu={setOpenMenuId}
                onToggleFavorite={toggleFavoriteDocument}
              />
            ))
          : renderTreeItems(null)}
      </nav>
      {isSwitcherOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/20 p-6" role="dialog" aria-modal="true">
          <div className="mx-auto mt-20 max-w-xl overflow-hidden rounded-md border border-border bg-white shadow-xl">
            <div className="border-b border-border p-3">
              <label className="sr-only" htmlFor="quick-switcher-input">
                Quick switcher search
              </label>
              <input
                id="quick-switcher-input"
                autoFocus
                value={switcherQuery}
                onChange={(event) => setSwitcherQuery(event.target.value)}
                placeholder="Jump to document"
                className="h-10 w-full rounded-md border border-border px-3 text-sm outline-none focus:border-ink"
              />
            </div>
            <div className="max-h-80 overflow-auto p-2">
              {switcherResults.map((document) => (
                <Link
                  key={document.id}
                  href={`/workspaces/${workspaceSlug}?document=${document.id}`}
                  onClick={() => setIsSwitcherOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="block truncate">{document.title}</span>
                  <span className="block truncate text-xs text-slate-500">{document.path}</span>
                </Link>
              ))}
              {switcherResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">No documents found.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function FavoriteSection({
  workspaceSlug,
  folders,
  documents,
  favoriteDocumentIds,
  searchQuery,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  favoriteDocumentIds: Set<string>;
  searchQuery: string;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
}) {
  return (
    <section className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Favorites</p>
      <div className="space-y-1">
        {folders.map((folder) => (
          <Link
            key={`Favorites-folder-${folder.id}`}
            href={`/workspaces/${workspaceSlug}?folder=${folder.id}`}
            onClick={() => onOpenMenu(null)}
            className="block rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            <span className="block truncate">{folder.name}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{folder.path}</span>
          </Link>
        ))}
        {documents.map((document) => (
          <DocumentLinkRow
            key={`Favorites-${document.id}`}
            rowId={`favorite-document:${document.id}`}
            workspaceSlug={workspaceSlug}
            document={document}
            isFavorite={favoriteDocumentIds.has(document.id)}
            searchQuery={searchQuery}
            openMenuId={openMenuId}
            onOpenMenu={onOpenMenu}
            onToggleFavorite={onToggleFavorite}
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
  searchQuery,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
}: {
  title: string;
  workspaceSlug: string;
  documents: DocumentListItem[];
  menuScope: string;
  favoriteDocumentIds: Set<string>;
  searchQuery: string;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
}) {
  return (
    <section className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-1">
        {documents.map((document) => (
          <DocumentLinkRow
            key={`${title}-${document.id}`}
            rowId={`${menuScope}:${document.id}`}
            workspaceSlug={workspaceSlug}
            document={document}
            isFavorite={favoriteDocumentIds.has(document.id)}
            searchQuery={searchQuery}
            openMenuId={openMenuId}
            onOpenMenu={onOpenMenu}
            onToggleFavorite={onToggleFavorite}
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
  searchQuery,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
}: {
  rowId: string;
  workspaceSlug: string;
  document: DocumentListItem;
  isFavorite: boolean;
  searchQuery: string;
  openMenuId: string | null;
  onOpenMenu: (menuId: string | null) => void;
  onToggleFavorite: (documentId: string) => void;
}) {
  const menuId = rowId;
  const isMenuOpen = openMenuId === menuId;

  return (
    <div className="group relative flex items-start gap-1 rounded-md hover:bg-muted focus-within:bg-muted">
      <Link
        href={`/workspaces/${workspaceSlug}?document=${document.id}${
          searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""
        }`}
        onClick={() => onOpenMenu(null)}
        className="min-w-0 flex-1 px-2 py-2 text-sm"
      >
        <span className="block truncate">{documentDisplayLabel(document)}</span>
        {searchQuery ? (
          <span className="mt-1 block truncate text-xs text-slate-500">{document.path}</span>
        ) : null}
      </Link>
      <button
        type="button"
        aria-label={`Open actions for ${document.title}`}
        aria-expanded={isMenuOpen}
        onClick={() => onOpenMenu(isMenuOpen ? null : menuId)}
        className={`mt-1 rounded p-1 text-slate-500 hover:bg-white hover:text-ink focus:bg-white focus:text-ink ${
          isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-sm shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleFavorite(document.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {isFavorite ? "Remove from favorites" : "Add to favorites"}
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
  const rowClassName = selected
    ? "group relative flex w-full items-center gap-1 rounded-md bg-white px-2 py-1.5 text-left text-sm font-medium shadow-sm focus-within:bg-white"
    : "group relative flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-within:bg-muted";

  if (isRenaming) {
    const renameInputId = `rename-folder-${folder.id}`;

    return (
      <form
        action={renameFolderAction}
        className={rowClassName}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancelRename();
        }}
      >
        <input type="hidden" name="folderId" value={folder.id} />
        <label className="sr-only" htmlFor={renameInputId}>
          Rename {folder.name}
        </label>
        <input
          id={renameInputId}
          name="name"
          defaultValue={folder.name}
          required
          autoFocus
          className="min-w-0 flex-1 rounded border border-border bg-white px-2 py-1 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="rounded px-2 py-1 text-xs font-medium text-ink hover:bg-muted"
        >
          Save
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
          <input type="hidden" name="template" value="blank" />
          <button
            type="submit"
            disabled={!canWrite}
            aria-label={`New document in ${folder.name}`}
            className="rounded p-1 text-slate-500 hover:bg-white hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        <button
          type="button"
          aria-label={`Open actions for ${folder.name}`}
          aria-expanded={isMenuOpen}
          onClick={() => onOpenMenu(isMenuOpen ? null : menuId)}
          className="rounded p-1 text-slate-500 hover:bg-white hover:text-ink focus:bg-white focus:text-ink"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-sm shadow-lg"
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

type TreeRow =
  | { kind: "folder"; folder: FolderListItem }
  | { kind: "document"; document: DocumentListItem };

function buildTreeItems(
  folders: FolderListItem[],
  documents: DocumentListItem[],
  parentFolderId: string | null,
): TreeRow[] {
  return [
    ...folders
      .filter((folder) => folder.parentFolderId === parentFolderId)
      .map((folder) => ({ kind: "folder" as const, folder })),
    ...documents
      .filter((document) => document.folderId === parentFolderId)
      .map((document) => ({ kind: "document" as const, document })),
  ].sort((left, right) => {
    const leftPath = left.kind === "folder" ? left.folder.path : left.document.path;
    const rightPath = right.kind === "folder" ? right.folder.path : right.document.path;
    return leftPath.localeCompare(rightPath);
  });
}

function hasTreeChildren(
  folders: FolderListItem[],
  documents: DocumentListItem[],
  folderId: string,
) {
  return (
    folders.some((folder) => folder.parentFolderId === folderId) ||
    documents.some((document) => document.folderId === folderId)
  );
}

function parseFavorites(raw: string | null): FavoriteState {
  if (!raw) return emptyFavorites;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { documents: parsed.filter(isString), folders: [] };
    if (!parsed || typeof parsed !== "object") return emptyFavorites;

    const value = parsed as Partial<Record<keyof FavoriteState, unknown>>;
    return {
      documents: Array.isArray(value.documents) ? value.documents.filter(isString) : [],
      folders: Array.isArray(value.folders) ? value.folders.filter(isString) : [],
    };
  } catch {
    return emptyFavorites;
  }
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function folderErrorMessage(folderError: string) {
  if (!folderError) return "";
  if (folderError === "FOLDER_NOT_EMPTY") return "Empty this folder before moving it to trash.";
  if (folderError === "FOLDER_NAME_REQUIRED") return "Folder name is required.";
  return "The folder action could not be completed.";
}
