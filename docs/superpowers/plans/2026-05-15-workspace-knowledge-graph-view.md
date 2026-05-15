# Workspace Knowledge Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Obsidian-style workspace knowledge graph view that shows document, tag, wiki link, and property relationships with zoom/pan and filter controls.

**Architecture:** Route graph mode through `?graph=1`, render graph content in the existing workspace center shell, and keep sidebar document/search/favorites panels separate from center graph mode. Server code builds a permission-filtered graph DTO from existing `DocumentLink`, `DocumentTag`, and `DocumentProperty` rows; client code uses `react-force-graph-2d` for canvas rendering and local filter/focus state.

**Tech Stack:** Next.js 15 app router, React 19 client components, Prisma, Vitest/jsdom, Playwright, `react-force-graph-2d`.

---

## File Structure

- Create `lib/knowledge-graph/model.ts`
  - Pure graph DTO types, graph model builder, focus set calculation, filter application, route helper.
- Create `tests/knowledge-graph/model.test.ts`
  - Unit tests for node/link construction, focus, and filters.
- Modify `lib/workspace-routes.ts`
  - Add `workspaceGraphHref()` and optional `graph` clearing behavior through helper usage.
- Modify `tests/workspace-routes.test.ts`
  - Route helper tests for graph mode.
- Modify `components/document-create-controls.tsx`
  - Add `Graph` icon button, active state, tooltip.
- Modify `components/document-list.tsx`
  - Add graph active prop and route handler.
- Modify `tests/components/document-list.test.tsx`
  - Toolbar graph button tests.
- Modify `components/workspace-center-shell.tsx`
  - Add `isGraphView` prop, show `Graph view` path, hide edit/preview toggle, preserve scroll container.
- Modify `tests/components/workspace-center-shell.test.tsx`
  - Graph toolbar/path/mode-toggle tests.
- Create `components/knowledge-graph-view.tsx`
  - Client wrapper around `react-force-graph-2d`, filter panel, node click routing.
- Create `tests/components/knowledge-graph-view.test.tsx`
  - Mock the graph library and test filter panel + node click behavior.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`
  - Parse `graph` search param, query graph relations, build graph DTO, render graph view.
- Modify `tests/e2e/login.spec.ts`
  - Add graph view smoke to the existing workspace login flow.
- Modify wiki files
  - `wiki/Document Editing Workflow.md`
  - `wiki/Document Knowledge Model.md`
  - `wiki/Wiki Links And Backlinks.md`
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki/manifest.json`

---

### Task 1: Route Helpers For Graph Mode

**Files:**
- Modify: `lib/workspace-routes.ts`
- Test: `tests/workspace-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Add these tests to `tests/workspace-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { workspaceDocumentHref, workspaceGraphHref } from "@/lib/workspace-routes";

describe("workspaceDocumentHref", () => {
  it("preserves the search query when linking to a document", () => {
    expect(
      workspaceDocumentHref({
        workspaceSlug: "company-handbook",
        documentId: "doc-1",
        searchQuery: "Backlinked Runbook",
      }),
    ).toBe("/workspaces/company-handbook?document=doc-1&q=Backlinked+Runbook");
  });

  it("omits empty search queries", () => {
    expect(
      workspaceDocumentHref({
        workspaceSlug: "company-handbook",
        documentId: "doc-1",
        searchQuery: "",
      }),
    ).toBe("/workspaces/company-handbook?document=doc-1");
  });
});

