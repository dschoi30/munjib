# Document List Sidebar UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the document sidebar UX so top-level creation does not flash, created items scroll into view, normal document rows are title-only, and bottom-edge action menus open upward.

**Architecture:** Keep existing server actions and route shapes. Move top-level creation into `DocumentList` client handlers using the existing `redirect=false` action contract, keep row rendering behavior inside the document-navigation component family, and share row-menu placement through one small helper.

**Tech Stack:** Next.js App Router, React client components, Tailwind classes, Sonner toast, Vitest, React Testing Library, existing Munjib wiki maintenance scripts.

---

## File Structure

- Modify `components/document-list.tsx`: own top-level create pending state, `redirect=false` action calls, created-row scroll target, route push, and creation failure toast.
- Modify `components/document-create-controls.tsx`: replace top-level create `<form>` elements with icon buttons that call `DocumentList` handlers and expose pending disabled state.
- Modify `components/document-navigation/types.ts`: update `OpenMenuHandler` so menu triggers can pass their button element for collision-aware placement.
- Modify `components/document-navigation.tsx`: store action-menu placement by menu id, pass placement and description mode to row components, and keep folder-scoped creation behavior unchanged.
- Modify `components/document-navigation/document-row.tsx`: add stable row DOM attributes, optional description rendering, trigger-element forwarding, and menu placement classes.
- Modify `components/document-navigation/document-section.tsx`: pass `showDescription` through to `DocumentLinkRow`.
- Modify `components/document-navigation/search-panel.tsx`: keep search result descriptions visible by passing `showDescription={true}`.
- Modify `components/document-navigation/favorites-panel.tsx`: keep favorite document descriptions visible by passing `showDescription={true}`.
- Modify `components/document-navigation/folder-row.tsx`: add stable folder row DOM attributes, trigger-element forwarding, and menu placement classes to folder menus.
- Create `components/document-navigation/menu-placement.ts`: define `ActionMenuPlacement`, collision measurement, and menu class helpers.
- Modify `tests/components/document-list.test.tsx`: add focused regression tests for creation, scroll, description visibility, and bottom-edge menu placement; update older path-display expectations for the normal Documents panel.
- Modify `wiki/Document Editing Workflow.md`, `wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json`: record the implemented Issue #137 behavior after source changes are complete.

## Task 1: Top-Level Creation Regression Tests

**Files:**
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Replace the root-create form test with client-controlled creation tests**

Find the existing test named:

```tsx
  it("keeps top-level create controls scoped to the workspace root", () => {
```

Replace that full test with these four tests:

```tsx
  it("creates a root document from the toolbar without relying on server redirect", async () => {
    const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
    renderList({ createAction });

    fireEvent.click(screen.getByRole("button", { name: "New document" }));

    await waitFor(() => {
      expect(createAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("folderId")).toBe("");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?document=doc-created");
  });

  it("creates a root folder from the toolbar without relying on server redirect", async () => {
    const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
    renderList({ createFolderAction });

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));

    await waitFor(() => {
      expect(createFolderAction).toHaveBeenCalledWith(expect.any(FormData));
    });
    const submittedFormData = (createFolderAction.mock.calls as unknown as FormData[][])[0][0];
    expect(submittedFormData.get("parentFolderId")).toBe("");
    expect(submittedFormData.get("redirect")).toBe("false");
    expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?folder=folder-created");
  });

  it("guards top-level toolbar creation against repeated clicks while pending", async () => {
    let resolveCreateDocument: (result: { documentId: string }) => void = () => {};
    const createAction = vi.fn(
      () =>
        new Promise<{ documentId: string }>((resolve) => {
          resolveCreateDocument = resolve;
        }),
    );
    renderList({ createAction });

    const newDocumentButton = screen.getByRole("button", { name: "New document" });
    fireEvent.click(newDocumentButton);
    fireEvent.click(newDocumentButton);

    expect(createAction).toHaveBeenCalledTimes(1);
    expect(newDocumentButton).toHaveProperty("disabled", true);

    resolveCreateDocument({ documentId: "doc-created" });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        "/workspaces/company-handbook?document=doc-created",
      );
    });
  });

  it("shows a localized toast when top-level creation fails", async () => {
    const createAction = vi.fn(async () => {
      throw new Error("create failed");
    });
    renderList({ createAction });

    fireEvent.click(screen.getByRole("button", { name: "New document" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "Could not create the item. Try again.",
        expect.objectContaining({ id: "folder-create-error" }),
      );
    });
    expect(router.push).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Add created-row scroll tests**

Add these tests after the new top-level creation tests:

```tsx
  it("scrolls a newly created root document row into view after refreshed props include it", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    const createAction = vi.fn(async () => ({ documentId: "doc-created" }));
    const { rerender } = renderList({ createAction });

    fireEvent.click(screen.getByRole("button", { name: "New document" }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(
        "/workspaces/company-handbook?document=doc-created",
      );
    });

    rerender(
      <DocumentList
        {...baseProps}
        createAction={createAction}
        documents={[
          ...baseProps.documents,
          {
            id: "doc-created",
            folderId: null,
            title: "Untitled",
            path: "/untitled-2",
            contentText: "",
            tagNames: [],
            canWrite: true,
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    });
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("scrolls a newly created root folder row into view after refreshed props include it", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    const createFolderAction = vi.fn(async () => ({ folderId: "folder-created" }));
    const { rerender } = renderList({ createFolderAction });

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/workspaces/company-handbook?folder=folder-created");
    });

    rerender(
      <DocumentList
        {...baseProps}
        createFolderAction={createFolderAction}
        folders={[
          ...baseProps.folders,
          {
            id: "folder-created",
            parentFolderId: null,
            name: "Untitled folder",
            path: "/untitled-folder",
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    });
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: FAIL because top-level create controls are still forms, no `redirect=false` is submitted by click handlers, no created-row scroll target exists, and top-level creation failure toast is not wired.

## Task 2: Implement Top-Level Client Creation And Created-Row Scroll

**Files:**
- Modify: `components/document-create-controls.tsx`
- Modify: `components/document-list.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Update `DocumentCreateControls` props and buttons**

In `components/document-create-controls.tsx`, remove the type-only import of `CreateDocumentFormAction` and `CreateFolderFormAction` from `@/components/document-navigation/types`.

Change the component props from:

```tsx
  createAction,
  createFolderAction,
```

to:

```tsx
  onCreateDocument,
  onCreateFolder,
  isCreatingDocument,
  isCreatingFolder,
```

Change the prop type block to:

```tsx
}: {
  canWrite: boolean;
  onCreateDocument: () => void;
  onCreateFolder: () => void;
  isCreatingDocument: boolean;
  isCreatingFolder: boolean;
  activeView: "documents" | "search" | "favorites" | "graph";
  onOpenDocuments: () => void;
  onOpenSearch: () => void;
  onOpenFavorites: () => void;
  onOpenGraph: () => void;
}) {
```

Replace the top-level document creation `<form>` block with:

```tsx
        <ToolbarTooltip label={t("nav.newDocument")}>
          <Button
            type="button"
            disabled={!canWrite || isCreatingDocument}
            aria-label={t("nav.newDocument")}
            onClick={onCreateDocument}
            className={iconButtonClassName}
          >
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
```

Replace the top-level folder creation `<form>` block with:

```tsx
        <ToolbarTooltip label={t("nav.newFolder")}>
          <Button
            type="button"
            disabled={!canWrite || isCreatingFolder}
            aria-label={t("nav.newFolder")}
            onClick={onCreateFolder}
            className={iconButtonClassName}
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </ToolbarTooltip>
```

- [ ] **Step 2: Add top-level creation state and toast in `DocumentList`**

In `components/document-list.tsx`, add this import:

```tsx
import { toast } from "sonner";
```

Change the React import to include `useTransition`:

```tsx
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
```

Remove `CreateDocumentFormAction` and `CreateFolderFormAction` from the imported types.

Add these types above `export type DocumentListItem`:

```tsx
type PendingCreatedTarget =
  | { kind: "document"; id: string }
  | { kind: "folder"; id: string };

type TopLevelCreateKind = "document" | "folder";
```

Inside `DocumentList`, after `const [searchQuery, setSearchQuery] = useState("");`, add:

```tsx
  const [pendingTopLevelCreateKind, setPendingTopLevelCreateKind] =
    useState<TopLevelCreateKind | null>(null);
  const [pendingCreatedTarget, setPendingCreatedTarget] =
    useState<PendingCreatedTarget | null>(null);
  const [, startTopLevelCreateTransition] = useTransition();
```

- [ ] **Step 3: Add created-row scroll effect**

In `components/document-list.tsx`, after the `openGraph` callback, add:

```tsx
  useEffect(() => {
    if (!pendingCreatedTarget) return;

    const selector =
      pendingCreatedTarget.kind === "document"
        ? `[data-document-row-id="${CSS.escape(pendingCreatedTarget.id)}"]`
        : `[data-folder-row-id="${CSS.escape(pendingCreatedTarget.id)}"]`;
    const row = document.querySelector<HTMLElement>(selector);
    if (!row) return;

    row.scrollIntoView({ block: "nearest" });
    setPendingCreatedTarget(null);
  }, [documents, folders, pendingCreatedTarget]);
```

If the test environment reports `CSS.escape` as missing, place this helper above the effect and use `escapeCssIdentifier(pendingCreatedTarget.id)` in the selector:

```tsx
function escapeCssIdentifier(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}
```

- [ ] **Step 4: Add top-level creation callbacks**

In `components/document-list.tsx`, after the created-row scroll effect, add:

```tsx
  const createTopLevelDocument = useCallback(async () => {
    if (pendingTopLevelCreateKind) return;

    const formData = new FormData();
    formData.set("folderId", "");
    formData.set("redirect", "false");

    setPendingTopLevelCreateKind("document");
    try {
      const result = await createAction(formData);
      if (result?.documentId) {
        setPendingCreatedTarget({ kind: "document", id: result.documentId });
        startTopLevelCreateTransition(() => {
          router.push(workspaceDocumentHref({ workspaceSlug, documentId: result.documentId }));
        });
        return;
      }

      startTopLevelCreateTransition(() => {
        router.refresh();
      });
    } catch {
      toast(t("nav.folderCreateFailed"), {
        id: "folder-create-error",
        className:
          "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg",
        unstyled: true,
      });
    } finally {
      setPendingTopLevelCreateKind(null);
    }
  }, [
    createAction,
    pendingTopLevelCreateKind,
    router,
    startTopLevelCreateTransition,
    t,
    workspaceSlug,
  ]);

  const createTopLevelFolder = useCallback(async () => {
    if (pendingTopLevelCreateKind) return;

    const formData = new FormData();
    formData.set("parentFolderId", "");
    formData.set("redirect", "false");

    setPendingTopLevelCreateKind("folder");
    try {
      const result = await createFolderAction(formData);
      if (result?.folderId) {
        setPendingCreatedTarget({ kind: "folder", id: result.folderId });
        startTopLevelCreateTransition(() => {
          router.push(`/workspaces/${workspaceSlug}?folder=${result.folderId}`);
        });
        return;
      }

      startTopLevelCreateTransition(() => {
        router.refresh();
      });
    } catch {
      toast(t("nav.folderCreateFailed"), {
        id: "folder-create-error",
        className:
          "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-lg",
        unstyled: true,
      });
    } finally {
      setPendingTopLevelCreateKind(null);
    }
  }, [
    createFolderAction,
    pendingTopLevelCreateKind,
    router,
    startTopLevelCreateTransition,
    t,
    workspaceSlug,
  ]);
```

- [ ] **Step 5: Wire the new toolbar props**

In the `DocumentCreateControls` call in `components/document-list.tsx`, replace:

```tsx
          createAction={createAction as CreateDocumentFormAction}
          createFolderAction={createFolderAction as CreateFolderFormAction}
```

with:

```tsx
          onCreateDocument={createTopLevelDocument}
          onCreateFolder={createTopLevelFolder}
          isCreatingDocument={pendingTopLevelCreateKind === "document"}
          isCreatingFolder={pendingTopLevelCreateKind === "folder"}
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: the new top-level creation and scroll tests pass. Some existing display-path tests still fail until Task 4 updates row description modes.

- [ ] **Step 7: Commit the top-level creation slice**

Run:

```bash
git add components/document-create-controls.tsx components/document-list.tsx tests/components/document-list.test.tsx
git commit -m "fix: smooth top-level sidebar creation"
```

Expected: commit succeeds after the pre-commit wiki guard sees no staged durable wiki requirement for this focused source/test slice, or it reports wiki candidates to update in Task 7.

## Task 3: Description Visibility Regression Tests

**Files:**
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Replace normal-tree display-path expectations**

Find the existing test named:

```tsx
  it("uses display paths in normal document tree and recent rows", () => {
```

Replace that full test with:

```tsx
  it("shows title-only document rows in normal recents and document tree", () => {
    const folders = [
      { ...folderFixtures[0], displayPath: "Engineering" },
      { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
    ];
    const documents = [
      {
        id: "doc-selected",
        folderId: null,
        title: "Welcome",
        path: "/welcome",
        contentText: "Welcome body",
        tagNames: [],
        canWrite: true,
      },
      {
        id: "doc-runbook",
        folderId: "folder-runbooks",
        title: "Engineering Runbook",
        path: "/engineering/runbooks/engineering-runbook",
        displayPath: "Engineering / Runbooks / Engineering Runbook",
        contentText: "Release checklist",
        tagNames: ["engineering"],
        canWrite: true,
      },
      {
        id: "doc-operations",
        folderId: null,
        title: "Operations Runbook",
        path: "/operations/runbook",
        contentText: "Operations checklist",
        tagNames: [],
        canWrite: true,
      },
    ];
    renderList({ folders, documents, selectedDocumentId: "doc-selected" });

    const recentsSection = screen.getByText("Recents").closest("section");
    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    expect(recentsSection).toBeTruthy();

    for (const surface of [recentsSection as HTMLElement, allDocumentsNav]) {
      expect(within(surface).getByRole("link", { name: "Engineering Runbook" })).toBeTruthy();
      expect(within(surface).getByRole("link", { name: "Operations Runbook" })).toBeTruthy();
      expect(surface.textContent).not.toContain(
        "Engineering / Runbooks / Engineering Runbook",
      );
      expect(surface.textContent).not.toContain("/operations/runbook");
    }

    expect(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering Runbook · Engineering / Runbooks / Engineering Runbook",
      }),
    ).toBeTruthy();
  });
```

- [ ] **Step 2: Replace collision-context normal-tree tests**

Find the test named:

```tsx
  it("keeps stored path context when title display paths collide", () => {
```

Change only the final expectations to:

```tsx
    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    expect(allDocumentsNav.textContent).not.toContain(
      "Engineering / Runbooks / Runbook · /engineering/runbooks/runbook-2",
    );
    expect(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Runbook · Engineering / Runbooks / Runbook · /engineering/runbooks/runbook-2",
      }),
    ).toBeTruthy();
```

Find the test named:

```tsx
  it("keeps stored path context when slash-title display paths collide", () => {
```

Change only the final expectations to:

```tsx
    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    expect(allDocumentsNav.textContent).not.toContain("A / B / C · /a/b-c");
    expect(allDocumentsNav.textContent).not.toContain("A / B / C · /a/b/c");
    expect(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for B / C · A / B / C · /a/b-c",
      }),
    ).toBeTruthy();
    expect(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for C · A / B / C · /a/b/c",
      }),
    ).toBeTruthy();
```

- [ ] **Step 3: Add explicit search and favorites preservation checks**

After the existing search display-path tests, add:

```tsx
  it("keeps title-based display paths visible in favorites while documents panel is title-only", () => {
    const folders = [
      { ...folderFixtures[0], displayPath: "Engineering" },
      { ...folderFixtures[1], displayPath: "Engineering / Runbooks" },
    ];
    const documents = [
      {
        id: "doc-runbook",
        folderId: "folder-runbooks",
        title: "Engineering Runbook",
        path: "/engineering/runbooks/engineering-runbook",
        displayPath: "Engineering / Runbooks / Engineering Runbook",
        contentText: "Release checklist",
        tagNames: ["engineering"],
        canWrite: true,
      },
    ];
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({ documents: ["doc-runbook"], folders: [] }),
    );
    renderList({ folders, documents, selectedDocumentId: null });

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    expect(allDocumentsNav.textContent).not.toContain(
      "Engineering / Runbooks / Engineering Runbook",
    );

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    const favoritesSection = screen.getByText("Favorites").closest("section");
    expect(favoritesSection).toBeTruthy();
    expect(favoritesSection?.textContent).toContain(
      "Engineering / Runbooks / Engineering Runbook",
    );
  });
```

- [ ] **Step 4: Run focused tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: FAIL because `DocumentLinkRow` still renders descriptions by default in the Documents panel.

## Task 4: Implement Title-Only Documents Panel Rows

**Files:**
- Modify: `components/document-navigation/document-row.tsx`
- Modify: `components/document-navigation/document-section.tsx`
- Modify: `components/document-navigation/search-panel.tsx`
- Modify: `components/document-navigation/favorites-panel.tsx`
- Modify: `components/document-navigation.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Add `showDescription` and row data attributes to `DocumentLinkRow`**

In `components/document-navigation/document-row.tsx`, add `showDescription = true` to the destructured props:

```tsx
  showDescription = true,
```

Add this prop to the TypeScript object type:

```tsx
  showDescription?: boolean;
```

Change:

```tsx
  const rowDescription = description ?? documentDisplayDescription(document, fallbackLabel);
```

to:

```tsx
  const rowDescription = showDescription
    ? description ?? documentDisplayDescription(document, fallbackLabel)
    : undefined;
```

Change the outer `<div>` opening tag from:

```tsx
    <div className={rowClassName}>
```

to:

```tsx
    <div className={rowClassName} data-document-row-id={document.id}>
```

- [ ] **Step 2: Pass `showDescription` through `DocumentSection`**

In `components/document-navigation/document-section.tsx`, add `showDescription = true` to the destructured props and add the prop type:

```tsx
  showDescription = true,
```

```tsx
  showDescription?: boolean;
```

Pass it into each `DocumentLinkRow`:

```tsx
            showDescription={showDescription}
```

- [ ] **Step 3: Keep search and favorites descriptions visible**

In `components/document-navigation/search-panel.tsx`, pass:

```tsx
      showDescription={true}
```

to the `DocumentLinkRow` inside `SearchResultRow`.

In `components/document-navigation/favorites-panel.tsx`, pass:

```tsx
            showDescription={true}
```

to the favorite document `DocumentLinkRow`.

- [ ] **Step 4: Disable descriptions in the Documents panel**

In `components/document-navigation.tsx`, add:

```tsx
              showDescription={false}
```

to the `DocumentSection` rendering `Recents`.

In `renderTreeItems`, add:

```tsx
            showDescription={false}
```

to the `DocumentLinkRow` for `item.kind === "document"`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: description visibility tests pass. Menu-placement tests are still absent until Task 5.

- [ ] **Step 6: Commit the description-mode slice**

Run:

```bash
git add components/document-navigation/document-row.tsx components/document-navigation/document-section.tsx components/document-navigation/search-panel.tsx components/document-navigation/favorites-panel.tsx components/document-navigation.tsx tests/components/document-list.test.tsx
git commit -m "fix: show title-only normal document rows"
```

Expected: commit succeeds after staged checks, or wiki guard reports durable behavior updates to complete in Task 7.

## Task 5: Row Menu Placement Regression Tests

**Files:**
- Modify: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Add a bottom-edge document menu test**

Add this test near the folder action menu tests:

```tsx
  it("opens bottom-edge document action menus upward", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 120,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getRect(this: HTMLElement) {
        if (this.getAttribute("aria-label")?.startsWith("Open actions for Engineering Runbook")) {
          return {
            x: 0,
            y: 100,
            width: 24,
            height: 24,
            top: 100,
            right: 24,
            bottom: 124,
            left: 0,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          width: 240,
          height: 120,
          top: 0,
          right: 240,
          bottom: 120,
          left: 0,
          toJSON: () => ({}),
        };
      });
    renderList();

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering Runbook · /engineering-runbook",
      }),
    );

    expect(screen.getByRole("menu").className).toContain("bottom-8");

    rectSpy.mockRestore();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });
```

- [ ] **Step 2: Add a down-placement control test**

Add this test directly after the upward document menu test:

```tsx
  it("keeps document action menus opening downward when there is room below", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getRect(this: HTMLElement) {
        if (this.getAttribute("aria-label")?.startsWith("Open actions for Engineering Runbook")) {
          return {
            x: 0,
            y: 40,
            width: 24,
            height: 24,
            top: 40,
            right: 24,
            bottom: 64,
            left: 0,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          width: 240,
          height: 800,
          top: 0,
          right: 240,
          bottom: 800,
          left: 0,
          toJSON: () => ({}),
        };
      });
    renderList();

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering Runbook · /engineering-runbook",
      }),
    );

    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("top-8");
    expect(menu.className).not.toContain("bottom-8");

    rectSpy.mockRestore();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });
```

- [ ] **Step 3: Add a folder menu upward-placement test**

Add this test after the existing test named `"moves folder-scoped creation into the folder actions menu"`:

```tsx
  it("opens bottom-edge folder action menus upward", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 120,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getRect(this: HTMLElement) {
        if (this.getAttribute("aria-label") === "Open actions for Engineering /engineering") {
          return {
            x: 0,
            y: 100,
            width: 24,
            height: 24,
            top: 100,
            right: 24,
            bottom: 124,
            left: 0,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          width: 240,
          height: 120,
          top: 0,
          right: 240,
          bottom: 120,
          left: 0,
          toJSON: () => ({}),
        };
      });
    renderList();

    const allDocumentsNav = screen.getByRole("navigation", { name: "All documents" });
    fireEvent.click(
      within(allDocumentsNav).getByRole("button", {
        name: "Open actions for Engineering /engineering",
      }),
    );

    expect(screen.getByRole("menu").className).toContain("bottom-8");

    rectSpy.mockRestore();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });
```

- [ ] **Step 4: Run focused tests and verify failure**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: FAIL because row menus always use `top-8`.

## Task 6: Implement Collision-Aware Row Menu Placement

**Files:**
- Create: `components/document-navigation/menu-placement.ts`
- Modify: `components/document-navigation/types.ts`
- Modify: `components/document-navigation.tsx`
- Modify: `components/document-navigation/document-row.tsx`
- Modify: `components/document-navigation/folder-row.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Create the menu placement helper**

Create `components/document-navigation/menu-placement.ts` with:

```ts
export type ActionMenuPlacement = "down" | "up";

const estimatedActionMenuHeight = 176;

export function chooseActionMenuPlacement(
  trigger: HTMLElement,
  menuHeight = estimatedActionMenuHeight,
): ActionMenuPlacement {
  const triggerRect = trigger.getBoundingClientRect();
  const boundaryBottom = findScrollBoundaryBottom(trigger);
  const spaceBelow = boundaryBottom - triggerRect.bottom;

  return spaceBelow < menuHeight ? "up" : "down";
}

export function actionMenuPositionClassName(placement: ActionMenuPlacement) {
  return placement === "up" ? "bottom-8" : "top-8";
}

function findScrollBoundaryBottom(element: HTMLElement) {
  let current = element.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = `${style.overflowY} ${style.overflow}`;
    if (/(auto|scroll|hidden)/.test(overflowY)) {
      return current.getBoundingClientRect().bottom;
    }
    current = current.parentElement;
  }

  return window.innerHeight;
}
```

