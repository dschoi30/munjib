# Markdown Document Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings dialog and import one Markdown file into the current workspace.

**Architecture:** Keep the settings dialog as client UI under `DocumentList`, and keep import persistence on the server-action path. Title parsing lives in a small pure helper so the UI and persistence changes stay testable.

**Tech Stack:** Next.js App Router, React client components, server actions, Prisma-backed document service, Vitest, Testing Library.

---

### Task 1: Markdown Import Title Helper

**Files:**
- Create: `lib/documents/import-markdown.ts`
- Test: `tests/documents/import-markdown.test.ts`

- [ ] Write tests for title derivation from frontmatter, first ATX heading, and filename.
- [ ] Run `pnpm exec vitest run tests/documents/import-markdown.test.ts` and confirm the helper is missing.
- [ ] Implement `deriveMarkdownImportTitle({ fileName, contentMarkdown })`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Settings Dialog UI

**Files:**
- Modify: `components/document-list.tsx`
- Modify: `tests/components/document-list.test.tsx`

- [ ] Add failing tests for the settings button, settings dialog open/close, selected `Import` menu, document-list preservation behind the dialog, Markdown file input, and disabled submit for read-only users.
- [ ] Run `pnpm exec vitest run tests/components/document-list.test.tsx` and confirm the new tests fail because settings UI is absent.
- [ ] Add the settings icon to the `Company Handbook` title row with right alignment matching the toolbar icon row.
- [ ] Add settings dialog state and render a two-column dialog with a left settings sidebar and right import content.
- [ ] Re-run the focused component test and confirm it passes.

### Task 3: Server Action Wiring

**Files:**
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `components/document-list.tsx`
- Modify: `lib/service-errors.ts`

- [ ] Add `SERVICE_ERROR_CODES.MARKDOWN_IMPORT_FILE_REQUIRED` and `SERVICE_ERROR_CODES.MARKDOWN_IMPORT_UNSUPPORTED_FILE`.
- [ ] Add `importMarkdownDocumentAction(workspaceSlug, formData)` that validates the uploaded Markdown file with those shared error codes and calls `createDocument()`.
- [ ] Pass the bound action from the workspace page into `DocumentList`.
- [ ] Wire the settings dialog import form to the action.
- [ ] Run focused tests again to confirm type and UI contracts.

### Task 4: Wiki Maintenance And Verification

**Files:**
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/index.md` if navigation text needs an import mention.
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

- [ ] Update wiki pages with the durable Markdown import workflow.
- [ ] Run `pnpm wiki:manifest`.
- [ ] Run `pnpm wiki:lint`.
- [ ] Run `pnpm exec vitest run tests/documents/import-markdown.test.ts tests/components/document-list.test.tsx`.
- [ ] Run `pnpm exec tsc --noEmit`.
- [ ] Stage changes and run `pnpm wiki:sync-plan --staged` and `pnpm wiki:sync-check --staged`.
