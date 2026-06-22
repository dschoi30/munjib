# Document Title Display Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show workspace document and folder path labels with folder names and `Document.title` while preserving stored slug paths for identity and matching.

**Architecture:** Add a pure display-path helper in `lib/workspace-tree.ts`, compute display paths during workspace page assembly, and pass both `path` and `displayPath` to the client surfaces that render visible path labels. Stored `Document.path` and `Folder.path` stay unchanged for sorting, search compatibility, wiki links, graph/RAG metadata, and audit metadata.

**Tech Stack:** Next.js App Router, React client components, Prisma workspace data, Vitest, Testing Library, existing Munjib wiki sync tools.

---

## Commit Strategy

This repository's pre-commit hook rejects staged source changes without staged
wiki maintenance. Tasks 1-4 therefore create testable code checkpoints without
committing. Task 5 stages source, tests, plan, and wiki maintenance together,
runs the wiki sync checks, and creates one implementation commit.

## File Structure

- Modify `lib/workspace-tree.ts`: owns pure helper functions for folder/document display path labels.
- Modify `tests/workspace-tree.test.ts`: covers display path generation and action-label fallback behavior.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: computes display paths once from loaded folders/documents and passes them into client props.
- Modify `lib/document-tabs.ts`: allows selected/readable document props to carry `displayPath` without changing serialized tab storage.
- Modify `components/workspace-center-shell.tsx`: sends `displayPath` to the toolbar when present.
- Modify `tests/components/workspace-center-shell.test.tsx`: proves toolbar path is title-based and not slug-based.
- Modify `components/document-list.tsx`: extends document/folder item types and forwards display paths to settings and navigation.
- Modify `components/document-navigation.tsx`: matches search against both stored `path` and visible `displayPath`.
- Modify `components/document-navigation/search-panel.tsx`: renders search result descriptions with `displayPath`.
- Modify `components/document-navigation/document-row.tsx`: uses `displayPath` in accessible action labels through `documentActionLabel()`.
- Modify `components/document-navigation/folder-row.tsx`: shows favorite folder descriptions and action labels with `displayPath`.
- Modify `components/document-navigation/favorites-panel.tsx`: passes document `displayPath` to favorite document rows when path context is needed.
- Modify `components/workspace-settings-panel.tsx`: shows import destination labels with folder `displayPath`, while submitting the same `folderId`.
- Modify `components/folder-detail.tsx`: shows selected folder `displayPath`.
- Modify `tests/components/document-list.test.tsx`: covers sidebar search, visible descriptions, destination picker, and action labels.
- Modify `tests/components/folder-detail.test.tsx`: covers title-based folder path labels.
- Modify wiki files after implementation: `wiki/Folder Hierarchy Model.md`, `wiki/Document Editing Workflow.md`, `wiki/Munjib.md`, `wiki/Project PRD.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

### Task 1: Display Path Helper

**Files:**
- Modify: `lib/workspace-tree.ts`
- Test: `tests/workspace-tree.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add these imports in `tests/workspace-tree.test.ts`:

```ts
import {
  buildFolderDisplayPathMap,
  countFolderChildren,
  documentActionLabel,
  documentDisplayLabel,
  documentDisplayPath,
  folderDisplayPath,
  treeDepth,
} from "@/lib/workspace-tree";
```

Add these tests inside `describe("workspace tree helpers", () => { ... })`:

```ts
  it("builds display paths from folder names and document titles", () => {
    const folders = [
      {
        id: "folder-engineering",
        parentFolderId: null,
        name: "Engineering",
        path: "/engineering",
      },
      {
        id: "folder-runbooks",
        parentFolderId: "folder-engineering",
        name: "Runbooks",
        path: "/engineering/runbooks",
      },
    ];
    const displayPaths = buildFolderDisplayPathMap(folders);

    expect(folderDisplayPath(folders[0], displayPaths)).toBe("Engineering");
    expect(folderDisplayPath(folders[1], displayPaths)).toBe("Engineering / Runbooks");
    expect(
      documentDisplayPath(
        {
          id: "doc-contextual-retrieval",
          folderId: "folder-runbooks",
          title: "Contextual Retrieval",
          path: "/engineering/runbooks/contextual-retrieval",
          contentText: "",
          updatedAt: new Date("2026-06-22T00:00:00Z"),
        },
        displayPaths,
      ),
    ).toBe("Engineering / Runbooks / Contextual Retrieval");
  });

  it("keeps stored path fallback when a display parent is missing", () => {
    const displayPaths = buildFolderDisplayPathMap([]);

    expect(
      documentDisplayPath(
        {
          id: "doc-orphaned",
          folderId: "missing-folder",
          title: "Contextual Retrieval",
          path: "/engineering/runbooks/contextual-retrieval",
          contentText: "",
          updatedAt: new Date("2026-06-22T00:00:00Z"),
        },
        displayPaths,
      ),
    ).toBe("engineering / runbooks / contextual-retrieval");
  });

  it("uses display path context in document action labels", () => {
    expect(
      documentActionLabel({
        title: "Contextual Retrieval",
        path: "/engineering/runbooks/contextual-retrieval",
        displayPath: "Engineering / Runbooks / Contextual Retrieval",
      }),
    ).toBe("Contextual Retrieval · Engineering / Runbooks / Contextual Retrieval");
  });
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/workspace-tree.test.ts
```

Expected: FAIL because `buildFolderDisplayPathMap`, `folderDisplayPath`, and `documentDisplayPath` are not exported.

- [ ] **Step 3: Implement display path helpers**

In `lib/workspace-tree.ts`, keep existing exports and add these functions:

```ts
type DisplayPathFolder = Pick<Folder, "id" | "parentFolderId" | "name" | "path">;

function formatStoredPath(path: string) {
  const segments = path.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : segments.join(" / ");
}

function fallbackPathSegment(path: string, fallbackLabel: string) {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? fallbackLabel;
}

function folderNameLabel(folder: Pick<Folder, "name" | "path">, fallbackLabel: string) {
  return folder.name.trim() || fallbackPathSegment(folder.path, fallbackLabel);
}

export function buildFolderDisplayPathMap<TFolder extends DisplayPathFolder>(
  folders: TFolder[],
  fallbackLabel = "Untitled folder",
) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const displayPaths = new Map<string, string>();

  function resolve(folder: TFolder, seenFolderIds = new Set<string>()): string {
    const cached = displayPaths.get(folder.id);
    if (cached) return cached;

    if (seenFolderIds.has(folder.id)) {
      return formatStoredPath(folder.path);
    }

    const label = folderNameLabel(folder, fallbackLabel);
    if (!folder.parentFolderId) {
      displayPaths.set(folder.id, label);
      return label;
    }

    const parentFolder = foldersById.get(folder.parentFolderId);
    if (!parentFolder) {
      const fallbackPath = formatStoredPath(folder.path);
      displayPaths.set(folder.id, fallbackPath);
      return fallbackPath;
    }

    const nextSeenFolderIds = new Set(seenFolderIds);
    nextSeenFolderIds.add(folder.id);
    const parentPath = resolve(parentFolder, nextSeenFolderIds);
    const displayPath = parentPath === "/" ? label : `${parentPath} / ${label}`;
    displayPaths.set(folder.id, displayPath);
    return displayPath;
  }

  for (const folder of folders) {
    resolve(folder);
  }

  return displayPaths;
}

export function folderDisplayPath(
  folder: Pick<Folder, "id" | "path">,
  folderDisplayPaths: Map<string, string>,
) {
  return folderDisplayPaths.get(folder.id) ?? formatStoredPath(folder.path);
}

export function documentDisplayPath(
  document: Pick<Document, "folderId" | "title" | "path">,
  folderDisplayPaths: Map<string, string>,
  fallbackLabel = "Untitled",
) {
  const label = documentDisplayLabel(document, fallbackLabel);
  if (!document.folderId) return label;

  const parentPath = folderDisplayPaths.get(document.folderId);
  if (!parentPath) return formatStoredPath(document.path);

  return parentPath === "/" ? label : `${parentPath} / ${label}`;
}
```

Update `documentActionLabel()` in the same file:

```ts
export function documentActionLabel(
  document: Pick<Document, "title" | "path"> & { displayPath?: string },
  fallbackLabel = "Untitled",
) {
  const label = documentDisplayLabel(document, fallbackLabel);
  if (document.displayPath && document.displayPath !== label) {
    return `${label} · ${document.displayPath}`;
  }

  const rootPath = `/${slugifyTitle(label)}`;
  return document.path === rootPath ? label : `${label} · ${document.path}`;
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/workspace-tree.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint Task 1**

Run:

```bash
git status --short
git diff -- lib/workspace-tree.ts tests/workspace-tree.test.ts
```

Expected: only the helper and helper test changes from Task 1 are present.

### Task 2: Workspace Page And Center Toolbar

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `lib/document-tabs.ts`
- Modify: `components/workspace-center-shell.tsx`
- Test: `tests/components/workspace-center-shell.test.tsx`

- [ ] **Step 1: Write failing toolbar tests**

In `tests/components/workspace-center-shell.test.tsx`, update the fixture documents:

```ts
const documents = [
  { id: "doc-1", title: "Welcome", path: "/welcome", displayPath: "Welcome" },
  {
    id: "doc-2",
    title: "Engineering Runbook",
    path: "/engineering/runbook",
    displayPath: "Engineering / Engineering Runbook",
  },
  {
    id: "doc-3",
    title: "Operations Runbook",
    path: "/operations/runbook",
    displayPath: "Operations / Operations Runbook",
  },
];
```

Replace the path assertion in `adds the selected document as the active tab and shows the path`:

```ts
    expect(screen.getByText("Welcome")).toBeTruthy();
    expect(screen.queryByText("welcome")).toBeNull();
```

Add this test:

```ts
  it("shows title-based folder and document display paths in the toolbar", () => {
    const { rerender } = renderShell(documents[1]);

    expect(screen.getByText("Engineering / Engineering Runbook")).toBeTruthy();
    expect(screen.queryByText("engineering / runbook")).toBeNull();

    rerender(
      <WorkspaceCenterShell
        workspaceSlug="company-handbook"
        documents={documents}
        selectedDocument={null}
        selectedFolder={{
          path: "/engineering/runbooks",
          displayPath: "Engineering / Runbooks",
        }}
      >
        <div>Folder content</div>
      </WorkspaceCenterShell>,
    );

    expect(screen.getByText("Engineering / Runbooks")).toBeTruthy();
    expect(screen.queryByText("engineering / runbooks")).toBeNull();
  });
```

- [ ] **Step 2: Run toolbar tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx
```

Expected: FAIL because `WorkspaceCenterShell` still renders `path`.

- [ ] **Step 3: Allow document props to carry display paths**

In `lib/document-tabs.ts`, change `DocumentTabDocument` only:

```ts
export type DocumentTabDocument = {
  id: string;
  title: string;
  path: string;
  displayPath?: string;
};
```

Do not add `displayPath` to `DocumentTab`; serialized tab storage remains unchanged.

- [ ] **Step 4: Use display paths in the center shell**

In `components/workspace-center-shell.tsx`, change the selected folder prop type:

```ts
  selectedFolder: { path: string; displayPath?: string } | null;
```

Add this local value before the return:

```ts
  const toolbarPath = isGraphView
    ? t("toolbar.graphView")
    : selectedDocument?.displayPath ??
      selectedDocument?.path ??
      selectedFolder?.displayPath ??
      selectedFolder?.path ??
      "/";
```

Change the toolbar call:

```tsx
      <DocumentToolbar
        path={toolbarPath}
        canNavigateBack={canNavigateBack}
        canNavigateForward={canNavigateForward}
        showModeToggle={Boolean(selectedDocument) && !isGraphView}
        onModeChange={handleModeChange}
        onNavigateBack={handleNavigateBack}
        onNavigateForward={handleNavigateForward}
      />
```

- [ ] **Step 5: Compute display paths in the server page**

In `app/workspaces/[workspaceSlug]/page.tsx`, extend the existing import from `@/lib/workspace-tree`:

