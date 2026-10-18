export type LayoutTab = { id: string; documentId: string | null };
export type LayoutPane = { type: "pane"; id: string; tabs: LayoutTab[]; activeTabId: string | null };
export type LayoutSplit = { type: "split"; id: string; direction: "horizontal" | "vertical"; ratio: number; children: [LayoutNode, LayoutNode] };
export type LayoutNode = LayoutPane | LayoutSplit;
export type SidebarCategory = "outline" | "attachments" | "versions" | "audit";
export type WorkspaceLayout = { version: 1; root: LayoutNode; activePaneId: string; rightSidebar: { expandedByDocument: Record<string, Partial<Record<SidebarCategory, boolean>>> } };
export type DropEdge = "center" | "left" | "right" | "bottom";
const id = () => crypto.randomUUID();
const pane = (tabs: LayoutTab[] = []): LayoutPane => ({ type: "pane", id: id(), tabs, activeTabId: tabs[0]?.id ?? null });
export function createLayout(documentId: string | null = null): WorkspaceLayout {
  const root = pane(documentId ? [{ id: id(), documentId }] : []);
  return { version: 1, root, activePaneId: root.id, rightSidebar: { expandedByDocument: {} } };
}
export function getPanes(layout: WorkspaceLayout): LayoutPane[] {
  const visit = (node: LayoutNode): LayoutPane[] => node.type === "pane" ? [node] : node.children.flatMap(visit);
  return visit(layout.root);
}
function mapNode(node: LayoutNode, fn: (pane: LayoutPane) => LayoutNode | null): LayoutNode | null {
  if (node.type === "pane") return fn(node);
  const a = mapNode(node.children[0], fn), b = mapNode(node.children[1], fn);
  return a && b ? { ...node, children: [a, b] } : a ?? b;
}
function finish(state: WorkspaceLayout, root: LayoutNode | null, activePaneId = state.activePaneId): WorkspaceLayout {
  root ??= pane();
  const next = { ...state, root, activePaneId };
  if (!getPanes(next).some(p => p.id === activePaneId)) next.activePaneId = getPanes(next)[0].id;
  return next;
}
export function selectTab(state: WorkspaceLayout, paneId: string, tabId: string): WorkspaceLayout {
  if (!getPanes(state).some(p => p.id === paneId && p.tabs.some(t => t.id === tabId))) return state;
  return finish(state, mapNode(state.root, p => p.id === paneId ? { ...p, activeTabId: tabId } : p), paneId);
}
export function openDocument(state: WorkspaceLayout, documentId: string, paneId = state.activePaneId): WorkspaceLayout {
  for (const p of getPanes(state)) {
    const existing = p.tabs.find(t => t.documentId === documentId);
    if (existing) return selectTab(state, p.id, existing.id);
  }
  const tab = { id: id(), documentId };
  return finish(state, mapNode(state.root, p => p.id === paneId ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id } : p), paneId);
}
function removeTab(p: LayoutPane, tabId: string): LayoutPane | null {
  const index = p.tabs.findIndex(t => t.id === tabId);
  if (index < 0) return p;
  const tabs = p.tabs.filter(t => t.id !== tabId);
  return tabs.length ? { ...p, tabs, activeTabId: p.activeTabId === tabId ? tabs[Math.min(index, tabs.length - 1)].id : p.activeTabId } : null;
}
export function closeTab(state: WorkspaceLayout, tabId: string): WorkspaceLayout {
  return finish(state, mapNode(state.root, p => removeTab(p, tabId)));
}
export function moveTab(state: WorkspaceLayout, tabId: string, targetPaneId: string, edge: DropEdge): WorkspaceLayout {
  const panes = getPanes(state), source = panes.find(p => p.tabs.some(t => t.id === tabId)), target = panes.find(p => p.id === targetPaneId);
  if (!source || !target || (source === target && (edge === "center" || source.tabs.length === 1))) return state;
  const tab = source.tabs.find(t => t.id === tabId)!;
  const newPane = pane([tab]);
  const root = mapNode(state.root, p => {
    const retained = p.id === source.id ? removeTab(p, tabId) : p;
    if (p.id !== targetPaneId) return retained;
    if (edge === "center") return { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id };
    return { type: "split", id: id(), direction: edge === "bottom" ? "vertical" : "horizontal", ratio: 0.5, children: edge === "left" ? [newPane, retained!] : [retained!, newPane] };
  });
  return finish(state, root, edge === "center" ? targetPaneId : newPane.id);
}
export function addTab(state: WorkspaceLayout, paneId = state.activePaneId): WorkspaceLayout {
  const tab = { id: id(), documentId: null };
  return finish(state, mapNode(state.root, p => p.id === paneId ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id } : p), paneId);
}
export function mergeAll(state: WorkspaceLayout): WorkspaceLayout {
  const panes = getPanes(state), active = panes.find(p => p.id === state.activePaneId)!;
  return finish(state, { ...active, tabs: panes.flatMap(p => p.tabs) }, active.id);
}
const clampRatio = (ratio: number) => Number.isFinite(ratio) ? Math.max(0.05, Math.min(0.95, ratio)) : 0.5;
export function resizeSplit(state: WorkspaceLayout, splitId: string, ratio: number): WorkspaceLayout {
  const visit = (node: LayoutNode): LayoutNode => node.type === "pane" ? node : { ...node, ratio: node.id === splitId ? clampRatio(ratio) : node.ratio, children: [visit(node.children[0]), visit(node.children[1])] };
  return { ...state, root: visit(state.root) };
}
export function setSplitDirection(state: WorkspaceLayout, splitId: string, direction: LayoutSplit["direction"]): WorkspaceLayout {
  const visit = (node: LayoutNode): LayoutNode => node.type === "pane" ? node : {
    ...node, direction: node.id === splitId ? direction : node.direction,
    children: [visit(node.children[0]), visit(node.children[1])],
  };
  return { ...state, root: visit(state.root) };
}
export function setSidebarExpanded(state: WorkspaceLayout, documentId: string, category: SidebarCategory, expanded: boolean): WorkspaceLayout {
  return { ...state, rightSidebar: { expandedByDocument: { ...state.rightSidebar.expandedByDocument, [documentId]: { ...state.rightSidebar.expandedByDocument[documentId], [category]: expanded } } } };
}
const categories: SidebarCategory[] = ["outline", "attachments", "versions", "audit"];
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
/** A storage snapshot is untrusted; readable IDs come from the current server projection. */
export function parseLayout(raw: string | null, readableIds: Iterable<string>): WorkspaceLayout | null {
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1) return null;
    const readable = new Set(readableIds), nodes = new Set<string>(), tabs = new Set<string>(), documents = new Set<string>();
    let count = 0;
    const visit = (input: unknown, depth: number): LayoutNode | null => {
      if (++count > 2048 || depth > 64) throw new Error("layout bounds");
      if (!record(input) || !validId(input.id) || nodes.has(input.id)) return null;
      nodes.add(input.id);
      if (input.type === "pane") {
        if (!Array.isArray(input.tabs) || input.tabs.length > 2048) return null;
        const kept: LayoutTab[] = [];
        for (const tab of input.tabs) {
          if (!record(tab) || !validId(tab.id) || tabs.has(tab.id)) continue;
          if (tab.documentId !== null && (!validId(tab.documentId) || !readable.has(tab.documentId) || documents.has(tab.documentId))) continue;
          tabs.add(tab.id);
          if (tab.documentId !== null) documents.add(tab.documentId);
          kept.push({ id: tab.id, documentId: tab.documentId });
        }
        if (!kept.length) return null;
        return { type: "pane", id: input.id, tabs: kept, activeTabId: kept.some(t => t.id === input.activeTabId) ? input.activeTabId as string : kept[0].id };
      }
      if (input.type !== "split" || (input.direction !== "horizontal" && input.direction !== "vertical") || !Array.isArray(input.children) || input.children.length !== 2) return null;
      const a = visit(input.children[0], depth + 1), b = visit(input.children[1], depth + 1);
      return a && b ? { type: "split", id: input.id, direction: input.direction, ratio: clampRatio(typeof input.ratio === "number" ? input.ratio : 0.5), children: [a, b] } : a ?? b;
    };
    const root = visit(value.root, 0) ?? pane();
    const expandedByDocument: WorkspaceLayout["rightSidebar"]["expandedByDocument"] = {};
    const sidebar = record(value.rightSidebar) ? value.rightSidebar.expandedByDocument : null;
    if (record(sidebar)) for (const [documentId, flags] of Object.entries(sidebar)) {
      if (!readable.has(documentId) || !record(flags)) continue;
      const kept: Partial<Record<SidebarCategory, boolean>> = {};
      for (const category of categories) if (typeof flags[category] === "boolean") kept[category] = flags[category];
      Object.defineProperty(expandedByDocument, documentId, { value: kept, enumerable: true, writable: true, configurable: true });
    }
    return finish({ version: 1, root, activePaneId: typeof value.activePaneId === "string" ? value.activePaneId : "", rightSidebar: { expandedByDocument } }, root);
  } catch { return null; }
}
export function layoutStorageKey(userId: string, workspaceId: string): string {
  return `munjib:workspace-layout:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:v1`;
}
export function readLayout(storage: Pick<Storage, "getItem">, userId: string, workspaceId: string, readableIds: Iterable<string>): WorkspaceLayout | null {
  if (!userId || !workspaceId) return null;
  try { return parseLayout(storage.getItem(layoutStorageKey(userId, workspaceId)), readableIds); } catch { return null; }
}
export function writeLayout(storage: Pick<Storage, "setItem">, userId: string, workspaceId: string, state: WorkspaceLayout): boolean {
  if (!userId || !workspaceId) return false;
  try {
    const ids = [...getPanes(state).flatMap(p => p.tabs.flatMap(t => t.documentId ? [t.documentId] : [])), ...Object.keys(state.rightSidebar.expandedByDocument)];
    const projected = parseLayout(JSON.stringify(state), ids);
    if (!projected) return false;
    storage.setItem(layoutStorageKey(userId, workspaceId), JSON.stringify(projected));
    return true;
  } catch { return false; }
}
export type LayoutRect = { x: number; y: number; width: number; height: number };
export type LayoutGeometry = { width: number; height: number; panes: Array<LayoutRect & { paneId: string }>; splitters: Array<LayoutRect & { splitId: string; direction: LayoutSplit["direction"]; container: LayoutRect }> };
export const MIN_PANE_WIDTH = 320;
export const MIN_PANE_HEIGHT = 240;
export const SPLITTER_SIZE = 6;
export function minimumLayoutSize(node: LayoutNode): { width: number; height: number } {
  if (node.type === "pane") return { width: MIN_PANE_WIDTH, height: MIN_PANE_HEIGHT };
  const a = minimumLayoutSize(node.children[0]), b = minimumLayoutSize(node.children[1]);
  return node.direction === "horizontal" ? { width: a.width + b.width + SPLITTER_SIZE, height: Math.max(a.height, b.height) } : { width: Math.max(a.width, b.width), height: a.height + b.height + SPLITTER_SIZE };
}
/** Flat coordinates keep editor hosts mounted while their tree placement changes. */
export function calculateLayout(state: WorkspaceLayout, viewportWidth: number, viewportHeight: number): LayoutGeometry {
  const minimum = minimumLayoutSize(state.root);
  const width = Math.max(minimum.width, Number.isFinite(viewportWidth) ? viewportWidth : 0), height = Math.max(minimum.height, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  const result: LayoutGeometry = { width, height, panes: [], splitters: [] };
  const visit = (node: LayoutNode, rect: LayoutRect) => {
    if (node.type === "pane") { result.panes.push({ ...rect, paneId: node.id }); return; }
    const horizontal = node.direction === "horizontal", axis = horizontal ? "width" : "height";
    const available = rect[axis] - SPLITTER_SIZE;
    const first = Math.max(minimumLayoutSize(node.children[0])[axis], Math.min(available - minimumLayoutSize(node.children[1])[axis], available * clampRatio(node.ratio)));
    const a = { ...rect, [axis]: first }, b = { ...rect, [axis]: available - first, ...(horizontal ? { x: rect.x + first + SPLITTER_SIZE } : { y: rect.y + first + SPLITTER_SIZE }) };
    result.splitters.push({ ...rect, [axis]: SPLITTER_SIZE, ...(horizontal ? { x: rect.x + first } : { y: rect.y + first }), splitId: node.id, direction: node.direction, container: rect });
    visit(node.children[0], a); visit(node.children[1], b);
  };
  visit(state.root, { x: 0, y: 0, width, height });
  return result;
}
