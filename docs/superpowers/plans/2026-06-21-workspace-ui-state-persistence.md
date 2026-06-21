# Workspace UI State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve workspace UI panel state across route navigation, refresh, and browser restart using workspace-scoped `localStorage`.

**Architecture:** Add one focused browser storage helper for versioned workspace UI state, then keep each existing component as the owner of its own React state. Hydrate stored values after mount and write only after the relevant workspace has hydrated, avoiding server/client render mismatches.

**Tech Stack:** Next.js App Router, React client components, TypeScript, `localStorage`, Vitest, React Testing Library, wiki maintenance CLI.

---

## File Map

- Create `lib/workspace-ui-state.ts`: versioned aggregate `localStorage` key, state types, strict validators, safe read/write/update helpers.
- Create `tests/workspace-ui-state.test.ts`: focused helper tests for merge behavior, validation, workspace scoping, and blocked storage.
- Modify `components/app-shell.tsx`: optional `workspaceSlug` prop, sidebar hydration/write effects.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: pass `workspaceSlug` into `AppShell`.
- Modify `tests/components/app-shell.test.tsx`: add storage-backed sidebar persistence coverage.
- Modify `components/document-list.tsx`: hydrate/write active Documents/Search/Favorites panel.
- Modify `tests/components/document-list.test.tsx`: add active-panel persistence and tag-search override coverage.
- Modify `components/knowledge-graph-view.tsx`: move graph settings from `sessionStorage` to aggregate workspace UI `localStorage`; add controls/section open-state persistence.
- Modify `tests/components/knowledge-graph-view.test.tsx`: switch graph persistence tests to `localStorage` aggregate key and add controls/section tests.
- Modify `components/workspace-chatbot.tsx`: hydrate/write Workspace AI chat open state only.
- Modify `tests/components/workspace-chatbot.test.tsx`: add open-state persistence coverage and adjust workspace-change expectations.
- Modify `wiki/Document Editing Workflow.md`, `wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json`: record implemented behavior after source changes.

Implementation commits should happen after the wiki maintenance task because the repository hook requires staged source changes to include staged wiki maintenance.

---

### Task 1: Workspace UI State Storage Helper

**Files:**
- Create: `lib/workspace-ui-state.ts`
- Create: `tests/workspace-ui-state.test.ts`

- [x] **Step 1: Write failing helper tests**

Create `tests/workspace-ui-state.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
  workspaceUiStateStorageKey,
} from "@/lib/workspace-ui-state";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("workspace UI state storage", () => {
  it("uses a versioned workspace-scoped aggregate key", () => {
    expect(workspaceUiStateStorageKey("company-handbook")).toBe(
      "munjib:workspace-ui:company-handbook:v1",
    );
  });

  it("merges updates without replacing unrelated surfaces", () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    updateStoredWorkspaceUiState("company-handbook", (current) => ({
      ...current,
      leftSidebarOpen: false,
      graph: {
        ...current.graph,
        settingsOpen: false,
        filters: { tag: true, orphans: false },
      },
    }));

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({
      activeSidebarPanel: "favorites",
      leftSidebarOpen: false,
      graph: {
        settingsOpen: false,
        filters: { tag: true, orphans: false },
      },
    });
  });

  it("ignores invalid stored fields and keeps valid fields", () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        leftSidebarOpen: "no",
        rightSidebarOpen: true,
        activeSidebarPanel: "graph",
        workspaceChatOpen: false,
        graph: {
          settingsOpen: true,
          filtersOpen: "yes",
          filters: { tag: true, orphans: "false" },
          display: {
            arrows: true,
            linkThickness: 20,
            nodeSize: 8,
            textFadeThreshold: 2,
          },
          forces: {
            center: 0.6,
            link: 0.7,
            linkDistance: 120,
            repel: -180,
          },
        },
      }),
    );

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({
      rightSidebarOpen: true,
      workspaceChatOpen: false,
      graph: {
        settingsOpen: true,
        forces: {
          center: 0.6,
          link: 0.7,
          linkDistance: 120,
          repel: -180,
        },
      },
    });
  });

  it("does not leak state between workspaces", () => {
    updateStoredWorkspaceUiState("company-handbook", (current) => ({
      ...current,
      workspaceChatOpen: true,
    }));

    expect(readStoredWorkspaceUiState("research")).toEqual({});
  });

  it("returns defaults when storage reads or writes throw", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new Error("storage blocked");
        }),
        setItem: vi.fn(() => {
          throw new Error("quota exceeded");
        }),
      },
    });

    expect(readStoredWorkspaceUiState("company-handbook")).toEqual({});
    expect(() =>
      updateStoredWorkspaceUiState("company-handbook", (current) => ({
        ...current,
        leftSidebarOpen: false,
      })),
    ).not.toThrow();
  });
});
```