```ts
import {
  buildFolderDisplayPathMap,
  countFolderChildren,
  documentDisplayPath,
  folderDisplayPath,
  filterReadableDocuments,
} from "@/lib/workspace-tree";
```

After `readableDocuments` and `workspace.folders` are available, add:

```ts
  const folderDisplayPaths = buildFolderDisplayPathMap(workspace.folders);
```

When building `selectedCenterFolder`, include `displayPath`:

```ts
  const selectedCenterFolder = selectedFolder
    ? {
        id: selectedFolder.id,
        name: selectedFolder.name,
        path: selectedFolder.path,
        displayPath: folderDisplayPath(selectedFolder, folderDisplayPaths),
        childCount: countFolderChildren({
          folderId: selectedFolder.id,
          folders: workspace.folders,
          documents: readableDocuments,
        }),
      }
    : null;
```

When mapping `WorkspaceCenterShell` documents, include `displayPath`:

```ts
            documents={readableDocuments.map((document) => ({
              id: document.id,
              title: document.title,
              path: document.path,
              displayPath: documentDisplayPath(document, folderDisplayPaths),
            }))}
```

When mapping `selectedDocument`, include `displayPath`:

```ts
                    displayPath: documentDisplayPath(selectedDocument, folderDisplayPaths),
```

- [ ] **Step 6: Run toolbar tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/workspace-center-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Checkpoint Task 2**

Run:

```bash
git status --short
git diff -- app/workspaces/[workspaceSlug]/page.tsx lib/document-tabs.ts components/workspace-center-shell.tsx tests/components/workspace-center-shell.test.tsx
```

Expected: Task 1 and Task 2 changes are present, with toolbar tests passing.

### Task 3: Sidebar Search, Rows, Favorites, And Actions

**Files:**
- Modify: `components/document-list.tsx`
- Modify: `components/document-navigation.tsx`
- Modify: `components/document-navigation/search-panel.tsx`
- Modify: `components/document-navigation/document-row.tsx`
- Modify: `components/document-navigation/folder-row.tsx`
- Modify: `components/document-navigation/favorites-panel.tsx`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write failing sidebar tests**

In `tests/components/document-list.test.tsx`, update `folderFixtures`:

```ts
const folderFixtures = [
  {
    id: "folder-engineering",
    parentFolderId: null,
    name: "Engineering",
    path: "/engineering",
    displayPath: "Engineering",
  },
  {
    id: "folder-runbooks",
    parentFolderId: "folder-engineering",
    name: "Runbooks",
    path: "/engineering/runbooks",
    displayPath: "Engineering / Runbooks",
  },
];
```

Update `doc-2` in `baseProps.documents` so it lives inside the nested folder:

```ts
    {
      id: "doc-2",
      folderId: "folder-runbooks",
      title: "Engineering Runbook",
      path: "/engineering/runbooks/engineering-runbook",
      displayPath: "Engineering / Runbooks / Engineering Runbook",
      contentText: "Engineering body",
      tagNames: ["engineering"],
      canWrite: true,
    },
```

Add `displayPath: "Welcome"` to `doc-1`.

Add this test near the existing search tests:

```ts
  it("searches and displays title-based document paths", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "Runbooks / Engineering" },
    });

    expect(screen.getByText("1 result")).toBeTruthy();
    const result = screen.getByRole("link", { name: /Engineering Runbook/ });
    expect(result.textContent).toContain("Engineering / Runbooks / Engineering Runbook");
    expect(result.textContent).not.toContain("/engineering/runbooks/engineering-runbook");
  });
```

Add this test near favorite tests:

```ts
  it("uses display paths in favorite folder rows and document action labels", async () => {
    window.localStorage.setItem(
      "munjib:favorites:company-handbook",
      JSON.stringify({
        folders: ["folder-runbooks"],
        documents: ["doc-2"],
      }),
    );
    renderList();

    expect(await screen.findByText("Favorites")).toBeTruthy();
    const folderLink = screen.getByRole("link", { name: /Runbooks/ });
    expect(folderLink.textContent).toContain("Engineering / Runbooks");
    expect(folderLink.textContent).not.toContain("/engineering/runbooks");

    expect(
      screen.getByRole("button", {
        name: "Open actions for Engineering Runbook · Engineering / Runbooks / Engineering Runbook",
      }),
    ).toBeTruthy();
  });
```

