# Document Editor And Navigation Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `DocumentEditor` and `DocumentNavigation` file size by extracting focused feature-local modules while preserving current behavior.

**Architecture:** Keep `components/document-editor.tsx` and `components/document-navigation.tsx` as stable public entrypoints. Extract preview/folding/properties and navigation panel/row/helper code into sibling folders, preserving existing props, localStorage keys, route shape, and server action contracts.

**Tech Stack:** Next.js App Router, React, TypeScript, CodeMirror, ReactMarkdown, Vitest, Playwright, Munjib wiki automation.

---

## File Structure

### Document Editor

- Modify: `components/document-editor.tsx`
  - Keep exported `DocumentEditor`.
  - Keep document title/content state, save form, attachment form, CodeMirror setup, outline context registration, and mode switching.
  - Import extracted submodules.
- Create: `components/document-editor/types.ts`
  - Export `EditableDocument`, `LinkCandidate`, and `CommentItem` types used across editor submodules.
- Create: `components/document-editor/wiki-link-suggestions.tsx`
  - Render only the wiki-link suggestion popover UI.
- Create: `components/document-editor/folding-storage.ts`
  - Export fold localStorage helpers and CodeMirror folded-range persistence helpers.
- Create: `components/document-editor/preview-markdown.ts`
  - Export preview markdown helpers and `remarkPreviewSoftLineBreaks`.
- Create: `components/document-editor/markdown-preview.tsx`
  - Export `MarkdownPreview`.
  - Own recursive preview section rendering.
- Create: `components/document-editor/document-properties.tsx`
  - Export `DocumentProperties`.
  - Own properties, tags, links, broken link creation controls, comments, and property row UI.

### Document Navigation

- Modify: `components/document-navigation.tsx`
  - Keep exported `DocumentNavigation`.
  - Keep router/transition handling, localStorage favorites state, open menu state, rename state, expanded folder state, keyboard/outside-click effects, and folder error toast policy.
  - Import extracted panel/row/helper modules.
- Create: `components/document-navigation/types.ts`
  - Export `FavoriteState`, action result types, and shared handler prop types used by navigation submodules.
- Create: `components/document-navigation/favorites.ts`
  - Export `emptyFavorites`, `parseFavorites()`, and `toggleListValue()`.
- Create: `components/document-navigation/tree.ts`
  - Export `TreeRow`, `buildTreeItems()`, and `hasTreeChildren()`.
- Create: `components/document-navigation/document-row.tsx`
  - Export `DocumentLinkRow`.
- Create: `components/document-navigation/folder-row.tsx`
  - Export `FolderToggleRow` and `FavoriteFolderRow`.
- Create: `components/document-navigation/document-section.tsx`
  - Export `DocumentSection`.
- Create: `components/document-navigation/search-panel.tsx`
  - Export `SearchPanel`.
- Create: `components/document-navigation/favorites-panel.tsx`
  - Export `FavoriteSection`.

### Tests And Wiki

- Modify if needed: `tests/components/document-editor-preview.test.tsx`
  - Keep existing behavior assertions passing after imports move.
- Modify if needed: `tests/components/document-list.test.tsx`
  - Keep existing sidebar behavior assertions passing after imports move.
- Modify: `wiki/Document Editing Workflow.md`
  - Record the final source layout once implementation is complete.
- Modify: `wiki/log.md`
  - Add implementation result, source evidence, and verification commands.
- Modify as generated: `wiki/manifest.json`
  - Regenerate with `pnpm wiki:manifest`.

## Task 1: Extract Editor Shared Types And Suggestion Popover

**Files:**
- Create: `components/document-editor/types.ts`
- Create: `components/document-editor/wiki-link-suggestions.tsx`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Write the shared editor type module**

Create `components/document-editor/types.ts`:

```ts
import type { DocumentProperty, Tag } from "@prisma/client";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";

export type EditableDocument = {
  id: string;
  title: string;
  contentMarkdown: string;
};

export type LinkCandidate = {
  id: string;
  slug: string;
  title: string;
  path: string;
};

export type CommentItem = {
  id: string;
  body: string;
  user: { name: string; email: string };
};

export type DocumentEditorProps = {
  document: EditableDocument | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  linkCandidates: LinkCandidate[];
  tags: Pick<Tag, "id" | "name">[];
  properties: Pick<DocumentProperty, "id" | "key" | "valueJson">[];
  comments: CommentItem[];
  linkPanels: DocumentLinkPanels;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  createCommentAction: (formData: FormData) => Promise<void>;
};
```

