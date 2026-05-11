"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentTab } from "@/lib/document-tabs";

type DocumentTabsProps = {
  tabs: DocumentTab[];
  activeDocumentId: string | null;
  onSelect: (documentId: string) => void;
  onClose: (documentId: string) => void;
};

export function DocumentTabs({ tabs, activeDocumentId, onSelect, onClose }: DocumentTabsProps) {
  if (tabs.length === 0) {
    return <div className="h-11 border-b border-border bg-muted" />;
  }

  return (
    <nav aria-label="Open documents" className="h-11 border-b border-border bg-muted">
      <ul className="flex h-full min-w-0 overflow-x-auto">
      {tabs.map((tab) => {
        const selected = tab.id === activeDocumentId;

        return (
          <li
            key={tab.id}
            className={cn(
              "group flex h-11 max-w-56 shrink-0 items-center border-r border-border",
              selected ? "bg-white text-ink" : "bg-muted text-slate-600 hover:bg-white/70",
            )}
          >
            <button
              type="button"
              aria-current={selected ? "page" : undefined}
              className="h-full min-w-0 flex-1 truncate px-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ink"
              onClick={() => onSelect(tab.id)}
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              className="mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              onClick={() => onClose(tab.id)}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        );
      })}
      </ul>
    </nav>
  );
}
