# Knowledge Graph Zoom And Session Display Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine `KnowledgeGraphView` so graph filters default off, graph display/force options persist for the browser session, node sizing adapts to document count, and zoom/labels stay within usable bounds.

**Architecture:** Keep the feature inside `components/knowledge-graph-view.tsx` because the state is component-local and existing tests already mock the force graph boundary there. Add small pure helpers at the bottom of the file for storage validation, document-count node sizing, font clamping, and label offset calculation. Use `react-force-graph-2d` `minZoom` and `maxZoom` props for bounded zoom.

**Tech Stack:** Next.js client component, React state/effects, `sessionStorage`, `react-force-graph-2d`, Vitest, React Testing Library, repository wiki maintenance commands.

---

## File Structure

- Modify `components/knowledge-graph-view.tsx`
  - Change `DEFAULT_FILTERS`.
  - Add zoom constants, label font constants, node-size tier helpers, storage key helpers, and storage parser helpers.
  - Hydrate `filters`, `display`, and `forces` from `sessionStorage` after mount.
  - Persist those option groups after hydration.
  - Pass effective node size plus `minZoom`/`maxZoom` to `ForceGraph2D`.
  - Use effective node size and clamped font size in `nodeCanvasObject`.
- Modify `tests/components/knowledge-graph-view.test.tsx`
  - Add `sessionStorage` mock setup/cleanup.
  - Update existing filter and display tests for default-off filters and effective node size.
  - Add storage persistence, invalid storage fallback, document-count scaling, zoom bound, and label clamp tests.
- Modify `wiki/Document Editing Workflow.md`
  - Record implemented Issue #67 graph control behavior after source changes are complete.
- Modify `wiki/index.md`
  - Update the graph follow-up status for Issue #67 after implementation.
- Modify `wiki/log.md`
  - Add implementation chronology and verification evidence.

## Constants And Helper Contracts

Use these values consistently in implementation and tests:

```ts
const KNOWLEDGE_GRAPH_STORAGE_VERSION = "v1";
const GRAPH_MIN_ZOOM = 0.35;
const GRAPH_MAX_ZOOM = 3.5;
const MIN_LABEL_FONT_SIZE = 9;
const MAX_LABEL_FONT_SIZE = 16;
const BASE_LABEL_FONT_SIZE = 12;
const LABEL_PADDING = 5;
```

Use these helper signatures:

```ts
function graphSettingsStorageKey(
  workspaceSlug: string,
  group: "display" | "filters" | "forces",
) {
  return `munjib:knowledge-graph:${workspaceSlug}:${KNOWLEDGE_GRAPH_STORAGE_VERSION}:${group}`;
}

function getDocumentNodeCount(graph: KnowledgeGraphData) {
  return graph.nodes.filter((node) => node.kind === "document").length;
}

function getNodeSizeBaseline(documentCount: number) {
  if (documentCount >= 250) return 0.45;
  if (documentCount >= 100) return 0.55;
  if (documentCount >= 25) return 0.7;
  return 0.85;
}

function getEffectiveNodeSize(nodeSize: number, documentCount: number) {
  return nodeSize * getNodeSizeBaseline(documentCount);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getLabelFontSize(globalScale: number) {
  return clamp(BASE_LABEL_FONT_SIZE / Math.sqrt(globalScale), MIN_LABEL_FONT_SIZE, MAX_LABEL_FONT_SIZE);
}

function getLabelYOffset(effectiveNodeSize: number, fontSize: number, globalScale: number) {
  return (effectiveNodeSize + LABEL_PADDING + fontSize / 2) / globalScale;
}
```

Storage parser helpers should return `null` for malformed JSON, wrong shapes, wrong primitive types, and out-of-range numeric values. Merge restored values over defaults only when the whole group validates.

---

### Task 1: Default Filters And Session Storage

**Files:**
- Modify: `tests/components/knowledge-graph-view.test.tsx`
- Modify: `components/knowledge-graph-view.tsx`

