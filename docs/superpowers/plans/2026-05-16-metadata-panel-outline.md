# Metadata Panel Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-position Outline tab to the right metadata panel that renders the selected document's `#`-`####` heading tree with vertical level guides and scrolls to the clicked heading.

**Architecture:** Reuse the existing markdown heading fold parser as the source of truth for heading hierarchy, then expose a shallow outline projection from `lib/markdown/folding.ts`. Pass selected document markdown into `MetadataPanel`, register document heading navigation through `AppShell` client context, and make preview/editor surfaces respond to outline item keys and source line numbers.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CodeMirror, ReactMarkdown, lucide-react, Vitest, Testing Library, Munjib wiki maintenance CLI.

---

### Task 0: Feature Issue And Branch Setup

**Files:**
- Read: `docs/superpowers/specs/2026-05-16-metadata-panel-outline-design.md`
- Read: `wiki/Document Editing Workflow.md`
- No source edits in this task.

- [x] **Step 1: Confirm current branch and untracked files**

Run: `git status --short --branch`

Expected: branch is `main` or an existing feature branch. Existing untracked design images such as `wiki/designs/notion2.png`, `wiki/designs/notion3.png`, and `wiki/designs/obsidian3.png` may be present and must not be staged unless the user explicitly asks.

- [x] **Step 2: Create the GitHub issue and feature branch**

Run: `pnpm wiki:feature-start "Metadata panel outline"`

Expected: command creates a GitHub issue when `gh` is authenticated. If current branch is `main`, it switches to `issue-<number>-metadata-panel-outline`. If already on a feature branch, it stays on that branch.

- [x] **Step 3: Record the resulting branch**

Run: `git status --short --branch`

Expected: output shows the issue branch or confirms the existing feature branch. Keep this branch for all implementation commits.

### Task 1: Markdown Outline Projection

**Files:**
- Modify: `lib/markdown/folding.ts`
- Test: `tests/markdown/outline.test.ts`

- [x] **Step 1: Write failing outline tests**

Create `tests/markdown/outline.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildMarkdownOutline } from "@/lib/markdown/folding";

describe("buildMarkdownOutline", () => {
  it("returns # through #### headings as a nested outline", () => {
    const outline = buildMarkdownOutline(`# Root
