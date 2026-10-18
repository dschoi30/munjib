"use client";

import { useWorkspaceMode } from "@/components/workspace-mode";

import type { Attachment, AuditLog, DocumentVersion } from "@prisma/client";
import { ChevronDown, ChevronRight, FileClock, History, ListTree, PanelRightClose, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  useHeadingNavigation,
  useRightPanel,
  type HeadingNavigationTarget,
} from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
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
import { metadataStatusMessages } from "@/lib/i18n/metadata-status-messages";
import { scrollToOutlineHeading } from "@/lib/outline-targets";

type DisplayAttachment = Pick<Attachment, "id" | "fileName" | "mimeType" | "size">;
type DisplayVersion = Pick<DocumentVersion, "id" | "versionNumber" | "title" | "changeSummary">;
type DisplayAuditLog = Pick<AuditLog, "id" | "action">;

export type MetadataTab = "outline" | "attachments" | "versions" | "audit";

type MetadataDocument = {
  id: string;
  contentMarkdown: string;
};

export type MetadataDocumentBundle = {
  loading?: boolean;
  error?: string;
  document: MetadataDocument & { title: string; path?: string };
  versions: DisplayVersion[];
  auditLogs: DisplayAuditLog[];
  attachments: DisplayAttachment[];
  canWrite: boolean;
};
export type MetadataExpandedState = Record<string, Partial<Record<MetadataTab, boolean>>>;