describe("workspaceGraphHref", () => {
  it("links to workspace graph mode without a selected document", () => {
    expect(workspaceGraphHref({ workspaceSlug: "company-handbook" })).toBe(
      "/workspaces/company-handbook?graph=1",
    );
  });

  it("preserves a selected document as graph focus", () => {
    expect(
      workspaceGraphHref({
        workspaceSlug: "company-handbook",
        documentId: "doc-1",
      }),
    ).toBe("/workspaces/company-handbook?document=doc-1&graph=1");
  });
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/workspace-routes.test.ts
```

Expected: FAIL because `workspaceGraphHref` is not exported.

- [ ] **Step 3: Implement route helper**

Replace `lib/workspace-routes.ts` with:

```ts
export function workspaceDocumentHref({
  workspaceSlug,
  documentId,
  searchQuery,
}: {
  workspaceSlug: string;
  documentId: string;
  searchQuery?: string;
}) {
  const params = new URLSearchParams({ document: documentId });
  if (searchQuery) {
    params.set("q", searchQuery);
  }

  return `/workspaces/${workspaceSlug}?${params.toString()}`;
}

export function workspaceGraphHref({
  workspaceSlug,
  documentId,
}: {
  workspaceSlug: string;
  documentId?: string | null;
}) {
  const params = new URLSearchParams();
  if (documentId) {
    params.set("document", documentId);
  }
  params.set("graph", "1");

  return `/workspaces/${workspaceSlug}?${params.toString()}`;
}
```

- [ ] **Step 4: Run route tests and verify pass**

Run:

```bash
pnpm exec vitest run tests/workspace-routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workspace-routes.ts tests/workspace-routes.test.ts
git commit -m "add workspace graph route helper"
```

---

### Task 2: Pure Knowledge Graph Model

**Files:**
- Create: `lib/knowledge-graph/model.ts`
- Test: `tests/knowledge-graph/model.test.ts`

- [ ] **Step 1: Write failing model tests**

Create `tests/knowledge-graph/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGraph,
  filterKnowledgeGraph,
  getKnowledgeGraphFocus,
  type KnowledgeGraphInput,
} from "@/lib/knowledge-graph/model";

const input: KnowledgeGraphInput = {
  documents: [
    { id: "doc-1", title: "Welcome", path: "/welcome" },
    { id: "doc-2", title: "Engineering Runbook", path: "/engineering-runbook" },
  ],
  links: [
    {
      id: "link-1",
      sourceDocumentId: "doc-1",
      targetDocumentId: "doc-2",
      targetTitleRaw: "Engineering Runbook",
      isBroken: false,
      isAmbiguous: false,
    },
    {
      id: "link-2",
      sourceDocumentId: "doc-1",
      targetDocumentId: null,
      targetTitleRaw: "Missing Runbook",
      isBroken: true,
      isAmbiguous: false,
    },
  ],
  tags: [
    {
      documentId: "doc-1",
      tag: { name: "Design", normalizedName: "design" },
    },
  ],
  properties: [
    { documentId: "doc-1", key: "status", valueJson: "active", valueType: "string" },
    { documentId: "doc-1", key: "tags", valueJson: ["design"], valueType: "array" },
    { documentId: "doc-1", key: "links", valueJson: ["[[Engineering Runbook]]"], valueType: "array" },
    { documentId: "doc-2", key: "score", valueJson: 5, valueType: "number" },
  ],
};

describe("buildKnowledgeGraph", () => {
  it("builds document, tag, wiki, and property nodes with typed links", () => {
    const graph = buildKnowledgeGraph(input);

    expect(graph.nodes.map((node) => node.id).sort()).toEqual([
      "document:doc-1",
      "document:doc-2",
      "property:score:5",
      "property:status:active",
      "tag:design",
      "wiki:broken:missing-runbook",
    ]);
    expect(graph.links.map((link) => [link.source, link.target, link.kind]).sort()).toEqual([
      ["document:doc-1", "document:doc-2", "wiki"],
      ["document:doc-1", "property:status:active", "property"],
      ["document:doc-1", "tag:design", "tag"],
      ["document:doc-1", "wiki:broken:missing-runbook", "wiki"],
      ["document:doc-2", "property:score:5", "property"],
    ]);
  });

  it("calculates focused 1-hop nodes and links for the selected document", () => {
    const graph = buildKnowledgeGraph(input);
    const focus = getKnowledgeGraphFocus(graph, "doc-1");

    expect(focus.focusedNodeIds.has("document:doc-1")).toBe(true);
    expect(focus.focusedNodeIds.has("document:doc-2")).toBe(true);
    expect(focus.focusedNodeIds.has("tag:design")).toBe(true);
    expect(focus.focusedLinkIds.has("wiki:link-1")).toBe(true);
  });

  it("filters typed links and hides isolated non-document nodes", () => {
    const graph = buildKnowledgeGraph(input);
    const filtered = filterKnowledgeGraph(graph, {
      wiki: false,
      tag: true,
      property: false,
    });

    expect(filtered.links.map((link) => link.kind)).toEqual(["tag"]);
    expect(filtered.nodes.map((node) => node.id).sort()).toEqual([
      "document:doc-1",
      "document:doc-2",
      "tag:design",
    ]);
  });
});
```

- [ ] **Step 2: Run model tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/knowledge-graph/model.test.ts
```

Expected: FAIL because `lib/knowledge-graph/model.ts` does not exist.

- [ ] **Step 3: Implement model helpers**

Create `lib/knowledge-graph/model.ts`:

```ts
import { slugifyTitle } from "@/lib/workspace-tree";

export type KnowledgeGraphNodeKind = "document" | "tag" | "wiki" | "property";
export type KnowledgeGraphLinkKind = "wiki" | "tag" | "property";

export type KnowledgeGraphDocumentInput = {
  id: string;
  title: string;
  path: string;
};

export type KnowledgeGraphLinkInput = {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string | null;
  targetTitleRaw: string;
  isBroken: boolean;
  isAmbiguous: boolean;
};

export type KnowledgeGraphTagInput = {
  documentId: string;
  tag: {
    name: string;
    normalizedName: string;
  };
};

export type KnowledgeGraphPropertyInput = {
  documentId: string;
  key: string;
  valueJson: unknown;
  valueType: string;
};

export type KnowledgeGraphInput = {
  documents: KnowledgeGraphDocumentInput[];
  links: KnowledgeGraphLinkInput[];
  tags: KnowledgeGraphTagInput[];
  properties: KnowledgeGraphPropertyInput[];
};

export type KnowledgeGraphNode =
  | {
      id: string;
      kind: "document";
      label: string;
      documentId: string;
      path: string;
    }
  | {
      id: string;
      kind: "tag";
      label: string;
      normalizedName: string;
    }
  | {
      id: string;
      kind: "wiki";
      label: string;
      targetDocumentId: string | null;
      state: "broken" | "ambiguous";
    }
  | {
      id: string;
      kind: "property";
      label: string;
      key: string;
      value: string;
    };

export type KnowledgeGraphLink = {
  id: string;
  source: string;
  target: string;
  kind: KnowledgeGraphLinkKind;
};

export type KnowledgeGraphData = {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
};

export type KnowledgeGraphFilters = Record<KnowledgeGraphLinkKind, boolean>;

export type KnowledgeGraphFocus = {
  focusedNodeIds: Set<string>;
  focusedLinkIds: Set<string>;
};

const canonicalPropertyRows = new Set(["tags", "links"]);

export function buildKnowledgeGraph(input: KnowledgeGraphInput): KnowledgeGraphData {
  const nodes = new Map<string, KnowledgeGraphNode>();
  const links: KnowledgeGraphLink[] = [];
  const readableDocumentIds = new Set(input.documents.map((document) => document.id));

  for (const document of input.documents) {
    nodes.set(documentNodeId(document.id), {
      id: documentNodeId(document.id),
      kind: "document",
      label: document.title,
      documentId: document.id,
      path: document.path,
    });
  }

  for (const link of input.links) {
    if (!readableDocumentIds.has(link.sourceDocumentId)) continue;
    const source = documentNodeId(link.sourceDocumentId);
    const target = link.targetDocumentId && readableDocumentIds.has(link.targetDocumentId)
      ? documentNodeId(link.targetDocumentId)
      : wikiNodeId(link);

    if (!link.targetDocumentId || !readableDocumentIds.has(link.targetDocumentId)) {
      nodes.set(target, {
        id: target,
        kind: "wiki",
        label: link.targetTitleRaw,
        targetDocumentId: null,
        state: link.isAmbiguous ? "ambiguous" : "broken",
      });
    }

    links.push({ id: `wiki:${link.id}`, source, target, kind: "wiki" });
  }

  for (const tagLink of input.tags) {
    if (!readableDocumentIds.has(tagLink.documentId)) continue;
    const tagId = tagNodeId(tagLink.tag.normalizedName);
    nodes.set(tagId, {
      id: tagId,
      kind: "tag",
      label: `#${tagLink.tag.name}`,
      normalizedName: tagLink.tag.normalizedName,
    });
    links.push({
      id: `tag:${tagLink.documentId}:${tagLink.tag.normalizedName}`,
      source: documentNodeId(tagLink.documentId),
      target: tagId,
      kind: "tag",
    });
  }

  for (const property of input.properties) {
    if (!readableDocumentIds.has(property.documentId)) continue;
    if (canonicalPropertyRows.has(property.key)) continue;
    const value = scalarPropertyValue(property.valueJson);
    if (!value) continue;

    const propertyId = propertyNodeId(property.key, value);
    nodes.set(propertyId, {
      id: propertyId,
      kind: "property",
      label: `${property.key}: ${value}`,
      key: property.key,
      value,
    });
    links.push({
      id: `property:${property.documentId}:${property.key}:${slugifyTitle(value)}`,
      source: documentNodeId(property.documentId),
      target: propertyId,
      kind: "property",
    });
  }

  return { nodes: [...nodes.values()], links };
}

