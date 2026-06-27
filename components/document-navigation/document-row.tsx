"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { DocumentListItem } from "@/components/document-list";
import { useI18n } from "@/components/i18n-provider";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
} from "@/components/document-navigation/types";
import {
  documentActionLabel,
  documentDisplayDescription,
  documentDisplayLabel,
} from "@/lib/workspace-tree";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

export function DocumentLinkRow({
  rowId,
  workspaceSlug,
  document,
  isFavorite,
  selected,
  description,
  showDescription = true,
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
  showDescription?: boolean;
  openMenuId: string | null;
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
}) {
  const { t } = useI18n();
  const menuId = rowId;
  const isMenuOpen = openMenuId === menuId;
  const fallbackLabel = t("nav.untitledDocument");
  const displayLabel = documentDisplayLabel(document, fallbackLabel);
  const rowDescription = showDescription
    ? description ?? documentDisplayDescription(document, fallbackLabel)
    : undefined;
  const actionLabel = documentActionLabel(document, fallbackLabel);
  const rowClassName = selected
    ? "group relative flex items-start gap-1 rounded-md bg-slate-200 focus-within:bg-slate-200"
    : "group relative flex items-start gap-1 rounded-md hover:bg-slate-200 focus-within:bg-slate-200";

  return (
    <div className={rowClassName} data-document-row-id={document.id}>
      <Link
        href={workspaceDocumentHref({ workspaceSlug, documentId: document.id })}
        aria-label={showDescription ? undefined : actionLabel}
        onClick={() => onOpenMenu(null)}
        className="min-w-0 flex-1 px-2 py-1.5 text-[13px]"
      >
        <span className="block truncate">{displayLabel}</span>
        {rowDescription ? (
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{rowDescription}</span>
        ) : null}
      </Link>
      <button
        type="button"
        aria-label={t("nav.openActions", { label: actionLabel })}
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
            {isFavorite ? t("nav.removeFromFavorites") : t("nav.addToFavorites")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onOpenInNewTab(document)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {t("nav.openInNewTab")}
          </button>
          <form action={archiveDocumentAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <button
              type="submit"
              role="menuitem"
              hidden={!document.canWrite}
              className="block w-full rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50"
            >
              {t("nav.moveToTrash")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