- [x] **Step 2: Run the helper test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/workspace-ui-state.test.ts --reporter=dot
```

Expected: FAIL because `@/lib/workspace-ui-state` does not exist.

- [x] **Step 3: Implement the helper**

Create `lib/workspace-ui-state.ts`:

```ts
export type WorkspaceSidebarPanel = "documents" | "search" | "favorites";

export type WorkspaceUiGraphFilters = {
  tag: boolean;
  orphans: boolean;
};

export type WorkspaceUiGraphDisplay = {
  arrows: boolean;
  linkThickness: number;
  nodeSize: number;
  textFadeThreshold: number;
};

export type WorkspaceUiGraphForces = {
  center: number;
  link: number;
  linkDistance: number;
  repel: number;
};

export type WorkspaceUiState = {
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  activeSidebarPanel?: WorkspaceSidebarPanel;
  workspaceChatOpen?: boolean;
  graph?: {
    settingsOpen?: boolean;
    filtersOpen?: boolean;
    displayOpen?: boolean;
    forcesOpen?: boolean;
    filters?: WorkspaceUiGraphFilters;
    display?: WorkspaceUiGraphDisplay;
    forces?: WorkspaceUiGraphForces;
  };
};

const STORAGE_VERSION = "v1";

export function workspaceUiStateStorageKey(workspaceSlug: string) {
  return `munjib:workspace-ui:${workspaceSlug}:${STORAGE_VERSION}`;
}