export function getKnowledgeGraphFocus(
  graph: KnowledgeGraphData,
  selectedDocumentId: string | null | undefined,
): KnowledgeGraphFocus {
  const focusedNodeIds = new Set<string>();
  const focusedLinkIds = new Set<string>();
  if (!selectedDocumentId) return { focusedNodeIds, focusedLinkIds };

  const selectedNodeId = documentNodeId(selectedDocumentId);
  focusedNodeIds.add(selectedNodeId);

  for (const link of graph.links) {
    if (link.source === selectedNodeId || link.target === selectedNodeId) {
      focusedLinkIds.add(link.id);
      focusedNodeIds.add(link.source);
      focusedNodeIds.add(link.target);
    }
  }

  return { focusedNodeIds, focusedLinkIds };
}

export function filterKnowledgeGraph(
  graph: KnowledgeGraphData,
  filters: KnowledgeGraphFilters,
): KnowledgeGraphData {
  const links = graph.links.filter((link) => filters[link.kind]);
  const linkedNodeIds = new Set(links.flatMap((link) => [link.source, link.target]));
  const nodes = graph.nodes.filter(
    (node) => node.kind === "document" || linkedNodeIds.has(node.id),
  );

  return { nodes, links };
}

export function documentNodeId(documentId: string) {
  return `document:${documentId}`;
}