- [ ] **Step 2: Update the open-menu handler type**

In `components/document-navigation/types.ts`, replace:

```ts
export type OpenMenuHandler = (menuId: string | null) => void;
```

with:

```ts
export type OpenMenuHandler = (menuId: string | null, trigger?: HTMLElement | null) => void;
```

- [ ] **Step 3: Add placement state in `DocumentNavigation`**

In `components/document-navigation.tsx`, add this import:

```tsx
import {
  type ActionMenuPlacement,
  chooseActionMenuPlacement,
} from "@/components/document-navigation/menu-placement";
```

After:

```tsx
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
```

add:

```tsx
  const [menuPlacements, setMenuPlacements] = useState<Record<string, ActionMenuPlacement>>({});
```

Add this function before `toggleFavoriteDocument`:

```tsx
  function setOpenRowMenu(menuId: string | null, trigger?: HTMLElement | null) {
    if (!menuId) {
      setOpenMenuId(null);
      return;
    }

    setMenuPlacements((current) => ({
      ...current,
      [menuId]: trigger ? chooseActionMenuPlacement(trigger) : "down",
    }));
    setOpenMenuId(menuId);
  }
```

Replace every `onOpenMenu={setOpenMenuId}` in `DocumentNavigation` with:

```tsx
            onOpenMenu={setOpenRowMenu}
```

