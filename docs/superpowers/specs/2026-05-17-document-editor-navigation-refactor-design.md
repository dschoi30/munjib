# Document Editor And Navigation Refactor Design

## Context

`components/document-editor.tsx` and `components/document-navigation.tsx` have grown to roughly one thousand lines each. Both files now combine container state, UI composition, nested rows, localStorage helpers, markdown preview behavior, and small pure utilities. The goal of this refactor is to reduce file size and make future editor/navigation work easier without changing user-visible behavior.

This work tracks GitHub issue #48.

## Goals

- Preserve existing editor, preview, outline, folding, wiki-link, properties, sidebar, favorites, search, folder, and row-menu behavior.
- Keep the exported `DocumentEditor` and `DocumentNavigation` component APIs stable for their current callers.
- Split large files along existing responsibility boundaries instead of redesigning state flow.
- Extract pure helpers where that improves readability or testability.
- Avoid creating tiny utility files that imply a broader abstraction than the code needs.

## Non-Goals

- Do not redesign the document editor UI.
- Do not change route shape, localStorage key names, server action contracts, or database behavior.
- Do not introduce a reducer/state machine for navigation state in this slice.
- Do not move component-local logic into global `lib/` modules unless it is already shared or clearly reusable.

## Document Editor Split

`components/document-editor.tsx` remains the container and public entrypoint. It keeps document-level state, save form wiring, CodeMirror lifecycle wiring, outline context registration, and mode-based editor/preview switching.

Extracted modules:

- `components/document-editor/markdown-preview.tsx` owns `MarkdownPreview` and recursive preview section rendering.
- `components/document-editor/document-properties.tsx` owns document property rows, tags, links, broken-link creation controls, and comments.
- `components/document-editor/wiki-link-suggestions.tsx` owns the small autocomplete suggestion popover UI only. Completion detection and candidate calculation stay near the editor state unless a later pass needs a hook.
- `components/document-editor/folding-storage.ts` owns heading fold localStorage read/write and CodeMirror folded-range persistence helpers.
- `components/document-editor/preview-markdown.ts` owns preview markdown chunk helpers, soft-line-break remark transform, shared definition extraction, and markdown inline plain-text conversion used by preview headings.

The split keeps preview/folding behavior local to the editor feature while making the top-level editor file readable.

## Document Navigation Split

`components/document-navigation.tsx` remains the container and public entrypoint. It keeps panel selection inputs, router transition behavior, favorites state, row menu state, rename state, expanded folder state, global keyboard handling, outside-click menu closing, and folder error toast policy.

Extracted modules:

- `components/document-navigation/search-panel.tsx` owns search panel rendering and search result rows.
- `components/document-navigation/favorites-panel.tsx` owns favorite folder/document panel rendering.
- `components/document-navigation/document-section.tsx` owns reusable document sections such as Recents.
- `components/document-navigation/document-row.tsx` owns document row rendering and document row action menu.
- `components/document-navigation/folder-row.tsx` owns folder toggle rows, inline rename form, folder row action menu, and favorite folder rows.
- `components/document-navigation/tree.ts` owns `buildTreeItems()` and `hasTreeChildren()`.
- `components/document-navigation/favorites.ts` owns `parseFavorites()` and list toggle helpers.

Folder error text and toast styling remain in the container file because they are small navigation UI policy, not a reusable error layer.

## Behavior Preservation

The refactor must preserve:

- `munjib:heading-folds:<documentId>` fold state shared between edit and preview mode.
- Preview frontmatter stripping, wiki-link rendering, soft line breaks, reference definitions, and folding.
- Live outline registration from unsaved editor markdown.
- CodeMirror paste conversion from rich HTML to Markdown.
- Workspace-scoped favorites stored at `munjib:favorites:<workspaceSlug>`.
- `Ctrl+K` search opening and `Escape` returning search/favorites to document list.
- Row action menu closing on outside click.
- Folder rename, folder archive, document archive, and open-in-new-tab behavior.
- Current `?document=<id>` and `?folder=<id>` navigation behavior.

## Testing

Use existing focused coverage as the main guardrail:

- `pnpm exec vitest run tests/components/document-editor-preview.test.tsx`
- `pnpm exec vitest run tests/components/document-list.test.tsx`
- `pnpm exec vitest run tests/markdown/outline.test.ts tests/markdown/folding.test.ts tests/wiki-links/preview.test.ts`
- `pnpm exec tsc --noEmit`

If a pure helper becomes more independently exposed during extraction and existing tests do not cover it, add minimal tests for that helper. Do not add broad snapshot tests for unchanged UI.

## Wiki Impact

This is a structural refactor with no intended durable behavior change. The wiki should still record issue #48, affected files, and the new source layout in `wiki/Document Editing Workflow.md` and `wiki/log.md`. `wiki/index.md` and `wiki/manifest.json` should be updated if wiki navigation or manifest output changes.

## Rollout Plan

1. Extract `DocumentEditor` preview/folding/property submodules while keeping imports internal to the component feature.
2. Run editor-focused tests and typecheck enough to catch import/type drift.
3. Extract `DocumentNavigation` panel, row, tree, and favorites modules.
4. Run navigation-focused tests and typecheck.
5. Update wiki maintenance files.
6. Run repository wiki sync commands before commit.

## Risks

- Preview heading folding and outline navigation are coupled through DOM targets and localStorage keys, so extraction must preserve function signatures and call order.
- Navigation row menus rely on shared `openMenuId` naming conventions. Splitting rows must keep row IDs stable.
- Moving small helpers too aggressively would increase file count without improving maintainability. The design intentionally keeps small policy such as folder error toasts in the container.
