# Document Tabs And Navigation Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Obsidian-style document tabs and a navigation toolbar above the workspace editor while preserving the existing single-document `?document=<id>` routing model.

**Architecture:** Keep tab state as browser UI state, not database state. Add pure tab-state helpers in `lib/document-tabs.ts`, client components for the tab strip and toolbar, and a `WorkspaceCenterShell` that wraps the existing editor/folder content. `app/workspaces/[workspaceSlug]/page.tsx` remains the server authority for the selected document or folder.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind, lucide-react, Vitest, Testing Library, Playwright, existing wiki maintenance CLI.

---

## File Structure

- Create `lib/document-tabs.ts`
  - Owns serializable tab data, localStorage parsing, readable-document reconciliation, active document upsert, close-target calculation, and path formatting.
- Create `tests/document-tabs.test.ts`
  - Unit-tests duplicated selection, metadata refresh, stale tab pruning, corrupted storage recovery, active close target, and path display.
- Create `components/use-document-tabs.ts`
  - Client hook that connects `lib/document-tabs.ts` helpers to `window.localStorage` and Next router navigation callbacks.
- Create `components/document-tabs.tsx`
  - Renders the horizontal tab strip with active/inactive tab states and close buttons.
- Create `components/document-toolbar.tsx`
  - Renders back/forward icon buttons and current context path.
- Create `components/workspace-center-shell.tsx`
  - Composes tab strip, toolbar, and the existing center content.
- Create `tests/components/workspace-center-shell.test.tsx`
  - Component-tests selected document insertion, tab switching, tab closing, and toolbar path display.
- Modify `components/app-shell.tsx`
  - Adjust center column padding/overflow so the top chrome stays attached to the center surface.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`
  - Pass `workspaceSlug`, selected document/folder context, and readable tab candidates into `WorkspaceCenterShell`.
- Modify `tests/e2e/login.spec.ts`
  - Add smoke coverage for opening multiple document tabs, switching tabs, closing active tabs, and toolbar path display.
- Update wiki after implementation
  - `wiki/Document Editing Workflow.md`
  - `wiki/Folder Hierarchy Model.md`
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki/manifest.json`

## Task 1: Pure Document Tab State

**Files:**
- Create: `lib/document-tabs.ts`
- Create: `tests/document-tabs.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/document-tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  closeDocumentTab,
  formatWorkspacePath,
  parseStoredDocumentTabs,
  reconcileDocumentTabs,
  serializeDocumentTabs,
  type DocumentTab,
} from "@/lib/document-tabs";

const readable: DocumentTab[] = [
  { id: "doc-1", title: "Welcome", path: "/welcome" },
  { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
  { id: "doc-3", title: "Operations Runbook", path: "/operations/runbook" },
];

describe("parseStoredDocumentTabs", () => {
  it("returns an empty list for missing or corrupted values", () => {
    expect(parseStoredDocumentTabs(null)).toEqual([]);
    expect(parseStoredDocumentTabs("{broken")).toEqual([]);
    expect(parseStoredDocumentTabs(JSON.stringify([{ id: 1, title: "Bad", path: "/" }]))).toEqual(
      [],
    );
  });

  it("keeps only valid tab records", () => {
    expect(
      parseStoredDocumentTabs(
        JSON.stringify([
          { id: "doc-1", title: "Welcome", path: "/welcome" },
          { id: "", title: "Bad", path: "/bad" },
          { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
        ]),
      ),
    ).toEqual([
      { id: "doc-1", title: "Welcome", path: "/welcome" },
      { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
    ]);
  });
});

describe("reconcileDocumentTabs", () => {
  it("upserts the selected document without duplicates", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [{ id: "doc-1", title: "Old title", path: "/old" }],
      readableDocuments: readable,
      selectedDocument: readable[0],
    });

    expect(result).toEqual([{ id: "doc-1", title: "Welcome", path: "/welcome" }]);
  });

  it("prunes tabs that are no longer readable", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [
        { id: "doc-1", title: "Welcome", path: "/welcome" },
        { id: "missing", title: "Missing", path: "/missing" },
      ],
      readableDocuments: readable,
      selectedDocument: null,
    });

    expect(result).toEqual([{ id: "doc-1", title: "Welcome", path: "/welcome" }]);
  });

  it("appends a newly selected document to existing tabs", () => {
    const result = reconcileDocumentTabs({
      storedTabs: [{ id: "doc-1", title: "Welcome", path: "/welcome" }],
      readableDocuments: readable,
      selectedDocument: readable[1],
    });

    expect(result.map((tab) => tab.id)).toEqual(["doc-1", "doc-2"]);
  });
});

describe("closeDocumentTab", () => {
  it("removes an inactive tab without changing the active target", () => {
    expect(
      closeDocumentTab({
        tabs: readable,
        closedTabId: "doc-1",
        activeDocumentId: "doc-2",
      }),
    ).toEqual({
      tabs: [readable[1], readable[2]],
      nextDocumentId: "doc-2",
    });
  });

  it("selects the right tab, then left tab, then root when closing the active tab", () => {
    expect(
      closeDocumentTab({
        tabs: readable,
        closedTabId: "doc-2",
        activeDocumentId: "doc-2",
      }).nextDocumentId,
    ).toBe("doc-3");

    expect(
      closeDocumentTab({
        tabs: readable.slice(0, 2),
        closedTabId: "doc-2",
        activeDocumentId: "doc-2",
      }).nextDocumentId,
    ).toBe("doc-1");

    expect(
      closeDocumentTab({
        tabs: [readable[0]],
        closedTabId: "doc-1",
        activeDocumentId: "doc-1",
      }).nextDocumentId,
    ).toBeNull();
  });
});

describe("document tab storage and path display", () => {
  it("serializes tabs as stable JSON", () => {
    expect(serializeDocumentTabs([readable[0]])).toBe(
      JSON.stringify([{ id: "doc-1", title: "Welcome", path: "/welcome" }]),
    );
  });

  it("formats slash paths for toolbar display", () => {
    expect(formatWorkspacePath("/operations/runbook")).toBe("operations / runbook");
    expect(formatWorkspacePath("/")).toBe("/");
    expect(formatWorkspacePath("")).toBe("/");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run tests/document-tabs.test.ts
```