- [ ] **Step 2: Extract the suggestion popover**

Create `components/document-editor/wiki-link-suggestions.tsx`:

```tsx
import type { WikiLinkCompletionOption } from "@/lib/wiki-links/autocomplete";

export function WikiLinkSuggestions({
  canWrite,
  suggestions,
  onSelect,
}: {
  canWrite: boolean;
  suggestions: WikiLinkCompletionOption[];
  onSelect: (option: WikiLinkCompletionOption) => void;
}) {
  if (!canWrite || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-4 top-12 z-10 w-72 overflow-hidden rounded-md border border-border bg-white shadow-lg">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Wiki links
      </div>
      {suggestions.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option)}
          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-muted"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Update `DocumentEditor` imports and props**

In `components/document-editor.tsx`:

```ts
import type { DocumentEditorProps } from "@/components/document-editor/types";
import { WikiLinkSuggestions } from "@/components/document-editor/wiki-link-suggestions";
```

Change the component signature to:

```ts
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
}: DocumentEditorProps) {
```

Remove the local `EditableDocument`, `LinkCandidate`, and `WikiLinkSuggestions` definitions from `components/document-editor.tsx`.

- [ ] **Step 4: Run editor focused test**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: PASS. If it fails with import/type errors, fix only the moved import or exported type.

- [ ] **Step 5: Commit**

```bash
git add components/document-editor.tsx components/document-editor/types.ts components/document-editor/wiki-link-suggestions.tsx
git commit -m "refactor: extract editor suggestions"
```

## Task 2: Extract Editor Folding Storage And Preview Markdown Helpers

**Files:**
- Create: `components/document-editor/folding-storage.ts`
- Create: `components/document-editor/preview-markdown.ts`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Extract folding storage helpers**

Create `components/document-editor/folding-storage.ts` by moving these existing functions from `components/document-editor.tsx` without changing behavior:

```ts
import { foldedRanges } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import {
  buildHeadingFoldTree,
  createHeadingFoldStorageValue,
  getValidFoldedHeadingKeys,
  parseHeadingFoldStorageValue,
  type HeadingFoldTree,
} from "@/lib/markdown/folding";

export function readStoredFoldedHeadingKeys(storageKey: string, validKeys: Set<string>) {
  try {
    return getValidFoldedHeadingKeys(
      parseHeadingFoldStorageValue(window.localStorage.getItem(storageKey)),
      validKeys,
    );
  } catch {
    return [];
  }
}

export function writeStoredFoldedHeadingKeys(storageKey: string, foldedKeys: Set<string>) {
  try {
    window.localStorage.setItem(storageKey, createHeadingFoldStorageValue(foldedKeys));
  } catch {
    // Folding remains usable in memory when browser storage is unavailable.
  }
}

export function persistEditorFoldState(view: EditorView, storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  const foldTree = buildHeadingFoldTree(view.state.doc.toString());
  const foldedKeys = getEditorFoldedHeadingKeys(view, foldTree);

  if (!foldedKeys) {
    return;
  }

  writeStoredFoldedHeadingKeys(storageKey, foldedKeys);
}

function getEditorFoldedHeadingKeys(view: EditorView, foldTree: HeadingFoldTree) {
  const sectionKeyByEditorRange = new Map<string, string>();

  for (const section of foldTree.sectionByKey.values()) {
    const editorRange = section.editorRange;

    if (editorRange && editorRange.fromLine <= editorRange.toLine) {
      const headingLine = editorRange.fromLine - 1;

      sectionKeyByEditorRange.set(
        createEditorRangeKey(editorRange.fromLine, editorRange.toLine),
        section.key,
      );

      if (headingLine >= 1 && headingLine <= editorRange.toLine) {
        sectionKeyByEditorRange.set(createEditorRangeKey(headingLine, editorRange.toLine), section.key);
      }
    }
  }

  try {
    const foldedKeys = new Set<string>();

    foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
      try {
        const fromLine = view.state.doc.lineAt(from).number;
        const toLine = view.state.doc.lineAt(to).number;
        const sectionKey = sectionKeyByEditorRange.get(createEditorRangeKey(fromLine, toLine));

        if (sectionKey) {
          foldedKeys.add(sectionKey);
        }
      } catch {
        // Ignore a range that cannot be mapped back to a document line.
      }
    });

    return new Set(getValidFoldedHeadingKeys(foldedKeys, foldTree.headingKeys));
  } catch {
    return null;
  }
}