- [ ] **Step 2: Run sidebar tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx -t "display paths|favorite folder"
```

Expected: FAIL because search only checks `path` and descriptions still render stored paths.

- [ ] **Step 3: Extend list item types**

In `components/document-list.tsx`, update types:

```ts
export type DocumentListItem = {
  id: string;
  folderId: string | null;
  title: string;
  path: string;
  displayPath?: string;
  contentText: string;
  tagNames: string[];
  canWrite: boolean;
};

export type FolderListItem = {
  id: string;
  parentFolderId: string | null;
  name: string;
  path: string;
  displayPath?: string;
};
```

In the same file, when rendering `WorkspaceSettingsPanel`, keep passing `folders={folders}`. The updated type in Task 4 will accept `displayPath`.

- [ ] **Step 4: Pass display paths from the server page to the sidebar**

In `app/workspaces/[workspaceSlug]/page.tsx`, update the `DocumentList` folder mapping:

```ts
            folders={workspace.folders.map((folder) => ({
              id: folder.id,
              parentFolderId: folder.parentFolderId,
              name: folder.name,
              path: folder.path,
              displayPath: folderDisplayPath(folder, folderDisplayPaths),
            }))}
```

Update the `DocumentList` document mapping:

```ts
              displayPath: documentDisplayPath(document, folderDisplayPaths),
```

- [ ] **Step 5: Search against both stored and display paths**

In `components/document-navigation.tsx`, update the non-tag `searchResults` predicate:

```ts
    return documents.filter((document) => {
      const displayPath = document.displayPath?.toLowerCase() ?? "";
      return (
        document.title.toLowerCase().includes(query) ||
        document.path.toLowerCase().includes(query) ||
        displayPath.includes(query) ||
        document.contentText.toLowerCase().includes(query)
      );
    });
```

- [ ] **Step 6: Render display paths in search rows**

In `components/document-navigation/search-panel.tsx`, change the row description:

```tsx
      description={document.displayPath ?? document.path}
```

- [ ] **Step 7: Use display paths in document row action labels**

`components/document-navigation/document-row.tsx` already calls `documentActionLabel(document, ...)`. After Task 1 and Task 3 type changes, no extra code is needed. Keep this line:

```ts
  const actionLabel = documentActionLabel(document, t("nav.untitledDocument"));
```

- [ ] **Step 8: Use display paths in favorite folder rows**

In `components/document-navigation/folder-row.tsx`, update `FavoriteFolderRow`:

```tsx
        <span className="mt-1 block truncate text-[11px] text-slate-500">
          {folder.displayPath ?? folder.path}
        </span>
```

Update the local label helper:

```ts
function folderDisplayLabel(folder: Pick<FolderListItem, "name" | "path" | "displayPath">) {
  return folder.displayPath ? `${folder.name} ${folder.displayPath}` : `${folder.name} ${folder.path}`;
}
```

- [ ] **Step 9: Add display descriptions to favorite document rows**

In `components/document-navigation/favorites-panel.tsx`, add the description prop:

```tsx
            description={document.displayPath ?? document.path}
```

- [ ] **Step 10: Run sidebar tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx -t "display paths|favorite folder|searches and displays"
```

Expected: PASS.

- [ ] **Step 11: Checkpoint Task 3**

Run:

```bash
git status --short
git diff -- app/workspaces/[workspaceSlug]/page.tsx components/document-list.tsx components/document-navigation.tsx components/document-navigation/search-panel.tsx components/document-navigation/document-row.tsx components/document-navigation/folder-row.tsx components/document-navigation/favorites-panel.tsx tests/components/document-list.test.tsx
```

Expected: Task 1 through Task 3 changes are present, with sidebar tests passing.

### Task 4: Settings Import Destination And Folder Detail

**Files:**
- Modify: `components/workspace-settings-panel.tsx`
- Modify: `components/folder-detail.tsx`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `tests/components/document-list.test.tsx`
- Test: `tests/components/folder-detail.test.tsx`