Intro
## Setup
Body
### Install
Body
#### Env
Body
##### Hidden
Body
## Workflow`);

    expect(outline).toMatchObject([
      {
        level: 1,
        title: "Root",
        lineNumber: 1,
        children: [
          {
            level: 2,
            title: "Setup",
            lineNumber: 3,
            children: [
              {
                level: 3,
                title: "Install",
                lineNumber: 5,
                children: [{ level: 4, title: "Env", lineNumber: 7, children: [] }],
              },
            ],
          },
          { level: 2, title: "Workflow", lineNumber: 11, children: [] },
        ],
      },
    ]);
    expect(JSON.stringify(outline)).not.toContain("Hidden");
  });

  it("normalizes closing hash markers and keeps repeated headings uniquely addressable", () => {
    const outline = buildMarkdownOutline(`# Root
## Notes ##
## Notes`);

    expect(outline[0]?.children.map((item) => ({ id: item.id, title: item.title }))).toEqual([
      { id: "1-root-0/2-notes-0", title: "Notes" },
      { id: "1-root-0/2-notes-1", title: "Notes" },
    ]);
  });

  it("ignores frontmatter and fenced code block heading-like lines", () => {
    const outline = buildMarkdownOutline(`---
title: "# Not a heading"
---
# Real
\`\`\`sh
## Also not a heading
\`\`\`
Body`);

    expect(outline).toHaveLength(1);
    expect(outline[0]?.title).toBe("Real");
    expect(outline[0]?.children).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify failure**

Run: `pnpm exec vitest run tests/markdown/outline.test.ts`

Expected: FAIL with an export error for `buildMarkdownOutline`.

- [x] **Step 3: Add outline types and projection helper**

In `lib/markdown/folding.ts`, extend `HeadingFoldSection` and add the outline export:

```ts
export type MarkdownOutlineItem = {
  id: string;
  level: number;
  title: string;
  lineNumber: number;
  children: MarkdownOutlineItem[];
};

export type HeadingFoldSection = {
  key: string;
  level: number;
  title: string;
  headingLine: number;
  bodyMarkdown: string;
  children: HeadingFoldSection[];
  editorRange: HeadingFoldEditorRange | null;
};

export function buildMarkdownOutline(markdown: string): MarkdownOutlineItem[] {
  return buildHeadingFoldTree(markdown).sections
    .map(toMarkdownOutlineItem)
    .filter((item) => item.level <= 4);
}

function toMarkdownOutlineItem(section: HeadingFoldSection): MarkdownOutlineItem {
  return {
    id: section.key,
    level: section.level,
    title: section.title,
    lineNumber: section.headingLine,
    children: section.children
      .map(toMarkdownOutlineItem)
      .filter((item) => item.level <= 4),
  };
}
```

In `finalizeSection()`, include the source heading line:

```ts
const finalized: HeadingFoldSection = Object.freeze({
  key: section.key,
  level: section.level,
  title: section.title,
  headingLine: section.headingLine,
  bodyMarkdown,
  children: Object.freeze(finalizedChildren) as unknown as HeadingFoldSection[],
  editorRange,
});
```

- [x] **Step 4: Run outline and existing folding tests**

Run: `pnpm exec vitest run tests/markdown/outline.test.ts tests/markdown/folding.test.ts`

Expected: PASS. Existing folding tests continue to pass because `toMatchObject` ignores the new `headingLine` field.

- [x] **Step 5: Commit parser work**

Run:

```bash
git add lib/markdown/folding.ts tests/markdown/outline.test.ts
git commit -m "Add markdown outline parser"
```

Expected: commit succeeds.

### Task 2: Metadata Panel Outline UI

**Files:**
- Modify: `components/metadata-panel.tsx`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `tests/components/metadata-panel.test.tsx`

- [x] **Step 1: Write failing metadata panel tests**

Update `renderPanel()` in `tests/components/metadata-panel.test.tsx` to pass a selected document:

```ts
const outlineDocument = {
  id: "doc-1",
  contentMarkdown: "# Welcome\n\n## Setup\n\n### Install\n\n#### Env\n\n##### Hidden",
};

function renderPanel(props: Partial<Parameters<typeof MetadataPanel>[0]> = {}) {
  return render(
    <MetadataPanel
      document={outlineDocument}
      versions={versions}
      auditLogs={auditLogs}
      attachments={attachments}
      canWrite
      restoreVersionAction={async () => {}}
      onTogglePanel={vi.fn()}
      onNavigateToHeading={vi.fn()}
      {...props}
    />,
  );
}
```

Replace the first test with:

```ts
it("opens outline by default and switches metadata lists from the tab toolbar", () => {
  renderPanel();

  expect(screen.getByRole("button", { name: "Outline" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Go to heading Welcome" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Go to heading Setup" })).toBeTruthy();
  expect(screen.queryByText("Hidden")).toBeNull();
  expect(screen.queryByRole("link", { name: "notes.txt" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Attachments" }));
  expect(screen.getByRole("link", { name: "notes.txt" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Versions" }));
  expect(screen.getByText("v2")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Audit log" }));
  expect(screen.getByText("document.updated")).toBeTruthy();
});
```

Add tests:

```ts
it("navigates to clicked outline headings", () => {
  const onNavigateToHeading = vi.fn();
  renderPanel({ onNavigateToHeading });

  fireEvent.click(screen.getByRole("button", { name: "Go to heading Install" }));

  expect(onNavigateToHeading).toHaveBeenCalledWith({
    id: "1-welcome-0/2-setup-0/3-install-0",
    lineNumber: 5,
  });
});

it("shows an outline empty state when the selected document has no headings", () => {
  renderPanel({ document: { id: "doc-1", contentMarkdown: "Body only" } });

  expect(screen.getByText("No outline headings")).toBeTruthy();
});
```

- [x] **Step 2: Run component test to verify failure**

Run: `pnpm exec vitest run tests/components/metadata-panel.test.tsx`

Expected: FAIL because `MetadataPanel` does not accept `document` or render Outline.

- [x] **Step 3: Add Outline tab props and toolbar button**

In `components/metadata-panel.tsx`, update imports:

```ts
import { FileClock, History, ListTree, PanelRightClose, Paperclip } from "lucide-react";
import { buildMarkdownOutline, type MarkdownOutlineItem } from "@/lib/markdown/folding";
```

Update types:

```ts
type MetadataTab = "outline" | "attachments" | "versions" | "audit";
type MetadataPanelDocument = {
  id: string;
  contentMarkdown: string;
} | null;
type HeadingNavigationTarget = {
  id: string;
  lineNumber: number;
};
```

Update props and default tab:

```ts
export function MetadataPanel({
  document,
  versions,
  auditLogs,
  attachments,
  canWrite,
  restoreVersionAction,
  onTogglePanel,
  onNavigateToHeading,
}: {
  document: MetadataPanelDocument;
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
  attachments: Attachment[];
  canWrite: boolean;
  restoreVersionAction: (formData: FormData) => Promise<void>;
  onTogglePanel?: () => void;
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void;
}) {
  const [activeTab, setActiveTab] = useState<MetadataTab>("outline");
```

Place this button before Attachments:

```tsx
<MetadataTabButton
  label="Outline"
  active={activeTab === "outline"}
  onClick={() => setActiveTab("outline")}
>
  <ListTree className="h-4 w-4" aria-hidden="true" />
</MetadataTabButton>
```

Render the list before attachments:

```tsx
{activeTab === "outline" ? (
  <OutlineList document={document} onNavigateToHeading={onNavigateToHeading} />
) : null}
```

- [x] **Step 4: Add OutlineList rendering with vertical guides**

Add these helpers in `components/metadata-panel.tsx`:

```tsx
function OutlineList({
  document,
  onNavigateToHeading,
}: {
  document: MetadataPanelDocument;
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void;
}) {
  const outline = document ? buildMarkdownOutline(document.contentMarkdown) : [];

  return (
    <section>
      <h2 className="text-sm font-semibold">Outline</h2>
      {outline.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No outline headings</p>
      ) : (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          {outline.map((item) => (
            <OutlineItemRow
              key={item.id}
              item={item}
              onNavigateToHeading={onNavigateToHeading}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OutlineItemRow({
  item,
  onNavigateToHeading,
}: {
  item: MarkdownOutlineItem;
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void;
}) {
  return (
    <div>
      <button
        type="button"
        aria-label={`Go to heading ${item.title}`}
        onClick={() => onNavigateToHeading?.({ id: item.id, lineNumber: item.lineNumber })}
        className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-200 hover:text-ink focus:bg-slate-200 focus:text-ink focus:outline-none"
      >
        {item.title}
      </button>
      {item.children.length > 0 ? (
        <div className="ml-3 border-l border-slate-200 pl-2">
          {item.children.map((child) => (
            <OutlineItemRow
              key={child.id}
              item={child}
              onNavigateToHeading={onNavigateToHeading}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [x] **Step 5: Pass selected document into MetadataPanel**

In `app/workspaces/[workspaceSlug]/page.tsx`, update the `MetadataPanel` call:

```tsx
<MetadataPanel
  document={
    selectedDocument
      ? {
          id: selectedDocument.id,
          contentMarkdown: selectedDocument.contentMarkdown,
        }
      : null
  }
  versions={versions}
  auditLogs={auditLogs}
  attachments={attachments}
  canWrite={canWriteSelectedDocument}
  restoreVersionAction={restoreVersionAction}
/>
```

- [x] **Step 6: Run component test**

Run: `pnpm exec vitest run tests/components/metadata-panel.test.tsx`

Expected: PASS.

- [x] **Step 7: Commit metadata panel UI**

Run:

```bash
git add components/metadata-panel.tsx 'app/workspaces/[workspaceSlug]/page.tsx' tests/components/metadata-panel.test.tsx
git commit -m "Add metadata panel outline tab"
```

Expected: commit succeeds.

### Task 3: Outline Click Scroll Bridge

**Files:**
- Modify: `components/app-shell.tsx`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`
- Test: `tests/components/metadata-panel.test.tsx`
- Test: `tests/components/app-shell.test.tsx`

- [x] **Step 1: Add failing preview target test**

In `tests/components/document-editor-preview.test.tsx`, add a test that renders preview mode and checks heading target attributes:

```ts
it("marks preview headings with outline target attributes", () => {
  renderEditor({
    document: {
      id: "doc-1",
      title: "Outline",
      contentMarkdown: "# Welcome\n\n## Setup",
    },
  });

  expect(document.querySelector('[data-outline-heading-id="1-welcome-0"]')).toBeTruthy();
  expect(document.querySelector('[data-outline-heading-id="1-welcome-0/2-setup-0"]')).toBeTruthy();
});
```

Use the existing test helper in that file. Set the mocked view mode to `preview` the same way existing preview tests in this file do.

- [x] **Step 2: Add failing metadata scroll test**

In `tests/components/metadata-panel.test.tsx`, update the navigation test to include a DOM target:

```ts
it("scrolls to a matching outline target when no navigation callback is provided", () => {
  const scrollIntoView = vi.fn();
  const target = window.document.createElement("h2");
  target.setAttribute("data-outline-heading-id", "1-welcome-0/2-setup-0");
  target.scrollIntoView = scrollIntoView;
  window.document.body.appendChild(target);

  renderPanel({ onNavigateToHeading: undefined });

  fireEvent.click(screen.getByRole("button", { name: "Go to heading Setup" }));

  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
});
```

- [x] **Step 3: Run tests to verify failure**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/metadata-panel.test.tsx`

Expected: FAIL because preview headings do not have outline target attributes.

- [x] **Step 4: Mark preview headings with outline ids**

In `components/document-editor.tsx`, add an `id` to the section wrapper rendered by `MarkdownPreviewSection`:

```tsx
return (
  <section
    className={getPreviewHeadingSectionClassName(section.level)}
    data-outline-heading-id={section.key}
  >
```

This marks the section that owns the heading and keeps ReactMarkdown heading rendering unchanged.

- [x] **Step 5: Add fallback DOM scrolling to MetadataPanel**

In `components/metadata-panel.tsx`, add a helper:

```ts
function navigateToOutlineHeading(
  target: HeadingNavigationTarget,
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void,
) {
  if (onNavigateToHeading) {
    onNavigateToHeading(target);
    return;
  }

  const element = window.document.querySelector(`[data-outline-heading-id="${target.id}"]`);
  element?.scrollIntoView({ block: "start", behavior: "smooth" });
}
```

Update `OutlineItemRow` click:

```tsx
onClick={() => navigateToOutlineHeading(
  { id: item.id, lineNumber: item.lineNumber },
  onNavigateToHeading,
)}
```

- [x] **Step 6: Add heading navigation context to AppShell**

In `components/app-shell.tsx`, extend imports:

```ts
import { createContext, useContext, useMemo, useState } from "react";
```

Add types and contexts near `RightPanelContext`:

```ts
type HeadingNavigationTarget = {
  id: string;
  lineNumber: number;
};

type HeadingNavigationHandler = (target: HeadingNavigationTarget) => void;

type HeadingNavigationControls = {
  navigateToHeading: HeadingNavigationHandler;
  setHeadingNavigator: (navigator: HeadingNavigationHandler | null) => void;
};

const HeadingNavigationContext = createContext<HeadingNavigationControls | null>(null);

export function useHeadingNavigation() {
  return useContext(HeadingNavigationContext);
}
```

Inside `AppShell`, add state and controls before `rightContent`:

```ts
const [headingNavigator, setHeadingNavigator] = useState<HeadingNavigationHandler | null>(null);
const headingNavigationControls = useMemo(
  () => ({
    navigateToHeading: (target: HeadingNavigationTarget) => {
      headingNavigator?.(target);
    },
    setHeadingNavigator,
  }),
  [headingNavigator],
);
```

Wrap the returned layout in the provider:

```tsx
return (
  <HeadingNavigationContext.Provider value={headingNavigationControls}>
    <main
      className={
        rightPanelOpen
          ? "grid h-dvh max-h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden bg-white text-ink"
          : "relative grid h-dvh max-h-dvh min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-white text-ink"
      }
    >
      {/* existing layout */}
    </main>
  </HeadingNavigationContext.Provider>
);
```

- [x] **Step 7: Register editor-mode scroll callback**

In `components/document-editor.tsx`, keep a CodeMirror view ref and accept an optional callback registrar:

```ts
type HeadingNavigationTarget = {
  id: string;
  lineNumber: number;
};

export function DocumentEditor({
  document,
  canWrite,
  action,
  uploadAttachmentAction,
  linkCandidates,
  tags,
  properties,
  comments,
  linkPanels,
  createFromBrokenLinkAction,
  createCommentAction,
  onHeadingNavigatorChange,
}: {
  // existing props
  onHeadingNavigatorChange?: (navigator: ((target: HeadingNavigationTarget) => void) | null) => void;
}) {
  const editorViewRef = useRef<EditorView | null>(null);
```

In the import from `@/components/app-shell`, add the hook:

```ts
import { useHeadingNavigation } from "@/components/app-shell";
```

Inside `DocumentEditor`, derive the registrar:

```ts
const headingNavigation = useHeadingNavigation();
const registerHeadingNavigator = onHeadingNavigatorChange ?? headingNavigation?.setHeadingNavigator;
```

Wrap `onCreateEditor`:

```tsx
onCreateEditor={(view) => {
  editorViewRef.current = view;
  restoreEditorFolds(view);
}}
```

Add an effect:

```ts
useEffect(() => {
  if (!registerHeadingNavigator || !document?.id) {
    registerHeadingNavigator?.(null);
    return;
  }

  registerHeadingNavigator((target) => {
    const previewTarget = window.document.querySelector(`[data-outline-heading-id="${target.id}"]`);
    if (previewTarget) {
      previewTarget.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }

    const view = editorViewRef.current;
    if (!view) return;

    try {
      const line = view.state.doc.line(target.lineNumber);
      view.dispatch({
        effects: EditorView.scrollIntoView(line.from, { y: "start" }),
      });
    } catch {
      // Invalid line numbers are ignored so outline navigation never blocks editing.
    }
  });

  return () => registerHeadingNavigator(null);
}, [document?.id, registerHeadingNavigator]);
```

- [x] **Step 8: Use AppShell heading navigation from MetadataPanel**

In `components/metadata-panel.tsx`, import the hook:

```ts
import { useHeadingNavigation } from "@/components/app-shell";
```

Inside `MetadataPanel`, read the context:

```ts
const headingNavigation = useHeadingNavigation();
```

Pass it into `OutlineList`:

```tsx
<OutlineList
  document={document}
  onNavigateToHeading={onNavigateToHeading}
  contextNavigateToHeading={headingNavigation?.navigateToHeading}
/>
```

Update types and `navigateToOutlineHeading`:

```ts
function navigateToOutlineHeading(
  target: HeadingNavigationTarget,
  onNavigateToHeading?: (target: HeadingNavigationTarget) => void,
  contextNavigateToHeading?: (target: HeadingNavigationTarget) => void,
) {
  if (onNavigateToHeading) {
    onNavigateToHeading(target);
    return;
  }

  if (contextNavigateToHeading) {
    contextNavigateToHeading(target);
    return;
  }

  const element = window.document.querySelector(`[data-outline-heading-id="${target.id}"]`);
  element?.scrollIntoView({ block: "start", behavior: "smooth" });
}
```

- [x] **Step 9: Add AppShell integration test**

In `tests/components/app-shell.test.tsx`, add a test client component:

```tsx
import { useEffect } from "react";
import { useHeadingNavigation } from "@/components/app-shell";

function HeadingNavigationProbe({ onNavigate }: { onNavigate: () => void }) {
  const headingNavigation = useHeadingNavigation();

  useEffect(() => {
    headingNavigation?.setHeadingNavigator(() => onNavigate);
    return () => headingNavigation?.setHeadingNavigator(null);
  }, [headingNavigation, onNavigate]);

  return (
    <button
      type="button"
      onClick={() => headingNavigation?.navigateToHeading({ id: "heading", lineNumber: 1 })}
    >
      Navigate heading
    </button>
  );
}
```

Add the test:

```tsx
it("shares heading navigation between center and right panel content", () => {
  const onNavigate = vi.fn();

  render(
    <AppShell
      left={<div>Left</div>}
      center={<HeadingNavigationProbe onNavigate={onNavigate} />}
      right={<button type="button">Right</button>}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Navigate heading" }));

  expect(onNavigate).toHaveBeenCalledOnce();
});
```

- [x] **Step 10: Run focused tests**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx`

Expected: PASS.

- [x] **Step 11: Commit scroll bridge**

Run:

```bash
git add components/app-shell.tsx components/document-editor.tsx components/metadata-panel.tsx tests/components/document-editor-preview.test.tsx tests/components/metadata-panel.test.tsx tests/components/app-shell.test.tsx
git commit -m "Connect outline headings to document scroll"
```

Expected: commit succeeds.

### Task 4: Wiki Maintenance And Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [x] **Step 1: Update durable wiki pages**

In `wiki/Document Editing Workflow.md`, replace the planned outline note with implemented behavior:

```md
Metadata panel의 첫 번째 tab은 `Outline`이다. Outline은 현재 선택 문서의 `#`, `##`, `###`, `####` ATX heading을 markdown 원문에서 추출하되 frontmatter와 fenced code block 내부 heading-like line은 제외한다. Heading tree는 `DocumentNavigation` tree와 같은 `border-l` vertical guide line으로 level을 구분한다. Row click은 preview heading target 또는 edit mode CodeMirror line으로 스크롤한다.
```

In `wiki/index.md`, update the status board sentence so it states the outline is implemented, not only planned.

In `wiki/log.md`, add a top entry with the issue number created in Task 0, changed files, and verification commands.

- [x] **Step 2: Generate manifest**

Run: `pnpm wiki:manifest`

Expected: writes `wiki/manifest.json`.

- [x] **Step 3: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/components/metadata-panel.test.tsx tests/components/document-editor-preview.test.tsx tests/components/app-shell.test.tsx
pnpm exec tsc --noEmit
```

Expected: all commands PASS.

- [x] **Step 4: Run wiki lint**

Run:

```bash
pnpm wiki:lint
```

Expected: `wiki:lint` exits 0.

- [x] **Step 5: Stage implementation and wiki changes**

Run:

```bash
git add lib/markdown/folding.ts tests/markdown/outline.test.ts components/app-shell.tsx components/metadata-panel.tsx components/document-editor.tsx 'app/workspaces/[workspaceSlug]/page.tsx' tests/components/app-shell.test.tsx tests/components/metadata-panel.test.tsx tests/components/document-editor-preview.test.tsx wiki/Document\ Editing\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
pnpm wiki:sync-check --staged
```

Expected: sync-check exits 0.

- [ ] **Step 6: Commit final implementation state**

Run: `git commit -m "Add metadata panel outline navigation"`

Expected: pre-commit `wiki:sync-check --staged` and `wiki:lint` pass, commit succeeds.

- [ ] **Step 7: Final status check**

Run: `git status --short --branch`

Expected: branch is clean except for pre-existing untracked design images that were intentionally left untouched.
