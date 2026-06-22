"use client";

import { ArrowLeft, ArrowRight, Eye, Pencil } from "lucide-react";
import { useDocumentViewMode, type DocumentViewMode } from "@/components/document-view-mode";
import { useI18n } from "@/components/i18n-provider";

type DocumentToolbarProps = {
  path: string;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  showModeToggle?: boolean;
  onModeChange?: (mode: DocumentViewMode) => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
};

export function DocumentToolbar({
  path,
  canNavigateBack = false,
  canNavigateForward = false,
  showModeToggle = false,
  onModeChange,
  onNavigateBack = () => window.history.back(),
  onNavigateForward = () => window.history.forward(),
}: DocumentToolbarProps) {
  const { t } = useI18n();
  const { mode, setMode } = useDocumentViewMode();
  const nextMode = mode === "preview" ? "edit" : "preview";
  const modeLabel = t(mode === "preview" ? "toolbar.edit" : "toolbar.preview");
  const ModeIcon = mode === "preview" ? Pencil : Eye;

  return (
    <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-white px-3">
      <div className="flex items-center gap-2 justify-self-start">
        <button
          type="button"
          aria-label={t("toolbar.navigateBack")}
          disabled={!canNavigateBack}
          className="inline-flex size-8 items-center justify-center rounded text-slate-600 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600"
          onClick={onNavigateBack}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("toolbar.navigateForward")}
          disabled={!canNavigateForward}
          className="inline-flex size-8 items-center justify-center rounded text-slate-600 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600"
          onClick={onNavigateForward}
        >
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="max-w-[42vw] min-w-0 truncate text-center text-sm font-medium text-slate-500">
        {path}
      </div>
      <div className="flex items-center justify-self-end">
        {showModeToggle ? (
          <button
            type="button"
            aria-label={modeLabel}
            aria-pressed={mode === "edit"}
            title={modeLabel}
            className="inline-flex size-8 items-center justify-center rounded text-slate-600 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            onClick={() => (onModeChange ?? setMode)(nextMode)}
          >
            <ModeIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