function createEditorRangeKey(fromLine: number, toLine: number) {
  return `${fromLine}:${toLine}`;
}
```

- [ ] **Step 2: Extract preview markdown helpers**

Create `components/document-editor/preview-markdown.ts` by moving these existing helpers from `components/document-editor.tsx`:

```ts
import { renderPreviewMarkdownWithWikiLinks } from "@/lib/wiki-links/preview";

export function remarkPreviewSoftLineBreaks() {
  return (tree: unknown) => {
    visitMarkdownParents(tree);
  };
}

function visitMarkdownParents(node: unknown) {
  if (!node || typeof node !== "object") {
    return;
  }

  const parent = node as { children?: unknown[] };

  if (!Array.isArray(parent.children)) {
    return;
  }

  parent.children = parent.children.flatMap((child) => splitMarkdownSoftLineBreaks(child));
  parent.children.forEach(visitMarkdownParents);
}

function splitMarkdownSoftLineBreaks(node: unknown) {
  if (!node || typeof node !== "object") {
    return [node];
  }

  const textNode = node as { type?: string; value?: string };

  if (textNode.type !== "text" || typeof textNode.value !== "string" || !textNode.value.includes("\n")) {
    return [node];
  }

  const parts = textNode.value.split("\n");
  return parts.flatMap((part, index) => {
    const nodes: Array<{ type: string; value?: string }> = [];

    if (index > 0) {
      nodes.push({ type: "break" });
    }

    if (part.length > 0) {
      nodes.push({ type: "text", value: part });
    }

    return nodes;
  });
}

export function markdownInlineToPlainText(markdown: string) {
  return markdown
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias: string | undefined) =>
      alias ?? target,
    )
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .trim();
}

export function getMarkdownBeforeFirstHeading(markdown: string) {
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  for (const line of tokenizeMarkdownLines(markdown)) {
    inFence = getNextFenceState(line.content, inFence);

    if (!inFence && /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line.content)) {
      return markdown.slice(0, line.startOffset);
    }
  }

  return markdown;
}

export function getSharedMarkdownDefinitions(markdown: string) {
  const definitions: string[] = [];
  let inFence: { marker: "`" | "~"; length: number } | null = null;

  const lines = tokenizeMarkdownLines(markdown);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].content;

    if (inFence) {
      inFence = getNextFenceState(line, inFence);
      continue;
    }

    const nextFenceState = getNextFenceState(line, inFence);
    if (nextFenceState) {
      inFence = nextFenceState;
      continue;
    }

    if (isMarkdownDefinitionLine(line)) {
      definitions.push(line);

      for (index += 1; index < lines.length; index += 1) {
        const continuationLine = lines[index].content;

        if (!isMarkdownDefinitionContinuationLine(continuationLine)) {
          index -= 1;
          break;
        }

        definitions.push(continuationLine);
      }
    }
  }

  return definitions.join("\n");
}

function tokenizeMarkdownLines(markdown: string) {
  const lines: Array<{ content: string; startOffset: number }> = [];
  let startOffset = 0;

  for (let index = 0; index <= markdown.length; index += 1) {
    if (index !== markdown.length && markdown[index] !== "\n") {
      continue;
    }

    const hasNewline = index < markdown.length;
    const rawContent = markdown.slice(startOffset, index);

    if (rawContent.length > 0 || hasNewline || markdown.length === 0) {
      lines.push({
        content: rawContent.endsWith("\r") ? rawContent.slice(0, -1) : rawContent,
        startOffset,
      });
    }

    startOffset = index + 1;
  }

  return lines;
}

function getNextFenceState(
  content: string,
  inFence: { marker: "`" | "~"; length: number } | null,
) {
  if (inFence) {
    const closingFence = content.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);

    if (!closingFence) {
      return inFence;
    }

    const marker = closingFence[1][0] as "`" | "~";
    const length = closingFence[1].length;

    return inFence.marker === marker && length >= inFence.length ? null : inFence;
  }

  const openingFence = content.match(/^ {0,3}(`{3,}|~{3,})/);

  return openingFence
    ? {
        marker: openingFence[1][0] as "`" | "~",
        length: openingFence[1].length,
      }
    : null;
}

