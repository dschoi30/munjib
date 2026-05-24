# Markdown Import Progress Panel Design

## Context

Issue #58 refines the multiple Markdown import flow introduced by issue #55.
The current settings Import panel supports selecting multiple Markdown files,
choosing a destination folder, and importing them through the Markdown import
server action.

The next iteration changes how selected files and progress are presented. The
existing settings panel should stay focused on choosing files and the import
destination. The file table should not be shown below the existing form. Instead,
starting an import opens a dedicated progress panel that shows import progress
at the top and the file table below it.

The current progress model also needs improvement. The UI submits all selected
files in one batch and updates every row only after the batch server action
returns. For slow imports, dropped connections, or larger selections, the user
cannot tell which file is currently being processed or how many files have
already completed.

## Goals

- Keep the existing settings Import panel compact.
- Do not render the selected-file table inside the existing settings form.
- Open a separate Markdown import progress panel when import starts.
- Place the progress summary at the top of the new panel.
- Place the selected-file table below the progress summary.
- Use the existing icon-only `X` close button pattern instead of a text `Close`
  button.
- Show per-file progress during import, not only after the full batch completes.
- Continue importing remaining queued files when one file fails.
- Preserve the current route after import and refresh the document list when
  documents are created.

## Non-Goals

- Directory import, ZIP import, drag-and-drop folder traversal, or preserving a
  local folder hierarchy.
- Markdown image rewriting or attachment upload during Markdown import.
- Backend jobs, polling, streaming responses, resumable imports, or persistent
  import history.
- Global toaster placement changes.
- A multi-step import wizard.

## User Experience

The existing settings Import panel remains the entry point. It contains:

1. The dashed Markdown file picker area.
2. The bordered destination path control.
3. The narrower `Import Markdown` button.

After file selection, the settings panel can show a compact selected count in
the picker area, but it should not render the full file table. The full file
list belongs to the progress panel.

When the user clicks `Import Markdown`, the app opens a dedicated Markdown
import progress panel. The implementation may reuse the existing modal shell,
but the import run must be presented as a distinct progress panel rather than as
a table attached to the selection form.

The progress panel top area shows:

- Title such as `Importing files`.
- Destination path.
- Completed count over total count, for example `Importing 2 / 10`.
- A progress bar.
- Current file name while a file is in flight.
- Final success or failure summary when the run completes.

The progress panel bottom area shows a table with stable columns:

- File name
- Size
- Status

Status values are:

- `Ready`: files selected before import starts.
- `Queued`: files waiting while another file imports.
- `Importing`: the active file request is in flight.
- `Imported`: the file created a document.
- `Failed`: the file failed validation, creation, or request handling.

The panel uses the same icon-only `X` button pattern already used by
`WorkspaceSettingsPanel` for dismissal. The button has an accessible label, such
as `Close import progress`.

## Recommended Approach

Use a client-side sequential per-file import loop.

The panel calls the existing `importMarkdownAction` once per selected file. Each
call sends exactly one file under the existing `markdownFiles` field and includes
`folderId` when a destination folder is selected. The server action can keep its
current batch contract because one-file batches are valid.

The UI marks only the active file as `Importing`. Rows that have not started are
`Queued`; completed rows become `Imported` or `Failed`. The progress summary
updates after each file completes. This gives the user observable progress
without adding backend job state.

This approach is preferred over server-side jobs or streaming for this
iteration. Markdown import currently creates documents and returns quickly per
file; a job system would add durable state, polling endpoints, cleanup behavior,
and more authorization surface than the feature currently needs.

## Client Data Flow

`WorkspaceSettingsPanel` continues to own file selection and destination
selection before import starts. When the user submits:

1. Snapshot the selected files and destination.
2. Open the Markdown import progress panel with those rows.
3. Disable or hide the file selection form while the import run is active.
4. Mark the first row `Importing` and remaining rows `Queued`.
5. For each row in order:
   - Build a fresh `FormData`.
   - Append that row's file under `markdownFiles`.
   - Append `folderId` only when a non-root destination is selected.
   - Await `importMarkdownAction(formData)`.
   - Mark the row `Imported` if the one-file result has an imported item.
   - Mark the row `Failed` if the one-file result has a failed item or throws.
   - Update completed count, current file, progress bar, and summary text.
6. After the loop completes, call `router.refresh()` once if any file imported
   successfully.
7. Keep the progress panel open so the user can inspect the final table.

The import loop should operate on the submit-time snapshot. Selecting a new set
of files later starts a new run instead of mutating the active run.

## Layout And Scrolling

The progress panel should be height constrained relative to the viewport. Its
top progress summary stays visible above the table. The table area below should
scroll when many files are present, so rows do not overflow outside the modal.

The existing settings modal shell can keep its two-column settings navigation if
that matches the current architecture, but the progress panel content must read
as a distinct import-run panel rather than as another table attached to the
selection form.

## Error Handling

Per-file failures do not abort remaining queued files. Empty files, unsupported
files, service failures, and request-level exceptions mark only the active row as
`Failed`.

If the browser page unloads, the network connection drops, or the user closes
the panel during import, already completed server action calls may have created
documents, but queued files that were not called are not imported. This is
acceptable for this iteration because the design does not include persistent
jobs or resume behavior.

If the user closes the progress panel while import is running, the UI should
avoid starting a second import run with the same rows. The simplest acceptable
behavior is to disable close while importing or confirm/ignore close until the
loop finishes. The implementation plan should choose the smaller option that
fits existing component patterns.

## Server Action Contract

`importMarkdownDocumentAction()` can keep the issue #55 contract:

```ts
type MarkdownImportActionResult = {
  documentIds: string[];
  imported: Array<{ fileName: string; documentId: string }>;
  failed: Array<{ fileName: string; error: string }>;
};
```

The interactive UI will call it with one Markdown file at a time. Repeated
`markdownFiles` support remains useful for compatibility and action tests.

Because the UI calls the action once per file, server-side `revalidatePath()` may
run once per imported file. The client should still call `router.refresh()` once
after the run completes. If revalidation becomes too costly for large imports, a
future task can introduce a dedicated single-file action or backend import job.

## Accessibility

- The hidden file input keeps an accessible label.
- The dashed picker remains keyboard operable.
- The destination path button keeps an accessible name that includes the current
  path.
- The progress panel has a dialog or panel label that describes the import run.
- The icon-only `X` button has an accessible label.
- The selected-file table has an accessible name.
- The progress summary uses a polite live region for count and completion
  changes.
- Row status text changes are reflected in the DOM.
- Import controls are disabled while the sequential loop is active.

## Testing

Component tests should cover:

- The existing settings Import form does not render the full file table.
- Starting import opens the dedicated progress panel.
- The progress summary is above the file table.
- The progress panel close control is an icon-only `X` button with an accessible
  label.
- Starting import sets the first row to `Importing` and remaining rows to
  `Queued`.
- Each per-file action result updates only that row.
- A failed row does not stop later queued files from importing.
- The progress summary updates completed/total counts during the loop.
- Final summary text reports full success, partial failure, and total failure.
- The import action receives one file per call and preserves `folderId`.
- `router.refresh()` is called once after at least one successful import.

Server action tests from issue #55 remain valid because the action contract does
not change.

## Open Decisions Resolved

- The full import table is shown in a new progress panel, not under the existing
  settings form.
- Progress summary is placed above the table.
- The progress panel uses the existing icon-only `X` close button pattern.
- Progress uses client-side sequential per-file imports for this iteration.
- Backend jobs, polling, and streaming progress are deferred.