export function readStoredWorkspaceUiState(workspaceSlug: string): WorkspaceUiState {
  const storage = getBrowserStorage();
  if (!storage) {
    return {};
  }

  const raw = safeGetItem(storage, workspaceUiStateStorageKey(workspaceSlug));
  if (!raw) {
    return {};
  }

  try {
    return validateWorkspaceUiState(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function updateStoredWorkspaceUiState(
  workspaceSlug: string,
  updater: (current: WorkspaceUiState) => WorkspaceUiState,
) {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  const current = readStoredWorkspaceUiState(workspaceSlug);
  const next = validateWorkspaceUiState(updater(current));
  safeSetItem(storage, workspaceUiStateStorageKey(workspaceSlug), JSON.stringify(next));
}

function validateWorkspaceUiState(value: unknown): WorkspaceUiState {
  if (!isRecord(value)) {
    return {};
  }

  const state: WorkspaceUiState = {};
  if (typeof value.leftSidebarOpen === "boolean") {
    state.leftSidebarOpen = value.leftSidebarOpen;
  }
  if (typeof value.rightSidebarOpen === "boolean") {
    state.rightSidebarOpen = value.rightSidebarOpen;
  }
  if (isWorkspaceSidebarPanel(value.activeSidebarPanel)) {
    state.activeSidebarPanel = value.activeSidebarPanel;
  }
  if (typeof value.workspaceChatOpen === "boolean") {
    state.workspaceChatOpen = value.workspaceChatOpen;
  }

  const graph = validateGraphState(value.graph);
  if (Object.keys(graph).length > 0) {
    state.graph = graph;
  }

  return state;
}

function validateGraphState(value: unknown): NonNullable<WorkspaceUiState["graph"]> {
  if (!isRecord(value)) {
    return {};
  }

  const graph: NonNullable<WorkspaceUiState["graph"]> = {};
  if (typeof value.settingsOpen === "boolean") {
    graph.settingsOpen = value.settingsOpen;
  }
  if (typeof value.filtersOpen === "boolean") {
    graph.filtersOpen = value.filtersOpen;
  }
  if (typeof value.displayOpen === "boolean") {
    graph.displayOpen = value.displayOpen;
  }
  if (typeof value.forcesOpen === "boolean") {
    graph.forcesOpen = value.forcesOpen;
  }

  const filters = validateGraphFilters(value.filters);
  if (filters) {
    graph.filters = filters;
  }

  const display = validateGraphDisplay(value.display);
  if (display) {
    graph.display = display;
  }

  const forces = validateGraphForces(value.forces);
  if (forces) {
    graph.forces = forces;
  }

  return graph;
}

function validateGraphFilters(value: unknown): WorkspaceUiGraphFilters | null {
  if (!isRecord(value) || typeof value.tag !== "boolean" || typeof value.orphans !== "boolean") {
    return null;
  }

  return { tag: value.tag, orphans: value.orphans };
}

function validateGraphDisplay(value: unknown): WorkspaceUiGraphDisplay | null {
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

function validateGraphForces(value: unknown): WorkspaceUiGraphForces | null {
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

function isWorkspaceSidebarPanel(value: unknown): value is WorkspaceSidebarPanel {
  return value === "documents" || value === "search" || value === "favorites";
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    return;
  }
}
```

- [x] **Step 4: Run the helper test and verify it passes**

Run:

```bash
pnpm exec vitest run tests/workspace-ui-state.test.ts --reporter=dot
```

Expected: PASS.

---

### Task 2: AppShell Sidebar Persistence

**Files:**
- Modify: `components/app-shell.tsx`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `tests/components/app-shell.test.tsx`

- [x] **Step 1: Write failing AppShell persistence test**

Add this import in `tests/components/app-shell.test.tsx`:

```ts
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";
```

Add this test inside `describe("AppShell", () => { ... })`:

```tsx
  it("restores and persists workspace sidebar open state", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        leftSidebarOpen: false,
        rightSidebarOpen: false,
        activeSidebarPanel: "favorites",
      }),
    );

    render(
      <AppShell
        workspaceSlug="company-handbook"
        left={<div>Left</div>}
        center={<div>Center</div>}
        right={({ collapse }) => <button onClick={collapse}>Close metadata panel</button>}
      />,
    );

    expect(await screen.findByRole("button", { name: "Open sidebar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open metadata panel" })).toBeTruthy();
    expect(screen.queryByText("Left")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close metadata panel" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "Open metadata panel" }));

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({
        leftSidebarOpen: true,
        rightSidebarOpen: true,
        activeSidebarPanel: "favorites",
      });
    });
  });
```

Also update the React Testing Library import:

```ts
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
```

- [x] **Step 2: Run the AppShell test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx --reporter=dot
```

Expected: FAIL because `AppShell` does not read the workspace UI storage key and does not accept `workspaceSlug`.

- [x] **Step 3: Implement AppShell persistence**

In `components/app-shell.tsx`, update imports:

```ts
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
} from "@/lib/workspace-ui-state";
```

Update the component props:

```ts
export function AppShell({
  left,
  center,
  right,
  workspaceSlug,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode | ((controls: RightPanelControls) => React.ReactNode);
  workspaceSlug?: string;
}) {
```

Add the hydrated workspace marker after the sidebar state:

```ts
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [shellStorageHydratedWorkspace, setShellStorageHydratedWorkspace] =
    useState<string | null>(null);
```

Add these effects before `requestTagSearch`:

```ts
  useEffect(() => {
    if (!workspaceSlug) {
      setShellStorageHydratedWorkspace(null);
      return;
    }

    const storedState = readStoredWorkspaceUiState(workspaceSlug);
    setLeftPanelOpen(storedState.leftSidebarOpen ?? true);
    setRightPanelOpen(storedState.rightSidebarOpen ?? true);
    setShellStorageHydratedWorkspace(workspaceSlug);
  }, [workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || shellStorageHydratedWorkspace !== workspaceSlug) {
      return;
    }

    updateStoredWorkspaceUiState(workspaceSlug, (current) => ({
      ...current,
      leftSidebarOpen: leftPanelOpen,
      rightSidebarOpen: rightPanelOpen,
    }));
  }, [leftPanelOpen, rightPanelOpen, shellStorageHydratedWorkspace, workspaceSlug]);
```

