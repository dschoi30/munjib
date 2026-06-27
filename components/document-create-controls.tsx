import { FilePlus2, Folder, FolderPlus, Network, Search, Star } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function DocumentCreateControls({
  canWrite,
  onCreateDocument,
  onCreateFolder,
  isCreatingDocument,
  isCreatingFolder,
  activeView,
  onOpenDocuments,
  onOpenSearch,
  onOpenFavorites,
  onOpenGraph,
}: {
  canWrite: boolean;
  onCreateDocument: () => void;
  onCreateFolder: () => void;
  isCreatingDocument: boolean;
  isCreatingFolder: boolean;
  activeView: "documents" | "search" | "favorites" | "graph";
  onOpenDocuments: () => void;
  onOpenSearch: () => void;
  onOpenFavorites: () => void;
  onOpenGraph: () => void;
}) {
  const { t } = useI18n();
  const iconButtonClassName =
    "h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink";
  const activeIconButtonClassName = "h-8 w-8 bg-slate-200 p-0 text-ink";

  return (
    <TooltipProvider delayDuration={0}>
      <div
        data-testid="document-create-toolbar"
        className="mb-4 flex h-11 items-center justify-between"
      >
        <ToolbarTooltip label={t("nav.documents")}>
          <Button
            type="button"
            aria-label={t("nav.documents")}
            aria-pressed={activeView === "documents"}
            onClick={onOpenDocuments}
            className={activeView === "documents" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Folder className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label={t("nav.graph")}>
          <Button
            type="button"
            aria-label={t("nav.graph")}
            aria-pressed={activeView === "graph"}
            onClick={onOpenGraph}
            className={activeView === "graph" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Network className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label={t("nav.newDocument")}>
          <Button
            type="button"
            disabled={!canWrite || isCreatingDocument}
            aria-label={t("nav.newDocument")}
            onClick={onCreateDocument}
            className={iconButtonClassName}
          >
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label={t("nav.newFolder")}>
          <Button
            type="button"
            disabled={!canWrite || isCreatingFolder}
            aria-label={t("nav.newFolder")}
            onClick={onCreateFolder}
            className={iconButtonClassName}
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label={t("nav.search")}>
          <Button
            type="button"
            aria-label={t("nav.search")}
            aria-pressed={activeView === "search"}
            onClick={onOpenSearch}
            className={activeView === "search" ? activeIconButtonClassName : iconButtonClassName}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
        <ToolbarTooltip label={t("nav.favorites")}>
          <Button
            type="button"
            aria-label={t("nav.favorites")}
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
