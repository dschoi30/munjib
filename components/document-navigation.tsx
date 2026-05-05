"use client";

import Link from "next/link";
import { Folder, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import { documentDisplayLabel, treeDepth } from "@/lib/workspace-tree";

export function DocumentNavigation({
  workspaceSlug,
  folders,
  documents,
  selectedFolderId,
  searchQuery,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  selectedFolderId: string | null;
  searchQuery: string;
}) {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [switcherQuery, setSwitcherQuery] = useState("");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const favoriteDocuments = documents.filter((document) => favoriteIds.includes(document.id));
  const recentDocuments = documents.slice(0, 4);
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
    try {
      const raw = window.localStorage.getItem(`munjib:favorites:${workspaceSlug}`);
      setFavoriteIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setFavoriteIds([]);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    window.localStorage.setItem(`munjib:favorites:${workspaceSlug}`, JSON.stringify(favoriteIds));
  }, [favoriteIds, workspaceSlug]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSwitcherOpen(true);
      }
      if (event.key === "Escape") setIsSwitcherOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleFavorite(documentId: string) {
    setFavoriteIds((current) =>
      current.includes(documentId)
        ? current.filter((favoriteId) => favoriteId !== documentId)
        : [...current, documentId],
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsSwitcherOpen(true)}
        className="mb-4 flex h-9 w-full items-center justify-between rounded-md border border-border bg-white px-3 text-sm text-slate-500 hover:bg-muted"
      >
        <span className="inline-flex items-center gap-2">
          <Search className="h-4 w-4" aria-hidden="true" />
          Quick switcher
        </span>
        <span className="text-xs">Ctrl K</span>
      </button>
      {favoriteDocuments.length > 0 ? (
        <DocumentSection
          title="Favorites"
          workspaceSlug={workspaceSlug}
          documents={favoriteDocuments}
          favoriteIds={favoriteIds}
          searchQuery={searchQuery}
          onToggleFavorite={toggleFavorite}
        />
      ) : null}
      {!searchQuery ? (
        <DocumentSection
          title="Recent"
          workspaceSlug={workspaceSlug}
          documents={recentDocuments}
          favoriteIds={favoriteIds}
          searchQuery={searchQuery}
          onToggleFavorite={toggleFavorite}
        />
      ) : null}
      <nav className="space-y-1" aria-label={searchQuery ? "Search results" : "All documents"}>
        {documents.length === 0 && (searchQuery || folders.length === 0) ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
            No documents found.
          </p>
        ) : null}
        {searchQuery
          ? documents.map((document) => (
              <DocumentLinkRow
                key={document.id}
                workspaceSlug={workspaceSlug}
                document={document}
                favoriteIds={favoriteIds}
                searchQuery={searchQuery}
                onToggleFavorite={toggleFavorite}
              />
            ))
          : buildTreeRows(folders, documents).map((row) =>
              row.kind === "folder" ? (
                <FolderLinkRow
                  key={row.folder.id}
                  workspaceSlug={workspaceSlug}
                  folder={row.folder}
                  selected={row.folder.id === selectedFolderId}
                />
              ) : (
                <DocumentLinkRow
                  key={row.document.id}
                  workspaceSlug={workspaceSlug}
                  document={row.document}
                  favoriteIds={favoriteIds}
                  searchQuery={searchQuery}
                  onToggleFavorite={toggleFavorite}
                />
              ),
            )}
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

function DocumentSection({
  title,
  workspaceSlug,
  documents,
  favoriteIds,
  searchQuery,
  onToggleFavorite,
}: {
  title: string;
  workspaceSlug: string;
  documents: DocumentListItem[];
  favoriteIds: string[];
  searchQuery: string;
  onToggleFavorite: (documentId: string) => void;
}) {
  return (
    <section className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-1">
        {documents.map((document) => (
          <DocumentLinkRow
            key={`${title}-${document.id}`}
            workspaceSlug={workspaceSlug}
            document={document}
            favoriteIds={favoriteIds}
            searchQuery={searchQuery}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </section>
  );
}

function DocumentLinkRow({
  workspaceSlug,
  document,
  favoriteIds,
  searchQuery,
  onToggleFavorite,
}: {
  workspaceSlug: string;
  document: DocumentListItem;
  favoriteIds: string[];
  searchQuery: string;
  onToggleFavorite: (documentId: string) => void;
}) {
  const isFavorite = favoriteIds.includes(document.id);

  return (
    <div className="group flex items-start gap-1 rounded-md hover:bg-muted">
      <Link
        href={`/workspaces/${workspaceSlug}?document=${document.id}${
          searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""
        }`}
        className="min-w-0 flex-1 px-2 py-2 text-sm"
        style={searchQuery ? undefined : { paddingLeft: `${8 + treeDepth(document.path) * 16}px` }}
      >
        <span className="block truncate">{documentDisplayLabel(document)}</span>
        {searchQuery ? (
          <span className="mt-1 block truncate text-xs text-slate-500">
            {document.path}
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        aria-label={
          isFavorite ? `Remove ${document.title} from favorites` : `Add ${document.title} to favorites`
        }
        onClick={() => onToggleFavorite(document.id)}
        className="mt-1 rounded p-1 text-slate-400 hover:text-ink"
      >
        <Star className={isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} aria-hidden="true" />
      </button>
    </div>
  );
}

function FolderLinkRow({
  workspaceSlug,
  folder,
  selected,
}: {
  workspaceSlug: string;
  folder: FolderListItem;
  selected: boolean;
}) {
  return (
    <Link
      href={`/workspaces/${workspaceSlug}?folder=${folder.id}`}
      className={
        selected
          ? "flex items-center gap-2 rounded-md bg-white px-2 py-2 text-sm font-medium shadow-sm"
          : "flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
      }
      style={{ paddingLeft: `${8 + treeDepth(folder.path) * 16}px` }}
    >
      <Folder className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <span className="min-w-0 truncate">{folder.name}</span>
    </Link>
  );
}

type TreeRow =
  | { kind: "folder"; folder: FolderListItem }
  | { kind: "document"; document: DocumentListItem };

function buildTreeRows(folders: FolderListItem[], documents: DocumentListItem[]): TreeRow[] {
  return [
    ...folders.map((folder) => ({ kind: "folder" as const, folder })),
    ...documents.map((document) => ({ kind: "document" as const, document })),
  ].sort((left, right) => {
    const leftPath = left.kind === "folder" ? left.folder.path : left.document.path;
    const rightPath = right.kind === "folder" ? right.folder.path : right.document.path;
    return leftPath.localeCompare(rightPath);
  });
}