Expected: FAIL because `@/lib/document-tabs` does not exist.

- [ ] **Step 3: Implement the pure helper module**

Create `lib/document-tabs.ts`:

```ts
export type DocumentTab = {
  id: string;
  title: string;
  path: string;
};

export type ReconcileDocumentTabsInput = {
  storedTabs: DocumentTab[];
  readableDocuments: DocumentTab[];
  selectedDocument: DocumentTab | null;
};

export type CloseDocumentTabInput = {
  tabs: DocumentTab[];
  closedTabId: string;
  activeDocumentId: string | null;
};

export type CloseDocumentTabResult = {
  tabs: DocumentTab[];
  nextDocumentId: string | null;
};

export function parseStoredDocumentTabs(raw: string | null): DocumentTab[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isDocumentTab);
  } catch {
    return [];
  }
}

export function serializeDocumentTabs(tabs: DocumentTab[]) {
  return JSON.stringify(tabs);
}

export function reconcileDocumentTabs({
  storedTabs,
  readableDocuments,
  selectedDocument,
}: ReconcileDocumentTabsInput): DocumentTab[] {
  const readableById = new Map(readableDocuments.map((document) => [document.id, document]));
  const reconciled: DocumentTab[] = [];
  const seen = new Set<string>();

  for (const tab of storedTabs) {
    const current = readableById.get(tab.id);
    if (!current || seen.has(tab.id)) continue;
    reconciled.push(current);
    seen.add(tab.id);
  }

  if (selectedDocument && readableById.has(selectedDocument.id) && !seen.has(selectedDocument.id)) {
    reconciled.push(selectedDocument);
  }

  return reconciled;
}

export function closeDocumentTab({
  tabs,
  closedTabId,
  activeDocumentId,
}: CloseDocumentTabInput): CloseDocumentTabResult {
  const closedIndex = tabs.findIndex((tab) => tab.id === closedTabId);
  const nextTabs = tabs.filter((tab) => tab.id !== closedTabId);

  if (closedTabId !== activeDocumentId) {
    return { tabs: nextTabs, nextDocumentId: activeDocumentId };
  }

  const rightTab = tabs[closedIndex + 1];
  const leftTab = tabs[closedIndex - 1];

  return {
    tabs: nextTabs,
    nextDocumentId: rightTab?.id ?? leftTab?.id ?? null,
  };
}

export function formatWorkspacePath(path: string) {
  const normalized = path.trim();
  if (!normalized || normalized === "/") return "/";
  return normalized.replace(/^\/+/, "").split("/").filter(Boolean).join(" / ");
}

function isDocumentTab(value: unknown): value is DocumentTab {
  if (!value || typeof value !== "object") return false;

  const tab = value as Partial<Record<keyof DocumentTab, unknown>>;
  return (
    typeof tab.id === "string" &&
    tab.id.length > 0 &&
    typeof tab.title === "string" &&
    tab.title.length > 0 &&
    typeof tab.path === "string" &&
    tab.path.length > 0
  );
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```bash
pnpm exec vitest run tests/document-tabs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/document-tabs.ts tests/document-tabs.test.ts
git commit -m "feat: add document tab state model"
```

## Task 2: Tab Hook And Center Chrome Components

**Files:**
- Create: `components/use-document-tabs.ts`
- Create: `components/document-tabs.tsx`
- Create: `components/document-toolbar.tsx`
- Create: `components/workspace-center-shell.tsx`
- Create: `tests/components/workspace-center-shell.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `tests/components/workspace-center-shell.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCenterShell } from "@/components/workspace-center-shell";

const router = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const documents = [
  { id: "doc-1", title: "Welcome", path: "/welcome" },
  { id: "doc-2", title: "Engineering Runbook", path: "/engineering/runbook" },
  { id: "doc-3", title: "Operations Runbook", path: "/operations/runbook" },
];

beforeEach(() => {
  let store: Record<string, string> = {};
  router.push.mockReset();
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  vi.spyOn(window.history, "forward").mockImplementation(() => {});

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderShell(selectedDocument = documents[0]) {
  return render(
    <WorkspaceCenterShell
      workspaceSlug="company-handbook"
      documents={documents}
      selectedDocument={selectedDocument}
      selectedFolder={null}
    >
      <div>Editor content</div>
    </WorkspaceCenterShell>,
  );
}

describe("WorkspaceCenterShell", () => {
  it("adds the selected document as the active tab and shows the path", () => {
    renderShell();

    expect(screen.getByRole("tab", { name: "Welcome" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("welcome")).toBeTruthy();
    expect(screen.getByText("Editor content")).toBeTruthy();
  });

  it("renders stored readable tabs and switches by router push", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([documents[0], documents[1]]),
    );

    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("tab", { name: "Engineering Runbook" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("closes the active tab and routes to the next tab", () => {
    window.localStorage.setItem(
      "munjib:open-tabs:company-handbook",
      JSON.stringify([documents[0], documents[1]]),
    );

    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Close Welcome" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-2");
  });

  it("routes to the workspace root after closing the final active tab", () => {
    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Close Welcome" }));

    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook");
  });

  it("uses browser history for toolbar navigation", () => {
    renderShell(documents[0]);

    fireEvent.click(screen.getByRole("button", { name: "Navigate back" }));
    fireEvent.click(screen.getByRole("button", { name: "Navigate forward" }));

    expect(window.history.back).toHaveBeenCalledOnce();
    expect(window.history.forward).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the failing component tests**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx
```