export function renderPreviewChunk(
  markdown: string,
  candidateBySlug: Parameters<typeof renderPreviewMarkdownWithWikiLinks>[1],
  sharedDefinitions: string,
) {
  const markdownWithDefinitions = sharedDefinitions ? `${markdown}\n\n${sharedDefinitions}` : markdown;

  return renderPreviewMarkdownWithWikiLinks(markdownWithDefinitions, candidateBySlug);
}

function isMarkdownDefinitionLine(line: string) {
  return /^ {0,3}\[(?:\^[^\]\n]+|[^\]\n]+)\]:[ \t]*(?:\S.*)?$/.test(line);
}

function isMarkdownDefinitionContinuationLine(line: string) {
  return line.trim().length === 0 || /^[ \t]/.test(line);
}
```

- [ ] **Step 3: Update `DocumentEditor` imports**

In `components/document-editor.tsx`, import:

```ts
import {
  persistEditorFoldState,
  readStoredFoldedHeadingKeys,
  writeStoredFoldedHeadingKeys,
} from "@/components/document-editor/folding-storage";
import { remarkPreviewSoftLineBreaks } from "@/components/document-editor/preview-markdown";
```

Remove local definitions for the moved helpers and remove no-longer-needed imports such as `foldedRanges`, `createHeadingFoldStorageValue`, and `parseHeadingFoldStorageValue`.

- [ ] **Step 4: Run editor focused test**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/document-editor.tsx components/document-editor/folding-storage.ts components/document-editor/preview-markdown.ts
git commit -m "refactor: extract editor preview helpers"
```

## Task 3: Extract Markdown Preview Component

**Files:**
- Create: `components/document-editor/markdown-preview.tsx`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Create `MarkdownPreview` module**

Create `components/document-editor/markdown-preview.tsx` by moving `MarkdownPreview`, `MarkdownPreviewSection`, `getAncestorOutlineHeadingIds()`, and `getPreviewHeadingSectionClassName()` from `components/document-editor.tsx`.

Use these imports:

```tsx
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getMarkdownBeforeFirstHeading,
  getSharedMarkdownDefinitions,
  markdownInlineToPlainText,
  remarkPreviewSoftLineBreaks,
  renderPreviewChunk,
} from "@/components/document-editor/preview-markdown";
import type { LinkCandidate } from "@/components/document-editor/types";
import {
  readStoredFoldedHeadingKeys,
  writeStoredFoldedHeadingKeys,
} from "@/components/document-editor/folding-storage";
import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";
import {
  buildHeadingFoldTree,
  getValidFoldedHeadingKeys,
  type HeadingFoldSection,
} from "@/lib/markdown/folding";
import {
  buildWikiLinkPreviewCandidateMap,
  renderPreviewMarkdownWithWikiLinks,
} from "@/lib/wiki-links/preview";

const previewRemarkPlugins = [remarkGfm, remarkPreviewSoftLineBreaks];
```

Export:

```tsx
export function MarkdownPreview({
  markdown,
  documentId,
  linkCandidates,
  registerHeadingExpander,
}: {
  markdown: string;
  documentId: string;
  linkCandidates: LinkCandidate[];
  registerHeadingExpander?: (expander: ((id: string) => void) | null) => void;
}) {
  // moved body from existing component, unchanged
}
```

- [ ] **Step 2: Update `DocumentEditor`**

In `components/document-editor.tsx`, import:

```ts
import { MarkdownPreview } from "@/components/document-editor/markdown-preview";
```

Remove local `MarkdownPreview`, `MarkdownPreviewSection`, `getAncestorOutlineHeadingIds()`, and `getPreviewHeadingSectionClassName()` definitions. Remove imports that are now used only by the new module: `Link`, `ChevronDown`, `ChevronRight`, `ReactMarkdown`, `Components`, `remarkGfm`, `stripDocumentFrontmatter`, `buildWikiLinkPreviewCandidateMap`, and `renderPreviewMarkdownWithWikiLinks`.

- [ ] **Step 3: Run editor focused test**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
```

Expected: PASS, including heading folding, outline navigation, wiki links, properties tests still present in that file.

- [ ] **Step 4: Commit**

```bash
git add components/document-editor.tsx components/document-editor/markdown-preview.tsx
git commit -m "refactor: extract markdown preview"
```

## Task 4: Extract Document Properties Component

**Files:**
- Create: `components/document-editor/document-properties.tsx`
- Modify: `components/document-editor.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Create properties module**

