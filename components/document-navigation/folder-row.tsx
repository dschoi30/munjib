"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import type { FolderListItem } from "@/components/document-list";
import type {
  CreateDocumentAction,
  OpenMenuHandler,
  ToggleFavoriteFolderHandler,
} from "@/components/document-navigation/types";

export function FavoriteFolderRow({
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
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteFolderHandler;
}) {
  const isMenuOpen = openMenuId === rowId;
  const displayLabel = folderDisplayLabel(folder);

  return (
    <div className="group relative flex items-start gap-1 rounded-md hover:bg-slate-200 focus-within:bg-slate-200">
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

export function FolderToggleRow({
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
  createAction: CreateDocumentAction;
  renameFolderAction: (formData: FormData) => Promise<void>;
  archiveFolderAction: (formData: FormData) => Promise<void>;
  isFavorite: boolean;
  isRenaming: boolean;
  openMenuId: string | null;
  onOpenMenu: OpenMenuHandler;
  onStartRename: (folderId: string) => void;
  onCancelRename: () => void;
  onToggleFavorite: ToggleFavoriteFolderHandler;
  onToggle: () => void;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const menuId = `folder:${folder.id}`;
  const isMenuOpen = openMenuId === menuId;
  const displayLabel = folderDisplayLabel(folder);
  const rowClassName = selected
    ? "group relative flex w-full items-center gap-1 rounded-md bg-slate-200 px-2 py-1.5 text-left text-[13px] font-medium focus-within:bg-slate-200"
    : "group relative flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-slate-200 focus-within:bg-slate-200";

  async function submitCreateDocument(formData: FormData) {
    await createAction(formData);
  }

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
        <form action={submitCreateDocument}>
          <input type="hidden" name="folderId" value={folder.id} />
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

function folderDisplayLabel(folder: Pick<FolderListItem, "name" | "path">) {
  return `${folder.name} ${folder.path}`;
}
