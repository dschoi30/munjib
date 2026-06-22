# Sidebar Skeleton Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align sidebar loading skeletons with the actual loaded sidebar icon and text slots, using uniform full-width document row bars.

**Architecture:** Keep the existing `Skeleton` primitive and `components/sidebar-loading-skeleton.tsx` public exports. Replace approximate row placeholders with small internal skeleton row components that mirror the loaded `DocumentList`, `DocumentCreateControls`, `DocumentNavigation`, and `MetadataPanel` layout slots.

**Tech Stack:** Next.js/React components, Tailwind utility classes, Vitest with React Testing Library, existing wiki maintenance workflow.

---

## File Structure

- Modify `components/sidebar-loading-skeleton.tsx`: keep the same exported components, remove variable-width row arrays, and add internal slot-matched row helpers for document rows, folder rows, section headings, and metadata rows.
- Modify `tests/components/sidebar-loading-skeleton.test.tsx`: keep existing decorative/no-text tests and add structural assertions for full-width document rows, folder icon slots, left toolbar spacing, and right metadata toolbar gap.
- Modify wiki maintenance files after implementation only if the source behavior changes beyond the already recorded design: likely `wiki/log.md`, `wiki/index.md`, `wiki/Munjib.md`, and `wiki/manifest.json`.

## Task 1: Structural Tests For Slot-Matched Skeleton Rows