Expected: FAIL because `WorkspaceCenterShell` does not exist.

- [ ] **Step 3: Create the tab hook**

Create `components/use-document-tabs.ts`:

```ts
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closeDocumentTab,
  parseStoredDocumentTabs,
  reconcileDocumentTabs,
  serializeDocumentTabs,
  type DocumentTab,
} from "@/lib/document-tabs";

export function useDocumentTabs({
  workspaceSlug,
  documents,
  selectedDocument,
}: {
  workspaceSlug: string;
  documents: DocumentTab[];
  selectedDocument: DocumentTab | null;
}) {
  const storageKey = `munjib:open-tabs:${workspaceSlug}`;
  const [tabs, setTabs] = useState<DocumentTab[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedTabs = parseStoredDocumentTabs(window.localStorage.getItem(storageKey));
    setTabs(reconcileDocumentTabs({ storedTabs, readableDocuments: documents, selectedDocument }));
    setHydrated(true);
  }, [documents, selectedDocument, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, serializeDocumentTabs(tabs));
  }, [hydrated, storageKey, tabs]);

  const activeDocumentId = selectedDocument?.id ?? null;

  return useMemo(
    () => ({
      tabs,
      activeDocumentId,
      closeTab(tabId: string) {
        const result = closeDocumentTab({
          tabs,
          closedTabId: tabId,
          activeDocumentId,
        });
        setTabs(result.tabs);
        return result.nextDocumentId;
      },
    }),
    [activeDocumentId, tabs],
  );
}
```