- [ ] **Step 1: Write failing settings destination tests**

In `tests/components/document-list.test.tsx`, update existing import destination assertions:

```ts
    expect(screen.getByRole("treeitem", { name: "Engineering" })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "Engineering / Runbooks" })).toBeTruthy();

    fireEvent.click(screen.getByRole("treeitem", { name: "Engineering / Runbooks" }));

    expect(screen.queryByRole("tree", { name: "Import destination folders" })).toBeNull();
    const selectedDestinationButton = screen.getByRole("button", {
      name: /Import destination: Engineering \/ Runbooks/,
    });
    expect(selectedDestinationButton.textContent).toBe("Engineering / Runbooks");
```

Add this assertion after import starts in the same test:

```ts
    await waitFor(() => {
      expect(
        screen.getByText("Destination: Engineering / Runbooks"),
      ).toBeTruthy();
    });
```

- [ ] **Step 2: Write failing folder detail test**

In `tests/components/folder-detail.test.tsx`, add:

```ts
  it("shows the display path when one is provided", () => {
    render(
      <I18nProvider>
        <FolderDetail
          canWrite={true}
          folder={{
            id: "folder-runbooks",
            name: "Runbooks",
            path: "/engineering/runbooks",
            displayPath: "Engineering / Runbooks",
            childCount: 2,
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Engineering / Runbooks")).toBeTruthy();
    expect(screen.queryByText("/engineering/runbooks")).toBeNull();
  });
```

- [ ] **Step 3: Run settings and folder tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx -t "destination picker" tests/components/folder-detail.test.tsx
```

Expected: FAIL because settings and folder detail still render stored paths.

- [ ] **Step 4: Extend settings folder type and destination label**

In `components/workspace-settings-panel.tsx`, update `WorkspaceSettingsFolder`:

```ts
type WorkspaceSettingsFolder = {
  id: string;
  path: string;
  displayPath?: string;
};
```

Replace `destinationPath` with:

```ts
  const destinationFolder = sortedFolders.find((folder) => folder.id === destinationFolderId);
  const destinationPath = destinationFolder?.displayPath ?? destinationFolder?.path ?? "/";
```

In the destination tree, change the folder button label:

```tsx
                                {folder.displayPath ?? folder.path}
```

The submitted form data remains unchanged because `handleSelectDestination(folder.id)` still stores the `folderId`.

- [ ] **Step 5: Extend folder detail type and rendering**

In `components/folder-detail.tsx`, change the prop type:

```ts
  folder: { id: string; name: string; path: string; displayPath?: string; childCount: number } | null;
```

Change the path text:

```tsx
      <p className="mt-1 font-mono text-sm text-slate-500">
        {folder.displayPath ?? folder.path}
      </p>
```

- [ ] **Step 6: Pass selected folder display path from the server page**

Task 2 already adds `displayPath` to `selectedCenterFolder`. Make sure the `FolderDetail` call receives `folder={selectedCenterFolder}` with the new property intact. The JSX should remain:

```tsx
              <FolderDetail folder={selectedCenterFolder} canWrite={canWrite} />
```

- [ ] **Step 7: Run settings and folder tests and verify they pass**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx -t "destination picker" tests/components/folder-detail.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Checkpoint Task 4**

Run:

```bash
git status --short
git diff -- components/workspace-settings-panel.tsx components/folder-detail.tsx app/workspaces/[workspaceSlug]/page.tsx tests/components/document-list.test.tsx tests/components/folder-detail.test.tsx
```

Expected: Task 1 through Task 4 changes are present, with settings and folder tests passing.

### Task 5: Wiki Sync And Final Verification

**Files:**
- Modify: `wiki/Folder Hierarchy Model.md`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Munjib.md`
- Modify: `wiki/Project PRD.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update wiki implementation notes**

Add an implementation entry to `wiki/log.md`:

```md
## 2026-06-22T<current-time>+0900 - implementation

