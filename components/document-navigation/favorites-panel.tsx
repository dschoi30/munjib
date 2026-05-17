"use client";

import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import { sectionHeadingClassName } from "@/components/document-navigation/document-section";
import { FavoriteFolderRow } from "@/components/document-navigation/folder-row";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
  ToggleFavoriteFolderHandler,
} from "@/components/document-navigation/types";

export function FavoriteSection({
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
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onToggleFavoriteFolder: ToggleFavoriteFolderHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
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