Create `components/document-editor/document-properties.tsx` by moving `DocumentProperties`, `TagsPropertyRow`, `propertyTags()`, `LinksPropertyRow`, and `PropertyRow` from `components/document-editor.tsx`.

Use these imports:

```tsx
import Link from "next/link";
import type { DocumentProperty, Tag } from "@prisma/client";
import { MessageSquare } from "lucide-react";
import type { EditableDocument, CommentItem } from "@/components/document-editor/types";
import { Button } from "@/components/ui/button";
import type { DocumentLinkPanels } from "@/lib/wiki-links/types";
```

Export:

```tsx
export function DocumentProperties({
  document,
  tags,
  properties,
  comments,
  linkPanels,
  canWrite,
  createFromBrokenLinkAction,
  createCommentAction,
}: {
  document: EditableDocument;
  tags: Pick<Tag, "id" | "name">[];
  properties: Pick<DocumentProperty, "id" | "key" | "valueJson">[];
  comments: CommentItem[];
  linkPanels: DocumentLinkPanels;
  canWrite: boolean;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  createCommentAction: (formData: FormData) => Promise<void>;
}) {
  // moved body from existing component, unchanged
}
```

- [ ] **Step 2: Update `DocumentEditor`**

In `components/document-editor.tsx`, import:

```ts
import { DocumentProperties } from "@/components/document-editor/document-properties";
```

Remove local properties component/helper definitions. Remove `MessageSquare` and `DocumentProperty`/`Tag` imports if they are no longer used directly in `components/document-editor.tsx`.

- [ ] **Step 3: Run editor focused test and typecheck**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx
pnpm exec tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 4: Confirm editor file length reduction**

Run:

```bash
wc -l components/document-editor.tsx components/document-editor/*.tsx components/document-editor/*.ts
```

Expected: `components/document-editor.tsx` is substantially below its starting size of 1102 lines.

- [ ] **Step 5: Commit**

```bash
git add components/document-editor.tsx components/document-editor/document-properties.tsx
git commit -m "refactor: extract document properties"
```

## Task 5: Extract Navigation Types, Favorites, And Tree Helpers

**Files:**
- Create: `components/document-navigation/types.ts`
- Create: `components/document-navigation/favorites.ts`
- Create: `components/document-navigation/tree.ts`
- Modify: `components/document-navigation.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Create navigation types**

Create `components/document-navigation/types.ts`:

```ts
import type { DocumentListItem, FolderListItem } from "@/components/document-list";

export type FavoriteState = { documents: string[]; folders: string[] };

export type RenameFolderResult = { folderId: string; error?: string };
export type ArchiveFolderResult = { folderId: string; error?: string };
export type ArchiveDocumentResult = { documentId: string };

export type OpenMenuHandler = (menuId: string | null) => void;
export type ToggleFavoriteDocumentHandler = (documentId: string) => void;
export type ToggleFavoriteFolderHandler = (folderId: string) => void;
export type OpenDocumentInNewTabHandler = (document: DocumentListItem) => void;
export type ArchiveDocumentAction = (formData: FormData) => Promise<void>;

export type TreeRow =
  | { kind: "folder"; folder: FolderListItem }
  | { kind: "document"; document: DocumentListItem };
```

- [ ] **Step 2: Create favorites helper module**

Create `components/document-navigation/favorites.ts`:

```ts
import type { FavoriteState } from "@/components/document-navigation/types";

export const emptyFavorites: FavoriteState = { documents: [], folders: [] };

export function parseFavorites(raw: string | null): FavoriteState {
  if (!raw) return emptyFavorites;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return { documents: parsed.filter(isString), folders: [] };
    if (!parsed || typeof parsed !== "object") return emptyFavorites;

    const value = parsed as Partial<Record<keyof FavoriteState, unknown>>;
    return {
      documents: Array.isArray(value.documents) ? value.documents.filter(isString) : [],
      folders: Array.isArray(value.folders) ? value.folders.filter(isString) : [],
    };
  } catch {
    return emptyFavorites;
  }
}

export function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
```

- [ ] **Step 3: Create tree helper module**

Create `components/document-navigation/tree.ts`:

```ts
import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import type { TreeRow } from "@/components/document-navigation/types";

