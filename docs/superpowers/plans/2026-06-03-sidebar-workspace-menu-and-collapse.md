# Sidebar Workspace Menu And Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the left sidebar gear button with a workspace-name Settings dropdown, add mirrored left sidebar collapse/reopen controls, and keep the title row plus icon toolbar sticky while sidebar content scrolls.

**Architecture:** `AppShell` owns left sidebar layout state through a new `LeftPanelContext`, mirroring the existing right metadata panel pattern. `DocumentList` owns only local workspace menu and settings-dialog state, renders the workspace title as a no-chevron menu trigger, and groups the title row plus `DocumentCreateControls` in a sticky sidebar chrome.

**Tech Stack:** Next.js App Router, React client components, TypeScript, lucide-react, Tailwind CSS, Vitest, Testing Library, Munjib wiki maintenance CLI.

---

### Task 0: Implementation Context Check

**Files:**
- Read: `docs/superpowers/specs/2026-06-03-sidebar-workspace-menu-and-collapse-design.md`
- Read: `wiki/Document Editing Workflow.md`
- No source edits in this task.

- [ ] **Step 1: Confirm branch and untracked files**

Run: `git status --short --branch`

Expected: branch is `issue-85-sidebar-workspace-menu-and-collapse`. Untracked `.antigravitycli/` and `wiki/designs/obsidian4.png` may be present and must not be staged.

- [ ] **Step 2: Confirm the latest design commits are present**

Run: `git log --oneline -3`

Expected: output includes:

```text
f4bb7da docs: add sidebar sticky toolbar requirement
e926a37 docs: design sidebar workspace menu
```

### Task 1: AppShell Left Panel State

**Files:**
- Modify: `components/app-shell.tsx`
- Test: `tests/components/app-shell.test.tsx`

- [ ] **Step 1: Write failing AppShell left panel tests**

In `tests/components/app-shell.test.tsx`, update the import and add the left panel probe:

```ts
import { AppShell, useHeadingNavigation, useLeftPanel } from "@/components/app-shell";

function LeftPanelProbe() {
  const leftPanel = useLeftPanel();

  return (
    <button type="button" onClick={() => leftPanel?.collapse()}>
      Close sidebar
    </button>
  );
}
```

Add this test at the end of the existing AppShell `describe` block:

```ts
it("can collapse and reopen the left sidebar", () => {
  render(
    <AppShell
      left={<LeftPanelProbe />}
      center={<div>Center</div>}
      right={<div>Right</div>}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Close sidebar" }));

  expect(screen.queryByRole("button", { name: "Close sidebar" })).toBeNull();
  const openButton = screen.getByRole("button", { name: "Open sidebar" });
  expect(openButton).toBeTruthy();
  expect(openButton.className).toContain("left-4");
  expect(openButton.className).toContain("top-1.5");
  expect(screen.getAllByRole("complementary")).toHaveLength(1);

  fireEvent.click(openButton);

  expect(screen.getByRole("button", { name: "Close sidebar" })).toBeTruthy();
  expect(screen.getAllByRole("complementary")).toHaveLength(2);
});
```

- [ ] **Step 2: Run the AppShell test to verify failure**

Run: `pnpm exec vitest run tests/components/app-shell.test.tsx -t "can collapse and reopen the left sidebar"`

Expected: FAIL with an export error for `useLeftPanel` or with no `Open sidebar` button.

- [ ] **Step 3: Add left panel context and layout state**

In `components/app-shell.tsx`, update the lucide import:

```ts
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
```

Add the left panel controls type near `RightPanelControls`:

```ts
type LeftPanelControls = {
  collapse: () => void;
};
```

Add a context and hook beside the right panel context:

```ts
const LeftPanelContext = createContext<LeftPanelControls | null>(null);
const RightPanelContext = createContext<RightPanelControls | null>(null);

export function useLeftPanel() {
  return useContext(LeftPanelContext);
}
```

Add `leftPanelOpen` state and controls inside `AppShell`:

```ts
const [leftPanelOpen, setLeftPanelOpen] = useState(true);
const [rightPanelOpen, setRightPanelOpen] = useState(true);
```