In `app/workspaces/[workspaceSlug]/page.tsx`, pass the slug:

```tsx
      <AppShell
        workspaceSlug={workspaceSlug}
        left={
```

- [x] **Step 4: Run AppShell tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx --reporter=dot
```

Expected: PASS.

---

### Task 3: DocumentList Active Panel Persistence

**Files:**
- Modify: `components/document-list.tsx`
- Test: `tests/components/document-list.test.tsx`

- [x] **Step 1: Write failing DocumentList tests**

Add this import in `tests/components/document-list.test.tsx`:

```ts
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";
```

Add these tests near the existing Search/Favorites panel tests:

```tsx
  it("restores and persists the active sidebar panel", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    renderList();

    expect(await screen.findByText("Favorites")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByLabelText("Search documents")).toBeTruthy();

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({ activeSidebarPanel: "search" });
    });
  });

  it("lets tag search override a stored non-search panel and persists search", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    render(
      <AppShell
        workspaceSlug="company-handbook"
        left={<DocumentList {...baseProps} />}
        center={<TagSearchRequester tag="LangChain" />}
        right={<div>Right</div>}
      />,
    );

    expect(await screen.findByText("Favorites")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

    expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
      "tag:#LangChain",
    );
    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({ activeSidebarPanel: "search" });
    });
  });
```

- [x] **Step 2: Run the DocumentList tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx --reporter=dot
```

Expected: FAIL because `DocumentList` starts with `documents` and does not write `activeSidebarPanel`.

- [x] **Step 3: Implement active panel persistence**

In `components/document-list.tsx`, add imports:

```ts
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
  type WorkspaceSidebarPanel,
} from "@/lib/workspace-ui-state";
```

Replace the `activePanel` state type with the shared type:

```ts
  const [activePanel, setActivePanel] = useState<WorkspaceSidebarPanel>("documents");
  const [activePanelHydratedWorkspace, setActivePanelHydratedWorkspace] =
    useState<string | null>(null);
```

Add these effects after the local constants:

```ts
  useEffect(() => {
    const storedState = readStoredWorkspaceUiState(workspaceSlug);
    setActivePanel(storedState.activeSidebarPanel ?? "documents");
    setActivePanelHydratedWorkspace(workspaceSlug);
  }, [workspaceSlug]);

  useEffect(() => {
    if (activePanelHydratedWorkspace !== workspaceSlug) {
      return;
    }

    updateStoredWorkspaceUiState(workspaceSlug, (current) => ({
      ...current,
      activeSidebarPanel: activePanel,
    }));
  }, [activePanel, activePanelHydratedWorkspace, workspaceSlug]);
```

Keep `openSearch`, `openDocuments`, `openFavorites`, and the tag-search effect using `setActivePanel(...)`. The new write effect persists those explicit state changes.

- [x] **Step 4: Run DocumentList tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx --reporter=dot
```

Expected: PASS.

---

### Task 4: KnowledgeGraphView Controls And Option Persistence

**Files:**
- Modify: `components/knowledge-graph-view.tsx`
- Test: `tests/components/knowledge-graph-view.test.tsx`

- [x] **Step 1: Update graph tests to target localStorage aggregate state**

In `tests/components/knowledge-graph-view.test.tsx`, add:

```ts
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";
```

Rename `createSessionStorageMock()` to `createLocalStorageMock()` and update `beforeEach`:

```ts
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createLocalStorageMock(),
  });
