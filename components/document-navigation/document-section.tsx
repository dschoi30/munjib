"use client";

import type { DocumentListItem } from "@/components/document-list";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
} from "@/components/document-navigation/types";

export const sectionHeadingClassName =
  "mb-2 text-[0.68rem] font-medium uppercase tracking-wide text-slate-500";

export function DocumentSection({
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
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
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