```ts
const leftPanelControls = useMemo(
  () => ({
    collapse: () => setLeftPanelOpen(false),
  }),
  [],
);
```

Add this helper near the bottom of the file:

```ts
function appShellGridClassName({
  leftPanelOpen,
  rightPanelOpen,
}: {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
}) {
  const baseClassName =
    "relative grid h-dvh max-h-dvh min-h-0 overflow-hidden bg-white text-ink";

  if (leftPanelOpen && rightPanelOpen) {
    return `${baseClassName} grid-cols-[280px_minmax(0,1fr)_320px]`;
  }

  if (leftPanelOpen) {
    return `${baseClassName} grid-cols-[280px_minmax(0,1fr)]`;
  }

  if (rightPanelOpen) {
    return `${baseClassName} grid-cols-[minmax(0,1fr)_320px]`;
  }

  return `${baseClassName} grid-cols-[minmax(0,1fr)]`;
}
```

Replace the existing `<main>` opening and left aside rendering with:

```tsx
<main className={appShellGridClassName({ leftPanelOpen, rightPanelOpen })}>
  {leftPanelOpen ? (
    <aside className="overflow-auto border-r border-border bg-muted px-4 pb-4 pt-0">
      <LeftPanelContext.Provider value={leftPanelControls}>
        {left}
      </LeftPanelContext.Provider>
    </aside>
  ) : (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label="Open sidebar"
            onClick={() => setLeftPanelOpen(true)}
            className="absolute left-4 top-1.5 z-30 h-8 w-8 bg-muted p-0 text-slate-600 shadow-sm hover:bg-slate-200 hover:text-ink"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open sidebar</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )}
  <section className="min-h-0 min-w-0 overflow-hidden bg-white">{center}</section>
```

Keep the existing right panel rendering, but it now follows the center section in all grid states.

- [ ] **Step 4: Run AppShell tests**

Run: `pnpm exec vitest run tests/components/app-shell.test.tsx`

Expected: PASS. Existing right metadata panel tests continue to pass and the new left panel test passes.

- [ ] **Step 5: Commit AppShell work**

Run:

```bash
git add components/app-shell.tsx tests/components/app-shell.test.tsx
git commit -m "feat: add left sidebar shell controls"
```

Expected: commit succeeds.

### Task 2: Workspace Name Settings Menu

**Files:**
- Modify: `components/document-list.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Update the header test to expect a workspace menu**

In `tests/components/document-list.test.tsx`, replace the `shows the workspace title inline with icon-only create controls` test body with:

```ts
renderList();

expect(screen.queryByText("Workspace")).toBeNull();
const workspaceMenuButton = screen.getByRole("button", { name: "Workspace menu" });
expect(workspaceMenuButton.textContent).toBe("Company Handbook");
expect(workspaceMenuButton.getAttribute("aria-expanded")).toBe("false");
expect(screen.queryByRole("button", { name: "Workspace settings" })).toBeNull();
expect(screen.getByRole("button", { name: "Close sidebar" })).toBeTruthy();
expect(screen.getByRole("button", { name: "New document" }).textContent).toBe("");
expect(screen.getByRole("button", { name: "New folder" }).textContent).toBe("");
expect(screen.queryByRole("combobox", { name: /template/i })).toBeNull();
```

- [ ] **Step 2: Replace settings-panel open tests with menu-driven tests**

In the `opens the workspace settings panel with import selected by default` test, replace the opening click with:

```ts
fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));

const workspaceMenu = screen.getByRole("menu", { name: "Workspace menu" });
expect(workspaceMenu.className).toContain("left-0");
expect(workspaceMenu.className).toContain("right-0");
expect(within(workspaceMenu).getByRole("menuitem", { name: "Settings" })).toBeTruthy();