- [ ] **Step 4: Create the tab strip component**

Create `components/document-tabs.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import type { DocumentTab } from "@/lib/document-tabs";

export function DocumentTabs({
  tabs,
  activeDocumentId,
  onSelect,
  onClose,
}: {
  tabs: DocumentTab[];
  activeDocumentId: string | null;
  onSelect: (documentId: string) => void;
  onClose: (documentId: string) => void;
}) {
  if (tabs.length === 0) {
    return <div className="h-11 border-b border-border bg-muted" />;
  }

  return (
    <div className="flex h-11 items-end overflow-x-auto border-b border-border bg-muted px-2">
      <div className="flex min-w-max items-end" role="tablist" aria-label="Open documents">
        {tabs.map((tab) => {
          const active = tab.id === activeDocumentId;
          return (
            <div
              key={tab.id}
              className={`group flex h-9 max-w-56 items-center gap-2 border px-3 text-sm ${
                active
                  ? "border-border border-b-white bg-white text-ink"
                  : "border-transparent bg-muted text-slate-600 hover:bg-white/70"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(tab.id)}
                className="min-w-0 truncate text-left"
              >
                {tab.title}
              </button>
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
                className="rounded p-0.5 text-slate-500 hover:bg-muted hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the toolbar component**

Create `components/document-toolbar.tsx`:

```tsx
"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { formatWorkspacePath } from "@/lib/document-tabs";

export function DocumentToolbar({ path }: { path: string }) {
  return (
    <div className="flex h-10 items-center gap-3 border-b border-border bg-white px-4 text-sm">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Navigate back"
          onClick={() => window.history.back()}
          className="rounded p-1.5 text-slate-500 hover:bg-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Navigate forward"
          onClick={() => window.history.forward()}
          className="rounded p-1.5 text-slate-500 hover:bg-muted hover:text-ink"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-w-0 flex-1 truncate text-center text-slate-600">
        {formatWorkspacePath(path)}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create the center shell component**

Create `components/workspace-center-shell.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DocumentTabs } from "@/components/document-tabs";
import { DocumentToolbar } from "@/components/document-toolbar";
import { useDocumentTabs } from "@/components/use-document-tabs";
import type { DocumentTab } from "@/lib/document-tabs";

type SelectedFolderContext = {
  id: string;
  name: string;
  path: string;
};

