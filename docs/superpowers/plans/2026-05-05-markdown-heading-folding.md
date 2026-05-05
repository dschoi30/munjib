# Markdown Heading Folding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Obsidian-style markdown heading folding to Munjib edit and preview modes while removing split mode.

**Architecture:** Add a pure markdown folding model that converts markdown into stable heading sections and editor ranges. `DocumentEditor` uses that model for preview section rendering, `localStorage` persistence, and CodeMirror fold restoration. Existing wiki-link preview conversion stays in `lib/wiki-links/preview.ts`; heading folding lives in `lib/markdown/folding.ts`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `@uiw/react-codemirror`, `@codemirror/lang-markdown`, `react-markdown`, `remark-gfm`, Vitest, Testing Library.

---

## File Structure

- Create `lib/markdown/folding.ts`
  - Owns heading detection, code/frontmatter exclusion, stable key generation, nested section tree creation, and CodeMirror line range calculation.
  - Exports only serializable types and pure functions so tests do not need React or CodeMirror.

- Create `tests/markdown/folding.test.ts`
  - Unit-tests heading hierarchy, repeated heading keys, code/frontmatter exclusions, body markdown preservation, and stale localStorage key cleanup helpers.

- Modify `components/document-editor.tsx`
  - Remove `split` from `EditorMode`.
  - Remove Split mode button and `Columns2` import.
  - Initialize the editor mode as `preview` so the new reading behavior is visible first.
  - Pass `document.id` into `MarkdownPreview`.
  - Enable CodeMirror `foldGutter`.
  - Add `onCreateEditor` hook to restore saved fold ranges from `localStorage`.
  - Render preview heading sections with hover/focus chevrons.

- Create `tests/components/document-editor-preview.test.tsx`
  - Component-level tests for Preview heading folding, hover/focus-independent accessibility state, `localStorage` restore, and Split removal.

- Modify `vitest.config.ts`
  - Include `tests/**/*.test.tsx` so React component tests run.

- Modify `package.json` and `pnpm-lock.yaml`
  - Add `jsdom` as a dev dependency for component tests.

- Modify `tests/wiki-links/preview.test.ts`
  - Add a regression case proving heading markdown and wiki-link preview conversion can coexist.

- Modify wiki files after implementation
  - `wiki/Document Editing Workflow.md`
  - `wiki/Wiki Links And Backlinks.md`
  - `wiki/log.md`
  - `wiki/manifest.json`

---

### Task 1: Markdown Folding Model

**Files:**
- Create: `lib/markdown/folding.ts`
- Create: `tests/markdown/folding.test.ts`

- [ ] **Step 1: Create the failing parser tests**

Create `tests/markdown/folding.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  buildHeadingFoldTree,
  createHeadingFoldStorageValue,
  getValidFoldedHeadingKeys,
} from "@/lib/markdown/folding";

describe("buildHeadingFoldTree", () => {
  it("builds nested heading sections by markdown hierarchy", () => {
    const result = buildHeadingFoldTree(`# A
Intro
## B
B body
### C
C body
## D
D body
# E
E body`);

    expect(result.sections).toMatchObject([
      {
        level: 1,
        title: "A",
        bodyMarkdown: "Intro\n",
        children: [
          {
            level: 2,
            title: "B",
            bodyMarkdown: "B body\n",
            children: [{ level: 3, title: "C", bodyMarkdown: "C body\n", children: [] }],
          },
          { level: 2, title: "D", bodyMarkdown: "D body\n", children: [] },
        ],
      },
      { level: 1, title: "E", bodyMarkdown: "E body", children: [] },
    ]);
  });

  it("creates stable unique keys for repeated headings under the same parent", () => {
    const result = buildHeadingFoldTree(`# Root
## Notes
One
## Notes
Two`);

    expect(result.sections[0]?.children.map((section) => section.key)).toEqual([
      "1-root-0/2-notes-0",
      "1-root-0/2-notes-1",
    ]);
  });

  it("ignores frontmatter and code block heading-like text", () => {
    const result = buildHeadingFoldTree(`---