For `FolderToggleRow`, use:

```tsx
            onOpenMenu={setOpenRowMenu}
```

Pass menu placement to document rows:

```tsx
            menuPlacement={menuPlacements[`tree-document:${item.document.id}`] ?? "down"}
```

Pass menu placement to folder rows:

```tsx
            menuPlacement={menuPlacements[`folder:${item.folder.id}`] ?? "down"}
```

Pass `menuPlacements` into `SearchPanel`, `FavoriteSection`, and `DocumentSection` using new props from later steps:

```tsx
            menuPlacements={menuPlacements}
```

- [ ] **Step 4: Update `DocumentLinkRow` menu placement**

In `components/document-navigation/document-row.tsx`, add this import:

```tsx
import {
  actionMenuPositionClassName,
  type ActionMenuPlacement,
} from "@/components/document-navigation/menu-placement";
```

Add `menuPlacement = "down"` to the destructured props and type:

```tsx
  menuPlacement = "down",
```

```tsx
  menuPlacement?: ActionMenuPlacement;
```

Change the action button `onClick` to pass the trigger:

```tsx
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenu(isMenuOpen ? null : menuId, event.currentTarget);
        }}
```

Change the menu class from:

```tsx
          className="absolute right-0 top-8 z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg"
```

to:

```tsx
          className={`absolute right-0 ${actionMenuPositionClassName(menuPlacement)} z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg`}
```

- [ ] **Step 5: Update `DocumentSection`, `SearchPanel`, and `FavoriteSection` placement props**

In `components/document-navigation/document-section.tsx`, import `ActionMenuPlacement` and add:

```tsx
  menuPlacements,
```

with prop type:

```tsx
  menuPlacements?: Record<string, ActionMenuPlacement>;
```

Pass to `DocumentLinkRow`:

```tsx
            menuPlacement={menuPlacements?.[`${menuScope}:${document.id}`] ?? "down"}
```

In `components/document-navigation/search-panel.tsx`, import `ActionMenuPlacement`, add a `menuPlacements` prop, pass it through `SearchResultRow`, and pass this to `DocumentLinkRow`:

