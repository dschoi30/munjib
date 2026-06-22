"use client";

import type { DocumentListItem } from "@/components/document-list";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import { useI18n } from "@/components/i18n-provider";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
} from "@/components/document-navigation/types";

export function SearchPanel({
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
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
}) {
  const { t } = useI18n();
  const resultLabel = t(
    documents.length === 1 ? "nav.searchResultCount.one" : "nav.searchResultCount.other",
    { count: documents.length },
  );

  return (
    <section className="space-y-3" aria-label={t("nav.searchResults")}>
      <div className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 shadow-sm focus-within:border-ink">
        <label className="sr-only" htmlFor="document-list-search">
          {t("nav.searchDocuments")}
        </label>
        <input
          id="document-list-search"
          autoFocus
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("nav.searchDocuments")}
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
            {t("nav.noDocuments")}
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
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
}) {
  return (
    <DocumentLinkRow
      rowId={rowId}
      workspaceSlug={workspaceSlug}
      document={document}
      isFavorite={isFavorite}
      selected={selected}
      description={document.displayPath ?? document.path}
      openMenuId={openMenuId}
      onOpenMenu={onOpenMenu}
      onToggleFavorite={onToggleFavorite}
      onOpenInNewTab={onOpenInNewTab}
      archiveDocumentAction={archiveDocumentAction}
    />
  );
}
