"use client";

import type { Attachment, AuditLog, DocumentVersion } from "@prisma/client";
import { FileClock, History, ListTree, PanelRightClose, Paperclip } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { useHeadingNavigation, useRightPanel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildMarkdownOutline,
  type MarkdownOutlineItem,
} from "@/lib/markdown/folding";

type MetadataTab = "outline" | "attachments" | "versions" | "audit";

type MetadataDocument = {
  id: string;
  contentMarkdown: string;
};

export function MetadataPanel({
  document,
  versions,
  auditLogs,
  attachments,
  canWrite,
  restoreVersionAction,
  onTogglePanel,
  onNavigateToHeading,
}: {
  document: MetadataDocument | null;
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
  attachments: Attachment[];
  canWrite: boolean;
  restoreVersionAction: (formData: FormData) => Promise<void>;
  onTogglePanel?: () => void;
  onNavigateToHeading?: (target: { id: string; lineNumber: number }) => void;
}) {
  const [activeTab, setActiveTab] = useState<MetadataTab>("outline");
  const rightPanel = useRightPanel();
  const headingNavigation = useHeadingNavigation();
  const collapsePanel = onTogglePanel ?? rightPanel?.collapse;
  const outlineItems = useMemo(
    () => buildMarkdownOutline(document?.contentMarkdown ?? ""),
    [document?.contentMarkdown],
  );
  const handleNavigateToHeading = useCallback(
    (target: { id: string; lineNumber: number }) => {
      if (onNavigateToHeading) {
        onNavigateToHeading(target);
        return;
      }

      if (headingNavigation?.navigateToHeading(target)) {
        return;
      }

      scrollToOutlineTarget(target.id);
    },
    [headingNavigation, onNavigateToHeading],
  );

  return (
    <div className="space-y-4">
      <TooltipProvider delayDuration={0}>
        <div className="flex h-11 items-center gap-1">
          <MetadataTabButton
            label="Outline"
            active={activeTab === "outline"}
            onClick={() => setActiveTab("outline")}
          >
            <ListTree className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <MetadataTabButton
            label="Attachments"
            active={activeTab === "attachments"}
            onClick={() => setActiveTab("attachments")}
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <MetadataTabButton
            label="Versions"
            active={activeTab === "versions"}
            onClick={() => setActiveTab("versions")}
          >
            <History className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <MetadataTabButton
            label="Audit log"
            active={activeTab === "audit"}
            onClick={() => setActiveTab("audit")}
          >
            <FileClock className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <ToolbarTooltip label="Close metadata panel">
            <Button
              type="button"
              aria-label="Close metadata panel"
              onClick={collapsePanel}
              className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink"
            >
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          </ToolbarTooltip>
        </div>
      </TooltipProvider>
      {activeTab === "outline" ? (
        <OutlineList items={outlineItems} onNavigateToHeading={handleNavigateToHeading} />
      ) : null}
      {activeTab === "attachments" ? <AttachmentsList attachments={attachments} /> : null}
      {activeTab === "versions" ? (
        <VersionsList
          versions={versions}
          canWrite={canWrite}
          restoreVersionAction={restoreVersionAction}
        />
      ) : null}
      {activeTab === "audit" ? <AuditLogList auditLogs={auditLogs} /> : null}
    </div>
  );
}

function OutlineList({
  items,
  onNavigateToHeading,
}: {
  items: MarkdownOutlineItem[];
  onNavigateToHeading?: (target: { id: string; lineNumber: number }) => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">Outline</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No outline headings</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {items.map((item) => (
            <OutlineItemRow
              key={item.id}
              item={item}
              onNavigateToHeading={onNavigateToHeading}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function OutlineItemRow({
  item,
  onNavigateToHeading,
}: {
  item: MarkdownOutlineItem;
  onNavigateToHeading?: (target: { id: string; lineNumber: number }) => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-label={`Go to heading ${item.title}`}
        onClick={() => onNavigateToHeading?.({ id: item.id, lineNumber: item.lineNumber })}
        className="flex w-full min-w-0 rounded px-2 py-1 text-left text-slate-600 hover:bg-slate-200 hover:text-ink focus:bg-slate-200 focus:text-ink focus:outline-none"
      >
        <span className="truncate">{item.title}</span>
      </button>
      {item.children.length > 0 ? (
        <ul className="ml-3 border-l border-slate-200 pl-2">
          {item.children.map((child) => (
            <OutlineItemRow
              key={child.id}
              item={child}
              onNavigateToHeading={onNavigateToHeading}
            />
          ))}
        </ul>
      ) : null}
    </li>
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

function MetadataTabButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ToolbarTooltip label={label}>
      <Button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={
          active
            ? "h-8 w-8 bg-slate-200 p-0 text-ink"
            : "h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink"
        }
      >
        {children}
      </Button>
    </ToolbarTooltip>
  );
}

function AttachmentsList({ attachments }: { attachments: Attachment[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">Attachments</h2>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {attachments.length === 0 ? <li>No attachments</li> : null}
        {attachments.map((attachment) => (
          <li key={attachment.id} className="rounded border border-border px-2 py-2">
            <Link className="font-medium underline" href={`/api/attachments/${attachment.id}`}>
              {attachment.fileName}
            </Link>
            <p className="mt-1 text-xs text-slate-500">
              {attachment.mimeType} · {formatBytes(attachment.size)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VersionsList({
  versions,
  canWrite,
  restoreVersionAction,
}: {
  versions: DocumentVersion[];
  canWrite: boolean;
  restoreVersionAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">Versions</h2>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {versions.length === 0 ? <li>No versions</li> : null}
        {versions.map((version) => (
          <li key={version.id} className="rounded border border-border px-2 py-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-700">v{version.versionNumber}</p>
                <p>{version.changeSummary}</p>
                <p className="mt-1 text-xs text-slate-500">{version.title}</p>
              </div>
              <form action={restoreVersionAction}>
                <input type="hidden" name="versionId" value={version.id} />
                <Button type="submit" disabled={!canWrite} className="h-8 px-2 text-xs">
                  Restore
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AuditLogList({ auditLogs }: { auditLogs: AuditLog[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">Audit log</h2>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {auditLogs.length === 0 ? <li>No audit logs</li> : null}
        {auditLogs.map((log) => (
          <li key={log.id}>{log.action}</li>
        ))}
      </ul>
    </section>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function scrollToOutlineTarget(id: string) {
  if (typeof window === "undefined") {
    return;
  }

  const target = window.document.querySelector<HTMLElement>(
    `[data-outline-heading-id="${escapeAttributeSelectorValue(id)}"]`,
  );

  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function escapeAttributeSelectorValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
