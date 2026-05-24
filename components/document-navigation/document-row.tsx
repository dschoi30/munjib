"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { DocumentListItem } from "@/components/document-list";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
} from "@/components/document-navigation/types";
import { documentDisplayLabel } from "@/lib/workspace-tree";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

export function DocumentLinkRow({
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
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
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
        <span className="block truncate">{document.title}</span>
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