fireEvent.click(within(workspaceMenu).getByRole("menuitem", { name: "Settings" }));
```

Make the same opening replacement in these existing tests:

```ts
fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
```

Apply it to tests that currently click `Workspace settings`:

```text
closes the workspace settings panel
closes the workspace settings panel from the backdrop without closing on dialog clicks
disables markdown import when the workspace is read-only
opens a markdown import progress panel and imports files one at a time
imports selected markdown files into the chosen destination folder
reports failed markdown imports in the progress table
closes the import progress panel after completion
keeps settings open during active markdown import and allows close after completion
does not refresh the workspace when every markdown import row fails
```

- [ ] **Step 3: Add workspace menu close behavior tests**

Add these tests near the workspace settings tests:

```ts
it("closes the workspace menu when switching sidebar views", () => {
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  expect(screen.getByRole("menu", { name: "Workspace menu" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Search" }));

  expect(screen.queryByRole("menu", { name: "Workspace menu" })).toBeNull();
  expect(screen.getByLabelText("Search documents")).toBeTruthy();
});

it("closes the workspace menu on Escape", () => {
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  expect(screen.getByRole("menu", { name: "Workspace menu" })).toBeTruthy();

  fireEvent.keyDown(window, { key: "Escape" });

  expect(screen.queryByRole("menu", { name: "Workspace menu" })).toBeNull();
});

it("closes the workspace menu on outside click", () => {
  renderList();

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  expect(screen.getByRole("menu", { name: "Workspace menu" })).toBeTruthy();

  fireEvent.mouseDown(document.body);

  expect(screen.queryByRole("menu", { name: "Workspace menu" })).toBeNull();
});

it("closes the workspace menu when an AppShell tag search request opens search", () => {
  render(
    <AppShell
      left={<DocumentList {...baseProps} />}
      center={<TagSearchRequester tag="LangChain" />}
      right={<div />}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
  expect(screen.getByRole("menu", { name: "Workspace menu" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Search tag" }));

  expect(screen.queryByRole("menu", { name: "Workspace menu" })).toBeNull();
  expect((screen.getByLabelText("Search documents") as HTMLInputElement).value).toBe(
    "tag:#LangChain",
  );
});
```

- [ ] **Step 4: Run DocumentList tests to verify failure**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx -t "Workspace|workspace menu|settings panel|tag search request"`

Expected: FAIL because `Workspace menu`, `Settings` menu item, and `Close sidebar` do not exist yet.

- [ ] **Step 5: Implement the workspace title menu**

In `components/document-list.tsx`, update imports:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose, Settings } from "lucide-react";
import { useLeftPanel, useTagSearch } from "@/components/app-shell";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
```

Add state and refs inside `DocumentList`:

```ts
const leftPanel = useLeftPanel();
const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
const workspaceMenuRef = useRef<HTMLDivElement>(null);
```

Add these callbacks before `openSearch`:

```ts
const closeWorkspaceMenu = useCallback(() => {
  setWorkspaceMenuOpen(false);
}, []);

const openWorkspaceSettings = useCallback(() => {
  setWorkspaceMenuOpen(false);
  setSettingsOpen(true);
}, []);

const closeSidebar = useCallback(() => {
  setWorkspaceMenuOpen(false);
  setSettingsOpen(false);
  leftPanel?.collapse();
}, [leftPanel]);
```

Update `openSearch`, `openDocuments`, `openFavorites`, and `openGraph` to call `setWorkspaceMenuOpen(false)` before changing the panel or route:

```ts
const openSearch = useCallback(() => {
  setWorkspaceMenuOpen(false);
  setSettingsOpen(false);
  setActivePanel("search");
  clearGraphRoute();
}, [clearGraphRoute]);
```

Apply the same first line to the other three callbacks.

Add outside-click and Escape handling:

```ts
useEffect(() => {
  if (!workspaceMenuOpen) return;

  function handleMouseDown(event: MouseEvent) {
    if (workspaceMenuRef.current?.contains(event.target as Node)) return;
    setWorkspaceMenuOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setWorkspaceMenuOpen(false);
    }
  }

  document.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("keydown", handleKeyDown);

  return () => {
    document.removeEventListener("mousedown", handleMouseDown);
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [workspaceMenuOpen]);
```

In the tag-search effect, add `setWorkspaceMenuOpen(false)` before opening search:

```ts
setWorkspaceMenuOpen(false);
setSettingsOpen(false);
setActivePanel("search");
setSearchQuery(`tag:#${tagName}`);
```

Replace the current header row with:

```tsx
<div ref={workspaceMenuRef} className="relative">
  <TooltipProvider delayDuration={0}>
    <div className="flex h-11 items-center gap-2">
      <Button
        type="button"
        aria-label="Workspace menu"
        aria-expanded={workspaceMenuOpen}
        onClick={() => setWorkspaceMenuOpen((open) => !open)}
        className="min-w-0 flex-1 justify-start bg-transparent p-0 text-left text-sm font-medium text-ink hover:bg-transparent hover:text-ink"
      >
        <span className="truncate">Company Handbook</span>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label="Close sidebar"
            onClick={closeSidebar}
            className={iconButtonClassName}
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close sidebar</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
  {workspaceMenuOpen ? (
    <div
      role="menu"
      aria-label="Workspace menu"
      className="absolute left-0 right-0 top-11 z-30 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        onClick={openWorkspaceSettings}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-medium text-ink hover:bg-muted"
      >
        <Settings className="h-4 w-4" aria-hidden="true" />
        Settings
      </button>
    </div>
  ) : null}
</div>
```

- [ ] **Step 6: Run DocumentList tests**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx`

Expected: PASS. Settings import tests pass through the new workspace menu path.

- [ ] **Step 7: Commit workspace menu work**

Run:

```bash
git add components/document-list.tsx tests/components/document-list.test.tsx
git commit -m "feat: add sidebar workspace menu"
```

Expected: commit succeeds.

### Task 3: Sticky Sidebar Chrome

**Files:**
- Modify: `components/document-list.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Add sticky chrome test**

Add this test near the toolbar tests in `tests/components/document-list.test.tsx`:

```ts
it("keeps the workspace header and icon toolbar in sticky sidebar chrome", () => {
  renderList();

  const stickyChrome = screen.getByTestId("document-list-sticky-chrome");
  expect(stickyChrome.className).toContain("sticky");
  expect(stickyChrome.className).toContain("top-0");
  expect(stickyChrome.className).toContain("z-20");
  expect(stickyChrome.className).toContain("bg-muted");
  expect(within(stickyChrome).getByRole("button", { name: "Workspace menu" })).toBeTruthy();
  expect(within(stickyChrome).getByTestId("document-create-toolbar")).toBeTruthy();

  const navigationBody = screen.getByTestId("document-list-navigation-body");
  expect(navigationBody.className).toContain("pt-3");
  expect(within(navigationBody).getByText("Recents")).toBeTruthy();
  expect(within(navigationBody).getByRole("navigation", { name: "All documents" })).toBeTruthy();
});
```

- [ ] **Step 2: Run sticky chrome test to verify failure**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx -t "sticky sidebar chrome"`

Expected: FAIL because `document-list-sticky-chrome` and `document-list-navigation-body` do not exist.

- [ ] **Step 3: Wrap title row and toolbar in sticky chrome**

In `components/document-list.tsx`, wrap the workspace menu header and `DocumentCreateControls` in this container:

```tsx
<div
  data-testid="document-list-sticky-chrome"
  className="sticky top-0 z-20 bg-muted pb-1"
>
  <div ref={workspaceMenuRef} className="relative">
    <TooltipProvider delayDuration={0}>
      <div className="flex h-11 items-center gap-2">
        <Button
          type="button"
          aria-label="Workspace menu"
          aria-expanded={workspaceMenuOpen}
          onClick={() => setWorkspaceMenuOpen((open) => !open)}
          className="min-w-0 flex-1 justify-start bg-transparent p-0 text-left text-sm font-medium text-ink hover:bg-transparent hover:text-ink"
        >
          <span className="truncate">Company Handbook</span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              aria-label="Close sidebar"
              onClick={closeSidebar}
              className={iconButtonClassName}
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close sidebar</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
    {workspaceMenuOpen ? (
      <div
        role="menu"
        aria-label="Workspace menu"
        className="absolute left-0 right-0 top-11 z-30 rounded-md border border-slate-200 bg-white p-1 text-sm shadow-lg"
      >
        <button
          type="button"
          role="menuitem"
          onClick={openWorkspaceSettings}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-medium text-ink hover:bg-muted"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Settings
        </button>
      </div>
    ) : null}
  </div>
  <DocumentCreateControls
    canWrite={canWrite}
    createAction={createAction as CreateDocumentFormAction}
    createFolderAction={createFolderAction as CreateFolderFormAction}
    activeView={isGraphView ? "graph" : activePanel}
    onOpenDocuments={openDocuments}
    onOpenSearch={openSearch}
    onOpenFavorites={openFavorites}
    onOpenGraph={openGraph}
  />
</div>
```

Wrap `DocumentNavigation` in a body container:

```tsx
<div data-testid="document-list-navigation-body" className="pt-3">
  <DocumentNavigation
    workspaceSlug={workspaceSlug}
    folders={folders}
    documents={documents}
    activePanel={activePanel}
    searchQuery={searchQuery}
    onOpenSearch={openSearch}
    onOpenDocuments={openDocuments}
    onSearchQueryChange={setSearchQuery}
    selectedFolderId={selectedFolderId}
    canWrite={canWrite}
    createAction={createAction}
    createFolderAction={createFolderAction}
    renameFolderAction={renameFolderAction}
    archiveFolderAction={archiveFolderAction}
    archiveDocumentAction={archiveDocumentAction}
    folderError={folderError}
    selectedDocumentId={selectedDocumentId}
  />
</div>
```

Keep `WorkspaceSettingsPanel` outside the sticky chrome and navigation body so the modal remains a fixed overlay sibling.

- [ ] **Step 4: Run focused DocumentList tests**

Run: `pnpm exec vitest run tests/components/document-list.test.tsx -t "sticky sidebar chrome|workspace menu|settings panel"`

Expected: PASS.

- [ ] **Step 5: Run full focused component bundle**

Run: `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit sticky chrome work**

Run:

```bash
git add components/document-list.tsx tests/components/document-list.test.tsx
git commit -m "feat: keep sidebar toolbar sticky"
```

Expected: commit succeeds.

### Task 4: Wiki Maintenance And Final Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update Document Editing Workflow**

In `wiki/Document Editing Workflow.md`, replace the paragraph that starts with `Issue #40 이후 \`Company Handbook\`` with:

```md
Issue #85 이후 `Company Handbook` workspace name text는 chevron 없는 workspace menu trigger다. Trigger를 클릭하면 sidebar content width를 채우는 dropdown menu가 열리고, 현재 첫 item은 `Settings` 하나다. `Settings`는 기존 `WorkspaceSettingsPanel` modal을 열며, dialog 내부는 좌측 settings sidebar와 우측 content pane으로 구성되고 첫 slice에서는 `Import` menu가 기본 선택된 상태로 열린다. 좌측 sidebar header 오른쪽의 기존 gear slot은 right metadata panel과 같은 결의 반대 방향인 `PanelLeftClose` button으로 바뀌며, 클릭하면 `AppShell`이 left sidebar column을 접고 center content를 확장한다. 접힌 상태에서는 화면 좌측 상단의 `PanelLeftOpen` button으로 sidebar를 다시 연다. Workspace title row와 Documents/Graph/New document/New folder/Search/Favorites icon toolbar는 sticky sidebar chrome으로 묶여 긴 Recents, folder tree, search, favorites content를 스크롤해도 항상 보이고, document navigation body만 그 아래에서 스크롤된다.

Issue #40 이후 workspace settings dialog는 document list를 교체하지 않고 modal dialog로 열린다. Dialog는 close button뿐 아니라 backdrop click으로도 닫히지만, dialog surface 내부 click은 닫힘으로 처리하지 않는다.
```

- [ ] **Step 2: Update Wiki Index status line**

In `wiki/index.md`, update the Issue #85 clause in the current editing experience line to describe implementation instead of design:

```text
Issue #85는 좌측 sidebar workspace name을 full-width Settings dropdown trigger로 바꾸고, `PanelLeftClose`/`PanelLeftOpen`으로 left sidebar collapse/reopen을 추가하며, workspace title row와 icon toolbar를 sticky sidebar chrome으로 유지한다.
```

- [ ] **Step 3: Add Wiki Log entry**

At the top of `wiki/log.md`, add this entry:

```md
## 2026-06-03T15:30:00+09:00 - issue-85 sidebar workspace menu

- Result: 좌측 sidebar workspace name dropdown, Settings menu item, left sidebar collapse/reopen, sticky title+toolbar chrome을 구현했다.
- Coverage: `AppShell` owns left sidebar open state and exposes `useLeftPanel()`. `DocumentList` renders the workspace title as the no-chevron menu trigger, opens `WorkspaceSettingsPanel` through a full-width `Settings` menu item, uses `PanelLeftClose` for collapse, and keeps the title row plus icon toolbar sticky while navigation content scrolls.
- Pages: [[Document Editing Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #85, `docs/superpowers/specs/2026-06-03-sidebar-workspace-menu-and-collapse-design.md`, `components/app-shell.tsx`, `components/document-list.tsx`, `tests/components/app-shell.test.tsx`, `tests/components/document-list.test.tsx`.
- Verification: `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`, `pnpm wiki:sync-check --staged`.
```

- [ ] **Step 4: Regenerate wiki manifest**

Run: `pnpm wiki:manifest`

Expected: output says `wrote wiki/manifest.json with 16 pages`.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx
pnpm exec tsc --noEmit
```

Expected: both commands PASS.

- [ ] **Step 6: Run wiki sync commands**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: `wiki:sync-check --staged` reports source changes and wiki maintenance changes. `wiki:lint` may continue to warn about the Excalidraw embedded PNG wikilink `[[Pasted Image 20260603131407_119.png]]`; that warning is acceptable only if the command exits 0.

- [ ] **Step 7: Commit wiki and final verification work**

Run:

```bash
git add wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "docs: record sidebar workspace menu"
```

Expected: commit succeeds.

### Task 5: Visual And PR Workflow

**Files:**
- No planned source edits unless visual verification reveals a defect.

- [ ] **Step 1: Start or reuse the local dev server**

Run: `pnpm run dev`

Expected: the server prints a localhost URL, usually `http://localhost:3000`. If port 3000 is already in use, use the printed alternate port.

- [ ] **Step 2: Verify in the browser**

Open the seeded Company Handbook workspace:

```text
http://localhost:3000/workspaces/company-handbook
```

Verify these UI states:

- Workspace title row shows `Company Handbook` text and `PanelLeftClose`.
- Clicking `Company Handbook` opens a full-width menu with exactly `Settings`.
- Clicking `Settings` opens the existing workspace settings dialog.
- Clicking `PanelLeftClose` removes the left sidebar and shows `PanelLeftOpen`.
- Clicking `PanelLeftOpen` restores the sidebar.
- Scrolling a long sidebar keeps the workspace title row and icon toolbar visible.

- [ ] **Step 3: Fix visual defects if found**

If visual verification finds a defect, write a focused failing test in `tests/components/document-list.test.tsx` or `tests/components/app-shell.test.tsx`, implement the correction, rerun:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx
pnpm exec tsc --noEmit
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Then commit the fix with a specific message, for example:

```bash
git add components/app-shell.tsx components/document-list.tsx tests/components/app-shell.test.tsx tests/components/document-list.test.tsx wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "fix: align sidebar workspace controls"
```

- [ ] **Step 4: Push branch and create PR**

Run:

```bash
git push -u origin issue-85-sidebar-workspace-menu-and-collapse
gh pr create --title "Refine sidebar workspace menu and collapse" --body "Implements #85."
```

Expected: branch pushes and GitHub returns a PR URL.

- [ ] **Step 5: Mark PR ready and check review state**

Run:

```bash
gh pr ready
sleep 300
gh pr view --json reviewDecision,mergeStateStatus,statusCheckRollup,reviews,comments
```

Expected: PR is ready for review. After the wait, report review submissions, unresolved actionable feedback if any, and CI/check status. If review feedback or failing checks appear, fix them on the same branch, rerun verification and wiki sync, commit, push, and repeat the review check.
