"use client";

import type { Attachment, AuditLog, DocumentVersion } from "@prisma/client";
import { FileClock, History, PanelRightClose, Paperclip } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { useRightPanel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MetadataTab = "attachments" | "versions" | "audit";

export function MetadataPanel({
  versions,
  auditLogs,
  attachments,
  canWrite,
  restoreVersionAction,
  onTogglePanel,
}: {
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
  attachments: Attachment[];
  canWrite: boolean;
  restoreVersionAction: (formData: FormData) => Promise<void>;
  onTogglePanel?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<MetadataTab>("attachments");
  const rightPanel = useRightPanel();
  const collapsePanel = onTogglePanel ?? rightPanel?.collapse;

  return (
    <div className="space-y-4">
      <TooltipProvider delayDuration={0}>
        <div className="flex h-11 items-center gap-1">
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