export function MetadataPanel({
  document = null,
  versions = [],
  auditLogs = [],
  attachments = [],
  canWrite = false,
  documents,
  expanded,
  onExpandedChange,
  activeDocumentId,
  onNavigateToDocumentHeading,
  onRetryDocument,
  restoreVersionAction,
  onTogglePanel,
  onNavigateToHeading,
}: {
  documents?: MetadataDocumentBundle[];
  onRetryDocument?: (documentId: string) => void;
  expanded?: MetadataExpandedState;
  onExpandedChange?: (documentId: string, category: MetadataTab, expanded: boolean) => void;
  activeDocumentId?: string | null;
  onNavigateToDocumentHeading?: (documentId: string, target: HeadingNavigationTarget) => void;
  document?: MetadataDocument | null;
  versions?: DisplayVersion[];
  auditLogs?: DisplayAuditLog[];
  attachments?: DisplayAttachment[];
  canWrite?: boolean;
  restoreVersionAction: (formData: FormData) => Promise<void>;
  onTogglePanel?: () => void;
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<MetadataTab>("outline");
  const categoryLabel = {
    outline: t("metadata.outline"), attachments: t("metadata.attachments"),
    versions: t("metadata.versions"), audit: t("metadata.auditLog"),
  }[activeTab];
  const [localExpanded, setLocalExpanded] = useState<MetadataExpandedState>({});
  const changeExpanded = useCallback((id: string, category: MetadataTab, value: boolean) => {
    setLocalExpanded((previous) => ({ ...previous, [id]: { ...previous[id], [category]: value } }));
    onExpandedChange?.(id, category, value);
  }, [onExpandedChange]);
  const rightPanel = useRightPanel();
  const attachmentFocus = rightPanel?.attachmentFocus;
  const clearAttachmentFocus = rightPanel?.clearAttachmentFocus;
  const focusedAttachmentId = attachmentFocus && attachmentFocus.documentId === document?.id ? attachmentFocus.attachmentId : null;
  const groupedFocusVisible = documents?.some((bundle) => bundle.document.id === attachmentFocus?.documentId) ?? false;
  const handledFocus = useRef<typeof attachmentFocus>(null);
  useEffect(() => {
    if (!attachmentFocus) { handledFocus.current = null; return; }
    if (documents ? !groupedFocusVisible : attachmentFocus.documentId !== document?.id) {
      clearAttachmentFocus?.();
      return;
    }
    if (handledFocus.current === attachmentFocus) return;
    handledFocus.current = attachmentFocus;
    setActiveTab("attachments");
    if (documents) changeExpanded(attachmentFocus.documentId, "attachments", true);
  }, [attachmentFocus, document?.id, documents, groupedFocusVisible, clearAttachmentFocus, changeExpanded]);
  const headingNavigation = useHeadingNavigation();
  const liveOutlineDocument = headingNavigation?.outlineDocument;
  const navigateToHeading = headingNavigation?.navigateToHeading;
  const collapsePanel = onTogglePanel ?? rightPanel?.collapse;
  const outlineDocument =
    liveOutlineDocument?.id === document?.id
      ? liveOutlineDocument
      : document;
  const outlineItems = useMemo(
    () => buildMarkdownOutline(outlineDocument?.contentMarkdown ?? ""),
    [outlineDocument?.contentMarkdown],
  );
  const handleNavigateToHeading = useCallback(
    (target: HeadingNavigationTarget) => {
      if (onNavigateToHeading) {
        onNavigateToHeading(target);
        return;
      }

      if (navigateToHeading?.(target)) {
        return;
      }

      scrollToOutlineHeading(target.id);
    },
    [navigateToHeading, onNavigateToHeading],
  );

  return (
    <div className="space-y-4">
      <TooltipProvider delayDuration={0}>
        <div className="flex h-11 items-center gap-1">
          <MetadataTabButton
            label={t("metadata.outline")}
            active={activeTab === "outline"}
            onClick={() => setActiveTab("outline")}
          >
            <ListTree className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <MetadataTabButton
            label={t("metadata.attachments")}
            active={activeTab === "attachments"}
            onClick={() => setActiveTab("attachments")}
          >
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <MetadataTabButton
            label={t("metadata.versions")}
            active={activeTab === "versions"}
            onClick={() => setActiveTab("versions")}
          >
            <History className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <MetadataTabButton
            label={t("metadata.auditLog")}
            active={activeTab === "audit"}
            onClick={() => setActiveTab("audit")}
          >
            <FileClock className="h-4 w-4" aria-hidden="true" />
          </MetadataTabButton>
          <ToolbarTooltip label={t("metadata.closePanel")}>
            <Button
              type="button"
              aria-label={t("metadata.closePanel")}
              onClick={collapsePanel}
              className="ml-auto h-8 w-8 bg-transparent p-0 text-slate-600 hover:bg-slate-200 hover:text-ink"
            >
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          </ToolbarTooltip>
        </div>
      </TooltipProvider>
      <h2 className="text-sm font-semibold">{categoryLabel}</h2>
      {documents ? documents.map((bundle) => (
        <DocumentMetadataGroup key={bundle.document.id} bundle={bundle} category={activeTab}
          showPath={documents.filter(item => item.document.title === bundle.document.title).length > 1}
          expanded={(expanded ?? localExpanded)[bundle.document.id]?.[activeTab] ?? true}
          onToggle={() => changeExpanded(bundle.document.id, activeTab, !((expanded ?? localExpanded)[bundle.document.id]?.[activeTab] ?? true))}
          focusedAttachmentId={attachmentFocus?.documentId === bundle.document.id ? attachmentFocus.attachmentId : null}
          onClearFocus={clearAttachmentFocus}
          active={bundle.document.id === activeDocumentId}
          onRetry={onRetryDocument ? () => onRetryDocument(bundle.document.id) : undefined}
          restoreVersionAction={restoreVersionAction}
          onNavigateToHeading={(target) => onNavigateToDocumentHeading?.(bundle.document.id, target)}
        />
      )) : <>
      {activeTab === "outline" ? (
        <OutlineList items={outlineItems} onNavigateToHeading={handleNavigateToHeading} />
      ) : null}
      {activeTab === "attachments" ? <AttachmentsList attachments={attachments} focusedAttachmentId={focusedAttachmentId} onClearFocus={clearAttachmentFocus} /> : null}
      {activeTab === "versions" ? (
        <VersionsList
          versions={versions}
          canWrite={canWrite}
          restoreVersionAction={restoreVersionAction}
        />
      ) : null}
      {activeTab === "audit" ? <AuditLogList auditLogs={auditLogs} /> : null}
      </>}
    </div>
  );
}

function DocumentMetadataGroup({ bundle, category, showPath, expanded, onToggle, active, restoreVersionAction, onNavigateToHeading, onRetry, focusedAttachmentId, onClearFocus }: {
  showPath?: boolean;
  focusedAttachmentId?: string | null;
  onClearFocus?: () => void;
  onRetry?: () => void;
  bundle: MetadataDocumentBundle;
  category: MetadataTab;
  expanded: boolean;
  onToggle: () => void;
  active: boolean;
  restoreVersionAction: (data: FormData) => Promise<void>;
  onNavigateToHeading: (target: HeadingNavigationTarget) => void;
}) {
  const { language } = useI18n();
  const statusMessages = metadataStatusMessages[language];
  const contentId = useId();
  const outline = useMemo(() => {
    const items = buildMarkdownOutline(bundle.document.contentMarkdown);
    const first = items[0];
    return first?.level === 1 && first.title.trim() === bundle.document.title.trim()
      ? [...first.children, ...items.slice(1)] : items;
  }, [bundle.document.contentMarkdown, bundle.document.title]);
  return <section className="border-b border-border pb-3">
    <button type="button" aria-expanded={expanded} aria-controls={contentId}
      aria-label={showPath ? `${bundle.document.title} ${bundle.document.path}` : bundle.document.title}
      title={bundle.document.path ? `${bundle.document.title} (${bundle.document.path})` : bundle.document.title}
      onClick={onToggle}
      className={`flex w-full min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-sm font-semibold hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-visible)] ${active ? "bg-slate-200 text-ink" : "text-slate-600"}`}>
      {expanded ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="truncate">{bundle.document.title}</span>
    </button>
    <div id={contentId} hidden={!expanded} className={`px-2 ${category === "outline" ? "pt-1" : "pt-2"}`}>
      {bundle.loading ? <p role="status" className="text-sm text-slate-600">{statusMessages.loading}</p> : bundle.error ? <div role="alert" className="text-sm text-slate-600">
        <p>{bundle.error}</p>{onRetry ? <Button type="button" onClick={onRetry}>{statusMessages.retry}</Button> : null}
      </div> : <>
      {category === "outline" ? <OutlineList items={outline} onNavigateToHeading={onNavigateToHeading} /> : null}
      {category === "attachments" ? <AttachmentsList attachments={bundle.attachments} focusedAttachmentId={expanded ? focusedAttachmentId : null} onClearFocus={onClearFocus} /> : null}
      {category === "versions" ? <VersionsList versions={bundle.versions} canWrite={bundle.canWrite} restoreVersionAction={restoreVersionAction} /> : null}
      {category === "audit" ? <AuditLogList auditLogs={bundle.auditLogs} /> : null}
      </>}
    </div>
  </section>;
}

function OutlineList({
  items,
  onNavigateToHeading,
}: {
  items: MarkdownOutlineItem[];
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void;
}) {
  const { t } = useI18n();

  return (
    <section>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{t("metadata.noOutlineHeadings")}</p>
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
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void;
}) {
  const { t } = useI18n();

  return (
    <li>
      <button
        type="button"
        aria-label={t("metadata.goToHeading", { title: item.title })}
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

function AttachmentsList({ attachments, focusedAttachmentId, onClearFocus }: {
  attachments: DisplayAttachment[];
  focusedAttachmentId?: string | null;
  onClearFocus?: () => void;
}) {
  const focusedCard = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!focusedAttachmentId) return;
    focusedCard.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    const clearOutside = (event: Event) => {
      if (event.target instanceof Node && !focusedCard.current?.contains(event.target)) onClearFocus?.();
    };
    const clearOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClearFocus?.(); };
    document.addEventListener("pointerdown", clearOutside, true);
    document.addEventListener("focusin", clearOutside, true);
    document.addEventListener("keydown", clearOnEscape);
    return () => {
      document.removeEventListener("pointerdown", clearOutside, true);
      document.removeEventListener("focusin", clearOutside, true);
      document.removeEventListener("keydown", clearOnEscape);
    };
  }, [focusedAttachmentId, attachments, onClearFocus]);
  const workspaceMode = useWorkspaceMode();
  const { t } = useI18n();

  return (
    <section>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {attachments.length === 0 ? <li>{t("metadata.noAttachments")}</li> : null}
        {attachments.map((attachment) => (
          <li key={attachment.id} ref={attachment.id === focusedAttachmentId ? focusedCard : undefined}
            className={`rounded border px-2 py-2 ${attachment.id === focusedAttachmentId ? "border-green-600 ring-1 ring-green-600" : "border-border"}`}>
            <a download={attachment.fileName} className="font-medium underline" href={`${workspaceMode === "anonymous-trial-readonly" ? "/api/trial" : "/api"}/attachments/${attachment.id}?download=1`}>
              {attachment.fileName}
            </a>
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
  versions: DisplayVersion[];
  canWrite: boolean;
  restoreVersionAction: (formData: FormData) => Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <section>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {versions.length === 0 ? <li>{t("metadata.noVersions")}</li> : null}
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
                  {t("metadata.restore")}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AuditLogList({ auditLogs }: { auditLogs: DisplayAuditLog[] }) {
  const { t } = useI18n();

  return (
    <section>
      <ul className="mt-2 space-y-2 text-sm text-slate-600">
        {auditLogs.length === 0 ? <li>{t("metadata.noAuditLogs")}</li> : null}
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