- Result: Issue #131 shows document and folder path labels with folder names and `Document.title` instead of slugified stored paths.
- Coverage: Display paths are generated in `lib/workspace-tree.ts`, passed from `app/workspaces/[workspaceSlug]/page.tsx`, and rendered in the center toolbar, sidebar search/result descriptions, favorites/action labels, settings import destination picker/progress, and folder detail. Stored `Document.path` and `Folder.path` remain available for uniqueness, sorting, wiki-link matching, graph/RAG/audit metadata, and stored path search compatibility.
- Pages: [[Munjib]], [[Project PRD]], [[Folder Hierarchy Model]], [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #131, `docs/superpowers/specs/2026-06-22-document-title-display-path-design.md`, `docs/superpowers/plans/2026-06-22-document-title-display-paths.md`, `lib/workspace-tree.ts`, `app/workspaces/[workspaceSlug]/page.tsx`, `components/workspace-center-shell.tsx`, `components/document-navigation.tsx`, `components/document-navigation/search-panel.tsx`, `components/document-navigation/folder-row.tsx`, `components/workspace-settings-panel.tsx`, `components/folder-detail.tsx`, `tests/workspace-tree.test.ts`, `tests/components/workspace-center-shell.test.tsx`, `tests/components/document-list.test.tsx`, `tests/components/folder-detail.test.tsx`.
- Verification: focused Vitest runs, `pnpm exec tsc --noEmit --pretty false`, `DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.
```

Update the current Issue #131 design wording in the other listed wiki pages from future-tense design to implemented behavior after the code is merged into the branch.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/workspace-tree.test.ts tests/components/workspace-center-shell.test.tsx tests/components/document-list.test.tsx tests/components/folder-detail.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run full test suite with database URL**

Run:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test
```

Expected: PASS. The baseline before implementation passed 74 files / 817 tests with this command.

- [ ] **Step 5: Stage changes and run wiki commands**

Run:

```bash
git add lib/workspace-tree.ts tests/workspace-tree.test.ts app/workspaces/[workspaceSlug]/page.tsx lib/document-tabs.ts components/workspace-center-shell.tsx tests/components/workspace-center-shell.test.tsx components/document-list.tsx components/document-navigation.tsx components/document-navigation/search-panel.tsx components/document-navigation/document-row.tsx components/document-navigation/folder-row.tsx components/document-navigation/favorites-panel.tsx components/workspace-settings-panel.tsx components/folder-detail.tsx tests/components/document-list.test.tsx tests/components/folder-detail.test.tsx docs/superpowers/plans/2026-06-22-document-title-display-paths.md wiki/Folder\ Hierarchy\ Model.md wiki/Document\ Editing\ Workflow.md wiki/Munjib.md wiki/Project\ PRD.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected:

- `wiki:manifest` writes `wiki/manifest.json`.
- `wiki:lint` may report the known `wiki/designs/sidebar.md` unresolved pasted-image warning.
- `wiki:sync-check --staged` exits 0 after wiki maintenance files are staged.

- [ ] **Step 6: Check staged diff**

Run:

```bash
git diff --cached --check
git status --short
```

Expected: no whitespace errors, and only Issue #131 implementation, tests, plan, and wiki files are staged or modified.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git commit -m "feat: show document paths by title"
```

### Task 6: Push And PR Review Workflow

**Files:**
- No source edits unless CI or review feedback requires follow-up.

- [ ] **Step 1: Push the branch**

Run:

```bash
git push -u origin issue-131-display-document-paths-by-title
```

Expected: branch is pushed to GitHub.

- [ ] **Step 2: Create draft PR**

Run:

```bash
gh pr create --draft --title "Show document paths by title" --body "Closes #131"
```

Expected: draft PR URL is printed.

- [ ] **Step 3: Mark ready for review**

Run:

```bash
gh pr ready
```

Expected: PR is ready for review.

- [ ] **Step 4: Wait at least 5 minutes**

Run:

```bash
sleep 300
```

Expected: command returns after 5 minutes.

- [ ] **Step 5: Check CI and reviews**

Run:

```bash
gh pr checks
gh pr view --json reviewDecision,reviewRequests,latestReviews,statusCheckRollup
```

Expected: CI is passing or any failing check is identified by name. If there are review comments or failing checks, fix them on the same branch using the same TDD and wiki-sync sequence, then repeat Task 6 from Step 1.
