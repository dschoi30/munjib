"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import { openDocumentInNewTab } from "@/components/use-document-tabs";
import { documentDisplayLabel } from "@/lib/workspace-tree";

type FavoriteState = { documents: string[]; folders: string[] };

const emptyFavorites: FavoriteState = { documents: [], folders: [] };
const folderErrorToastId = "folder-trash-error";
const folderErrorToastClassName =
  "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg";
const sectionHeadingClassName =
  "mb-2 text-[0.68rem] font-medium uppercase tracking-wide text-slate-500";
type RenameFolderResult = { folderId: string; error?: string };
type ArchiveFolderResult = { folderId: string; error?: string };
type ArchiveDocumentResult = { documentId: string };

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
  archiveDocumentAction,
  folderError,
  selectedDocumentId,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  selectedFolderId: string | null;
  searchQuery: string;
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
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-row-action-menu]")) return;
      setOpenMenuId(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

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

  function openDocumentRowInNewTab(document: DocumentListItem) {
    openDocumentInNewTab(workspaceSlug, {
      id: document.id,
      title: document.title,
      path: document.path,
    });
    setOpenMenuId(null);
    router.push(`/workspaces/${workspaceSlug}?document=${document.id}`);
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
            searchQuery={searchQuery}
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
      {favoriteDocuments.length > 0 || favoriteFolders.length > 0 ? (
        <FavoriteSection
          workspaceSlug={workspaceSlug}
          folders={favoriteFolders}
          documents={favoriteDocuments}
          favoriteDocumentIds={favoriteDocumentIds}
          selectedDocumentId={selectedDocumentId}
          searchQuery={searchQuery}
          openMenuId={openMenuId}
          onOpenMenu={setOpenMenuId}
          onToggleFavorite={toggleFavoriteDocument}
          onToggleFavoriteFolder={toggleFavoriteFolder}
          onOpenInNewTab={openDocumentRowInNewTab}
          archiveDocumentAction={archiveDocumentFromMenu}
        />
      ) : null}
      {!searchQuery ? (
        <DocumentSection
          title="Recents"
          workspaceSlug={workspaceSlug}
          documents={recentDocuments}
          menuScope="recent-document"
          favoriteDocumentIds={favoriteDocumentIds}
          selectedDocumentId={selectedDocumentId}
          searchQuery={searchQuery}
          openMenuId={openMenuId}
          onOpenMenu={setOpenMenuId}
          onToggleFavorite={toggleFavoriteDocument}
          onOpenInNewTab={openDocumentRowInNewTab}
          archiveDocumentAction={archiveDocumentFromMenu}
        />
      ) : null}
      <nav className="space-y-1" aria-label={searchQuery ? "Search results" : "All documents"}>
        {!searchQuery ? (
          <p className={sectionHeadingClassName}>Documents</p>
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
                selected={document.id === selectedDocumentId}
                searchQuery={searchQuery}
                openMenuId={openMenuId}
                onOpenMenu={setOpenMenuId}
                onToggleFavorite={toggleFavoriteDocument}
                onOpenInNewTab={openDocumentRowInNewTab}
                archiveDocumentAction={archiveDocumentFromMenu}
              />
            ))
          : renderTreeItems(null)}
      </nav>
      </div>
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
  selectedDocumentId,
  searchQuery,
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
  searchQuery: string;
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
            searchQuery={searchQuery}
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
  searchQuery,
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
  searchQuery: string;
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
            searchQuery={searchQuery}
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
  searchQuery,
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
  searchQuery: string;
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
    ? "group relative flex items-start gap-1 rounded-md bg-white shadow-sm focus-within:bg-white"
    : "group relative flex items-start gap-1 rounded-md hover:bg-muted focus-within:bg-muted";

  return (
    <div className={rowClassName}>
      <Link
        href={`/workspaces/${workspaceSlug}?document=${document.id}${
          searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""
        }`}
        onClick={() => onOpenMenu(null)}
        className="min-w-0 flex-1 px-2 py-1.5 text-[13px]"
      >
        <span className="block truncate">{documentDisplayLabel(document)}</span>
        {searchQuery ? (
          <span className="mt-1 block truncate text-[11px] text-slate-500">{document.path}</span>
        ) : null}
      </Link>
      <button
        type="button"
        aria-label={`Open actions for ${displayLabel}`}
        aria-expanded={isMenuOpen}
        onClick={() => onOpenMenu(isMenuOpen ? null : menuId)}
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
    <div className="group relative flex items-start gap-1 rounded-md hover:bg-muted focus-within:bg-muted">
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
    ? "group relative flex w-full items-center gap-1 rounded-md bg-white px-2 py-1.5 text-left text-[13px] font-medium shadow-sm focus-within:bg-white"
    : "group relative flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted focus-within:bg-muted";

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
          <input type="hidden" name="template" value="blank" />
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

function folderDisplayLabel(folder: Pick<FolderListItem, "name" | "path">) {
  return `${folder.name} ${folder.path}`;
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