```tsx
      menuPlacement={menuPlacements?.[rowId] ?? "down"}
```

In `components/document-navigation/favorites-panel.tsx`, import `ActionMenuPlacement`, add a `menuPlacements` prop, pass it to `FavoriteFolderRow`, and pass this to favorite document rows:

```tsx
            menuPlacement={menuPlacements?.[`favorite-document:${document.id}`] ?? "down"}
```

- [ ] **Step 6: Update folder rows**

In `components/document-navigation/folder-row.tsx`, add this import:

```tsx
import {
  actionMenuPositionClassName,
  type ActionMenuPlacement,
} from "@/components/document-navigation/menu-placement";
```

For `FavoriteFolderRow`, add `menuPlacement = "down"` to destructured props and add the prop type:

```tsx
  menuPlacement = "down",
```

```tsx
  menuPlacement?: ActionMenuPlacement;
```

Change the outer favorite folder `<div>` to:

```tsx
    <div
      className="group relative flex items-start gap-1 rounded-md hover:bg-slate-200 focus-within:bg-slate-200"
      data-folder-row-id={folder.id}
    >
```

Change the favorite folder action button `onClick` to:

```tsx
        onClick={(event) => onOpenMenu(isMenuOpen ? null : rowId, event.currentTarget)}
```

Change the favorite folder menu class to:

```tsx
          className={`absolute right-0 ${actionMenuPositionClassName(menuPlacement)} z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg`}
```

For `FolderToggleRow`, add `menuPlacement = "down"` to destructured props and add the prop type:

```tsx
  menuPlacement = "down",
```

```tsx
  menuPlacement?: ActionMenuPlacement;
```

Change the non-renaming outer folder `<div>` to:

```tsx
    <div className={rowClassName} data-folder-row-id={folder.id}>
```

Change the folder action button `onClick` to:

```tsx
          onClick={(event) => onOpenMenu(isMenuOpen ? null : menuId, event.currentTarget)}
```

Change the folder menu class to:

```tsx
          className={`absolute right-0 ${actionMenuPositionClassName(menuPlacement)} z-20 w-44 rounded-md border border-border bg-white p-1 text-[13px] shadow-lg`}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS for the full `document-list` component test file.

- [ ] **Step 8: Commit the menu-placement slice**

Run:

```bash
git add components/document-navigation/menu-placement.ts components/document-navigation/types.ts components/document-navigation.tsx components/document-navigation/document-row.tsx components/document-navigation/document-section.tsx components/document-navigation/search-panel.tsx components/document-navigation/favorites-panel.tsx components/document-navigation/folder-row.tsx tests/components/document-list.test.tsx
git commit -m "fix: keep sidebar row menus in view"
```

Expected: commit succeeds after staged checks, or wiki guard reports durable behavior updates to complete in Task 7.

## Task 7: Wiki Maintenance And Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update `wiki/Document Editing Workflow.md`**

Add an Issue #137 paragraph near the existing sidebar/navigation behavior notes:

```md
Issue #137 updates the left sidebar document-list UX. Top-level `New document`
and `New folder` toolbar actions use the existing `redirect=false` server-action
return contract so the client can route without a direct server redirect flash.
After refreshed props include the created document or folder, the matching
sidebar row scrolls into view. Normal Documents/Recents document rows render as
title-only rows, while Search and Favorites keep title-based display-path context
for disambiguation and stored-path search compatibility. Row action menus keep
their existing menu implementation but open upward when the lower viewport or
scroll area lacks enough space.
```

- [ ] **Step 2: Update `wiki/index.md`**

In the current editing experience bullet, update the Issue #137 sentence from design status to implementation status:

```md
Issue #137 implements title-only normal Documents/Recents rows while keeping
Search/Favorites display-path context, moves top-level new document/folder
creation to client-controlled `redirect=false` transitions, scrolls the created
row into view, and opens bottom-edge row action menus upward.
```

- [ ] **Step 3: Update `wiki/log.md`**

Run this command:

```bash
date +%Y-%m-%dT%H:%M:%S%z
```

Use the exact timestamp printed by the command as the heading timestamp, followed
by ` - implementation`. Add this entry body at the top of the log under that
heading:

```md
- Result: Issue #137 smooths the document-list sidebar creation and row menu UX.
- Coverage: Top-level `New document` and `New folder` now submit `redirect=false`
  and route on the client, created documents/folders scroll into view once the
  refreshed list contains them, normal Documents/Recents document rows are
  title-only, Search/Favorites keep title-based display-path context, and
  bottom-edge row action menus open upward.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #137,
  `docs/superpowers/specs/2026-06-27-document-list-sidebar-ux-design.md`,
  `docs/superpowers/plans/2026-06-27-document-list-sidebar-ux.md`,
  `components/document-list.tsx`, `components/document-create-controls.tsx`,
  `components/document-navigation.tsx`,
  `components/document-navigation/document-row.tsx`,
  `components/document-navigation/folder-row.tsx`,
  `components/document-navigation/menu-placement.ts`,
  `tests/components/document-list.test.tsx`.
