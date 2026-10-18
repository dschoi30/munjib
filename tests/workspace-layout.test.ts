import { describe, expect, it } from "vitest";
import * as layout from "@/lib/workspace-layout";

describe("workspace layout transitions", () => {
  it("splits only the target pane and collapses only the emptied branch", () => {
    let state = layout.createLayout("a");
    const first = state.activePaneId;
    state = layout.openDocument(state, "b");
    const b = layout.getPanes(state)[0].activeTabId!;
    state = layout.moveTab(state, b, first, "right");
    const right = state.activePaneId;
    state = layout.openDocument(state, "c");
    const c = layout.getPanes(state).find(p => p.id === right)!.activeTabId!;
    state = layout.moveTab(state, c, right, "bottom");
    expect(layout.getPanes(state).map(p => p.tabs[0].documentId)).toEqual(["a", "b", "c"]);
    expect(state.root.type === "split" && state.root.children[1].type).toBe("split");
    state = layout.closeTab(state, b);
    expect(layout.getPanes(state).map(p => p.tabs[0].documentId)).toEqual(["a", "c"]);
    expect(layout.getPanes(state)[0].id).toBe(first);
  });
});

it("keeps tab identity across selection, movement, resize and merge", () => {
  let state = layout.createLayout("a");
  const first = state.activePaneId;
  const a = layout.getPanes(state)[0].activeTabId!;
  expect(layout.moveTab(state, a, first, "left")).toBe(state);
  state = layout.openDocument(state, "b");
  const b = layout.getPanes(state)[0].activeTabId!;
  state = layout.moveTab(state, b, first, "left");
  expect(layout.getPanes(state).map(p => p.tabs[0].documentId)).toEqual(["b", "a"]);
  state = layout.resizeSplit(state, state.root.id, 0.7);
  expect(state.root.type === "split" && state.root.ratio).toBe(0.7);
  state = layout.openDocument(state, "a");
  expect(state.activePaneId).toBe(first);
  expect(layout.getPanes(state).flatMap(p => p.tabs)).toHaveLength(2);
  state = layout.mergeAll(state);
  expect(layout.getPanes(state)).toHaveLength(1);
  expect(layout.getPanes(state)[0].activeTabId).toBe(a);
  expect(layout.getPanes(state)[0].tabs.map(tab => tab.documentId)).toEqual(["a", "b"]);
  state = layout.addTab(state);
  expect(layout.getPanes(state)[0].tabs.at(-1)?.documentId).toBeNull();
});

it("restores only readable documents and permitted metadata, isolating account keys", () => {
  let state = layout.createLayout("a");
  state = layout.openDocument(state, "private");
  const privateTab = layout.getPanes(state)[0].activeTabId!;
  state = layout.moveTab(state, privateTab, state.activePaneId, "right");
  state = layout.setSidebarExpanded(state, "a", "outline", false);
  state = layout.setSidebarExpanded(state, "private", "audit", false);
  const restored = layout.parseLayout(JSON.stringify(state), ["a"])!;
  expect(layout.getPanes(restored).map(p => p.tabs.map(t => t.documentId))).toEqual([["a"]]);
  expect(restored.rightSidebar.expandedByDocument).toEqual({ a: { outline: false } });
  const storage = new Map<string, string>();
  const adapter = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  expect(layout.writeLayout(adapter, "user1", "space", state)).toBe(true);
  expect(layout.readLayout(adapter, "user2", "space", ["a"])).toBeNull();
  expect(layout.readLayout(adapter, "user1", "space", ["a"])?.root.type).toBe("pane");
  expect(layout.parseLayout('{broken', ["a"])).toBeNull();
  expect(layout.parseLayout('{"version":2}', ["a"])).toBeNull();
  expect(layout.layoutStorageKey("a:b", "c")).not.toBe(layout.layoutStorageKey("a", "b:c"));
});

it("keeps all nested panes above minimum size in a scrolling workspace", () => {
  let state = layout.createLayout("a");
  state = layout.openDocument(state, "b");
  state = layout.moveTab(state, layout.getPanes(state)[0].activeTabId!, state.activePaneId, "right");
  state = layout.openDocument(state, "c");
  state = layout.moveTab(state, layout.getPanes(state)[1].activeTabId!, state.activePaneId, "bottom");
  const geometry = layout.calculateLayout(state, 400, 300);
  expect([geometry.width, geometry.height]).toEqual([646, 486]);
  expect(geometry.panes.map(p => [p.x, p.y, p.width, p.height])).toEqual([[0, 0, 320, 486], [326, 0, 320, 240], [326, 246, 320, 240]]);
  expect(geometry.splitters).toHaveLength(2);
});

it("moves into an existing pane without losing tabs and excludes saved document bodies", () => {
  let state = layout.createLayout("a");
  state = layout.openDocument(state, "b");
  const [first] = layout.getPanes(state);
  const b = first.activeTabId!;
  state = layout.moveTab(state, b, first.id, "right");
  state = layout.moveTab(state, b, first.id, "center");
  expect(layout.getPanes(state).map(p => p.tabs.map(t => t.documentId))).toEqual([["a", "b"]]);
  const untrusted = JSON.parse(JSON.stringify(state));
  untrusted.root.tabs.push({ id: "duplicate", documentId: "a", title: "secret", body: "secret" });
  untrusted.root.tabs[0].title = "secret";
  untrusted.root.activeTabId = "missing";
  untrusted.activePaneId = "missing";
  const restored = layout.parseLayout(JSON.stringify(untrusted), ["a", "b"])!;
  expect(layout.getPanes(restored)[0].tabs).toHaveLength(2);
  expect(JSON.stringify(restored)).not.toContain("secret");
  expect(restored.activePaneId).toBe(restored.root.id);
  expect(layout.getPanes(restored)[0].activeTabId).toBe(first.tabs[0].id);
  expect(layout.readLayout({ getItem: () => { throw Error("blocked"); } }, "a", "w", ["a"])).toBeNull();
  expect(layout.writeLayout({ setItem: () => { throw Error("quota"); } }, "a", "w", state)).toBe(false);
});

it("changes only the chosen split axis while preserving its tabs and ratios", () => {
  let state = layout.createLayout("a");
  state = layout.openDocument(state, "b");
  state = layout.moveTab(state, layout.getPanes(state)[0].activeTabId!, state.activePaneId, "right");
  state = layout.openDocument(state, "c");
  state = layout.moveTab(state, layout.getPanes(state)[1].activeTabId!, state.activePaneId, "bottom");
  if (state.root.type !== "split" || state.root.children[1].type !== "split") throw new Error("Expected nested split");
  const nested = state.root.children[1];
  const changed = layout.setSplitDirection(state, nested.id, "horizontal");
  expect(changed.root.type === "split" && changed.root.direction).toBe("horizontal");
  expect(changed.root.type === "split" && changed.root.children[1]).toEqual({ ...nested, direction: "horizontal" });
  expect(layout.getPanes(changed)).toEqual(layout.getPanes(state));
  expect(changed.activePaneId).toBe(state.activePaneId);
});
