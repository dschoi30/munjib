"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DocumentEditorProps } from "@/components/document-editor/types";
import type { DocumentTabDocument } from "@/lib/document-tabs";
import type { WorkspaceDocumentDetail } from "@/lib/documents/workspace-detail-types";
import { createLayout, getPanes, openDocument, closeTab, parseLayout, layoutStorageKey, type WorkspaceLayout } from "@/lib/workspace-layout";
import { useI18n } from "@/components/i18n-provider";
import { splitMessages } from "@/lib/i18n/split-messages";

export type SplitEditorProps = Omit<DocumentEditorProps,
  "document" | "canWrite" | "attachmentIds" | "tags" | "properties" | "comments" | "linkPanels">;
type Props = {
  userId: string; workspaceId: string; workspaceSlug: string;
  documents: DocumentTabDocument[]; selectedDocumentId: string | null;
  initialDetail: WorkspaceDocumentDetail | null; specialView: boolean;
  editorProps: SplitEditorProps; restoreVersionAction: (data: FormData) => Promise<void>; children: ReactNode;
};
type Session = Props & {
  layout: WorkspaceLayout; ready: boolean;
  commit: (updater: (state: WorkspaceLayout) => WorkspaceLayout, navigation?: "push" | "replace" | false) => void;
  details: Record<string, WorkspaceDocumentDetail>; errors: Record<string, boolean>;
  reload: (id: string) => Promise<WorkspaceDocumentDetail | null>;
  dirty: React.MutableRefObject<Set<string>>; resetVersions: Record<string, number>;
  restore: (data: FormData) => Promise<void>; mutate: (action: (data: FormData) => Promise<unknown>, data: FormData, id: string) => Promise<unknown>;
};
const Context = createContext<Session | null>(null);
export function useSplitWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Split workspace provider required");
  return context;
}
export function activeDocumentId(layout: WorkspaceLayout) {
  const pane = getPanes(layout).find(p => p.id === layout.activePaneId);
  return pane?.tabs.find(t => t.id === pane.activeTabId)?.documentId ?? null;
}
export function SplitWorkspaceProvider(props: Props) {
  const { workspaceSlug, workspaceId, userId, initialDetail, documents, selectedDocumentId, specialView } = props;
  const router = useRouter();
  const { language } = useI18n();
  const copy = splitMessages[language];
  const key = layoutStorageKey(userId, workspaceId);
  const [layout, setLayout] = useState(() => createLayout());
  const state = useRef(layout);
  const [ready, setReady] = useState(false);
  const [details, setDetails] = useState<Record<string, WorkspaceDocumentDetail>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [resetVersions, setResetVersions] = useState<Record<string, number>>({});
  const dirty = useRef(new Set<string>());
  const requests = useRef(new Map<string, AbortController>());
  const denied = useRef(new Set<string>());
  const warned = useRef(false);
  const readableKey = documents.map(d => d.id).sort().join(",");
  const routeRef = useRef(selectedDocumentId);
  const navigate = useCallback((next: WorkspaceLayout, method: "push" | "replace") => {
    const id = activeDocumentId(next);
    const href = `/workspaces/${encodeURIComponent(workspaceSlug)}${id ? `?document=${encodeURIComponent(id)}` : ""}`;
    // Supersede any pending selection even when the address bar still shows this href.
    router[method](href, { scroll: false });
  }, [router, workspaceSlug]);
  const commit = useCallback<Session["commit"]>((update, navigation = false) => {
    const next = update(state.current);
    if (next !== state.current) {
      state.current = next;
      setLayout(next);
      try { window.localStorage.setItem(key, JSON.stringify(next)); }
      catch { if (!warned.current) { toast.error(copy.saveError); warned.current = true; } }
    }
    if (navigation) navigate(next, navigation);
  }, [key, copy.saveError, navigate]);

  useEffect(() => {
    let restored: WorkspaceLayout | null = null;
    try { restored = parseLayout(window.localStorage.getItem(key), documents.map(d => d.id)); } catch { /* storage disabled */ }
    let next = restored ?? createLayout();
    if (selectedDocumentId && documents.some(d => d.id === selectedDocumentId)) next = openDocument(next, selectedDocumentId);
    state.current = next; setLayout(next); setReady(true);
    routeRef.current = selectedDocumentId;
    if (!specialView && !selectedDocumentId && activeDocumentId(next)) navigate(next, "replace");
    return () => { requests.current.forEach(r => r.abort()); requests.current.clear(); dirty.current.clear(); };
    // The parent keys this provider by account/workspace, preserving it across document routes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    const readable = new Set(documents.map(d => d.id));
    let next = state.current;
    for (const pane of getPanes(next)) for (const tab of pane.tabs) {
      if (tab.documentId && !readable.has(tab.documentId)) next = closeTab(next, tab.id);
    }
    if (routeRef.current !== selectedDocumentId) {
      routeRef.current = selectedDocumentId;
      if (selectedDocumentId && readable.has(selectedDocumentId)) next = openDocument(next, selectedDocumentId);
    }
    const expanded = next.rightSidebar.expandedByDocument;
    if (Object.keys(expanded).some(id => !readable.has(id))) next = { ...next, rightSidebar: {
      expandedByDocument: Object.fromEntries(Object.entries(expanded).filter(([id]) => readable.has(id))),
    } };
    if (next !== state.current) commit(() => next);
    setDetails(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => readable.has(id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readableKey, selectedDocumentId, ready]);

  const reload = useCallback(async (id: string) => {
    requests.current.get(id)?.abort();
    const controller = new AbortController(); requests.current.set(id, controller);
    setErrors(previous => ({ ...previous, [id]: false }));
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/documents/${encodeURIComponent(id)}/detail`,
        { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return null;
      if (response.status === 401 || response.status === 404) {
        denied.current.add(id);
        setDetails(previous => { const next = { ...previous }; delete next[id]; return next; });
        commit(current => {
          let next = current;
          for (const p of getPanes(next)) for (const tab of p.tabs) if (tab.documentId === id) next = closeTab(next, tab.id);
          const expandedByDocument = { ...next.rightSidebar.expandedByDocument };
          delete expandedByDocument[id];
          return { ...next, rightSidebar: { expandedByDocument } };
        });
        return null;
      }
      if (!response.ok) throw new Error("DETAIL_UNAVAILABLE");
      const detail: WorkspaceDocumentDetail = await response.json();
      if (detail.document.id !== id || controller.signal.aborted) return null;
      denied.current.delete(id);
      setDetails(previous => ({ ...previous, [id]: detail }));
      return detail;
    } catch {
      if (!controller.signal.aborted) setErrors(previous => ({ ...previous, [id]: true }));
      return null;
    } finally { if (requests.current.get(id) === controller) requests.current.delete(id); }
  }, [workspaceSlug, commit]);
  useEffect(() => {
    if (initialDetail) setDetails(previous => ({ ...previous, [initialDetail.document.id]: initialDetail }));
  }, [initialDetail]);
  const allDocumentIds = getPanes(layout).flatMap(p => p.tabs.map(t => t.documentId)).filter((id): id is string => Boolean(id));
  const openKey = allDocumentIds.join(",");
  useEffect(() => {
    if (!ready) return;
    for (const id of allDocumentIds) if (!details[id] && !errors[id] && !requests.current.has(id) && !denied.current.has(id)) void reload(id);
    // Only tab changes trigger admission; errors have an explicit retry action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, ready]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      for (const p of getPanes(state.current)) {
        const id = p.tabs.find(t => t.id === p.activeTabId)?.documentId;
        if (id) void reload(id);
      }
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);
  useEffect(() => {
    const open = (event: Event) => {
      const request = event as CustomEvent<{ workspaceSlug: string; document: DocumentTabDocument }>;
      if (request.detail.workspaceSlug !== workspaceSlug) return;
      event.preventDefault();
      commit(current => openDocument(current, request.detail.document.id), "push");
    };
    window.addEventListener("munjib:open-document-tab", open);
    return () => window.removeEventListener("munjib:open-document-tab", open);
  }, [commit, workspaceSlug]);
  useEffect(() => {
    const leave = (event: Event) => {
      if (dirty.current.size && !window.confirm(copy.discard)) event.preventDefault();
    };
    window.addEventListener("munjib:before-sign-out", leave);
    return () => window.removeEventListener("munjib:before-sign-out", leave);
  }, [copy.discard]);
  const mutate = useCallback<Session["mutate"]>(async (action, data, id) => {
    const result = await action(data);
    await reload(id);
    return result;
  }, [reload]);
  const restore = useCallback(async (data: FormData) => {
    const versionId = String(data.get("versionId"));
    const target = Object.values(details).find(d => d.versions.some(v => v.id === versionId));
    if (!target || !window.confirm(copy.restore)) return;
    const payload = new FormData(); payload.set("versionId", versionId); payload.set("redirect", "false");
    await props.restoreVersionAction(payload);
    if (await reload(target.document.id)) {
      setResetVersions(previous => ({ ...previous, [target.document.id]: (previous[target.document.id] ?? 0) + 1 }));
    }
  }, [details, copy.restore, props.restoreVersionAction, reload]);
  return <Context.Provider value={{ ...props, layout, ready, commit, details, errors, reload, dirty, resetVersions, restore, mutate }}>{props.children}</Context.Provider>;
}