export function buildTreeItems(
  folders: FolderListItem[],
  documents: DocumentListItem[],
  parentFolderId: string | null,
): TreeRow[] {
  return [
    ...folders
      .filter((folder) => folder.parentFolderId === parentFolderId)
      .map((folder) => ({ kind: "folder" as const, folder })),
    ...documents
      .filter((document) => document.folderId === parentFolderId)
      .map((document) => ({ kind: "document" as const, document })),
  ].sort((left, right) => {
    const leftPath = left.kind === "folder" ? left.folder.path : left.document.path;
    const rightPath = right.kind === "folder" ? right.folder.path : right.document.path;
    return leftPath.localeCompare(rightPath);
  });
}

export function hasTreeChildren(
  folders: FolderListItem[],
  documents: DocumentListItem[],
  folderId: string,
) {
  return (
    folders.some((folder) => folder.parentFolderId === folderId) ||
    documents.some((document) => document.folderId === folderId)
  );
}
```

- [ ] **Step 4: Update `DocumentNavigation` imports**

In `components/document-navigation.tsx`, import:

```ts
import { emptyFavorites, parseFavorites, toggleListValue } from "@/components/document-navigation/favorites";
import { buildTreeItems, hasTreeChildren } from "@/components/document-navigation/tree";
import type {
  ArchiveDocumentResult,
  ArchiveFolderResult,
  FavoriteState,
  RenameFolderResult,
} from "@/components/document-navigation/types";
```

Remove local definitions for the moved types/helpers.

- [ ] **Step 5: Run navigation focused test**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/document-navigation.tsx components/document-navigation/types.ts components/document-navigation/favorites.ts components/document-navigation/tree.ts
git commit -m "refactor: extract navigation helpers"
```

## Task 6: Extract Document Row, Folder Row, And Document Section

**Files:**
- Create: `components/document-navigation/document-row.tsx`
- Create: `components/document-navigation/folder-row.tsx`
- Create: `components/document-navigation/document-section.tsx`
- Modify: `components/document-navigation.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Create document row module**

Create `components/document-navigation/document-row.tsx` by moving `DocumentLinkRow` from `components/document-navigation.tsx`.

Use these imports:

```tsx
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { DocumentListItem } from "@/components/document-list";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
} from "@/components/document-navigation/types";
import { documentDisplayLabel } from "@/lib/workspace-tree";
import { workspaceDocumentHref } from "@/lib/workspace-routes";
```

Export `DocumentLinkRow` with the same props and body as the current local function.

- [ ] **Step 2: Create folder row module**

Create `components/document-navigation/folder-row.tsx` by moving `FavoriteFolderRow`, `FolderToggleRow`, and `folderDisplayLabel()` from `components/document-navigation.tsx`.

Use these imports:

```tsx
import Link from "next/link";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import type { FolderListItem } from "@/components/document-list";
import type { OpenMenuHandler, ToggleFavoriteFolderHandler } from "@/components/document-navigation/types";
```

Export `FavoriteFolderRow` and `FolderToggleRow` with the same props and body as the current local functions.

- [ ] **Step 3: Create document section module**

Create `components/document-navigation/document-section.tsx`:

```tsx
import type { DocumentListItem } from "@/components/document-list";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
} from "@/components/document-navigation/types";

export const sectionHeadingClassName =
  "mb-2 text-[0.68rem] font-medium uppercase tracking-wide text-slate-500";

