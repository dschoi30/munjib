"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { toast } from "sonner";
import { DocumentTabs } from "@/components/document-tabs";
import { DocumentToolbar } from "@/components/document-toolbar";
import { DocumentViewModeProvider, type DocumentViewMode } from "@/components/document-view-mode";
import { DocumentEditor } from "@/components/document-editor";
import { MetadataPanel } from "@/components/metadata-panel";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
import { useHeadingNavigation, useLeftPanel } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-provider";
import { addTab, closeTab, selectTab, moveTab, mergeAll, resizeSplit, setSidebarExpanded, getPanes, calculateLayout,
  setSplitDirection, type LayoutSplit, type DropEdge, type LayoutPane, type LayoutNode } from "@/lib/workspace-layout";
import { useSplitWorkspace, activeDocumentId } from "@/components/split-workspace-session";
import { splitMessages } from "@/lib/i18n/split-messages";
export { SplitWorkspaceProvider } from "@/components/split-workspace-session";
const DRAG_TYPE = "application/x-munjib-tab";
const HEADER_HEIGHT = 88;

export function SplitWorkspaceCenter({ fallback }: { fallback?: ReactNode }) {
  const session = useSplitWorkspace();
  const { language, t } = useI18n();
  const copy = splitMessages[language];
  const leftPanel = useLeftPanel();
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 480 });
  const [modes, setModes] = useState<Record<string, DocumentViewMode>>({});
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ paneId: string; edge: DropEdge } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, { ids: string[]; index: number }>>({});
  const resize = useRef<{ id: string; horizontal: boolean; x: number; y: number; width: number; height: number } | null>(null);
  const panes = getPanes(session.layout);
  const geometry = calculateLayout(session.layout, size.width, size.height);
  const live = useHeadingNavigation();
  const documentMap = new Map(session.documents.map(d => [d.id, d]));
  useEffect(() => {
    const measure = () => { if (viewport.current) setSize({ width: viewport.current.clientWidth, height: viewport.current.clientHeight }); };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (viewport.current) observer?.observe(viewport.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const selectionKey = panes.map(p => `${p.id}:${p.tabs.find(t => t.id === p.activeTabId)?.documentId ?? ""}`).join(",");
  useEffect(() => {
    setHistories(previous => {
      const next = { ...previous };
      for (const pane of panes) {
        const id = pane.tabs.find(tab => tab.id === pane.activeTabId)?.documentId;
        if (!id) continue;
        const history = next[pane.id] ?? { ids: [], index: -1 };
        if (history.ids[history.index] !== id) {
          const ids = [...history.ids.slice(0, history.index + 1), id]; next[pane.id] = { ids, index: ids.length - 1 };
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);
  if (!session.ready) return <div ref={viewport} className="relative h-full min-h-0 min-w-0 overflow-auto bg-surface-page" />;
  function focus(pane: LayoutPane) {
    if (session.layout.activePaneId !== pane.id) session.commit(current => ({ ...current, activePaneId: pane.id }), "replace");
  }
  function close(tabId: string) {
    const id = panes.flatMap(p => p.tabs).find(tab => tab.id === tabId)?.documentId;
    if (id && session.dirty.current.has(id) && !window.confirm(copy.discard)) return;
    session.commit(current => closeTab(current, tabId), "replace");
  }
  function move(tabId: string, target: string, edge: DropEdge) {
    session.commit(current => {
      const next = moveTab(current, tabId, target, edge);
      if (next === current && edge !== "center") toast.info(copy.noSplit);
      return next;
    }, "replace");
    setDragged(null); setDrop(null); setMenu(null);
  }
  function hit(clientX: number, clientY: number) {
    const bounds = host.current?.getBoundingClientRect(); if (!bounds) return null;
    const x = clientX - bounds.left, y = clientY - bounds.top;
    const rect = geometry.panes.find(p => x >= p.x && x < p.x + p.width && y >= p.y + HEADER_HEIGHT && y < p.y + p.height);
    if (!rect) return null;
    const edge: DropEdge = y > rect.y + rect.height - (rect.height - HEADER_HEIGHT) * .25 ? "bottom"
      : x < rect.x + rect.width * .25 ? "left" : x > rect.x + rect.width * .75 ? "right" : "center";
    return { paneId: rect.paneId, edge };
  }
  function navigateHistory(pane: LayoutPane, offset: number) {
    const history = histories[pane.id]; if (!history) return;
    const index = history.index + offset; const id = history.ids[index];
    const tab = pane.tabs.find(t => t.documentId === id); if (!tab) return;
    setHistories(previous => ({ ...previous, [pane.id]: { ...history, index } }));
    session.commit(current => selectTab(current, pane.id, tab.id), "push");
  }
  const flatTabs = panes.flatMap(p => p.tabs.map(tab => ({ pane: p, tab }))).sort((a, b) => a.tab.id.localeCompare(b.tab.id));
  const styleFor = (paneId: string, content = false): CSSProperties => {
    const rect = geometry.panes.find(r => r.paneId === paneId)!;
    return { position: "absolute", left: rect.x, top: rect.y + (content ? HEADER_HEIGHT : 0),
      width: rect.width, height: content ? rect.height - HEADER_HEIGHT : HEADER_HEIGHT };
  };
  return <div ref={viewport} className="relative h-full min-h-0 min-w-0 overflow-auto bg-surface-page"
    onKeyDown={event => { if (event.key === "Escape") { setDragged(null); setDrop(null); setMenu(null); } }}>
    {session.specialView ? fallback : null}
    <div ref={host} data-testid="split-workspace" style={{ position: "relative", width: geometry.width, height: geometry.height,
      display: session.specialView || !session.ready ? "none" : "block" }}
      onDragOver={event => { if (!dragged || !event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDrop(hit(event.clientX, event.clientY)); }}
      onDrop={event => { const target = hit(event.clientX, event.clientY); if (!dragged || !target || event.dataTransfer.getData(DRAG_TYPE) !== dragged) return;
        event.preventDefault(); move(dragged, target.paneId, target.edge); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null); }}>
      {panes.map((pane, index) => {
        const activeTab = pane.tabs.find(tab => tab.id === pane.activeTabId);
        const doc = activeTab?.documentId ? documentMap.get(activeTab.documentId) : undefined;
        const history = histories[pane.id];
        const parentSplit = findParentSplit(session.layout.root, pane.id);
        return <div key={pane.id} data-pane-header={pane.id} style={styleFor(pane.id)} className="z-10 border border-border bg-surface-page"
          onFocus={() => { if (!dragged) focus(pane); }}>
          <div className="flex min-w-0"><div className="min-w-0 flex-1"><DocumentTabs
            tabs={pane.tabs.map(tab => ({ ...tab, title: (tab.documentId && (live?.outlineDocuments?.[tab.documentId]?.title ?? documentMap.get(tab.documentId)?.title)) || t("tabs.new"), path: tab.documentId ? documentMap.get(tab.documentId)?.path ?? "/" : "/" }))}
            activeTabId={pane.activeTabId} reserveLeadingSlot={index === 0 && leftPanel?.isOpen === false}
            onSelect={id => session.commit(current => selectTab(current, pane.id, id), "push")}
            onClose={close} onAdd={() => session.commit(current => addTab(current, pane.id), "push")}
            onDragTab={(id, event) => { event.dataTransfer.setData(DRAG_TYPE, id); event.dataTransfer.effectAllowed = "move"; setDragged(id); setMenu(null); }}
            onDragEnd={() => { setDragged(null); setDrop(null); }} /></div>
            <button type="button" aria-label={copy.actions} aria-expanded={menu === pane.id} className="h-11 w-8 shrink-0 border-b border-border"
              onClick={() => setMenu(menu === pane.id ? null : pane.id)}>⋮</button></div>
          {menu === pane.id ? <div role="menu" className="absolute right-0 top-11 z-40 min-w-44 rounded border border-border bg-surface-page p-1 shadow-lg">
            {(["left", "right", "bottom"] as const).map(edge => <button role="menuitem" type="button" key={edge}
              disabled={!activeTab?.documentId || pane.tabs.length < 2} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:opacity-40"
              onClick={() => activeTab && move(activeTab.id, pane.id, edge)}>{copy[edge]}</button>)}
            {panes.filter(p => p.id !== pane.id).map(target => <button role="menuitem" type="button" key={target.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted" disabled={!activeTab?.documentId}
              onClick={() => activeTab && move(activeTab.id, target.id, "center")}>{copy.move} {panes.indexOf(target) + 1}</button>)}
            {parentSplit ? <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => { session.commit(current => setSplitDirection(current, parentSplit.id, parentSplit.direction === "horizontal" ? "vertical" : "horizontal")); setMenu(null); }}>
              {parentSplit.direction === "horizontal" ? copy.vertical : copy.horizontal}</button> : null}
            <button role="menuitem" type="button" disabled={panes.length < 2} className="block w-full px-3 py-2 text-left text-sm disabled:opacity-40"
              onClick={() => { session.commit(mergeAll, "replace"); setMenu(null); }}>{copy.merge}</button>
          </div> : null}
          <DocumentViewModeProvider mode={modes[activeTab?.id ?? ""] ?? "preview"} onModeChange={mode => activeTab && setModes(previous => ({ ...previous, [activeTab.id]: mode }))}>
            <DocumentToolbar path={doc?.displayPath ?? doc?.path ?? "/"} showModeToggle={Boolean(doc)}
              canNavigateBack={Boolean(history && history.index > 0 && pane.tabs.some(t => t.documentId === history.ids[history.index - 1]))}
              canNavigateForward={Boolean(history && pane.tabs.some(t => t.documentId === history.ids[history.index + 1]))}
              onNavigateBack={() => navigateHistory(pane, -1)} onNavigateForward={() => navigateHistory(pane, 1)} />
          </DocumentViewModeProvider>
        </div>;
      })}
      {flatTabs.map(({ tab, pane }) => {
        const visible = tab.id === pane.activeTabId;
        const detail = tab.documentId ? session.details[tab.documentId] : null;
        return <div key={tab.id} data-document-pane={tab.documentId ?? ""} data-pane-id={pane.id}
          style={{ ...styleFor(pane.id, true), display: visible ? "block" : "none" }}
          onPointerDown={() => focus(pane)} onFocus={() => focus(pane)}
          className={`overflow-auto border p-5 ${session.layout.activePaneId === pane.id ? "border-primary" : "border-border"}`}>
          {detail ? <DocumentViewModeProvider mode={modes[tab.id] ?? "preview"} onModeChange={mode => setModes(previous => ({ ...previous, [tab.id]: mode }))}>
            <DocumentEditor {...session.editorProps} {...detail} attachmentIds={detail.attachments.map(a => a.id)}
              isActive={visible && !session.specialView} resetVersion={session.resetVersions[detail.document.id] ?? 0}
              onDirtyChange={(id, dirty) => { if (dirty) session.dirty.current.add(id); else session.dirty.current.delete(id); }}
              action={async data => { await session.mutate(session.editorProps.action, data, detail.document.id); }}
              uploadAttachmentAction={async data => await session.mutate(session.editorProps.uploadAttachmentAction, data, detail.document.id) as Awaited<ReturnType<typeof session.editorProps.uploadAttachmentAction>>}
              createCommentAction={async data => { await session.mutate(session.editorProps.createCommentAction, data, detail.document.id); }} />
          </DocumentViewModeProvider> : tab.documentId ? <div role="status">{session.errors[tab.documentId] ? <>{copy.error} <button type="button" onClick={() => void session.reload(tab.documentId!)}>{copy.retry}</button></> : copy.loading}</div>
            : <p className="text-sm text-ink-muted">{t("tabs.new")}</p>}
        </div>;
      })}
      {panes.filter(p => !p.tabs.length).map(p => <div key={`empty-${p.id}`} style={styleFor(p.id, true)} className="p-5 text-sm text-ink-muted">{t("tabs.new")}</div>)}
      {geometry.splitters.map(splitter => <div key={splitter.splitId} role="separator" tabIndex={0}
        aria-label={copy.resize} aria-orientation={splitter.direction === "horizontal" ? "vertical" : "horizontal"}
        aria-valuemin={5} aria-valuemax={95} aria-valuenow={Math.round(findRatio(session.layout.root, splitter.splitId) * 100)}
        style={{ position: "absolute", left: splitter.x, top: splitter.y, width: splitter.width, height: splitter.height,
          cursor: splitter.direction === "horizontal" ? "col-resize" : "row-resize", touchAction: "none" }} className="z-20 bg-border hover:bg-primary focus:bg-primary"
        onKeyDown={event => { const decrease = splitter.direction === "horizontal" ? "ArrowLeft" : "ArrowUp"; const increase = splitter.direction === "horizontal" ? "ArrowRight" : "ArrowDown";
          if (event.key === decrease || event.key === increase) { event.preventDefault(); session.commit(current => resizeSplit(current, splitter.splitId, findRatio(current.root, splitter.splitId) + (event.key === decrease ? -.05 : .05))); } }}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); resize.current = { id: splitter.splitId, horizontal: splitter.direction === "horizontal", ...splitter.container }; }}
        onPointerMove={event => { const item = resize.current, rect = host.current?.getBoundingClientRect(); if (!item || !rect) return;
          const ratio = item.horizontal ? (event.clientX - rect.left - item.x) / item.width : (event.clientY - rect.top - item.y) / item.height;
          session.commit(current => resizeSplit(current, item.id, ratio)); }}
        onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }} />)}
      {drop && dragged ? (() => {
        const rect = geometry.panes.find(p => p.paneId === drop.paneId)!;
        const width = drop.edge === "left" || drop.edge === "right" ? rect.width / 2 : rect.width;
        const height = drop.edge === "bottom" ? (rect.height - HEADER_HEIGHT) / 2 : rect.height - HEADER_HEIGHT;
        return <div className="pointer-events-none absolute z-30 flex items-center justify-center border-2 border-primary bg-primary-muted text-sm"
          style={{ left: rect.x + (drop.edge === "right" ? rect.width / 2 : 0), top: rect.y + HEADER_HEIGHT + (drop.edge === "bottom" ? height : 0), width, height }}>{copy.drop}</div>;
      })() : null}
    </div>
  </div>;
}
function findParentSplit(node: LayoutNode, paneId: string): LayoutSplit | null {
  if (node.type === "pane") return null;
  if (node.children.some(child => child.type === "pane" && child.id === paneId)) return node;
  return findParentSplit(node.children[0], paneId) ?? findParentSplit(node.children[1], paneId);
}
function findRatio(node: LayoutNode, id: string): number {
  if (node.type === "pane") return 0;
  return node.id === id ? node.ratio : findRatio(node.children[0], id) || findRatio(node.children[1], id);
}

export function SplitWorkspaceMetadata() {
  const session = useSplitWorkspace();
  const heading = useHeadingNavigation();
  const { language } = useI18n();
  const copy = splitMessages[language];
  const documents = session.specialView ? [] : getPanes(session.layout).flatMap(pane => {
    const id = pane.tabs.find(t => t.id === pane.activeTabId)?.documentId; if (!id) return [];
    const data = session.details[id]; const index = session.documents.find(d => d.id === id);
    if (!index) return [];
    const live = heading?.outlineDocuments?.[id];
    return [{ document: { id, title: live?.title ?? data?.document.title ?? index.title, path: index.displayPath ?? index.path,
      contentMarkdown: live?.contentMarkdown ?? data?.document.contentMarkdown ?? "" },
      versions: data?.versions ?? [], auditLogs: data?.auditLogs ?? [], attachments: data?.attachments ?? [], canWrite: data?.canWrite ?? false,
      loading: !data && !session.errors[id], error: session.errors[id] ? copy.error : undefined }];
  });
  return <MetadataPanel documents={documents} expanded={session.layout.rightSidebar.expandedByDocument}
    activeDocumentId={activeDocumentId(session.layout)} restoreVersionAction={session.restore}
    onExpandedChange={(id, category, expanded) => session.commit(current => setSidebarExpanded(current, id, category, expanded))}
    onRetryDocument={id => void session.reload(id)} onNavigateToDocumentHeading={(id, target) => {
      const pane = getPanes(session.layout).find(p => p.tabs.some(tab => tab.documentId === id));
      if (pane) session.commit(current => ({ ...current, activePaneId: pane.id }), "replace");
      heading?.navigateToDocumentHeading?.(id, target);
    }} />;
}
export function SplitWorkspaceChatbot() {
  const session = useSplitWorkspace();
  return <WorkspaceChatbot workspaceSlug={session.workspaceSlug} selectedDocumentId={session.specialView ? null : activeDocumentId(session.layout)}
    defaultChatModel={session.editorProps.defaultChatModel} defaultChatProvider={session.editorProps.defaultChatProvider}
    availableChatProviders={session.editorProps.availableChatProviders} />;
}