title: "# Not a heading"
---
# Real
\`\`\`
## Not a heading
\`\`\`
    ### Also not a heading
Body`);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.title).toBe("Real");
    expect(result.sections[0]?.bodyMarkdown).toContain("## Not a heading");
    expect(result.sections[0]?.bodyMarkdown).toContain("### Also not a heading");
  });

  it("returns editor line ranges for heading bodies", () => {
    const result = buildHeadingFoldTree(`# A
Intro
## B
B body
# C`);

    expect(result.sections[0]?.editorRange).toEqual({ fromLine: 2, toLine: 4 });
    expect(result.sections[0]?.children[0]?.editorRange).toEqual({ fromLine: 4, toLine: 4 });
  });
});

describe("folded heading storage helpers", () => {
  it("keeps only keys that still exist in the current document", () => {
    const result = buildHeadingFoldTree("# A\nBody");

    expect(getValidFoldedHeadingKeys(["1-a-0", "missing"], result.headingKeys)).toEqual(["1-a-0"]);
  });

  it("serializes folded keys as a stable JSON array", () => {
    expect(createHeadingFoldStorageValue(new Set(["b", "a"]))).toBe("[\"a\",\"b\"]");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run tests/markdown/folding.test.ts
```

Expected: FAIL because `@/lib/markdown/folding` does not exist.

- [ ] **Step 3: Implement the pure folding model**

Create `lib/markdown/folding.ts`:

```ts
export type HeadingFoldSection = {
  key: string;
  level: number;
  title: string;
  headingMarkdown: string;
  bodyMarkdown: string;
  editorRange: { fromLine: number; toLine: number } | null;
  children: HeadingFoldSection[];
};

export type HeadingFoldTree = {
  leadingMarkdown: string;
  sections: HeadingFoldSection[];
  headingKeys: Set<string>;
  sectionByKey: Map<string, HeadingFoldSection>;
};

type MutableSection = Omit<HeadingFoldSection, "children"> & {
  children: MutableSection[];
  parentKey: string;
  startLine: number;
  endLine: number;
  bodyLines: string[];
};

const ATX_HEADING_PATTERN = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;

export function buildHeadingFoldTree(markdown: string): HeadingFoldTree {
  const lines = markdown.split("\n");
  const leadingLines: string[] = [];
  const roots: MutableSection[] = [];
  const stack: MutableSection[] = [];
  const siblingCounts = new Map<string, number>();
  const headingKeys = new Set<string>();
  const sectionByKey = new Map<string, HeadingFoldSection>();
  let inFrontmatter = lines[0]?.trim() === "---";
  let inFence: { marker: string; length: number } | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (lineNumber === 1 && inFrontmatter) return;
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      return;
    }

    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const markerText = fence[1] ?? "";
      const marker = markerText[0] ?? "`";
      if (!inFence) {
        inFence = { marker, length: markerText.length };
      } else if (marker === inFence.marker && markerText.length >= inFence.length) {
        inFence = null;
      }
      appendBodyLine(stack, leadingLines, line);
      return;
    }

    if (inFence || isIndentedCodeLine(line)) {
      appendBodyLine(stack, leadingLines, line);
      return;
    }

    const heading = line.match(ATX_HEADING_PATTERN);
    if (!heading) {
      appendBodyLine(stack, leadingLines, line);
      return;
    }

    const level = heading[1]?.length ?? 1;
    const title = normalizeHeadingTitle(heading[2] ?? "");
    while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) {
      closeSection(stack.pop(), lineNumber - 1);
    }

    const parent = stack.at(-1);
    const parentKey = parent?.key ?? "";
    const slug = slugifyHeadingTitle(title);
    const countKey = `${parentKey}/${level}-${slug}`;
    const occurrence = siblingCounts.get(countKey) ?? 0;
    siblingCounts.set(countKey, occurrence + 1);
    const ownKey = `${level}-${slug}-${occurrence}`;
    const key = parentKey ? `${parentKey}/${ownKey}` : ownKey;
    const section: MutableSection = {
      key,
      level,
      title,
      headingMarkdown: line,
      bodyMarkdown: "",
      editorRange: null,
      children: [],
      parentKey,
      startLine: lineNumber,
      endLine: lineNumber,
      bodyLines: [],
    };
    headingKeys.add(key);

    if (parent) {
      parent.children.push(section);
    } else {
      roots.push(section);
    }
    stack.push(section);
  });

  while (stack.length > 0) {
    closeSection(stack.pop(), lines.length);
  }

  const sections = roots.map(finalizeSection);
  sections.forEach((section) => indexSection(section, sectionByKey));

  return {
    leadingMarkdown: trimTrailingEmptyLines(leadingLines).join("\n"),
    sections,
    headingKeys,
    sectionByKey,
  };
}

