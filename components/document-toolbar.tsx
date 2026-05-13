"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatWorkspacePath } from "@/lib/document-tabs";

type DocumentToolbarProps = {
  path: string;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
};

export function DocumentToolbar({
  path,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack = () => window.history.back(),
  onNavigateForward = () => window.history.forward(),
}: DocumentToolbarProps) {
  return (
    <div className="flex h-11 items-center gap-2 border-b border-border bg-white px-3">
      <button
        type="button"
        aria-label="Navigate back"
        disabled={!canNavigateBack}
        className="inline-flex size-8 items-center justify-center rounded text-slate-600 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600"
        onClick={onNavigateBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Navigate forward"
        disabled={!canNavigateForward}
        className="inline-flex size-8 items-center justify-center rounded text-slate-600 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600"
        onClick={onNavigateForward}
      >
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
      <div className="min-w-0 truncate pl-1 text-sm text-slate-500">{formatWorkspacePath(path)}</div>
    </div>
  );
}