- [ ] **Step 1: Add a sessionStorage mock and default-off filter expectations**

In `tests/components/knowledge-graph-view.test.tsx`, add this helper near `renderGraph()`:

```ts
function createSessionStorageMock() {
  const values = new Map<string, string>();

  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}
```

Add this inside `beforeEach()` before `Object.defineProperties(HTMLElement.prototype, ...)`:

```ts
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: createSessionStorageMock(),
});
```

In the `"renders force graph and closes the settings panel to a reopen icon"` test, replace the two filter visibility assertions with checked-state assertions:

```ts
expect(screen.getByLabelText("Tags")).not.toBeChecked();
expect(screen.getByLabelText("Orphans")).not.toBeChecked();
```

In the reopen block of the same test, replace the repeated filter assertions with:

```ts
expect(screen.getByLabelText("Tags")).not.toBeChecked();
expect(screen.getByLabelText("Orphans")).not.toBeChecked();
```

- [ ] **Step 2: Update the existing tag filter test for default-off behavior**

Replace the current `"filters tag links and leaves only document nodes when Tags is unchecked"` test body with:

```ts
const graph = createGraph();
renderGraph();

expect(forceGraphMock.state.latestProps?.graphData).toEqual({
  nodes: [graph.nodes[0]],
  links: [],
});

fireEvent.click(screen.getByLabelText("Tags"));

expect(forceGraphMock.state.latestProps?.graphData).toEqual({
  nodes: graph.nodes,
  links: graph.links,
});
```

Rename the test to:

```ts
it("starts tag filtering disabled and restores tag links when Tags is checked", () => {
```

- [ ] **Step 3: Add storage restore and persist tests**

Add this test after the tag filter test:

```ts
it("persists filters, display, and forces in workspace session storage", async () => {
  renderGraph();

  fireEvent.click(screen.getByLabelText("Tags"));
  fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
  fireEvent.change(screen.getByLabelText("Node size"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
  fireEvent.change(screen.getByLabelText("Repel force"), { target: { value: "-180" } });

  await waitFor(() => {
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      "munjib:knowledge-graph:company-handbook:v1:filters",
      JSON.stringify({ tag: true, orphans: false }),
    );
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      "munjib:knowledge-graph:company-handbook:v1:display",
      JSON.stringify({
        arrows: false,
        linkThickness: 1,
        nodeSize: 8,
        textFadeThreshold: 1,
      }),
    );
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      "munjib:knowledge-graph:company-handbook:v1:forces",
      JSON.stringify({
        center: 0.3,
        link: 0.4,
        linkDistance: 80,
        repel: -180,
      }),
    );
  });
});
```

Add this test after it:

```ts
it("restores valid workspace graph settings from session storage", async () => {
  window.sessionStorage.setItem(
    "munjib:knowledge-graph:company-handbook:v1:filters",
    JSON.stringify({ tag: true, orphans: true }),
  );
  window.sessionStorage.setItem(
    "munjib:knowledge-graph:company-handbook:v1:display",
    JSON.stringify({
      arrows: true,
      linkThickness: 3,
      nodeSize: 8,
      textFadeThreshold: 2,
    }),
  );
  window.sessionStorage.setItem(
    "munjib:knowledge-graph:company-handbook:v1:forces",
    JSON.stringify({
      center: 0.6,
      link: 0.7,
      linkDistance: 120,
      repel: -180,
    }),
  );

  renderGraph();

  await waitFor(() => {
    expect(screen.getByLabelText("Tags")).toBeChecked();
    expect(screen.getByLabelText("Orphans")).toBeChecked();
  });

  fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
  expect(screen.getByLabelText("Arrows")).toBeChecked();
  expect(screen.getByLabelText("Node size")).toHaveValue("8");
  expect(screen.getByLabelText("Text fade threshold")).toHaveValue("2");
  expect(screen.getByLabelText("Link thickness")).toHaveValue("3");

  fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
  expect(screen.getByLabelText("Center force")).toHaveValue("0.6");
  expect(screen.getByLabelText("Repel force")).toHaveValue("-180");
  expect(screen.getByLabelText("Link force")).toHaveValue("0.7");
  expect(screen.getByLabelText("Link distance")).toHaveValue("120");
});
```