export function getValidFoldedHeadingKeys(
  foldedKeys: Iterable<string>,
  validKeys: Set<string>,
): string[] {
  return Array.from(foldedKeys).filter((key) => validKeys.has(key)).sort();
}

export function createHeadingFoldStorageValue(foldedKeys: Set<string>): string {
  return JSON.stringify(Array.from(foldedKeys).sort());
}

export function parseHeadingFoldStorageValue(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function appendBodyLine(stack: MutableSection[], leadingLines: string[], line: string) {
  const current = stack.at(-1);
  if (current) {
    current.bodyLines.push(line);
  } else {
    leadingLines.push(line);
  }
}

function closeSection(section: MutableSection | undefined, endLine: number) {
  if (!section) return;
  section.endLine = endLine;
  section.bodyMarkdown = trimTrailingEmptyLines(section.bodyLines).join("\n");
  section.editorRange =
    section.startLine < section.endLine ? { fromLine: section.startLine + 1, toLine: section.endLine } : null;
}

function finalizeSection(section: MutableSection): HeadingFoldSection {
  return {
    key: section.key,
    level: section.level,
    title: section.title,
    headingMarkdown: section.headingMarkdown,
    bodyMarkdown: section.bodyMarkdown,
    editorRange: section.editorRange,
    children: section.children.map(finalizeSection),
  };
}

function indexSection(section: HeadingFoldSection, sectionByKey: Map<string, HeadingFoldSection>) {
  sectionByKey.set(section.key, section);
  section.children.forEach((child) => indexSection(child, sectionByKey));
}

function normalizeHeadingTitle(title: string): string {
  return title.replace(/[ \t]+#+$/, "").trim();
}

function slugifyHeadingTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "heading";
}

function isIndentedCodeLine(line: string): boolean {
  return /^(    |\t)/.test(line);
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && next.at(-1) === "") {
    next.pop();
  }
  return next;
}
```

- [ ] **Step 4: Run the folding tests**

Run:

```bash
pnpm exec vitest run tests/markdown/folding.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/markdown/folding.ts tests/markdown/folding.test.ts
git commit -m "feat: add markdown heading fold model"
```

---

### Task 2: Preview Folding UI And Storage

**Files:**
- Modify: `components/document-editor.tsx`
- Create: `tests/components/document-editor-preview.test.tsx`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Enable React component tests**

Install the DOM test environment:

```bash
pnpm add -D jsdom
```

Modify `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
```

Expected: `package.json` has `jsdom` in `devDependencies`, `pnpm-lock.yaml` is updated, and Vitest includes TSX test files.

- [ ] **Step 2: Add failing component tests**

Create `tests/components/document-editor-preview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentEditor } from "@/components/document-editor";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, "aria-label": ariaLabel }: { value: string; "aria-label": string }) => (
    <textarea aria-label={ariaLabel} readOnly value={value} />
  ),
}));

