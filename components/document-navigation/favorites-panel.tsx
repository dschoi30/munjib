"use client";

import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import { sectionHeadingClassName } from "@/components/document-navigation/document-section";
import { FavoriteFolderRow } from "@/components/document-navigation/folder-row";
import type { ActionMenuPlacement } from "@/components/document-navigation/menu-placement";
import { useI18n } from "@/components/i18n-provider";
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
  menuPlacements = {},
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
  menuPlacements?: Record<string, ActionMenuPlacement>;
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onToggleFavoriteFolder: ToggleFavoriteFolderHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
}) {
  const { t } = useI18n();

  return (
    <section className="mb-4">
      <p className={sectionHeadingClassName}>{t("nav.favorites")}</p>
      <div className="space-y-1">
        {folders.length === 0 && documents.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-slate-500">
            {t("nav.noFavorites")}
          </p>
        ) : null}
        {folders.map((folder) => {
          const menuId = `favorite-folder:${folder.id}`;

          return (
            <FavoriteFolderRow
              key={`Favorites-folder-${folder.id}`}
              rowId={menuId}
              workspaceSlug={workspaceSlug}
              folder={folder}
              openMenuId={openMenuId}
              menuPlacement={menuPlacements[menuId] ?? "down"}
              onOpenMenu={onOpenMenu}
              onToggleFavorite={onToggleFavoriteFolder}
            />
          );
        })}
        {documents.map((document) => {
          const menuId = `favorite-document:${document.id}`;

          return (
            <DocumentLinkRow
              key={`Favorites-${document.id}`}
              rowId={menuId}
              workspaceSlug={workspaceSlug}
              document={document}
              isFavorite={favoriteDocumentIds.has(document.id)}
              selected={document.id === selectedDocumentId}
              openMenuId={openMenuId}
              menuPlacement={menuPlacements[menuId] ?? "down"}
              onOpenMenu={onOpenMenu}
              onToggleFavorite={onToggleFavorite}
              onOpenInNewTab={onOpenInNewTab}
              archiveDocumentAction={archiveDocumentAction}
            />
          );
        })}
      </div>
    </section>
  );
}