Add this test after it:

```ts
it("ignores invalid session storage settings and keeps defaults", async () => {
  window.sessionStorage.setItem(
    "munjib:knowledge-graph:company-handbook:v1:filters",
    JSON.stringify({ tag: true, orphans: "yes" }),
  );
  window.sessionStorage.setItem(
    "munjib:knowledge-graph:company-handbook:v1:display",
    JSON.stringify({
      arrows: false,
      linkThickness: 20,
      nodeSize: 8,
      textFadeThreshold: 2,
    }),
  );
  window.sessionStorage.setItem(
    "munjib:knowledge-graph:company-handbook:v1:forces",
    "not-json",
  );

  renderGraph();

  await waitFor(() => {
    expect(window.sessionStorage.getItem).toHaveBeenCalledWith(
      "munjib:knowledge-graph:company-handbook:v1:filters",
    );
  });

  expect(screen.getByLabelText("Tags")).not.toBeChecked();
  expect(screen.getByLabelText("Orphans")).not.toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
  expect(screen.getByLabelText("Node size")).toHaveValue("3");
  expect(screen.getByLabelText("Link thickness")).toHaveValue("1");

  fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
  expect(screen.getByLabelText("Repel force")).toHaveValue("-120");
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: FAIL because filters still default to checked and `sessionStorage` hydration/persistence does not exist.

- [ ] **Step 5: Implement default-off filters and storage helpers**

In `components/knowledge-graph-view.tsx`, change `DEFAULT_FILTERS` to:

```ts
const DEFAULT_FILTERS: KnowledgeGraphFilters = {
  tag: false,
  orphans: false,
};
```

Add this type below `type GraphForceSettings`:

```ts
type GraphSettingsGroup = "display" | "filters" | "forces";
```

Add this constant near the display/force constants:

```ts
const KNOWLEDGE_GRAPH_STORAGE_VERSION = "v1";
```

Add these helpers near the bottom of the file before `hexToRgb()`:

```ts
function graphSettingsStorageKey(workspaceSlug: string, group: GraphSettingsGroup) {
  return `munjib:knowledge-graph:${workspaceSlug}:${KNOWLEDGE_GRAPH_STORAGE_VERSION}:${group}`;
}