```

Replace the persistence test with:

```tsx
  it("persists controls, filters, display, and forces in workspace local storage", async () => {
    renderGraph();

    fireEvent.click(screen.getByLabelText("Tags"));
    fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
    fireEvent.change(screen.getByLabelText("Node size"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
    fireEvent.change(screen.getByLabelText("Repel force"), { target: { value: "-180" } });
    fireEvent.click(screen.getByRole("button", { name: "Close graph settings" }));

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ).graph,
      ).toMatchObject({
        settingsOpen: false,
        filtersOpen: true,
        displayOpen: true,
        forcesOpen: true,
        filters: { tag: true, orphans: false },
        display: {
          arrows: false,
          linkThickness: 1,
          nodeSize: 8,
          textFadeThreshold: 1,
        },
        forces: {
          center: 0.3,
          link: 0.4,
          linkDistance: 80,
          repel: -180,
        },
      });
    });
  });
```

Replace the restore test setup with one aggregate value:

```tsx
  it("restores valid workspace graph state from local storage", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        graph: {
          settingsOpen: false,
          filtersOpen: false,
          displayOpen: true,
          forcesOpen: true,
          filters: { tag: true, orphans: true },
          display: {
            arrows: true,
            linkThickness: 3,
            nodeSize: 8,
            textFadeThreshold: 2,
          },
          forces: {
            center: 0.6,
            link: 0.7,
            linkDistance: 120,
            repel: -180,
          },
        },
      }),
    );

    renderGraph();

    expect(await screen.findByRole("button", { name: "Open graph settings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open graph settings" }));

    expect(screen.getByRole("button", { name: "Expand filters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse display" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse forces" })).toBeTruthy();
    expect(getInput("Arrows").checked).toBe(true);
    expect(getInput("Node size").value).toBe("8");
    expect(getInput("Text fade threshold").value).toBe("2");
    expect(getInput("Link thickness").value).toBe("3");
    expect(getInput("Center force").value).toBe("0.6");
    expect(getInput("Repel force").value).toBe("-180");
    expect(getInput("Link force").value).toBe("0.7");
    expect(getInput("Link distance").value).toBe("120");
  });
```

Replace the invalid-storage test with:

```tsx
  it("ignores invalid local storage graph settings and keeps defaults", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({
        graph: {
          filters: { tag: true, orphans: "yes" },
          display: {
            arrows: false,
            linkThickness: 20,
            nodeSize: 8,
            textFadeThreshold: 2,
          },
          forces: "not-json",
        },
      }),
    );

    renderGraph();

    await waitFor(() => {
      expect(window.localStorage.getItem).toHaveBeenCalledWith(
        workspaceUiStateStorageKey("company-handbook"),
      );
    });

    expect(getInput("Tags").checked).toBe(false);
    expect(getInput("Orphans").checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Expand display" }));
    expect(getInput("Node size").value).toBe("3");
    expect(getInput("Link thickness").value).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Expand forces" }));
    expect(getInput("Repel force").value).toBe("-120");
  });
```

Replace the storage-read failure test with:

```tsx
  it("keeps rendering when local storage reads throw during mount", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        ...createLocalStorageMock(),
        getItem: vi.fn(() => {
          throw new Error("local storage blocked");
        }),
      },
    });

    renderGraph();

    expect(screen.getByTestId("force-graph")).toBeTruthy();
    expect(getInput("Tags").checked).toBe(false);

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(getInput("Tags").checked).toBe(true);
    expect(forceGraphMock.state.latestProps?.graphData).toMatchObject({
      links: [expect.objectContaining({ id: "tag:doc-1:design" })],
    });
  });
```

Replace the storage-write failure test with:

```tsx
  it("keeps interactions working when local storage writes throw during persistence", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        ...createLocalStorageMock(),
        setItem: vi.fn(() => {
          throw new Error("local storage quota exceeded");
        }),
      },
    });

    renderGraph();

    await waitFor(() => {
      expect(window.localStorage.getItem).toHaveBeenCalledWith(
        workspaceUiStateStorageKey("company-handbook"),
      );
    });

    fireEvent.click(screen.getByLabelText("Tags"));

    expect(getInput("Tags").checked).toBe(true);
    expect(forceGraphMock.state.latestProps?.graphData).toMatchObject({
      links: [expect.objectContaining({ id: "tag:doc-1:design" })],
    });
  });
```

- [x] **Step 2: Run graph tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx --reporter=dot
```