function tagNodeId(normalizedName: string) {
  return `tag:${normalizedName}`;
}

function wikiNodeId(link: KnowledgeGraphLinkInput) {
  return `wiki:${link.isAmbiguous ? "ambiguous" : "broken"}:${slugifyTitle(link.targetTitleRaw)}`;
}

function propertyNodeId(key: string, value: string) {
  return `property:${slugifyTitle(key)}:${slugifyTitle(value)}`;
}

function scalarPropertyValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}
```

- [ ] **Step 4: Run model tests and verify pass**

Run:

```bash
pnpm exec vitest run tests/knowledge-graph/model.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/knowledge-graph/model.ts tests/knowledge-graph/model.test.ts
git commit -m "add knowledge graph model"
```

---

### Task 3: Sidebar Graph Button And Routing

**Files:**
- Modify: `components/document-create-controls.tsx`
- Modify: `components/document-list.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write failing sidebar test**

Update the `next/navigation` mock and add a graph test in `tests/components/document-list.test.tsx`:

```ts
const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
```

Add:

```ts
beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  let store: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => {
        store = {};
      },
      getItem: (key: string) => store[key] ?? null,
      removeItem: (key: string) => {
        delete store[key];
      },
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    },
  });
});

it("opens graph view from the toolbar with focus on the selected document", () => {
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Graph" }));

  expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1&graph=1");
});

it("marks the graph toolbar button active in graph view", () => {
  renderList({ isGraphView: true });

  expect(screen.getByRole("button", { name: "Graph" }).getAttribute("aria-pressed")).toBe("true");
});
```

- [ ] **Step 2: Run sidebar tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: FAIL because `Graph` button and `isGraphView` prop do not exist.

- [ ] **Step 3: Implement graph button props and route handler**

In `components/document-create-controls.tsx`, import `Network`:

```ts
import { FilePlus2, Folder, FolderPlus, Network, Search, Star } from "lucide-react";
```

Change props:

```ts
activeView,
onOpenGraph,
}: {
  selectedFolderId: string | null;
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  activeView: "documents" | "search" | "favorites" | "graph";
  onOpenDocuments: () => void;
  onOpenSearch: () => void;
  onOpenFavorites: () => void;
  onOpenGraph: () => void;
}) {
```

Replace active checks from `activePanel` to `activeView`, then add after Favorites:

```tsx
<ToolbarTooltip label="Graph">
  <Button
    type="button"
    aria-label="Graph"
    aria-pressed={activeView === "graph"}
    onClick={onOpenGraph}
    className={activeView === "graph" ? activeIconButtonClassName : iconButtonClassName}
  >
    <Network className="h-4 w-4" aria-hidden="true" />
  </Button>
</ToolbarTooltip>
```

In `components/document-list.tsx`, import router and helper:

```ts
import { useRouter } from "next/navigation";
import { workspaceGraphHref } from "@/lib/workspace-routes";
```

Add prop:

```ts
isGraphView = false,
}: {
  workspaceSlug: string;
  folders: FolderListItem[];
  documents: DocumentListItem[];
  canWrite: boolean;
  createAction: (formData: FormData) => Promise<void>;
  createFolderAction: (formData: FormData) => Promise<void>;
  renameFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveFolderAction: (formData: FormData) => Promise<{ folderId: string; error?: string }>;
  archiveDocumentAction: (formData: FormData) => Promise<{ documentId: string }>;
  folderError: string;
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
  isGraphView?: boolean;
}) {
```

Add handler:

```ts
const router = useRouter();

const openGraph = useCallback(() => {
  router.push(
    workspaceGraphHref({
      workspaceSlug,
      documentId: selectedDocumentId,
    }),
  );
}, [router, selectedDocumentId, workspaceSlug]);
```

Pass active view:

```tsx
<DocumentCreateControls
  selectedFolderId={selectedFolderId}
  canWrite={canWrite}
  createAction={createAction}
  createFolderAction={createFolderAction}
  activeView={isGraphView ? "graph" : activePanel}
  onOpenDocuments={openDocuments}
  onOpenSearch={openSearch}
  onOpenFavorites={openFavorites}
  onOpenGraph={openGraph}
/>
```

