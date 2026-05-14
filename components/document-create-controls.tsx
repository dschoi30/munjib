import { FilePlus2, Folder, FolderPlus, Search, Star } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function DocumentCreateControls({
  selectedFolderId,
  canWrite,
  createAction,
  createFolderAction,
  activePanel,
  onOpenDocuments,
  onOpenSearch,
  onOpenFavorites,
}: {
  selectedFolderId: string | null;
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  activePanel: "documents" | "search" | "favorites";
  onOpenDocuments: () => void;
  onOpenSearch: () => void;
  onOpenFavorites: () => void;
}) {
  const iconButtonClassName =
    "h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink";
  const activeIconButtonClassName = "h-8 w-8 bg-slate-200 p-0 text-ink";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="mb-4 flex h-11 items-center gap-1">
        <ToolbarTooltip label="Documents">
          <Button
            type="button"
            aria-label="Documents"
            aria-pressed={activePanel === "documents"}
            onClick={onOpenDocuments}
            className={activePanel === "documents" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Folder className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <form action={createAction}>
          <input type="hidden" name="folderId" value={selectedFolderId ?? ""} />
          <ToolbarTooltip label="New document">
            <Button
              type="submit"
              disabled={!canWrite}
              aria-label="New document"
              className={iconButtonClassName}
            >
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </ToolbarTooltip>
        </form>
        <form action={createFolderAction}>
          <input type="hidden" name="parentFolderId" value={selectedFolderId ?? ""} />
          <ToolbarTooltip label="New folder">
            <Button
              type="submit"
              disabled={!canWrite}
              aria-label="New folder"
              className={iconButtonClassName}
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </ToolbarTooltip>
        </form>
        <ToolbarTooltip label="Search">
          <Button
            type="button"
            aria-label="Search"
            aria-pressed={activePanel === "search"}
            onClick={onOpenSearch}
            className={activePanel === "search" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label="Favorites">
          <Button
            type="button"
            aria-label="Favorites"
            aria-pressed={activePanel === "favorites"}
            onClick={onOpenFavorites}
            className={activePanel === "favorites" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Star className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
      </div>
    </TooltipProvider>
  );
}

function ToolbarTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