Expected: FAIL because `KnowledgeGraphView` still reads and writes old `sessionStorage` graph keys and does not persist panel open state.

- [x] **Step 3: Implement graph persistence through workspace UI storage**

In `components/knowledge-graph-view.tsx`, import the helper:

```ts
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
} from "@/lib/workspace-ui-state";
```

Remove `type GraphSettingsGroup = "display" | "filters" | "forces";` and remove `KNOWLEDGE_GRAPH_STORAGE_VERSION`.

Replace the graph settings hydration effects with:

```ts
  const [settingsHydrated, setSettingsHydrated] = useState<string | null>(null);

  useEffect(() => {
    const graphState = readStoredWorkspaceUiState(workspaceSlug).graph;
    setSettingsOpen(graphState?.settingsOpen ?? true);
    setFiltersOpen(graphState?.filtersOpen ?? true);
    setDisplayOpen(graphState?.displayOpen ?? false);
    setForcesOpen(graphState?.forcesOpen ?? false);
    setFilters(graphState?.filters ?? DEFAULT_FILTERS);
    setDisplay(graphState?.display ?? DEFAULT_DISPLAY_SETTINGS);
    setForces(graphState?.forces ?? DEFAULT_FORCE_SETTINGS);
    setSettingsHydrated(workspaceSlug);
  }, [workspaceSlug]);

  useEffect(() => {
    if (settingsHydrated !== workspaceSlug) {
      return;
    }

    updateStoredWorkspaceUiState(workspaceSlug, (current) => ({
      ...current,
      graph: {
        ...current.graph,
        settingsOpen,
        filtersOpen,
        displayOpen,
        forcesOpen,
        filters,
        display,
        forces,
      },
    }));
  }, [
    display,
    displayOpen,
    filters,
    filtersOpen,
    forces,
    forcesOpen,
    settingsHydrated,
    settingsOpen,
    workspaceSlug,
  ]);
```

Delete the old functions because validation now lives in `lib/workspace-ui-state.ts`:

```ts
function graphSettingsStorageKey(...)
function readStoredGraphSettings(...)
function writeStoredGraphSettings(...)
function isRecord(...)
function validateStoredFilters(...)
function isNumberInRange(...)
function validateStoredDisplay(...)
function validateStoredForces(...)
```

Keep `hexToRgb()` and `createCenterGravityForce()` unchanged.