const baseProps = {
  canWrite: true,
  action: async () => {},
  uploadAttachmentAction: async () => {},
  linkCandidates: [],
  tags: [],
  properties: [],
  comments: [],
  linkPanels: { outgoing: [], backlinks: [], broken: [] },
  createFromBrokenLinkAction: async () => {},
  createCommentAction: async () => {},
};

function renderEditor(markdown: string) {
  return render(
    <DocumentEditor
      {...baseProps}
      document={{ id: "doc-1", title: "Foldable", contentMarkdown: markdown }}
    />,
  );
}

describe("DocumentEditor heading preview folding", () => {
  it("removes split mode and opens preview mode by default", () => {
    renderEditor("# A\nBody");

    expect(screen.queryByRole("button", { name: /split/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "A" })).toBeTruthy();
  });

  it("folds and unfolds a preview heading section", () => {
    renderEditor("# A\nVisible body\n# B\nOther body");

    const toggle = screen.getByRole("button", { name: "Collapse section A" });
    expect(screen.getByText("Visible body")).toBeTruthy();

    fireEvent.click(toggle);

    expect(screen.queryByText("Visible body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand section A" }).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Expand section A" }));

    expect(screen.getByText("Visible body")).toBeTruthy();
  });

  it("restores folded headings from document localStorage", () => {
    window.localStorage.setItem("munjib:heading-folds:doc-1", "[\"1-a-0\"]");

    renderEditor("# A\nStored body");

    expect(screen.queryByText("Stored body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand section A" })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the component test and verify failure**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: FAIL because split mode still exists and preview heading buttons do not exist.

- [ ] **Step 4: Update `DocumentEditor` imports and mode state**

In `components/document-editor.tsx`, change imports:

```tsx
import { Eye, MessageSquare, Paperclip, Pencil, Save, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import {
  buildHeadingFoldTree,
  createHeadingFoldStorageValue,
  getValidFoldedHeadingKeys,
  parseHeadingFoldStorageValue,
  type HeadingFoldSection,
} from "@/lib/markdown/folding";
```

Remove `Columns2` from `lucide-react`.

Change:

```tsx
type EditorMode = "edit" | "preview";
```

Change initial mode:

```tsx
const [mode, setMode] = useState<EditorMode>("preview");
```

- [ ] **Step 5: Remove Split controls and layout branches**

Replace the mode button group with:

```tsx
<div className="inline-flex rounded-md border border-border bg-white p-1">
  <ModeButton active={mode === "edit"} onClick={() => setMode("edit")}>
    <Pencil className="h-4 w-4" aria-hidden="true" />
    <span>Edit</span>
  </ModeButton>
  <ModeButton active={mode === "preview"} onClick={() => setMode("preview")}>
    <Eye className="h-4 w-4" aria-hidden="true" />
    <span>Preview</span>
  </ModeButton>
</div>
```

Replace the editor/preview container with:

```tsx
<div className="overflow-hidden rounded-md border border-border bg-white">
  {mode === "edit" ? (
    <div className="relative min-w-0">
      <CodeMirror
        value={contentMarkdown}
        basicSetup={{
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
        editable={canWrite}
        extensions={extensions}
        onChange={(value, viewUpdate) =>
          updateMarkdown(value, viewUpdate.state.selection.main.head)
        }
        aria-label="Markdown editor"
      />
      {canWrite && suggestions.length > 0 ? (
        <WikiLinkSuggestions suggestions={suggestions} insertWikiLink={insertWikiLink} />
      ) : null}
    </div>
  ) : (
    <MarkdownPreview
      documentId={document.id}
      markdown={contentMarkdown}
      linkCandidates={linkCandidates}
    />
  )}
</div>
```

Add a small extracted suggestion component below `ModeButton` to keep the editor branch readable:

```tsx
function WikiLinkSuggestions({
  suggestions,
  insertWikiLink,
}: {
  suggestions: WikiLinkCompletionOption[];
  insertWikiLink: (option: WikiLinkCompletionOption) => void;
}) {
  return (
    <div className="absolute left-4 top-12 z-10 w-72 overflow-hidden rounded-md border border-border bg-white shadow-lg">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Wiki links
      </div>
      {suggestions.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => insertWikiLink(option)}
          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-muted"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Add localStorage-backed preview section rendering**

Replace the `MarkdownPreview` function with:

```tsx
function MarkdownPreview({
  documentId,
  markdown,
  linkCandidates,
}: {
  documentId: string;
  markdown: string;
  linkCandidates: LinkCandidate[];
}) {
  const storageKey = `munjib:heading-folds:${documentId}`;
  const candidateBySlug = useMemo(
    () => buildWikiLinkPreviewCandidateMap(linkCandidates),
    [linkCandidates],
  );
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const className = "text-violet-600 underline underline-offset-2 hover:text-violet-700";
        return href?.startsWith("?document=") ? (
          <Link href={href} className={className}>
            {children}
          </Link>
        ) : (
          <a href={href} className={className}>
            {children}
          </a>
        );
      },
    }),
    [],
  );
  const previewMarkdown = useMemo(
    () => renderPreviewMarkdownWithWikiLinks(stripDocumentFrontmatter(markdown), candidateBySlug),
    [markdown, candidateBySlug],
  );
  const foldTree = useMemo(() => buildHeadingFoldTree(previewMarkdown), [previewMarkdown]);
  const [foldedKeys, setFoldedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const storedKeys =
      typeof window === "undefined"
        ? []
        : parseHeadingFoldStorageValue(window.localStorage.getItem(storageKey));
    setFoldedKeys(new Set(getValidFoldedHeadingKeys(storedKeys, foldTree.headingKeys)));
  }, [foldTree.headingKeys, storageKey]);

  const toggleSection = useCallback(
    (sectionKey: string) => {
      setFoldedKeys((current) => {
        const next = new Set(current);
        if (next.has(sectionKey)) {
          next.delete(sectionKey);
        } else {
          next.add(sectionKey);
        }
        const validKeys = new Set(getValidFoldedHeadingKeys(next, foldTree.headingKeys));
        try {
          window.localStorage.setItem(storageKey, createHeadingFoldStorageValue(validKeys));
        } catch {
          // localStorage may be unavailable; the in-memory state still works.
        }
        return validKeys;
      });
    },
    [foldTree.headingKeys, storageKey],
  );

  if (!previewMarkdown) {
    return (
      <div className="markdown-preview min-w-0 p-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {"_Nothing to preview._"}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="markdown-preview min-w-0 p-5">
      {foldTree.leadingMarkdown ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {foldTree.leadingMarkdown}
        </ReactMarkdown>
      ) : null}
      {foldTree.sections.length > 0 ? (
        foldTree.sections.map((section) => (
          <MarkdownPreviewSection
            key={section.key}
            section={section}
            foldedKeys={foldedKeys}
            markdownComponents={markdownComponents}
            toggleSection={toggleSection}
          />
        ))
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {previewMarkdown}
        </ReactMarkdown>
      )}
    </div>
  );
}
```

Add recursive section rendering below `MarkdownPreview`:

```tsx
function MarkdownPreviewSection({
  section,
  foldedKeys,
  markdownComponents,
  toggleSection,
}: {
  section: HeadingFoldSection;
  foldedKeys: Set<string>;
  markdownComponents: Components;
  toggleSection: (sectionKey: string) => void;
}) {
  const isFolded = foldedKeys.has(section.key);
  const HeadingTag = `h${section.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const iconClassName = isFolded
    ? "opacity-100"
    : "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100";

  return (
    <section data-heading-key={section.key}>
      <div className="group -ml-7 flex items-center gap-1">
        <button
          type="button"
          aria-expanded={!isFolded}
          aria-label={`${isFolded ? "Expand" : "Collapse"} section ${section.title}`}
          onClick={() => toggleSection(section.key)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-muted hover:text-ink focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-violet-200 ${iconClassName}`}
        >
          {isFolded ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <HeadingTag>{section.title}</HeadingTag>
      </div>
      {!isFolded ? (
        <>
          {section.bodyMarkdown ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {section.bodyMarkdown}
            </ReactMarkdown>
          ) : null}
          {section.children.map((child) => (
            <MarkdownPreviewSection
              key={child.key}
              section={child}
              foldedKeys={foldedKeys}
              markdownComponents={markdownComponents}
              toggleSection={toggleSection}
            />
          ))}
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 7: Run component tests**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/markdown/folding.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add components/document-editor.tsx tests/components/document-editor-preview.test.tsx vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: fold markdown headings in preview"
```

---

### Task 3: Editor Fold Restoration

**Files:**
- Modify: `components/document-editor.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add direct CodeMirror dependencies**

Add the direct packages used by the editor fold restoration imports:

```bash
pnpm add @codemirror/language @codemirror/state @codemirror/view
```

Expected: `package.json` and `pnpm-lock.yaml` include the direct CodeMirror packages needed for editor fold restoration.

- [ ] **Step 2: Add editor fold restoration imports**

In `components/document-editor.tsx`, add:

```tsx
import { foldEffect } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
```

- [ ] **Step 3: Add editor restoration callback**

Inside `DocumentEditor`, after `insertWikiLink`, add:

```tsx
  const restoreEditorFolds = useCallback(
    (view: EditorView) => {
      if (!document) return;
      if (typeof window === "undefined") return;
      const foldTree = buildHeadingFoldTree(contentMarkdown);
      const storageKey = `munjib:heading-folds:${document.id}`;
      const storedKeys = parseHeadingFoldStorageValue(window.localStorage.getItem(storageKey));
      const validKeys = getValidFoldedHeadingKeys(storedKeys, foldTree.headingKeys);
      const effects = validKeys
        .map((key) => foldTree.sectionByKey.get(key)?.editorRange)
        .filter((range): range is { fromLine: number; toLine: number } => Boolean(range))
        .map((range) => {
          const from = view.state.doc.line(range.fromLine).from;
          const to = view.state.doc.line(range.toLine).to;
          return foldEffect.of({ from, to });
        });
      if (effects.length > 0) {
        view.dispatch({ effects });
      }
    },
    [contentMarkdown, document],
  );
```

- [ ] **Step 4: Wire CodeMirror creation**

Add to the `CodeMirror` props in edit mode:

```tsx
onCreateEditor={restoreEditorFolds}
```

Keep:

```tsx
basicSetup={{
  foldGutter: true,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
}}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add components/document-editor.tsx package.json pnpm-lock.yaml
git commit -m "feat: restore editor heading folds"
```

---

### Task 4: Regressions, Wiki Updates, And Final Verification

**Files:**
- Modify: `tests/wiki-links/preview.test.ts`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Wiki Links And Backlinks.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Add wiki-link regression test**

Append to `tests/wiki-links/preview.test.ts`:

```ts
  it("preserves heading markdown while converting wiki links", () => {
    expect(renderPreviewMarkdownWithWikiLinks("# Runbook\nSee [[Welcome]].", candidateBySlug)).toBe(
      "# Runbook\nSee [Welcome](?document=doc-welcome).",
    );
  });
```

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Update Document Editing Workflow wiki**

In `wiki/Document Editing Workflow.md`, update the `## UI 세부 사항` section so it says:

```md
`DocumentEditor`는 controlled title과 markdown state를 사용하며, 문서 선택이 바뀌면 `useEffect`로 title/content/completion state를 새 문서 값으로 재설정한다.

Editor는 edit/preview mode를 제공한다. Split mode는 Issue #25에서 제거되었다. CodeMirror markdown editor는 `[[` 입력 중 workspace 문서 후보를 보여주는 autocomplete를 제공하며, markdown heading fold gutter를 통해 raw markdown section을 접고 펼칠 수 있다.

Preview mode는 YAML frontmatter block을 본문에서 제외한 뒤 `[[Target Title]]` text를 그대로 노출하지 않고, 읽을 수 있는 workspace document와 matching되는 target을 `?document=<id>` link로 렌더링한다. `[[Target Title|Alias]]`는 alias를 label로 사용한다. Matching document가 없는 target은 bracket 없는 plain text로 표시된다.

Preview mode는 Obsidian-style heading folding도 제공한다. Heading 왼쪽 chevron button으로 section을 접고 펼치며, 펼쳐진 heading은 hover/focus 때만 chevron을 보여주고 접힌 heading은 chevron을 항상 보여준다. 접힘 범위는 heading hierarchy를 따르며, 접힘 상태는 문서별 browser `localStorage` key `munjib:heading-folds:<documentId>`에 저장된다.
```

- [ ] **Step 4: Update Wiki Links And Backlinks wiki**

In `wiki/Wiki Links And Backlinks.md`, add this paragraph to `## Preview link rendering`:

```md
Issue #25 이후 preview surface는 wiki-link rendering과 heading folding을 함께 적용한다. Wiki-link 변환은 heading section parsing 전에 markdown link 형태로 끝나야 하며, heading folding은 변환된 section body를 `ReactMarkdown`으로 렌더링한다. 이 순서를 유지하면 접힌 section 안의 `[[...]]`도 펼쳤을 때 기존 navigation behavior를 유지한다.
```

- [ ] **Step 5: Run implementation verification before writing the wiki log entry**

Run:

```bash
pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx
pnpm exec tsc --noEmit
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: all commands pass.

- [ ] **Step 6: Add wiki log entry**

Add to the top of `wiki/log.md` after the verification commands pass:

```md
## 2026-05-05T23:50:00+09:00 - implementation

- Result: Issue #25에서 markdown heading folding을 구현하고 split mode를 제거했다.
- Coverage: Preview heading chevron folding, edit mode CodeMirror fold gutter/restoration, 문서별 `localStorage` fold state, wiki-link preview regression.
- Pages: [[Document Editing Workflow]], [[Wiki Links And Backlinks]], [[log|Wiki Log]].
- Source evidence: GitHub issue #25, `components/document-editor.tsx`, `lib/markdown/folding.ts`, `tests/markdown/folding.test.ts`, `tests/components/document-editor-preview.test.tsx`, `tests/wiki-links/preview.test.ts`.
- Verification: `pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx`, `pnpm exec tsc --noEmit`, `pnpm wiki:manifest`, `pnpm wiki:lint`.
```

- [ ] **Step 7: Run wiki maintenance commands**

Run:

```bash
pnpm wiki:manifest
pnpm wiki:lint
```

Expected: both pass and `wiki/manifest.json` is up to date.

- [ ] **Step 8: Run full verification**

Run:

```bash
pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx
pnpm exec tsc --noEmit
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: all pass.

- [ ] **Step 9: Commit Task 4**

```bash
git add tests/wiki-links/preview.test.ts wiki/Document\ Editing\ Workflow.md wiki/Wiki\ Links\ And\ Backlinks.md wiki/log.md wiki/manifest.json
git commit -m "docs: update wiki for heading folding"
```

---

## Final Verification

- [ ] Run the focused tests:

```bash
pnpm exec vitest run tests/wiki-links/preview.test.ts tests/markdown/folding.test.ts tests/components/document-editor-preview.test.tsx
```

- [ ] Run typecheck:

```bash
pnpm exec tsc --noEmit
```

- [ ] Run wiki checks:

```bash
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

- [ ] Inspect final diff:

```bash
git status --short --branch
git log --oneline --decorate -n 8
```

Expected final branch shape: `issue-25-markdown-heading-folding` ahead of `origin/main` with commits for the fold model, preview UI, editor restoration, wiki updates, plus the already-existing design commits.