- [ ] **Step 4: Run sidebar tests and verify pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/document-create-controls.tsx components/document-list.tsx tests/components/document-list.test.tsx
git commit -m "add sidebar graph button"
```

---

### Task 4: Workspace Center Graph Mode

**Files:**
- Modify: `components/workspace-center-shell.tsx`
- Test: `tests/components/workspace-center-shell.test.tsx`

- [ ] **Step 1: Write failing center shell test**

Add to `tests/components/workspace-center-shell.test.tsx`:

```tsx
it("shows graph toolbar state without document mode controls", () => {
  render(
    <WorkspaceCenterShell
      workspaceSlug="company-handbook"
      documents={documents}
      selectedDocument={documents[0]}
      selectedFolder={null}
      isGraphView={true}
    >
      <div>Graph content</div>
    </WorkspaceCenterShell>,
  );

  expect(screen.getByText("Graph view")).toBeTruthy();
  expect(screen.getByText("Graph content")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
});
```

- [ ] **Step 2: Run center shell tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx
```

Expected: FAIL because `isGraphView` is not a valid prop and toolbar path still uses document path.

- [ ] **Step 3: Implement graph mode shell props**

In `components/workspace-center-shell.tsx`, extend props:

```ts
type WorkspaceCenterShellProps = {
  workspaceSlug: string;
  documents: DocumentTabDocument[];
  selectedDocument: DocumentTabDocument | null;
  selectedFolder: { path: string } | null;
  isGraphView?: boolean;
  children: React.ReactNode;
};
```

Thread `isGraphView = false` into `WorkspaceCenterShellContent`, then update toolbar props:

```tsx
<DocumentToolbar
  path={isGraphView ? "Graph view" : (selectedDocument?.path ?? selectedFolder?.path ?? "/")}
  canNavigateBack={canNavigateBack}
  canNavigateForward={canNavigateForward}
  showModeToggle={Boolean(selectedDocument) && !isGraphView}
  onModeChange={handleModeChange}
  onNavigateBack={handleNavigateBack}
  onNavigateForward={handleNavigateForward}
/>
```

- [ ] **Step 4: Run center shell tests and verify pass**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/workspace-center-shell.tsx tests/components/workspace-center-shell.test.tsx
git commit -m "support graph mode in workspace shell"
```

---

### Task 5: Knowledge Graph View Component

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `components/knowledge-graph-view.tsx`
- Test: `tests/components/knowledge-graph-view.test.tsx`

- [ ] **Step 1: Add graph library**

Run:

```bash
pnpm add react-force-graph-2d
```

Expected: `package.json` and `pnpm-lock.yaml` update with `react-force-graph-2d`.

- [ ] **Step 2: Write failing component tests**

Create `tests/components/knowledge-graph-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeGraphView } from "@/components/knowledge-graph-view";
import type { KnowledgeGraphData } from "@/lib/knowledge-graph/model";

const router = vi.hoisted(() => ({
  push: vi.fn(),
}));