function readStoredGraphSettings<State>(
  workspaceSlug: string,
  group: GraphSettingsGroup,
  validate: (value: unknown) => State | null,
) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(graphSettingsStorageKey(workspaceSlug, group));
  if (!raw) {
    return null;
  }

  try {
    return validate(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredGraphSettings<State>(
  workspaceSlug: string,
  group: GraphSettingsGroup,
  value: State,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    graphSettingsStorageKey(workspaceSlug, group),
    JSON.stringify(value),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStoredFilters(value: unknown): KnowledgeGraphFilters | null {
  if (!isRecord(value) || typeof value.tag !== "boolean" || typeof value.orphans !== "boolean") {
    return null;
  }

  return { tag: value.tag, orphans: value.orphans };
}

function isNumberInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateStoredDisplay(value: unknown): GraphDisplaySettings | null {
  if (
    !isRecord(value) ||
    typeof value.arrows !== "boolean" ||
    !isNumberInRange(value.linkThickness, 0.5, 5) ||
    !isNumberInRange(value.nodeSize, 1, 10) ||
    !isNumberInRange(value.textFadeThreshold, 0.5, 3)
  ) {
    return null;
  }

  return {
    arrows: value.arrows,
    linkThickness: value.linkThickness,
    nodeSize: value.nodeSize,
    textFadeThreshold: value.textFadeThreshold,
  };
}

function validateStoredForces(value: unknown): GraphForceSettings | null {
  if (
    !isRecord(value) ||
    !isNumberInRange(value.center, 0, 1) ||
    !isNumberInRange(value.link, 0, 1) ||
    !isNumberInRange(value.linkDistance, 20, 180) ||
    !isNumberInRange(value.repel, -300, -20)
  ) {
    return null;
  }

  return {
    center: value.center,
    link: value.link,
    linkDistance: value.linkDistance,
    repel: value.repel,
  };
}
```

Add this state near the existing `filters/display/forces` state:

```ts
const [settingsHydrated, setSettingsHydrated] = useState(false);
```

Add this effect after `nodeColorsRgb`:

```ts
useEffect(() => {
  setFilters(
    readStoredGraphSettings(workspaceSlug, "filters", validateStoredFilters) ?? DEFAULT_FILTERS,
  );
  setDisplay(
    readStoredGraphSettings(workspaceSlug, "display", validateStoredDisplay) ??
      DEFAULT_DISPLAY_SETTINGS,
  );
  setForces(
    readStoredGraphSettings(workspaceSlug, "forces", validateStoredForces) ??
      DEFAULT_FORCE_SETTINGS,
  );
  setSettingsHydrated(true);
}, [workspaceSlug]);
```

Add these effects after it:

```ts
useEffect(() => {
  if (!settingsHydrated) {
    return;
  }

  writeStoredGraphSettings(workspaceSlug, "filters", filters);
}, [filters, settingsHydrated, workspaceSlug]);

useEffect(() => {
  if (!settingsHydrated) {
    return;
  }

  writeStoredGraphSettings(workspaceSlug, "display", display);
}, [display, settingsHydrated, workspaceSlug]);

useEffect(() => {
  if (!settingsHydrated) {
    return;
  }

  writeStoredGraphSettings(workspaceSlug, "forces", forces);
}, [forces, settingsHydrated, workspaceSlug]);
```

- [ ] **Step 6: Run tests to verify Task 1 passes**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: PASS for the new storage/default tests, with failures only in tests that still expect raw node size values.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add components/knowledge-graph-view.tsx tests/components/knowledge-graph-view.test.tsx
git commit -m "feat: persist knowledge graph display settings"
```

---

### Task 2: Bounded Zoom, Effective Node Size, And Label Clamping

**Files:**
- Modify: `tests/components/knowledge-graph-view.test.tsx`
- Modify: `components/knowledge-graph-view.tsx`

- [ ] **Step 1: Add document-count graph fixture helper**

In `tests/components/knowledge-graph-view.test.tsx`, add this helper after `createGraph()`:

```ts
function createDocumentCountGraph(documentCount: number): KnowledgeGraphData {
  const nodes = Array.from({ length: documentCount }, (_, index) => ({
    id: `document:doc-${index + 1}`,
    kind: "document" as const,
    label: `Document ${index + 1}`,
    documentId: `doc-${index + 1}`,
    title: `Document ${index + 1}`,
    path: `/document-${index + 1}`,
  }));

  return { nodes, links: [] };
}
```

- [ ] **Step 2: Update display prop expectations for effective node size and zoom bounds**

In `"renders display controls and maps them to graph display props"`, replace:

```ts
expect(forceGraphMock.state.latestProps).toMatchObject({
  linkDirectionalArrowLength: 0,
  nodeRelSize: 3,
});
```

with:

```ts
expect(forceGraphMock.state.latestProps).toMatchObject({
  linkDirectionalArrowLength: 0,
  maxZoom: 3.5,
  minZoom: 0.35,
  nodeRelSize: 2.55,
});
```

Replace:

```ts
expect(forceGraphMock.state.latestProps).toMatchObject({
  linkDirectionalArrowLength: 4,
  nodeRelSize: 8,
});
```

with:

```ts
expect(forceGraphMock.state.latestProps).toMatchObject({
  linkDirectionalArrowLength: 4,
  nodeRelSize: 6.8,
});
```

- [ ] **Step 3: Add document-count scaling test**

Add this test after the display controls test:

```ts
it("scales node size baseline down as document count grows", () => {
  const { rerender } = render(
    <KnowledgeGraphView
      workspaceSlug="company-handbook"
      graph={createDocumentCountGraph(20)}
      selectedDocumentId={null}
    />,
  );

  expect(forceGraphMock.state.latestProps?.nodeRelSize).toBe(2.55);

  rerender(
    <KnowledgeGraphView
      workspaceSlug="company-handbook"
      graph={createDocumentCountGraph(120)}
      selectedDocumentId={null}
    />,
  );

  expect(forceGraphMock.state.latestProps?.nodeRelSize).toBe(1.65);

  rerender(
    <KnowledgeGraphView
      workspaceSlug="company-handbook"
      graph={createDocumentCountGraph(260)}
      selectedDocumentId={null}
    />,
  );

  expect(forceGraphMock.state.latestProps?.nodeRelSize).toBe(1.35);
});
```

- [ ] **Step 4: Update label drawing test for bounded font and effective offset**

In `"uses text fade threshold when drawing node labels"`, after the existing `nodeCanvasObject` lookup, replace the first draw assertion block with:

```ts
nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 1);

expect(context.font).toBe("12px sans-serif");
expect(context.fillStyle).toBe("rgba(100, 116, 139, 0.50)");
expect(context.textAlign).toBe("center");
expect(context.textBaseline).toBe("middle");
expect(context.fillText).toHaveBeenCalledWith("Welcome", 20, 43.55);
```

Then add these draw calls before the existing zoomed-out hidden assertion:

```ts
nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 3.5);
expect(context.font).toBe("9px sans-serif");

nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 0.75);
expect(context.font).toBe("13.856406460551018px sans-serif");
```

Keep the final call at `0.1` and the `toHaveBeenCalledTimes(3)` expectation:

```ts
nodeCanvasObject?.({ ...graph.nodes[0], x: 20, y: 30 }, context, 0.1);

expect(context.fillText).toHaveBeenCalledTimes(3);
```

- [ ] **Step 5: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: FAIL because `nodeRelSize` is still raw, `minZoom`/`maxZoom` are not passed, and labels still use `12 / globalScale` plus raw node size offset.

- [ ] **Step 6: Implement zoom, node-size, and label helpers**

In `components/knowledge-graph-view.tsx`, replace:

```ts
const LABEL_VERTICAL_OFFSET = 8;
const MIN_LABEL_GLOBAL_SCALE = 0.75;
```

with:

```ts
const GRAPH_MIN_ZOOM = 0.35;
const GRAPH_MAX_ZOOM = 3.5;
const MIN_LABEL_GLOBAL_SCALE = 0.75;
const MIN_LABEL_FONT_SIZE = 9;
const MAX_LABEL_FONT_SIZE = 16;
const BASE_LABEL_FONT_SIZE = 12;
const LABEL_PADDING = 5;
```

Add these memoized values after `visibleGraph`:

```ts
const documentNodeCount = useMemo(() => getDocumentNodeCount(graph), [graph]);
const effectiveNodeSize = useMemo(
  () => getEffectiveNodeSize(display.nodeSize, documentNodeCount),
  [display.nodeSize, documentNodeCount],
);
```

Change the `ForceGraph2D` props:

```tsx
nodeRelSize={effectiveNodeSize}
minZoom={GRAPH_MIN_ZOOM}
maxZoom={GRAPH_MAX_ZOOM}
```

Replace the label font and y-offset block:

```ts
const fontSize = 12 / globalScale;
```

with:

```ts
const fontSize = getLabelFontSize(globalScale);
```

Replace:

```ts
const labelY = node.y + (display.nodeSize + LABEL_VERTICAL_OFFSET) / globalScale;
```

with:

```ts
const labelY = node.y + getLabelYOffset(effectiveNodeSize, fontSize, globalScale);
```

Add these helpers before `graphSettingsStorageKey()`:

```ts
function getDocumentNodeCount(graph: KnowledgeGraphData) {
  return graph.nodes.filter((node) => node.kind === "document").length;
}

function getNodeSizeBaseline(documentCount: number) {
  if (documentCount >= 250) {
    return 0.45;
  }

  if (documentCount >= 100) {
    return 0.55;
  }

  if (documentCount >= 25) {
    return 0.7;
  }

  return 0.85;
}

function getEffectiveNodeSize(nodeSize: number, documentCount: number) {
  return nodeSize * getNodeSizeBaseline(documentCount);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getLabelFontSize(globalScale: number) {
  return clamp(
    BASE_LABEL_FONT_SIZE / Math.sqrt(globalScale),
    MIN_LABEL_FONT_SIZE,
    MAX_LABEL_FONT_SIZE,
  );
}

function getLabelYOffset(effectiveNodeSize: number, fontSize: number, globalScale: number) {
  return (effectiveNodeSize + LABEL_PADDING + fontSize / 2) / globalScale;
}
```

- [ ] **Step 7: Run tests to verify Task 2 passes**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add components/knowledge-graph-view.tsx tests/components/knowledge-graph-view.test.tsx
git commit -m "feat: bound knowledge graph zoom and labels"
```

---

### Task 3: Wiki Maintenance And Full Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Generated: `wiki/manifest.json`

- [ ] **Step 1: Update `wiki/Document Editing Workflow.md`**

In the Issue #34 graph paragraph, replace the final Issue #65 graph controls sentence:

```md
Issue #65 이후 graph filters는 `Tags`와 `Orphans`만 노출한다. Wiki links는 항상 적용되고 property graph rendering은 제거되었다. `Display`와 `Forces`는 기본 닫힘 상태이며, node size 기본값은 `3`과 range `1..10`, link thickness max는 `5`다. 선택/hover focus는 link width를 변경하지 않고 색상과 alpha만 바꾼다.
```

with:

```md
Issue #65 이후 graph filters는 `Tags`와 `Orphans`만 노출한다. Wiki links는 항상 적용되고 property graph rendering은 제거되었다. `Display`와 `Forces`는 기본 닫힘 상태이며, node size 기본값은 `3`과 range `1..10`, link thickness max는 `5`다. 선택/hover focus는 link width를 변경하지 않고 색상과 alpha만 바꾼다. Issue #67 이후 `Tags`와 `Orphans`는 기본 unchecked이고, filters/display/forces option은 workspace-scoped `sessionStorage`에 저장되어 browser session 동안 마지막 변경값을 유지한다. Graph zoom은 `minZoom`/`maxZoom` 범위로 제한해 node와 label이 과도하게 작아지거나 커지지 않게 하고, label font size는 zoom에 따라 bounded scaling된다. Node label은 document-count-scaled effective node size와 font size를 기준으로 node 아래에 배치된다. Node size slider 값은 문서 수 tier baseline과 곱해져 큰 workspace일수록 더 compact하게 렌더링된다.
```

- [ ] **Step 2: Update `wiki/index.md`**

In the Graph follow-up bullet, append this sentence to the Issue #67 sentence:

```md
구현은 graph zoom range 상한/하한, label font clamp, node-size tier, sessionStorage persistence를 `components/knowledge-graph-view.tsx`에 적용한다.
```

- [ ] **Step 3: Add implementation log entry**

Add this entry to the top of `wiki/log.md` after `# Wiki Log`:

```md
## 2026-05-25T16:45:00+09:00 - implementation

- Result: Issue #67 knowledge graph zoom and session display controls를 구현했다.
- Coverage: Tags/Orphans filters는 기본 unchecked가 되었고, filters/display/forces option은 workspace-scoped `sessionStorage`에 저장되어 browser session 동안 마지막 변경값을 유지한다. Graph renderer는 `minZoom`/`maxZoom`으로 zoom range를 제한하고, node size slider 값을 문서 수 tier baseline과 곱한 effective node size로 전달한다. Node label font size는 zoom scale에서 계산하되 minimum/maximum으로 clamp하며, effective node size와 font size를 기준으로 node 아래에 배치한다.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #67, `docs/superpowers/specs/2026-05-25-knowledge-graph-zoom-and-session-display-controls-design.md`, `docs/superpowers/plans/2026-05-25-knowledge-graph-zoom-and-session-display-controls.md`, `components/knowledge-graph-view.tsx`, `tests/components/knowledge-graph-view.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx`, `pnpm exec tsc --noEmit`.
```

- [ ] **Step 4: Run focused and type verification**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
pnpm exec tsc --noEmit
```

Expected: both commands PASS.

- [ ] **Step 5: Run wiki maintenance commands**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: `wiki:lint` exits 0 and `wiki:sync-check --staged` reports both source and wiki maintenance changes.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add components/knowledge-graph-view.tsx tests/components/knowledge-graph-view.test.tsx docs/superpowers/plans/2026-05-25-knowledge-graph-zoom-and-session-display-controls.md wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "docs: update knowledge graph zoom behavior"
```

---

### Task 4: Push, PR, And Review Loop

**Files:**
- No source edits unless CI or PR review requires follow-up.

- [ ] **Step 1: Inspect final branch status**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: branch is `issue-67-knowledge-graph-zoom-and-session-display-controls`; working tree is clean after Task 3 commit.

- [ ] **Step 2: Push branch**

Run:

```bash
git push -u origin issue-67-knowledge-graph-zoom-and-session-display-controls
```

Expected: branch pushes successfully.

- [ ] **Step 3: Create draft PR**

Run:

```bash
gh pr create --draft --title "Refine knowledge graph zoom and session display controls" --body "Closes #67"
```

Expected: PR URL is printed.

- [ ] **Step 4: Mark PR ready**

Run:

```bash
gh pr ready
```

Expected: PR is marked ready for review.

- [ ] **Step 5: Wait and inspect PR feedback**

Wait at least 5 minutes, then run:

```bash
gh pr checks
gh pr view --json reviewDecision,reviews,comments,url
PR_NUMBER="$(gh pr view --json number --jq .number)"
python3 /Users/andrewchoi/.codex/plugins/cache/openai-curated/github/dc902811/skills/gh-address-comments/scripts/fetch_comments.py --repo dschoi30/munjib --pr "$PR_NUMBER"
```

Expected: checks are passing or no checks are configured; review threads show no actionable unresolved feedback.

- [ ] **Step 6: Address feedback on the same branch**

When a check fails or review feedback is actionable, make a focused fix in the affected files, rerun:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
pnpm exec tsc --noEmit
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Then commit and push:

```bash
git add components/knowledge-graph-view.tsx tests/components/knowledge-graph-view.test.tsx wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "fix: address knowledge graph review feedback"
git push
```

Repeat Step 5 until there is no actionable review feedback and checks are passing or confirmed absent.

---

## Self-Review Notes

- Spec coverage: The plan covers default-off filters, sessionStorage persistence, invalid storage fallback, document-count node-size baseline, bounded min/max zoom, bounded label font scaling, node-below-label offset, focused tests, wiki updates, and PR review workflow.
- Placeholder scan: The plan contains no TBD/TODO placeholders. Every task includes file paths, code snippets, commands, and expected results.
- Type consistency: Helper names and constants are used consistently across tests and implementation snippets. The zoom bounds use the actual `react-force-graph-2d` `minZoom` and `maxZoom` props confirmed from local type definitions.
