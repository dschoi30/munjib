"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatWorkspacePath } from "@/lib/document-tabs";

type DocumentToolbarProps = {
  path: string;
};

export function DocumentToolbar({ path }: DocumentToolbarProps) {
  return (
    <div className="flex h-11 items-center gap-2 border-b border-border bg-white px-3">
      <button
        type="button"
        aria-label="Navigate back"
        className="inline-flex size-8 items-center justify-center rounded text-slate-600 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        onClick={() => window.history.back()}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Navigate forward"
        className="inline-flex size-8 items-center justify-center rounded text-slate-600 hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        onClick={() => window.history.forward()}
      >
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
      <div className="min-w-0 truncate pl-1 text-sm text-slate-500">{formatWorkspacePath(path)}</div>
    </div>
  );
}