const graphProps = vi.hoisted(() => ({
  latest: null as null | {
    graphData: KnowledgeGraphData;
    onNodeClick?: (node: { kind: string; documentId?: string }) => void;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("react-force-graph-2d", () => ({
  default: (props: {
    graphData: KnowledgeGraphData;
    onNodeClick?: (node: { kind: string; documentId?: string }) => void;
  }) => {
    graphProps.latest = props;
    return <div data-testid="force-graph">graph nodes: {props.graphData.nodes.length}</div>;
  },
}));

const graph: KnowledgeGraphData = {
  nodes: [
    { id: "document:doc-1", kind: "document", label: "Welcome", documentId: "doc-1", path: "/welcome" },
    { id: "tag:design", kind: "tag", label: "#design", normalizedName: "design" },
  ],
  links: [{ id: "tag:doc-1:design", source: "document:doc-1", target: "tag:design", kind: "tag" }],
};

afterEach(() => {
  cleanup();
  router.push.mockReset();
  graphProps.latest = null;
});

describe("KnowledgeGraphView", () => {
  it("renders graph and toggles the filter panel", () => {
    render(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={graph}
        selectedDocumentId="doc-1"
      />,
    );

    expect(screen.getByTestId("force-graph")).toBeTruthy();
    expect(screen.getByText("Filters")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(screen.queryByText("Wiki links")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open filters" }));
    expect(screen.getByText("Wiki links")).toBeTruthy();
  });

  it("filters graph data by relationship type", () => {
    render(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={graph}
        selectedDocumentId="doc-1"
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Tags" }));

    expect(graphProps.latest?.graphData.links).toEqual([]);
    expect(graphProps.latest?.graphData.nodes.map((node) => node.id)).toEqual(["document:doc-1"]);
  });

  it("opens a document when a document node is clicked", () => {
    render(
      <KnowledgeGraphView
        workspaceSlug="company-handbook"
        graph={graph}
        selectedDocumentId="doc-1"
      />,
    );

    graphProps.latest?.onNodeClick?.({
      kind: "document",
      documentId: "doc-1",
    });

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-1");
  });
});
```

- [ ] **Step 3: Run component tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: FAIL because `components/knowledge-graph-view.tsx` does not exist.

- [ ] **Step 4: Implement graph view component**

Create `components/knowledge-graph-view.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  filterKnowledgeGraph,
  getKnowledgeGraphFocus,
  type KnowledgeGraphData,
  type KnowledgeGraphFilters,
  type KnowledgeGraphNode,
} from "@/lib/knowledge-graph/model";
import { cn } from "@/lib/utils";
import { workspaceDocumentHref } from "@/lib/workspace-routes";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const graphColors = {
  document: "#e5e7eb",
  focusedDocument: "#8b5cf6",
  wiki: "#8b5cf6",
  tag: "#f59e0b",
  property: "#38bdf8",
};

const defaultFilters: KnowledgeGraphFilters = {
  wiki: true,
  tag: true,
  property: true,
};

export function KnowledgeGraphView({
  workspaceSlug,
  graph,
  selectedDocumentId,
}: {
  workspaceSlug: string;
  graph: KnowledgeGraphData;
  selectedDocumentId: string | null;
}) {
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<KnowledgeGraphFilters>(defaultFilters);
  const focus = useMemo(
    () => getKnowledgeGraphFocus(graph, selectedDocumentId),
    [graph, selectedDocumentId],
  );
  const visibleGraph = useMemo(() => filterKnowledgeGraph(graph, filters), [filters, graph]);

  function toggleFilter(kind: keyof KnowledgeGraphFilters) {
    setFilters((current) => ({ ...current, [kind]: !current[kind] }));
  }

  function handleNodeClick(node: KnowledgeGraphNode) {
    if (node.kind !== "document") return;
    router.push(
      workspaceDocumentHref({
        workspaceSlug,
        documentId: node.documentId,
      }),
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        No graph data available.
      </div>
    );
  }

  return (
    <section className="relative min-h-[640px] overflow-hidden rounded-md bg-zinc-900 text-zinc-100">
      <ForceGraph2D
        graphData={visibleGraph}
        backgroundColor="#18181b"
        nodeLabel={(node: KnowledgeGraphNode) => node.label}
        nodeColor={(node: KnowledgeGraphNode) => {
          if (focus.focusedNodeIds.has(node.id) && node.kind === "document") {
            return graphColors.focusedDocument;
          }
          if (node.kind === "document") return graphColors.document;
          return graphColors[node.kind];
        }}
        linkColor={(link: { kind?: keyof KnowledgeGraphFilters }) =>
          graphColors[link.kind ?? "wiki"]
        }
        linkWidth={(link: { id?: string }) => (link.id && focus.focusedLinkIds.has(link.id) ? 2.5 : 1)}
        onNodeClick={handleNodeClick}
        enableNodeDrag={true}
        cooldownTicks={80}
      />
      <div className="absolute right-3 top-3">
        {filtersOpen ? (
          <FilterPanel filters={filters} onToggle={toggleFilter} onClose={() => setFiltersOpen(false)} />
        ) : (
          <Button
            type="button"
            aria-label="Open filters"
            className="h-9 w-9 bg-zinc-800 p-0 text-zinc-100 hover:bg-zinc-700"
            onClick={() => setFiltersOpen(true)}
          >
            <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </section>
  );
}

function FilterPanel({
  filters,
  onToggle,
  onClose,
}: {
  filters: KnowledgeGraphFilters;
  onToggle: (kind: keyof KnowledgeGraphFilters) => void;
  onClose: () => void;
}) {
  return (
    <aside className="w-64 rounded-md border border-zinc-700 bg-zinc-800/95 p-3 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        <Button
          type="button"
          aria-label="Close filters"
          className="h-8 w-8 bg-transparent p-0 text-zinc-300 hover:bg-zinc-700"
          onClick={onClose}
        >
          <PanelRightClose className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="space-y-3 text-sm">
        <FilterToggle label="Wiki links" color={graphColors.wiki} checked={filters.wiki} onChange={() => onToggle("wiki")} />
        <FilterToggle label="Tags" color={graphColors.tag} checked={filters.tag} onChange={() => onToggle("tag")} />
        <FilterToggle label="Properties" color={graphColors.property} checked={filters.property} onChange={() => onToggle("property")} />
      </div>
    </aside>
  );
}

function FilterToggle({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <span className="h-1 w-6 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={cn("h-4 w-4 accent-violet-500")}
      />
    </label>
  );
}
```

- [ ] **Step 5: Run component tests and verify pass**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml components/knowledge-graph-view.tsx tests/components/knowledge-graph-view.test.tsx
git commit -m "add knowledge graph view component"
```

---

### Task 6: Workspace Page Data Wiring

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/document-list.tsx`
- Modify: `components/workspace-center-shell.tsx`
- Test: `tests/components/workspace-center-shell.test.tsx`

- [ ] **Step 1: Write integration-facing component test**

Add this test to `tests/components/workspace-center-shell.test.tsx`:

```tsx
it("keeps graph content mounted in the workspace scroll container", () => {
  render(
    <WorkspaceCenterShell
      workspaceSlug="company-handbook"
      documents={documents}
      selectedDocument={null}
      selectedFolder={null}
      isGraphView={true}
    >
      <div data-testid="graph-view">Graph content</div>
    </WorkspaceCenterShell>,
  );

  expect(screen.getByTestId("workspace-scroll-container")).toContainElement(
    screen.getByTestId("graph-view"),
  );
});
```

- [ ] **Step 2: Run focused tests and verify current pass/failure**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx
```

Expected: PASS if Tasks 3 and 4 are complete.

- [ ] **Step 3: Wire graph mode in page**

In `app/workspaces/[workspaceSlug]/page.tsx`, import:

```ts
import { KnowledgeGraphView } from "@/components/knowledge-graph-view";
import { buildKnowledgeGraph } from "@/lib/knowledge-graph/model";
```

Change search params type:

```ts
searchParams: Promise<{ document?: string; folder?: string; folderError?: string; graph?: string }>;
```

Read graph:

```ts
const {
  document: selectedDocumentId,
  folder: selectedFolderIdParam,
  folderError,
  graph,
} = await searchParams;
const isGraphView = graph === "1";
```

After `readableDocuments` is computed, add:

```ts
const readableDocumentIds = new Set(readableDocuments.map((document) => document.id));
const [graphLinks, graphTags, graphProperties] = isGraphView
  ? await Promise.all([
      prisma.documentLink.findMany({
        where: {
          workspaceId: workspace.id,
          sourceDocumentId: { in: [...readableDocumentIds] },
        },
        select: {
          id: true,
          sourceDocumentId: true,
          targetDocumentId: true,
          targetTitleRaw: true,
          isBroken: true,
          isAmbiguous: true,
        },
      }),
      prisma.documentTag.findMany({
        where: { documentId: { in: [...readableDocumentIds] } },
        include: { tag: { select: { name: true, normalizedName: true } } },
      }),
      prisma.documentProperty.findMany({
        where: { documentId: { in: [...readableDocumentIds] } },
        select: {
          documentId: true,
          key: true,
          valueJson: true,
          valueType: true,
        },
      }),
    ])
  : [[], [], []];

const graphData = isGraphView
  ? buildKnowledgeGraph({
      documents: readableDocuments.map((document) => ({
        id: document.id,
        title: document.title,
        path: document.path,
      })),
      links: graphLinks,
      tags: graphTags,
      properties: graphProperties,
    })
  : { nodes: [], links: [] };
```

Pass graph state into `DocumentList`:

```tsx
isGraphView={isGraphView}
```

Pass graph mode into `WorkspaceCenterShell`:

```tsx
isGraphView={isGraphView}
```

Change center children branch by inserting graph mode before the existing folder/document branch. Keep the existing `FolderDetail` and `DocumentEditor` prop blocks intact:

```tsx
{isGraphView ? (
  <KnowledgeGraphView
    workspaceSlug={workspaceSlug}
    graph={graphData}
    selectedDocumentId={selectedDocument?.id ?? null}
  />
) : selectedFolder ? (
  <FolderDetail
    folder={{
      id: selectedFolder.id,
      name: selectedFolder.name,
      path: selectedFolder.path,
      childCount: countFolderChildren({
        folderId: selectedFolder.id,
        folders: workspace.folders,
        documents: readableDocuments,
      }),
    }}
    canWrite={canWrite}
  />
) : (
  <DocumentEditor
    document={
      selectedDocument
        ? {
            id: selectedDocument.id,
            title: selectedDocument.title,
            contentMarkdown: selectedDocument.contentMarkdown,
          }
        : null
    }
    canWrite={canWriteSelectedDocument}
    action={updateAction}
    uploadAttachmentAction={uploadAttachmentAction}
    linkCandidates={readableDocuments.map((document) => ({
      id: document.id,
      slug: document.slug,
      title: document.title,
      path: document.path,
    }))}
    tags={documentTags.map((documentTag) => documentTag.tag)}
    properties={documentProperties}
    comments={comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      user: comment.user,
    }))}
    linkPanels={linkPanels}
    createFromBrokenLinkAction={createFromBrokenLinkAction}
    createCommentAction={commentAction}
  />
)}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add 'app/workspaces/[workspaceSlug]/page.tsx' components/document-list.tsx components/workspace-center-shell.tsx tests/components/workspace-center-shell.test.tsx
git commit -m "wire graph view into workspace page"
```

---

### Task 7: E2E, Wiki, And Final Verification

**Files:**
- Modify: `tests/e2e/login.spec.ts`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/Wiki Links And Backlinks.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Add e2e graph smoke**

In `tests/e2e/login.spec.ts`, extend the existing workspace smoke after the document list assertions:

```ts
await page.getByRole("button", { name: "Graph" }).click();
await expect(page.getByText("Graph view")).toBeVisible();
await expect(page.getByText("Filters")).toBeVisible();

await page.getByRole("button", { name: "Close filters" }).click();
await expect(page.getByText("Wiki links")).toHaveCount(0);

await page.getByRole("button", { name: "Open filters" }).click();
await expect(page.getByText("Wiki links")).toBeVisible();
```

- [ ] **Step 2: Run e2e and verify pass**

Run:

```bash
pnpm run test:e2e
```

Expected: PASS.

- [ ] **Step 3: Update wiki docs**

Update `wiki/Document Editing Workflow.md` with these claims in the sidebar/center UI sections:

```md
Issue #34 이후 sidebar toolbar의 `Graph` icon button은 workspace URL을 `?graph=1`로 전환한다. Graph mode에서는 center content가 editor/folder detail 대신 workspace knowledge graph를 렌더링하고, toolbar path는 `Graph view`로 표시한다. Graph mode에서 document node를 클릭하면 `?document=<id>`로 이동하며 graph mode는 종료된다.
```

Update `wiki/Document Knowledge Model.md` with:

```md
Knowledge graph view는 새 저장 모델을 만들지 않고 기존 `Document`, `DocumentLink`, `DocumentTag`, `DocumentProperty` row를 읽어 document, tag, wiki, property node와 typed edge DTO를 만든다. Read permission을 통과한 active document만 graph source of truth가 된다.
```

Update `wiki/Wiki Links And Backlinks.md` with:

```md
Graph view에서 resolved frontmatter wiki link는 source document와 readable target document 사이의 edge로 표시한다. Broken 또는 ambiguous link는 document node가 아니라 wiki value node로 표시해 target 문서가 없거나 불명확하다는 상태를 보존한다.
```

Update `wiki/index.md` current UI summary with a one-line graph view reference.

Add `wiki/log.md` entry:

```md
## 2026-05-15T23:07:00+09:00 - implementation

- Result: Issue #34 workspace knowledge graph view를 구현했다.
- Coverage: Sidebar `Graph` icon button, `?graph=1` route state, `react-force-graph-2d` canvas graph view, document/tag/wiki/property graph model, filter panel, selected document focus behavior를 추가했다.
- Pages: [[Document Editing Workflow]], [[Document Knowledge Model]], [[Wiki Links And Backlinks]], [[Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #34, `components/knowledge-graph-view.tsx`, `lib/knowledge-graph/model.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/knowledge-graph/model.test.ts`, `tests/components/knowledge-graph-view.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`.
```

- [ ] **Step 4: Regenerate and verify wiki**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: PASS and `wiki/manifest.json` updated if metadata changed.

- [ ] **Step 5: Run final verification**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts
pnpm exec tsc --noEmit
pnpm run test:e2e
pnpm wiki:sync-check --staged
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/login.spec.ts wiki/Document\ Editing\ Workflow.md wiki/Document\ Knowledge\ Model.md wiki/Wiki\ Links\ And\ Backlinks.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "document knowledge graph view"
```

---

## Final Completion

- [ ] Run full focused verification:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts
pnpm exec tsc --noEmit
pnpm run test:e2e
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

- [ ] Confirm branch status:

```bash
git status --short --branch
git log --oneline --decorate -n 8
```

- [ ] Open a draft PR:

```bash
git push -u origin issue-34-workspace-knowledge-graph-view
gh pr create --draft --title "[codex] Add workspace knowledge graph view" --body "$(cat <<'PR_BODY'
## Summary

- Adds a sidebar Graph control and `?graph=1` workspace graph mode.
- Builds document/tag/wiki/property graph data from existing workspace metadata.
- Renders an Obsidian-style graph view with filters, zoom/pan, and document node navigation.

## Validation

- `pnpm exec vitest run tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/knowledge-graph/model.test.ts tests/workspace-routes.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm run test:e2e`
- `pnpm wiki:manifest`
- `pnpm wiki:lint`
- `pnpm wiki:sync-check --staged`
PR_BODY
)"
```
