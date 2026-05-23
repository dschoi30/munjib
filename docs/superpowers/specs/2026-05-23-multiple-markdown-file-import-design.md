# Multiple Markdown File Import Design

## Context

Issue #55 expands the workspace settings Import flow from a single Markdown file to multiple Markdown files. The current flow lives in `components/document-list.tsx`: a settings dialog contains a form with one visible file input, submits `markdownFile` to `importMarkdownDocumentAction()`, receives `{ documentId }`, closes the dialog, and navigates to the imported document with `router.push()`.

The new behavior keeps the user on the current document after import. The settings panel becomes the place where file selection, selected-file review, import progress, completion, and failure feedback are visible.

## Goals

- Allow selecting more than one `.md` or `.markdown` file in the Import form.
- Hide the browser-default file input styling.
- Let the user click anywhere in the existing import form area to open the file picker.
- Show the selected files in a compact table inside the existing form area.
- Keep the current workspace route/document selection after import.
- Show import progress, completion, and failure feedback as a toast-like message centered inside the settings panel.
- Keep server-side Markdown validation and document creation aligned with the existing single-file import behavior.

## Non-Goals

- Folder import, directory traversal, ZIP import, or preserving local folder hierarchy.
- Importing image files or rewriting Markdown image references.
- New global toast placement or changing existing editor paste/upload toasts.
- A multi-step import wizard.

## User Experience

The Import panel keeps its current modal shell and Import menu selection. The current dashed file area remains the main target, but the native file input is visually hidden. Clicking the dashed area or any empty space in the form opens the file picker.

Before selection, the area shows a concise empty state: Markdown files can be selected or dropped by clicking the area. After selection, the same area shows a table with one row per selected file. Columns are:

- File name
- Size
- Status

Status starts as `Ready`, changes to `Importing` while the request is pending, then becomes `Imported` or `Failed` when the action resolves. The submit button is disabled while import is pending or when no files are selected.

Import completion does not call `router.push()`. The settings panel remains open so the user can read the result and selected-file statuses. The client refreshes the workspace data after successful document creation so the document list can include newly imported documents without changing the active document.

## Panel-Centered Toast

The feature uses a local panel-centered status message instead of changing the global Sonner toaster position. This avoids affecting editor image paste and attachment upload toasts, which currently use the global bottom-center toaster.

The local message appears above the Import form content and is visually centered within the settings panel content area. It has three states:

- Progress: `Importing 2 files...`
- Success: `Imported 2 Markdown files.`
- Error or partial failure: `Imported 1 file. 1 file failed.`

The message is state-driven React UI, not a separate global toaster. It should be dismissible only by selecting new files, retrying, closing the panel, or waiting for the next import state change.

## Server Action Contract

`importMarkdownDocumentAction()` should accept multiple files through repeated `markdownFiles` form fields. The single-file `markdownFile` field can remain supported for backward compatibility in tests or older callers.

The action returns a batch result:

```ts
type MarkdownImportResult = {
  documentIds: string[];
  imported: Array<{ fileName: string; documentId: string }>;
  failed: Array<{ fileName: string; error: string }>;
};
```

Validation remains per file:

- Missing all files throws `MARKDOWN_IMPORT_FILE_REQUIRED`.
- Unsupported or empty files are reported in `failed`.
- Supported files are imported even if another selected file fails.

The action calls `createDocument()` once per supported file, using the same title derivation and content persistence as the existing import flow. It revalidates the workspace route once after the batch completes.

## Client Data Flow

`WorkspaceSettingsPanel` owns selected files and row statuses.

1. User clicks the import area.
2. Hidden file input opens with `multiple`.
3. `onChange` stores `Array.from(input.files ?? [])`.
4. The selected-file table renders rows as `Ready`.
5. Submit builds a new `FormData` and appends each selected file under `markdownFiles`.
6. The panel sets the toast state to progress and row statuses to `Importing`.
7. The server action returns imported and failed rows.
8. Client maps results back to file names and updates row statuses.
9. Client calls `router.refresh()` and keeps the dialog open.

If the action throws before returning a batch result, all currently importing rows become `Failed`, and the centered message shows a failure summary.

## Error Handling

Partial success is preferred over all-or-nothing import. This is useful when one selected file is empty or has an unsupported extension but the rest are valid Markdown files.

Per-file errors should use existing service error codes where available. The UI can display concise status labels in the table and keep detailed error text out of the row unless needed later. The centered message summarizes the batch outcome.

## Accessibility

- The hidden file input keeps an accessible label.
- The clickable import area has button-like keyboard handling or is backed by a visible label associated with the hidden input.
- The selected-files table has a caption or accessible name.
- The centered status message uses a live region so progress and completion are announced.
- Disabled states should apply to both the input and submit button during pending import.

## Testing

Unit/component tests should cover:

- The file input allows multiple Markdown files and the default input styling is hidden.
- Clicking the form/drop area triggers the hidden file input.
- Selected files render in a table.
- Submitting multiple files calls the import action with repeated `markdownFiles`.
- Successful import does not call `router.push()` and does call `router.refresh()`.
- Progress and completion messages render inside the settings panel.
- Partial failure updates row statuses and shows a failure summary.
- Read-only workspaces disable file selection and import submission.

Action tests should cover:

- Multiple valid Markdown files create multiple documents.
- Mixed valid and unsupported files import valid files and report failures.
- Missing files still throws `MARKDOWN_IMPORT_FILE_REQUIRED`.
- The workspace path is revalidated once per batch.

## Open Decisions Resolved

- Import completion keeps the user on the current document.
- The settings panel stays open after import so the user can read batch status.
- Feedback is panel-centered React UI instead of changing global Sonner placement.
- Partial success is allowed.
