---
title: Cascade Folder Trash Confirmation
date: 2026-06-05
issue: 92
status: approved
---

# Cascade Folder Trash Confirmation

## Context

Folder trash currently protects users from accidental broad deletion by rejecting
non-empty folders. `archiveFolder()` checks only active direct child folders and
documents, then returns `FOLDER_NOT_EMPTY` through the workspace server action so
the sidebar can show a toast.

The requested behavior is to let users delete a folder and all of its descendant
folders and documents after an explicit confirmation. The existing model is soft
delete, not physical delete: folders and documents move to `ARCHIVED` status and
drop out of the active workspace tree.

## Goals

- Keep folder trash as a soft-delete archive operation.
- Preserve the current non-empty-folder guard unless the request explicitly opts
  into cascade archive.
- Show a stronger confirmation when a folder contains descendant folders or
  documents.
- Archive the target folder, all active descendant folders, and all active
  documents inside that subtree in one transaction.
- Navigate away from any selected folder or document that was archived.
- Add focused service, server-action, component, and e2e coverage.

## Non-Goals

- Do not physically delete folders, documents, versions, comments, attachments,
  metadata, wiki links, or RAG chunks.
- Do not add restore UI or recursive restore semantics in this slice.
- Do not replace the existing native `window.confirm` pattern with a custom
  modal.
- Do not introduce folder-specific ACL inheritance.
- Do not change document-level trash behavior.

## Proposed Design

### Sidebar Confirmation

`DocumentNavigation` will compute subtree counts from the active `folders` and
`documents` props. For each folder row, it can derive:

- descendant active folder count
- descendant active document count
- whether the current selected folder is inside that subtree
- whether the current selected document belongs to that subtree

`FolderToggleRow` will keep its existing `Move to trash` menu item and native
confirm. Empty folders use the current confirm copy and submit only `folderId`.
Non-empty folders use destructive cascade copy that includes the descendant
counts, then submit `folderId` plus `cascade=true` only if the user confirms.

The counts are for user comprehension only. They are not a security or data
integrity boundary.

### Server Action Contract

`archiveFolderAction()` will read `cascade` from `FormData` and pass it to
`archiveFolder()`. It will keep returning `{ folderId, error:
"FOLDER_NOT_EMPTY" }` only when the service rejects a non-empty folder without a
cascade opt-in.

Unexpected errors and permission failures continue to throw so existing error
handling semantics remain intact.

### Recursive Archive Service

`ArchiveFolderInput` will gain an optional `cascade?: boolean` flag.

When `cascade` is false or absent, `archiveFolder()` keeps the existing behavior:
if the active folder has active direct child folders or active direct documents,
throw `FOLDER_NOT_EMPTY`.

When `cascade` is true, the service will calculate the complete active
descendant subtree inside the same workspace. The transaction will set
`status=ARCHIVED`, `archivedAt`, and `updatedById` for:

- all active documents whose `folderId` is the target folder or any active
  descendant folder
- all active descendant folders
- the target folder

The service will record one audit log for the target folder archive. Cascade
archives will include `descendantFolderCount` and `descendantDocumentCount` in
that target folder's `folder.archived` metadata. This avoids creating a large
audit-log burst for every descendant row.

### Navigation After Archive

After a successful archive, `DocumentNavigation` will navigate to the workspace
root when the currently selected folder is the target or a descendant, or when
the currently selected document is in the archived subtree. Otherwise, it will
refresh the current route.

The workspace page already loads only active folders and documents, so archived
items disappear from the sidebar and any selected archived target becomes stale
on refresh.

### Data And Indexing

This feature does not delete supporting records. Archived documents keep their
versions, metadata, tags, links, chunks, comments, and attachments. Active
workspace document queries already exclude archived documents, and Ask AI builds
retrieval scopes from active readable documents, so archived descendants should
not be retrieved through normal workspace flows.

If stale chunk cleanup becomes necessary, it should be handled as a separate
storage-maintenance feature rather than part of folder trash.

## Tests

- `tests/folders/service.test.ts`: preserve the default non-empty rejection;
  add recursive archive coverage for nested folders and documents; verify
  unrelated workspace rows and already archived rows are not affected.
- `tests/workspace-actions.test.ts`: verify `cascade=true` is passed through and
  that `FOLDER_NOT_EMPTY` remains a returned action error for non-cascade calls.
- `tests/components/document-list.test.tsx`: verify empty-folder confirm submits
  without cascade, non-empty confirm includes descendant counts and submits
  cascade, cancel prevents submission, and selected archived descendants route
  to workspace root.
- `tests/e2e/login.spec.ts`: replace the old non-empty-folder toast expectation
  with confirmation-driven recursive trash behavior.

## Wiki Updates

Update `wiki/Folder Hierarchy Model.md` so its archive policy no longer says
recursive archive is only a follow-up. Add this design to `wiki/log.md`, refresh
`wiki/index.md` status text with the Issue #92 design, then regenerate
`wiki/manifest.json`.
