import { FilePlus2, Folder, FolderPlus, Network, Search, Star } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CreateDocumentAction,
  CreateFolderAction,
} from "@/components/document-navigation/types";
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
  activeView,
  onOpenDocuments,
  onOpenSearch,
  onOpenFavorites,
  onOpenGraph,
}: {
  selectedFolderId: string | null;
  canWrite: boolean;
  createAction: CreateDocumentAction;
  createFolderAction: CreateFolderAction;
  activeView: "documents" | "search" | "favorites" | "graph";
  onOpenDocuments: () => void;
  onOpenSearch: () => void;
  onOpenFavorites: () => void;
  onOpenGraph: () => void;
}) {
  const iconButtonClassName =
    "h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink";
  const activeIconButtonClassName = "h-8 w-8 bg-slate-200 p-0 text-ink";

  async function submitCreateDocument(formData: FormData) {
    await createAction(formData);
  }

  async function submitCreateFolder(formData: FormData) {
    await createFolderAction(formData);
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div
        data-testid="document-create-toolbar"
        className="mb-4 flex h-11 items-center justify-between"
      >
        <ToolbarTooltip label="Documents">
          <Button
            type="button"
            aria-label="Documents"
            aria-pressed={activeView === "documents"}
            onClick={onOpenDocuments}
            className={activeView === "documents" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Folder className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label="Graph">
          <Button
            type="button"
            aria-label="Graph"
            aria-pressed={activeView === "graph"}
            onClick={onOpenGraph}
            className={activeView === "graph" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Network className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <form action={submitCreateDocument}>
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
        <form action={submitCreateFolder}>
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
            aria-pressed={activeView === "search"}
            onClick={onOpenSearch}
            className={activeView === "search" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label="Favorites">
          <Button
            type="button"
            aria-label="Favorites"
            aria-pressed={activeView === "favorites"}
            onClick={onOpenFavorites}
            className={activeView === "favorites" ? activeIconButtonClassName : iconButtonClassName}
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