**Files:**
- Modify: `tests/components/sidebar-loading-skeleton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these test cases inside the existing `describe("sidebar loading skeletons", () => { ... })` block:

```tsx
  it("matches left sidebar chrome and toolbar slots", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="left" />);

    const loading = screen.getByTestId("left-sidebar-loading");
    const chrome = screen.getByTestId("left-sidebar-loading-chrome");
    const toolbar = screen.getByTestId("left-sidebar-loading-toolbar");

    expect(chrome.className).toContain("h-11");
    expect(toolbar.className).toContain("mb-4");
    expect(toolbar.className).toContain("h-11");
    expect(toolbar.className).toContain("justify-between");
    expect(within(toolbar).getAllByTestId("sidebar-toolbar-icon-skeleton")).toHaveLength(6);
    expect(loading.textContent).toBe("");
  });

  it("renders document rows as uniform full-width text slots with no icon", () => {
    render(<DocumentNavigationBodySkeleton />);

    const loading = screen.getByTestId("document-navigation-loading");
    const documentRows = within(loading).getAllByTestId("document-row-skeleton");

    expect(documentRows.length).toBeGreaterThan(4);
    for (const row of documentRows) {
      expect(row.className).toContain("px-2");
      expect(row.className).toContain("py-1.5");
      expect(within(row).queryByTestId("folder-row-icon-skeleton")).toBeNull();
      expect(within(row).getByTestId("document-row-text-skeleton").className).toContain("w-full");
    }
  });

  it("renders folder rows with the real chevron slot and full-width text", () => {
    render(<DocumentNavigationBodySkeleton />);

    const loading = screen.getByTestId("document-navigation-loading");
    const folderRows = within(loading).getAllByTestId("folder-row-skeleton");

    expect(folderRows.length).toBeGreaterThan(1);
    for (const row of folderRows) {
      expect(row.className).toContain("gap-1");
      expect(row.className).toContain("px-2");
      expect(row.className).toContain("py-1.5");
      expect(within(row).getByTestId("folder-row-icon-skeleton").className).toContain("h-4");
      expect(within(row).getByTestId("folder-row-icon-skeleton").className).toContain("w-4");
      expect(within(row).getByTestId("folder-row-text-skeleton").className).toContain("w-full");
    }
  });

  it("matches right metadata toolbar compact spacing", () => {
    render(<WorkspaceSidebarLoadingSkeleton side="right" />);

    const toolbar = screen.getByTestId("right-sidebar-loading-toolbar");

    expect(toolbar.className).toContain("h-11");
    expect(toolbar.className).toContain("gap-1");
    expect(within(toolbar).getAllByTestId("sidebar-toolbar-icon-skeleton")).toHaveLength(5);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx
```

Expected: FAIL because `left-sidebar-loading-chrome`, `left-sidebar-loading-toolbar`, `document-row-skeleton`, `folder-row-skeleton`, `folder-row-icon-skeleton`, `document-row-text-skeleton`, `folder-row-text-skeleton`, `right-sidebar-loading-toolbar`, and `sidebar-toolbar-icon-skeleton` do not exist yet.

## Task 2: Implement Slot-Matched Sidebar Skeleton Layout

**Files:**
- Modify: `components/sidebar-loading-skeleton.tsx`
- Test: `tests/components/sidebar-loading-skeleton.test.tsx`

- [ ] **Step 1: Replace approximate row arrays and helpers**

Replace the full contents of `components/sidebar-loading-skeleton.tsx` with:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

type SidebarSide = "left" | "right";

const recentDocumentRows = 3;
const allDocumentRows: Array<"folder" | "document"> = [
  "folder",
  "document",
  "folder",
  "document",
  "document",
  "folder",
];
const metadataRows = 5;

export function WorkspaceSidebarLoadingSkeleton({ side }: { side: SidebarSide }) {
  if (side === "right") {
    return (
      <div
        aria-hidden="true"
        data-testid="right-sidebar-loading"
        className="space-y-4 pt-2"
      >
        <div
          data-testid="right-sidebar-loading-toolbar"
          className="flex h-11 items-center gap-1"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <ToolbarIconSkeleton key={index} />
          ))}
          <ToolbarIconSkeleton className="ml-auto" />
        </div>
        <section>
          <Skeleton className="mb-2 h-3.5 w-24 rounded-full" />
          <div className="mt-2 space-y-1 text-sm text-slate-600">
            {Array.from({ length: metadataRows }).map((_, index) => (
              <MetadataRowSkeleton key={index} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div aria-hidden="true" data-testid="left-sidebar-loading">
      <div className="sticky top-0 z-20 bg-muted pb-1">
        <div
          data-testid="left-sidebar-loading-chrome"
          className="flex h-11 items-center gap-2"
        >
          <Skeleton className="h-3.5 w-36 rounded-full" />
          <ToolbarIconSkeleton className="ml-auto" />
        </div>
        <div
          data-testid="left-sidebar-loading-toolbar"
          className="mb-4 flex h-11 items-center justify-between"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <ToolbarIconSkeleton key={index} />
          ))}
        </div>
      </div>
      <div className="pt-3">
        <DocumentNavigationBodySkeleton />
      </div>
    </div>
  );
}

export function DocumentNavigationBodySkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="document-navigation-loading"
    >
      <section className="mb-4">
        <SectionHeadingSkeleton widthClassName="w-16" />
        <div className="space-y-1">
          {Array.from({ length: recentDocumentRows }).map((_, index) => (
            <DocumentRowSkeleton key={index} />
          ))}
        </div>
      </section>
      <nav className="space-y-1" aria-hidden="true">
        <SectionHeadingSkeleton widthClassName="w-20" />
        {allDocumentRows.map((kind, index) =>
          kind === "folder" ? (
            <FolderRowSkeleton key={index} />
          ) : (
            <DocumentRowSkeleton key={index} />
          ),
        )}
      </nav>
    </div>
  );
}

export function CollapsedPanelLoadingSkeleton({ side }: { side: SidebarSide }) {
  return (
    <div
      aria-hidden="true"
      data-testid={`${side}-collapsed-panel-loading`}
      className={side === "left" ? "absolute left-4 top-1.5 z-30" : "absolute right-4 top-1.5"}
    >
      <Skeleton className="h-8 w-8 shadow-sm" />
    </div>
  );
}

function ToolbarIconSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      data-testid="sidebar-toolbar-icon-skeleton"
      className={`h-8 w-8 ${className ?? ""}`}
    />
  );
}

function SectionHeadingSkeleton({ widthClassName }: { widthClassName: string }) {
  return (
    <Skeleton
      data-testid="section-heading-skeleton"
      className={`mb-2 h-3 rounded-full ${widthClassName}`}
    />
  );
}

function DocumentRowSkeleton() {
  return (
    <div
      data-testid="document-row-skeleton"
      className="flex min-w-0 rounded-md px-2 py-1.5"
    >
      <Skeleton
        data-testid="document-row-text-skeleton"
        className="h-[13px] w-full rounded-full"
      />
    </div>
  );
}

function FolderRowSkeleton() {
  return (
    <div
      data-testid="folder-row-skeleton"
      className="flex w-full items-center gap-1 rounded-md px-2 py-1.5"
    >
      <Skeleton
        data-testid="folder-row-icon-skeleton"
        className="h-4 w-4 shrink-0 rounded"
      />
      <Skeleton
        data-testid="folder-row-text-skeleton"
        className="h-[13px] w-full rounded-full"
      />
    </div>
  );
}

function MetadataRowSkeleton() {
  return (
    <div data-testid="metadata-row-skeleton" className="flex w-full min-w-0 rounded px-2 py-1">
      <Skeleton className="h-[13px] w-full rounded-full" />
    </div>
  );
}
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/components/sidebar-loading-skeleton.test.tsx
```

Expected: PASS. The old tests should still pass because the skeletons remain decorative and text-free; the new tests should pass because the new test ids and slot classes exist.

- [ ] **Step 3: Run nearby component tests**

Run:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx
```

Expected: PASS. These tests cover the hydration gates that render the skeletons.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add components/sidebar-loading-skeleton.tsx tests/components/sidebar-loading-skeleton.test.tsx
git commit -m "fix: align sidebar skeleton slots"
```

Expected: commit succeeds after the wiki sync hook. If the hook requires wiki maintenance for this source change, complete Task 3 before committing and include the wiki files in the same commit.

## Task 3: Wiki Maintenance For Implemented Alignment

**Files:**
- Modify if hook requires: `wiki/Munjib.md`
- Modify if hook requires: `wiki/index.md`
- Modify if hook requires: `wiki/log.md`
- Generated: `wiki/manifest.json`

- [ ] **Step 1: Run staged sync plan**

Run:

```bash
pnpm wiki:sync-plan --staged
```

Expected: The plan lists `components/sidebar-loading-skeleton.tsx` and `tests/components/sidebar-loading-skeleton.test.tsx` as source/test changes. It may list `wiki/Munjib.md`, `wiki/index.md`, and `wiki/log.md` as candidate pages.

- [ ] **Step 2: Add the implementation log entry if needed**

If `pnpm wiki:sync-check --staged` requires wiki maintenance, add this entry at the top of `wiki/log.md` below `# Wiki Log`:

```markdown
## 2026-06-22T23:30:00+0900 - implementation

- Result: Issue #129 sidebar skeleton placeholders now align with loaded sidebar icon and text slots.
- Coverage: `WorkspaceSidebarLoadingSkeleton` mirrors left workspace chrome, create toolbar spacing, document navigation body offset, right metadata toolbar spacing, and metadata row rhythm. `DocumentNavigationBodySkeleton` uses full-width bars for document rows with no icon placeholder, and folder rows keep only the real chevron icon slot.
- Pages: [[Munjib]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: `components/sidebar-loading-skeleton.tsx`, `tests/components/sidebar-loading-skeleton.test.tsx`, `docs/superpowers/specs/2026-06-22-sidebar-skeleton-alignment-design.md`.
- Verification: `pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx`.
```

Also update `updated` and `source_count` frontmatter values consistently on changed wiki pages.

- [ ] **Step 3: Regenerate and verify wiki**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: `wiki:lint` may keep the known `wiki/designs/sidebar.md` pasted image warning. `wiki:sync-check --staged` must exit successfully.

- [ ] **Step 4: Stage wiki maintenance**

Run:

```bash
git add wiki/Munjib.md wiki/index.md wiki/log.md wiki/manifest.json
```

Expected: any changed wiki files are staged.

## Task 4: Final Verification, Push, And PR Recheck

**Files:**
- No new source files.

- [ ] **Step 1: Run final focused verification**

Run:

```bash
pnpm exec vitest run tests/components/app-shell.test.tsx tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx
pnpm exec tsc --noEmit --pretty false
```

Expected: Both commands pass.

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
git diff --cached --stat
```

Expected: only intentional skeleton, tests, and wiki maintenance changes are present.

- [ ] **Step 3: Commit any remaining staged source/wiki changes**

Run:

```bash
git add components/sidebar-loading-skeleton.tsx tests/components/sidebar-loading-skeleton.test.tsx wiki/Munjib.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "fix: align sidebar skeleton slots"
```

Expected: commit succeeds. Skip this step if Task 2 already committed the implementation and no staged changes remain.

- [ ] **Step 4: Push branch**

Run:

```bash
git push
```

Expected: `issue-129-sidebar-skeleton-loading-and-language-hydration` updates remote PR #130.

- [ ] **Step 5: Wait and re-check PR review/CI**

Run after at least 5 minutes:

```bash
gh pr checks 130 --watch=false
gh pr view 130 --json reviewDecision,mergeStateStatus,statusCheckRollup
```

Expected: checks pass or any failures are inspected and fixed before final handoff.

## Plan Self-Review

- Spec coverage: Task 1 and Task 2 cover actual loaded slots, full-width document bars, folder chevron slots, right metadata gap, decorative text-free UI, and unchanged collapsed panels. Task 4 covers verification and PR recheck.
- Placeholder scan: No forbidden placeholder tokens or vague "add tests" steps remain. The only conditional wording is in Task 3 because wiki maintenance depends on the sync hook result.
- Type consistency: Test ids used in Task 1 are defined in Task 2 with matching names. Existing exports remain unchanged.