- [x] **Step 4: Run graph tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/knowledge-graph-view.test.tsx --reporter=dot
```

Expected: PASS.

---

### Task 5: WorkspaceChatbot Open State Persistence

**Files:**
- Modify: `components/workspace-chatbot.tsx`
- Test: `tests/components/workspace-chatbot.test.tsx`

- [x] **Step 1: Write failing WorkspaceChatbot tests**

Add this import in `tests/components/workspace-chatbot.test.tsx`:

```ts
import { workspaceUiStateStorageKey } from "@/lib/workspace-ui-state";
```

Add these tests near the launcher open/close tests:

```tsx
  it("restores the persisted open state and loads the thread", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ workspaceChatOpen: true }),
    );

    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

    expect(await screen.findByRole("region", { name: "Workspace AI chat" })).toBeTruthy();
    expect(await screen.findByText("Earlier workspace answer.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/company-handbook/assistant/thread");
  });

  it("persists open and closed state while preserving unrelated workspace UI state", async () => {
    window.localStorage.setItem(
      workspaceUiStateStorageKey("company-handbook"),
      JSON.stringify({ activeSidebarPanel: "favorites" }),
    );

    render(<WorkspaceChatbot defaultChatModel="openrouter/fusion" defaultChatProvider="openai-compatible" workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    await screen.findByRole("region", { name: "Workspace AI chat" });

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({
        activeSidebarPanel: "favorites",
        workspaceChatOpen: true,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Close workspace AI chat" }));

    await waitFor(() => {
      expect(
        JSON.parse(
          window.localStorage.getItem(workspaceUiStateStorageKey("company-handbook")) ?? "{}",
        ),
      ).toMatchObject({
        activeSidebarPanel: "favorites",
        workspaceChatOpen: false,
      });
    });
  });
```

Update the existing `loads a new thread when the workspace changes` test so both workspaces have explicit open state:

```tsx
    window.localStorage.setItem(
      workspaceUiStateStorageKey("alpha"),
      JSON.stringify({ workspaceChatOpen: true }),
    );
    window.localStorage.setItem(
      workspaceUiStateStorageKey("beta"),
      JSON.stringify({ workspaceChatOpen: true }),
    );
```

- [x] **Step 2: Run WorkspaceChatbot tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/workspace-chatbot.test.tsx --reporter=dot
```

Expected: FAIL because `WorkspaceChatbot` always starts closed and does not write `workspaceChatOpen`.

- [x] **Step 3: Implement open-state persistence**

In `components/workspace-chatbot.tsx`, import the helper:

```ts
import {
  readStoredWorkspaceUiState,
  updateStoredWorkspaceUiState,
} from "@/lib/workspace-ui-state";
```

Add the hydrated workspace marker near `isOpen`:

```ts
  const [isOpen, setIsOpen] = useState(false);
  const [chatStorageHydratedWorkspace, setChatStorageHydratedWorkspace] =
    useState<string | null>(null);
```

Inside the existing workspace reset effect, set `isOpen` from storage and mark hydration:

```ts
  useEffect(() => {
    requestGenerationRef.current += 1;
    messageVersionRef.current += 1;
    abortActiveSend();
    hasLoadedThreadRef.current = false;
    setChatModelOverride(readStoredChatModelSetting(workspaceSlug, defaultChatProvider));
    setMessages([]);
    setMessageInput("");
    setIsOpen(readStoredWorkspaceUiState(workspaceSlug).workspaceChatOpen ?? false);
    setIsLoading(false);
    setIsThinking(false);
    setIsResetting(false);
    setError("");
    setChatStorageHydratedWorkspace(workspaceSlug);

    return () => {
      requestGenerationRef.current += 1;
      messageVersionRef.current += 1;
      abortActiveSend();
    };
  }, [defaultChatProvider, workspaceSlug]);
```

Add a write effect after that reset effect:

```ts
  useEffect(() => {
    if (chatStorageHydratedWorkspace !== workspaceSlug) {
      return;
    }

    updateStoredWorkspaceUiState(workspaceSlug, (current) => ({
      ...current,
      workspaceChatOpen: isOpen,
    }));
  }, [chatStorageHydratedWorkspace, isOpen, workspaceSlug]);
```

Keep message loading gated by `isOpen`, so restoring open state triggers the existing thread load.

- [x] **Step 4: Run WorkspaceChatbot tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/workspace-chatbot.test.tsx --reporter=dot
```

Expected: PASS.

---

### Task 6: Wiki Maintenance And Full Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [x] **Step 1: Update wiki pages with implementation facts**

In `wiki/Document Editing Workflow.md`, update the UI sections so they describe implemented Issue #122 behavior:

```md
Issue #122 이후 workspace UI chrome state는 workspace slug로 scope된 `munjib:workspace-ui:<workspaceSlug>:v1` `localStorage` aggregate key에 저장된다. 저장 대상은 좌우 sidebar open state, 좌측 Documents/Search/Favorites active panel, knowledge graph controls panel과 Filters/Display/Forces section open state, graph filter/display/force option groups, Workspace AI chat open state다. 이 state는 browser UI preference이므로 DB, URL, server action, chat draft, pending request, graph layout position은 바꾸지 않는다. Client components는 hydration mismatch를 피하기 위해 mount 이후 저장값을 restore하고, restore 완료 뒤 변경분만 write한다.
```

In `wiki/index.md`, change the Issue #122 status text from design-only to implemented behavior:

```md
Issue #122는 좌우 sidebar open state, active sidebar panel, graph controls/section open state, graph option groups, Workspace AI chat open state를 workspace-scoped `localStorage`로 보존한다.
```

In `wiki/log.md`, add a new top entry:

```md
## 2026-06-21T11:58:58+0900 - implementation

- Result: Implemented Issue #122 workspace UI state persistence.
- Coverage: Added workspace-scoped `localStorage` aggregate UI state, hydrated/wrote AppShell sidebars, DocumentList active panel, KnowledgeGraphView controls and option groups, and Workspace AI chat open state. Stored values are validated, storage failures fail open, and DB/URL/server APIs/chat drafts/pending requests/graph layout positions remain unchanged.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #122, `lib/workspace-ui-state.ts`, `components/app-shell.tsx`, `components/document-list.tsx`, `components/knowledge-graph-view.tsx`, `components/workspace-chatbot.tsx`, component tests, `docs/superpowers/specs/2026-06-21-workspace-ui-state-persistence-design.md`, `docs/superpowers/plans/2026-06-21-workspace-ui-state-persistence.md`.
- Verification: `pnpm exec vitest run tests/workspace-ui-state.test.ts tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/components/workspace-chatbot.test.tsx --reporter=dot`; `pnpm exec tsc --noEmit --pretty false`; `pnpm wiki:manifest`; `pnpm wiki:lint`; `pnpm wiki:sync-check --staged`.
```

If implementation happens in a later session, run `date '+%Y-%m-%dT%H:%M:%S%z'` and use that command output in the log heading before staging.

- [x] **Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/workspace-ui-state.test.ts tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/components/workspace-chatbot.test.tsx --reporter=dot
```

Expected: PASS.

- [x] **Step 3: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

- [x] **Step 4: Run wiki maintenance commands**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
```

Expected:
- `wiki:sync-plan --staged` lists source and wiki files.
- `wiki:manifest` writes `wiki/manifest.json`.
- `wiki:lint` exits 0. It may print the existing unrelated warning for `wiki/designs/sidebar.md`.
- `wiki:sync-check --staged` exits 0.
- `git diff --cached --check` exits 0.

- [ ] **Step 5: Commit the implementation**

Stage and commit all implementation, test, wiki, and plan files:

```bash
git add lib/workspace-ui-state.ts \
  tests/workspace-ui-state.test.ts \
  components/app-shell.tsx \
  'app/workspaces/[workspaceSlug]/page.tsx' \
  tests/components/app-shell.test.tsx \
  components/document-list.tsx \
  tests/components/document-list.test.tsx \
  components/knowledge-graph-view.tsx \
  tests/components/knowledge-graph-view.test.tsx \
  components/workspace-chatbot.tsx \
  tests/components/workspace-chatbot.test.tsx \
  docs/superpowers/plans/2026-06-21-workspace-ui-state-persistence.md \
  wiki/Document\ Editing\ Workflow.md \
  wiki/index.md \
  wiki/log.md \
  wiki/manifest.json
git commit -m "Persist workspace UI panel state"
```

Expected: commit succeeds with wiki hook output and the known sidebar design warning only.

---

### Task 7: PR Workflow

**Files:**
- No code files unless CI or review feedback requires changes.

- [ ] **Step 1: Push the branch**

Run:

```bash
git push -u origin issue-122-persist-workspace-ui-panel-state
```

Expected: branch pushes successfully.

- [ ] **Step 2: Create the PR**

Run:

```bash
gh pr create --draft --title "Persist workspace UI panel state" --body "## Summary
- persist workspace UI chrome state in workspace-scoped localStorage
- preserve graph controls/options and Workspace AI chat open state across reloads
- add focused component/helper tests and wiki maintenance

## Verification
- pnpm exec vitest run tests/workspace-ui-state.test.ts tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/knowledge-graph-view.test.tsx tests/components/workspace-chatbot.test.tsx --reporter=dot
- pnpm exec tsc --noEmit --pretty false
- pnpm wiki:manifest
- pnpm wiki:lint
- pnpm wiki:sync-check --staged"
```

Expected: GitHub prints the PR URL.

- [ ] **Step 3: Mark ready and inspect review/CI**

Run:

```bash
gh pr ready
sleep 300
gh pr checks
gh pr view --comments
```

Expected: CI checks are visible. If checks fail or review comments are actionable, fix them on this branch, rerun verification, commit, push, and re-check.