export function DocumentSection({
  title,
  workspaceSlug,
  documents,
  menuScope,
  favoriteDocumentIds,
  selectedDocumentId,
  openMenuId,
  onOpenMenu,
  onToggleFavorite,
  onOpenInNewTab,
  archiveDocumentAction,
}: {
  title: string;
  workspaceSlug: string;
  documents: DocumentListItem[];
  menuScope: string;
  favoriteDocumentIds: Set<string>;
  selectedDocumentId: string | null;
  openMenuId: string | null;
  onOpenMenu: OpenMenuHandler;
  onToggleFavorite: ToggleFavoriteDocumentHandler;
  onOpenInNewTab: OpenDocumentInNewTabHandler;
  archiveDocumentAction: ArchiveDocumentAction;
}) {
  return (
    <section className="mb-4">
      <p className={sectionHeadingClassName}>{title}</p>
      <div className="space-y-1">
        {documents.map((document) => (
          <DocumentLinkRow
            key={`${title}-${document.id}`}
            rowId={`${menuScope}:${document.id}`}
            workspaceSlug={workspaceSlug}
            document={document}
            isFavorite={favoriteDocumentIds.has(document.id)}
            selected={document.id === selectedDocumentId}
            openMenuId={openMenuId}
            onOpenMenu={onOpenMenu}
            onToggleFavorite={onToggleFavorite}
            onOpenInNewTab={onOpenInNewTab}
            archiveDocumentAction={archiveDocumentAction}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Update `DocumentNavigation` imports and remove local row definitions**

In `components/document-navigation.tsx`, import:

```ts
import { DocumentSection, sectionHeadingClassName } from "@/components/document-navigation/document-section";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import { FavoriteFolderRow, FolderToggleRow } from "@/components/document-navigation/folder-row";
```

Remove local `DocumentLinkRow`, `FavoriteFolderRow`, `FolderToggleRow`, `DocumentSection`, and `folderDisplayLabel()` definitions. Remove `Link`, `ChevronDown`, `ChevronRight`, `MoreHorizontal`, `Plus`, `documentDisplayLabel`, and `workspaceDocumentHref` imports if no longer used by the container.

- [ ] **Step 5: Run navigation focused test and typecheck**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
pnpm exec tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add components/document-navigation.tsx components/document-navigation/document-row.tsx components/document-navigation/folder-row.tsx components/document-navigation/document-section.tsx
git commit -m "refactor: extract navigation rows"
```

## Task 7: Extract Search And Favorites Panels

**Files:**
- Create: `components/document-navigation/search-panel.tsx`
- Create: `components/document-navigation/favorites-panel.tsx`
- Modify: `components/document-navigation.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Create search panel module**

Create `components/document-navigation/search-panel.tsx` by moving `SearchPanel` and `SearchResultRow` from `components/document-navigation.tsx`.

Use these imports:

```tsx
import type { DocumentListItem } from "@/components/document-list";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
} from "@/components/document-navigation/types";
```

Export `SearchPanel` with the same props and body as the current local function.

- [ ] **Step 2: Create favorites panel module**

Create `components/document-navigation/favorites-panel.tsx` by moving `FavoriteSection` from `components/document-navigation.tsx`.

Use these imports:

```tsx
import type { DocumentListItem, FolderListItem } from "@/components/document-list";
import { DocumentLinkRow } from "@/components/document-navigation/document-row";
import { FavoriteFolderRow } from "@/components/document-navigation/folder-row";
import { sectionHeadingClassName } from "@/components/document-navigation/document-section";
import type {
  ArchiveDocumentAction,
  OpenDocumentInNewTabHandler,
  OpenMenuHandler,
  ToggleFavoriteDocumentHandler,
  ToggleFavoriteFolderHandler,
} from "@/components/document-navigation/types";
```

Export `FavoriteSection` with the same props and body as the current local function.

- [ ] **Step 3: Update `DocumentNavigation`**

In `components/document-navigation.tsx`, import:

```ts
import { FavoriteSection } from "@/components/document-navigation/favorites-panel";
import { SearchPanel } from "@/components/document-navigation/search-panel";
```

Remove local `SearchPanel`, `SearchResultRow`, and `FavoriteSection` definitions.

- [ ] **Step 4: Run navigation focused test and typecheck**

Run:

```bash
pnpm exec vitest run tests/components/document-list.test.tsx
pnpm exec tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 5: Confirm navigation file length reduction**

Run:

```bash
wc -l components/document-navigation.tsx components/document-navigation/*.tsx components/document-navigation/*.ts
```

Expected: `components/document-navigation.tsx` is substantially below its starting size of 979 lines.

- [ ] **Step 6: Commit**

```bash
git add components/document-navigation.tsx components/document-navigation/search-panel.tsx components/document-navigation/favorites-panel.tsx
git commit -m "refactor: extract navigation panels"
```

## Task 8: Final Verification, Wiki Maintenance, And PR

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`
- Possibly modify: `wiki/index.md` if navigation/status wording needs a new link or status update.

- [ ] **Step 1: Run focused regression suite**

Run:

```bash
pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/document-list.test.tsx tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/wiki-links/preview.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Update wiki with final implemented layout**

In `wiki/Document Editing Workflow.md`, add a short paragraph under `## UI 세부 사항` or `## 근거`:

```md
Issue #48 이후 editor와 navigation source는 동작을 유지한 채 feature-local module로 분리되었다. `components/document-editor.tsx`는 `DocumentEditor` entrypoint와 editor state/orchestration을 맡고, `components/document-editor/` 아래의 `markdown-preview.tsx`, `document-properties.tsx`, `folding-storage.ts`, `preview-markdown.ts`, `wiki-link-suggestions.tsx`, `types.ts`가 preview, properties, folding, suggestion UI를 나눠 맡는다. `components/document-navigation.tsx`는 `DocumentNavigation` entrypoint와 container state/orchestration을 맡고, `components/document-navigation/` 아래의 panel, row, tree, favorites module이 sidebar rendering과 순수 helper를 나눠 맡는다.
```

In `wiki/log.md`, prepend:

```md
## 2026-05-17T18:30:00+09:00 - implementation

- Result: Issue #48에서 `DocumentEditor`와 `DocumentNavigation`의 동작을 유지하면서 큰 component 파일을 feature-local module로 분리했다.
- Coverage: editor preview/folding/properties/suggestion UI와 navigation panel/row/tree/favorites helper를 하위 module로 나누고, public entrypoint component, route shape, localStorage key, server action contract는 유지했다.
- Pages: [[Document Editing Workflow]], [[log|Wiki Log]].
- Source evidence: GitHub issue #48, `docs/superpowers/specs/2026-05-17-document-editor-navigation-refactor-design.md`, `docs/superpowers/plans/2026-05-17-document-editor-navigation-refactor.md`, `components/document-editor.tsx`, `components/document-editor/*`, `components/document-navigation.tsx`, `components/document-navigation/*`.
- Verification: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/document-list.test.tsx tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/wiki-links/preview.test.ts`, `pnpm exec tsc --noEmit`.
```

- [ ] **Step 4: Run wiki commands**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: all PASS after source and wiki files are staged.

- [ ] **Step 5: Commit implementation and wiki updates**

```bash
git add components/document-editor.tsx components/document-editor components/document-navigation.tsx components/document-navigation wiki/Document\ Editing\ Workflow.md wiki/log.md wiki/manifest.json docs/superpowers/plans/2026-05-17-document-editor-navigation-refactor.md
git commit -m "refactor: split editor and navigation components"
```

- [ ] **Step 6: Push branch**

Run:

```bash
git push -u origin issue-48-refactor-document-editor-and-navigation-components
```

Expected: branch pushes successfully.

- [ ] **Step 7: Create PR**

Run:

```bash
gh pr create --draft --title "[codex] Refactor document editor and navigation components" --body "## Summary
- split DocumentEditor preview, folding, properties, and suggestion UI into feature-local modules
- split DocumentNavigation panels, rows, tree, and favorites helpers into feature-local modules
- update wiki documentation for the new source layout

## Tests
- pnpm exec vitest run tests/components/document-editor-preview.test.tsx tests/components/document-list.test.tsx tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/wiki-links/preview.test.ts
- pnpm exec tsc --noEmit
- pnpm wiki:manifest
- pnpm wiki:lint
- pnpm wiki:sync-check --staged"
```

Expected: PR URL is printed.

- [ ] **Step 8: Mark ready and start review workflow**

Run:

```bash
gh pr ready
```

Expected: PR is ready for review.

- [ ] **Step 9: Wait 5 minutes, then check review and CI**

Wait at least 5 minutes. Then run:

```bash
gh pr checks
gh pr view --json reviewDecision,mergeStateStatus,statusCheckRollup,url
python3 /Users/andrewchoi/.codex/plugins/cache/openai-curated/github/dc902811/skills/gh-address-comments/scripts/fetch_comments.py --repo dschoi30/munjib --pr <PR_NUMBER>
```

Expected: no failing checks and no unresolved actionable review comments. If there is actionable feedback, fix it on the same branch and repeat verification, commit, push, and review checks.

## Self-Review

- Spec coverage: The plan covers editor split, navigation split, behavior preservation, test coverage, wiki updates, and PR review workflow from the approved spec.
- Red-flag scan: No banned tokens or unspecified implementation steps remain.
- Type consistency: Shared editor and navigation types are defined before later tasks reference them. Row/panel handler type names are stable across tasks.
