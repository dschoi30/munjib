"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";
import type { DocumentTab } from "@/lib/document-tabs";

type DocumentTabsProps = {
  tabs: DocumentTab[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAdd: () => void;
  reserveLeadingSlot?: boolean;
};

const ADD_BUTTON_WIDTH = 44;
const SIDEBAR_REOPEN_SLOT_WIDTH = 56;
const MAX_TAB_WIDTH = 224;
const MIN_TAB_WIDTH = 120;
const TAB_WIDTH_STEP = 16;

export function calculateDocumentTabWidth(
  containerWidth: number,
  tabCount: number,
  leadingReservedWidth = 0,
) {
  const reservedWidth = ADD_BUTTON_WIDTH + leadingReservedWidth;

  if (tabCount <= 0 || containerWidth <= reservedWidth) {
    return MAX_TAB_WIDTH;
  }

  const availableWidth = Math.max(0, containerWidth - reservedWidth);
  const fullWidthTabCount = Math.max(1, Math.floor(availableWidth / MAX_TAB_WIDTH));
  const overflowSteps = Math.max(0, tabCount - fullWidthTabCount);
  const steppedWidth = Math.max(MIN_TAB_WIDTH, MAX_TAB_WIDTH - overflowSteps * TAB_WIDTH_STEP);
  const fittedWidth = Math.max(MIN_TAB_WIDTH, Math.floor(availableWidth / tabCount));

  return Math.min(steppedWidth, fittedWidth);
}

export function DocumentTabs({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onAdd,
  reserveLeadingSlot = false,
}: DocumentTabsProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const leadingReservedWidth = reserveLeadingSlot ? SIDEBAR_REOPEN_SLOT_WIDTH : 0;
  const tabWidth = calculateDocumentTabWidth(containerWidth, tabs.length, leadingReservedWidth);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => setContainerWidth(element.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <nav aria-label={t("tabs.openDocuments")} className="h-11 border-b border-border bg-surface-muted">
      <div ref={containerRef} className="flex h-full min-w-0 overflow-x-auto overflow-y-hidden">
        {reserveLeadingSlot ? (
          <div
            aria-hidden="true"
            data-testid="document-tabs-leading-sidebar-slot"
            className="h-11 w-14 shrink-0 border-r border-border"
          />
        ) : null}
        <ul className="flex h-full min-w-0 shrink-0 overflow-hidden">
          {tabs.map((tab) => {
            const selected = tab.id === activeTabId;
            const title = tab.documentId
              ? tab.title.trim() || t("nav.untitledDocument")
              : t("tabs.new");

            return (
              <li
                key={tab.id}
                style={{ width: tabWidth }}
                className={cn(
                  "group flex h-11 shrink-0 items-center border-r border-border",
                  selected ? "bg-surface-page text-ink" : "bg-surface-muted text-ink-muted hover:bg-surface-page",
                )}
              >
                <button
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  className="h-full min-w-0 flex-1 truncate px-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-visible)]"
                  onClick={() => onSelect(tab.id)}
                >
                  {title}
                </button>
                <button
                  type="button"
                  aria-label={t("tabs.close", { title })}
                  className="mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-surface-control hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-visible)]"
                  onClick={() => onClose(tab.id)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          aria-label={t("tabs.add")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-l border-border text-ink-muted hover:bg-surface-page hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-visible)]"
          onClick={onAdd}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