export function WorkspaceCenterShell({
  workspaceSlug,
  documents,
  selectedDocument,
  selectedFolder,
  children,
}: {
  workspaceSlug: string;
  documents: DocumentTab[];
  selectedDocument: DocumentTab | null;
  selectedFolder: SelectedFolderContext | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const { tabs, activeDocumentId, closeTab } = useDocumentTabs({
    workspaceSlug,
    documents,
    selectedDocument,
  });

  function openDocument(documentId: string | null) {
    if (!documentId) {
      router.push(`/workspaces/${workspaceSlug}`);
      return;
    }

    router.push(`/workspaces/${workspaceSlug}?document=${documentId}`);
  }

  const toolbarPath = selectedDocument?.path ?? selectedFolder?.path ?? "/";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <DocumentTabs
        tabs={tabs}
        activeDocumentId={activeDocumentId}
        onSelect={openDocument}
        onClose={(documentId) => openDocument(closeTab(documentId))}
      />
      <DocumentToolbar path={toolbarPath} />
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </div>
  );
}
```

- [ ] **Step 7: Run component tests**

Run:

```bash
pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add components/use-document-tabs.ts components/document-tabs.tsx components/document-toolbar.tsx components/workspace-center-shell.tsx tests/components/workspace-center-shell.test.tsx
git commit -m "feat: add workspace document tab chrome"
```

## Task 3: Wire The Center Shell Into The Workspace Page

**Files:**
- Modify: `components/app-shell.tsx`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `pnpm exec tsc --noEmit`

- [ ] **Step 1: Adjust the app shell center column**

In `components/app-shell.tsx`, replace:

```tsx
<section className="min-w-0 overflow-auto bg-white p-5">{center}</section>
```

with:

```tsx
<section className="min-h-0 min-w-0 overflow-hidden bg-white">{center}</section>
```

- [ ] **Step 2: Import `WorkspaceCenterShell`**

In `app/workspaces/[workspaceSlug]/page.tsx`, add:

```ts
import { WorkspaceCenterShell } from "@/components/workspace-center-shell";
```

- [ ] **Step 3: Wrap the existing center content**

In `app/workspaces/[workspaceSlug]/page.tsx`, replace the current `center={...}` expression with:

```tsx
center={
  <WorkspaceCenterShell
    workspaceSlug={workspaceSlug}
    documents={readableDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      path: document.path,
    }))}
    selectedDocument={
      selectedDocument
        ? {
            id: selectedDocument.id,
            title: selectedDocument.title,
            path: selectedDocument.path,
          }
        : null
    }
    selectedFolder={
      selectedFolder
        ? {
            id: selectedFolder.id,
            name: selectedFolder.name,
            path: selectedFolder.path,
          }
        : null
    }
  >
    {selectedFolder ? (
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
  </WorkspaceCenterShell>
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add components/app-shell.tsx 'app/workspaces/[workspaceSlug]/page.tsx'
git commit -m "feat: show document tabs in workspace"
```

## Task 4: E2E Coverage And Browser Verification

**Files:**
- Modify: `tests/e2e/login.spec.ts`

- [ ] **Step 1: Add tab smoke coverage to the existing login e2e**

In `tests/e2e/login.spec.ts`, after the existing assertion:

```ts
await expect(page.locator("[name='title']")).toHaveValue("Welcome");
```

add:

```ts
await expect(page.getByRole("tab", { name: "Welcome" })).toHaveAttribute(
  "aria-selected",
  "true",
);
await expect(page.getByText("welcome", { exact: true })).toBeVisible();
```

After the existing navigation to Engineering Runbook:

```ts
await expect(page.locator("[name='title']")).toHaveValue("Engineering Runbook");
```

add:

```ts
await expect(page.getByRole("tab", { name: "Welcome" })).toBeVisible();
await expect(page.getByRole("tab", { name: "Engineering Runbook" })).toHaveAttribute(
  "aria-selected",
  "true",
);
await expect(page.getByText("engineering-runbook", { exact: true })).toBeVisible();
await page.getByRole("tab", { name: "Welcome" }).click();
await expect(page.locator("[name='title']")).toHaveValue("Welcome");
await page.getByRole("tab", { name: "Engineering Runbook" }).click();
await expect(page.locator("[name='title']")).toHaveValue("Engineering Runbook");
await page.getByRole("button", { name: "Close Engineering Runbook" }).click();
await expect(page.locator("[name='title']")).toHaveValue("Welcome");
```

- [ ] **Step 2: Run the focused unit and component tests**

Run:

```bash
pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run e2e**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' NEXTAUTH_URL='http://localhost:3000' NEXTAUTH_SECRET='obsidian-clone-development-secret' pnpm run test:e2e
```

Expected: PASS. If the local database or dev server is not available, start the existing docker compose/dev server workflow used by the repo, then rerun this command.

- [ ] **Step 5: Browser visual check**

Start the app if it is not already running:

```bash
pnpm run dev
```

Open `/workspaces/company-handbook`, log in as `owner@example.com`, and verify:

- The tab strip is directly above the toolbar.
- The toolbar sits directly above editor/folder content.
- The center content scrolls without moving the left and right sidebars.
- Tab text truncates instead of overlapping close buttons.
- Back/forward buttons are visible icon buttons.

- [ ] **Step 6: Commit**

Run:

```bash
git add tests/e2e/login.spec.ts
git commit -m "test: cover document tabs navigation"
```

## Task 5: Wiki Maintenance And Final Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Folder Hierarchy Model.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update `wiki/Document Editing Workflow.md`**

Replace the planned Issue #29 wording with implemented-state wording:

```md
## Document tabs and navigation toolbar

Issue #29 adds an Obsidian-style document tab strip and navigation toolbar above the workspace editor. The active document source of truth remains the existing `?document=<id>` query. The tab strip stores only workspace-scoped UI state in `munjib:open-tabs:<workspaceSlug>` `localStorage`; it does not create database rows or preserve separate unsaved editor buffers per document.

Sidebar links, quick switcher links, and preview wikilinks continue to route through `?document=<id>`. When the selected document changes, the center shell upserts the document id/title/path into the open tabs list and refreshes stale tab metadata from the readable document list. Closing the active tab chooses the right tab, then the left tab, then the workspace root.

The toolbar uses browser history for back/forward and displays the current `Document.path`, selected `Folder.path`, or `/` for the workspace root.
```

- [ ] **Step 2: Update `wiki/Folder Hierarchy Model.md`**

Change the Issue #29 planned toolbar paragraph to implemented-state wording:

```md
Issue #29 exposes this path model in the center navigation toolbar. Document views display `Document.path`, folder detail views display `Folder.path`, and the root state displays `/`. This is display-only UI state and does not change folder/document path calculation or database schema.
```

- [ ] **Step 3: Update `wiki/index.md`**

Change the Issue #29 status sentence to implemented-state wording:

```md
Issue #29 문서 탭과 navigation toolbar는 기존 `?document=<id>` 라우팅과 `Document.path` 기반 path 표시를 유지하면서 workspace center 상단에 구현되어 있다.
```

- [ ] **Step 4: Append `wiki/log.md` implementation entry**

Add a new log entry above the design entry:

```md
## 2026-05-11T00:30:00+09:00 - implementation

- Result: Issue #29 document tabs and navigation toolbar를 구현했다.
- Coverage: workspace center 상단 tab strip, workspace-scoped `localStorage` tab state, active `?document=<id>` routing, tab close target selection, browser history back/forward toolbar, current document/folder path display, unit/component/e2e coverage.
- Pages: [[Document Editing Workflow]], [[Folder Hierarchy Model]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #29, `lib/document-tabs.ts`, `components/workspace-center-shell.tsx`, `components/document-tabs.tsx`, `components/document-toolbar.tsx`, `components/use-document-tabs.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `tests/document-tabs.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/e2e/login.spec.ts`.
- Verification: `pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm run test:e2e`, browser visual check.
```

- [ ] **Step 5: Regenerate manifest**

Run:

```bash
pnpm wiki:manifest
```

Expected: writes `wiki/manifest.json`.

- [ ] **Step 6: Stage source and wiki files**

Run:

```bash
git add lib/document-tabs.ts tests/document-tabs.test.ts components/use-document-tabs.ts components/document-tabs.tsx components/document-toolbar.tsx components/workspace-center-shell.tsx tests/components/workspace-center-shell.test.tsx components/app-shell.tsx 'app/workspaces/[workspaceSlug]/page.tsx' tests/e2e/login.spec.ts wiki/Document\ Editing\ Workflow.md wiki/Folder\ Hierarchy\ Model.md wiki/index.md wiki/log.md wiki/manifest.json
```

Expected: source changes and wiki maintenance changes are staged together.

- [ ] **Step 7: Run wiki checks**

Run:

```bash
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: PASS.

- [ ] **Step 8: Final full verification**

Run:

```bash
pnpm exec vitest run tests/document-tabs.test.ts tests/components/workspace-center-shell.test.tsx
pnpm exec tsc --noEmit
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git commit -m "feat: add document tabs navigation toolbar"
```

## Self-Review Checklist

- Spec coverage: The plan implements tab strip, toolbar, localStorage tab state, `?document=<id>` active routing, tab close selection, path display, stale tab pruning, tests, and wiki updates from `docs/superpowers/specs/2026-05-11-document-tabs-navigation-toolbar-design.md`.
- Scope control: The plan does not add DB schema, markdown payload changes, multi-editor buffer persistence, unsaved-change prompts, drag reorder, pinned tabs, or split panes.
- Type consistency: The shared tab shape is `DocumentTab { id, title, path }`; selected folder context is `{ id, name, path }`; storage key is `munjib:open-tabs:<workspaceSlug>`.
- Verification: Unit/component tests cover tab state and UI actions; e2e covers the real workspace flow; wiki checks cover repository maintenance guardrails.
