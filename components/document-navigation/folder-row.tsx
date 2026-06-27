"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import type { FolderListItem } from "@/components/document-list";
import { useI18n } from "@/components/i18n-provider";
import type {
  AddFolderChildHandler,
  AddFolderDocumentHandler,
  OpenMenuHandler,
  ToggleFavoriteFolderHandler,
} from "@/components/document-navigation/types";
import {
  type FolderTrashSummary,
  folderTrashConfirmMessage,
  hasTrashDescendants,
} from "@/components/document-navigation/folder-trash";
import {
  actionMenuPositionClassName,
  type ActionMenuPlacement,
} from "@/components/document-navigation/menu-placement";

export function FavoriteFolderRow({
  rowId,
  workspaceSlug,
  folder,
  openMenuId,
  menuPlacement = "down",
  onOpenMenu,
  onToggleFavorite,
}: {
  rowId: string;
  workspaceSlug: string;
  folder: FolderListItem;
  openMenuId: string | null;
  menuPlacement?: ActionMenuPlacement;
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteFolderHandler;
}) {
  const { t } = useI18n();
  const isMenuOpen = openMenuId === rowId;
  const displayLabel = folderDisplayLabel(folder);

  return (
    <div
      className="group relative flex items-start gap-1 rounded-md hover:bg-slate-200 focus-within:bg-slate-200"
      data-folder-row-id={folder.id}
    >
      <Link
        href={`/workspaces/${workspaceSlug}?folder=${folder.id}`}
        onClick={() => onOpenMenu(null)}
        className="min-w-0 flex-1 px-2 py-1.5 text-[13px]"
      >
        <span className="block truncate">{folder.name}</span>
        <span className="mt-1 block truncate text-[11px] text-slate-500">
          {folder.displayPath ?? folder.path}
        </span>
      </Link>
      <button
        type="button"
        aria-label={t("nav.openActions", { label: displayLabel })}
        aria-expanded={isMenuOpen}
        onClick={(event) =>
          onOpenMenu(isMenuOpen ? null : rowId, isMenuOpen ? null : event.currentTarget)
        }
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
          className={`absolute right-0 ${actionMenuPositionClassName(menuPlacement)} z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleFavorite(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {t("nav.removeFromFavorites")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function FolderToggleRow({
  folder,
  expanded,
  selected,
  canWrite,
  renameFolderAction,
  archiveFolderAction,
  trashSummary,
  isFavorite,
  isRenaming,
  pendingCreateAction,
  openMenuId,
  menuPlacement = "down",
  onOpenMenu,
  onStartRename,
  onCancelRename,
  onAddFolder,
  onAddDocument,
  onToggleFavorite,
  onToggle,
}: {
  folder: FolderListItem;
  expanded: boolean;
  selected: boolean;
  canWrite: boolean;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  trashSummary: FolderTrashSummary;
  isFavorite: boolean;
  isRenaming: boolean;
  pendingCreateAction: string | null;
  openMenuId: string | null;
  menuPlacement?: ActionMenuPlacement;
  onOpenMenu: OpenMenuHandler;
  onStartRename: (folderId: string) => void;
  onCancelRename: () => void;
  onAddFolder: AddFolderChildHandler;
  onAddDocument: AddFolderDocumentHandler;
  onToggleFavorite: ToggleFavoriteFolderHandler;
  onToggle: () => void;
}) {
  const { language, t } = useI18n();
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const menuId = `folder:${folder.id}`;
  const isMenuOpen = openMenuId === menuId;
  const isCreatingInFolder = pendingCreateAction?.endsWith(`:${folder.id}`) ?? false;
  const displayLabel = folderDisplayLabel(folder);
  const hasDescendantsToTrash = hasTrashDescendants(trashSummary);
  const trashConfirmMessage = folderTrashConfirmMessage(trashSummary, language);
  const rowClassName = selected
    ? "group relative flex w-full items-center gap-1 rounded-md bg-slate-200 px-2 py-1.5 text-left text-[13px] font-medium focus-within:bg-slate-200"
    : "group relative flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-slate-200 focus-within:bg-slate-200";

  if (isRenaming) {
    const renameInputId = `rename-folder-${folder.id}`;

    return (
      <form
        action={renameFolderAction}
        className={rowClassName}
        data-folder-row-id={folder.id}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancelRename();
        }}
        data-row-action-menu
      >
        <input type="hidden" name="folderId" value={folder.id} />
        <label className="sr-only" htmlFor={renameInputId}>
          {t("nav.renameFolder", { label: displayLabel })}
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
          {t("nav.rename")}
        </button>
      </form>
    );
  }

  return (
    <div className={rowClassName} data-folder-row-id={folder.id}>
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
        <button
          type="button"
          aria-label={t("nav.openActions", { label: displayLabel })}
          aria-expanded={isMenuOpen}
          onClick={(event) =>
            onOpenMenu(isMenuOpen ? null : menuId, isMenuOpen ? null : event.currentTarget)
          }
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
          className={`absolute right-0 ${actionMenuPositionClassName(menuPlacement)} z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg`}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canWrite || isCreatingInFolder}
            onClick={() => onAddFolder(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            {t("nav.addFolder")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canWrite || isCreatingInFolder}
            onClick={() => onAddDocument(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            {t("nav.addDocument")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canWrite}
            onClick={() => onStartRename(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          >
            {t("nav.rename")}
          </button>
          <form action={archiveFolderAction}>
            <input type="hidden" name="folderId" value={folder.id} />
            {hasDescendantsToTrash ? (
              <input type="hidden" name="cascade" value="true" />
            ) : null}
            <button
              type="submit"
              role="menuitem"
              disabled={!canWrite}
              onClick={(event) => {
                if (!window.confirm(trashConfirmMessage)) {
                  event.preventDefault();
                }
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              {t("nav.moveToTrash")}
            </button>
          </form>
          <button
            type="button"
            role="menuitem"
            onClick={() => onToggleFavorite(folder.id)}
            className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
          >
            {isFavorite ? t("nav.removeFromFavorites") : t("nav.addToFavorites")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function folderDisplayLabel(folder: Pick<FolderListItem, "name" | "path" | "displayPath">) {
  return `${folder.name} ${folder.displayPath ?? folder.path}`;
}