- Verification: focused `document-list` Vitest run passed; `pnpm exec tsc
  --noEmit --pretty false` passed; `pnpm wiki:manifest`, `pnpm wiki:lint`, and
  `pnpm wiki:sync-check --staged` passed with the known
  `wiki/designs/sidebar.md` pasted-image warning.
```

- [ ] **Step 4: Regenerate wiki manifest**

Run:

```bash
pnpm wiki:manifest
```

Expected: `wiki/manifest.json` is rewritten and source counts match the updated wiki frontmatter.

- [ ] **Step 5: Run source verification**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS.

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

- [ ] **Step 6: Run wiki verification**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: `wiki:lint` exits 0. It may print the known warning:

```text
WARN wiki/designs/sidebar.md: unresolved wiki link [[Pasted Image 20260603131407_119.png]]
```

- [ ] **Step 7: Commit wiki maintenance and final source state**

Run:

```bash
git add components/document-list.tsx components/document-create-controls.tsx components/document-navigation.tsx components/document-navigation/document-row.tsx components/document-navigation/document-section.tsx components/document-navigation/search-panel.tsx components/document-navigation/favorites-panel.tsx components/document-navigation/folder-row.tsx components/document-navigation/menu-placement.ts components/document-navigation/types.ts tests/components/document-list.test.tsx wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json docs/superpowers/plans/2026-06-27-document-list-sidebar-ux.md
git commit -m "docs: record document list sidebar UX implementation"
```

Expected: commit succeeds. If earlier tasks already committed source slices, this commit contains the plan file and wiki maintenance only.

## Task 8: PR Preparation And Review Loop

**Files:**
- No source file changes in this task unless PR checks or review feedback require fixes.

- [ ] **Step 1: Check final branch state**

Run:

```bash
git status --short --branch
```

Expected: branch is `issue-137-document-list-sidebar-ux-fixes` and the only remaining untracked file is the pre-existing `pnpm-workspace.yaml`, unless the user has handled it separately.

- [ ] **Step 2: Push the branch**

Run:

```bash
git push -u origin issue-137-document-list-sidebar-ux-fixes
```

Expected: push succeeds.

- [ ] **Step 3: Create a draft PR**

Run:

```bash
gh pr create --draft --title "Fix document list sidebar UX" --body "## Summary

- smooth top-level document/folder creation from the sidebar toolbar
- scroll newly created sidebar rows into view
- show title-only rows in the normal Documents panel while preserving Search/Favorites path context
- open bottom-edge row action menus upward

## Verification

- pnpm exec vitest run tests/components/document-list.test.tsx
- pnpm exec tsc --noEmit --pretty false
- pnpm wiki:manifest
- pnpm wiki:lint
- pnpm wiki:sync-check --staged"
```

Expected: GitHub returns a PR URL.

- [ ] **Step 4: Mark the PR ready**

Run:

```bash
gh pr ready
```

Expected: PR is ready for review.

- [ ] **Step 5: Wait and inspect CI/reviews**

Wait at least 5 minutes. Then run:

```bash
gh pr checks --watch=false
gh pr view --json reviewDecision,reviews,comments,url
```

Expected: checks are passing or still pending with clear names. If there is actionable review feedback or a failing check, fix it on the same branch, rerun the verification commands from Task 7, commit, push, and repeat this review check.

## Self-Review Checklist

- Spec coverage: Task 2 covers top-level client creation and created-row scroll. Task 4 covers normal title-only rows and Search/Favorites path-context preservation. Task 6 covers bottom-edge upward row menus. Task 7 covers wiki maintenance and verification. Task 8 covers repo completion and PR review loop.
- Completion scan: the plan contains no open-ended work markers, unspecified edge handling, or "write tests for this" style gaps. Each test and implementation step includes concrete code or exact commands.
- Type consistency: `OpenMenuHandler` accepts an optional `HTMLElement`, `ActionMenuPlacement` is `"down" | "up"`, row components receive `menuPlacement`, and `DocumentCreateControls` receives `onCreateDocument`, `onCreateFolder`, `isCreatingDocument`, and `isCreatingFolder`.
