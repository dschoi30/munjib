# Archived Document Retention Purge Settings Design

## Context

Issue #119 adds a workspace setting for automatically hard deleting documents
that have already been moved to trash. Munjib currently models document and
folder trash as soft delete: rows stay in PostgreSQL with
`status = ARCHIVED` and `archivedAt` filled, while normal workspace reads load
only `ACTIVE` documents and folders.

Folder cascade trash can archive a folder subtree, but it still does not
physically delete folders, documents, versions, metadata, comments,
attachments, links, or RAG chunks. This feature starts the retention path by
adding a workspace policy and a separate purge command for archived documents.

## Decisions From Brainstorming

- Store the retention policy in the database, scoped to the workspace.
- Use fixed presets: `Never`, `7 days`, `30 days`, and `90 days`.
- Use `30 days` as the default policy for existing and new workspaces.
- Add a `Retention` section to the existing workspace settings panel.
- Execute hard deletion through a separate CLI/tools command, not during
  ordinary web requests.
- Hard delete archived documents only in this slice.
- Document archived folder hard delete and attachment storage file cleanup as
  follow-up work.

## Goals

- Let workspace writers configure how long trashed documents are retained.
- Keep the retention policy workspace-wide so all users share the same data
  lifecycle.
- Preserve current soft-delete behavior for document and folder trash actions.
- Add a deterministic purge service that deletes only expired archived
  documents.
- Add a CLI command that can run from the local shell, Docker `tools`
  container, cron, or a future scheduled job.
- Support a `--dry-run` mode that reports deletion candidates without deleting
  rows.
- Print workspace-level purge counts for operational visibility.
- Keep the first implementation small and idempotent.

## Non-Goals

- Do not add document restore UI.
- Do not physically delete archived folders in this slice.
- Do not delete local or Docker attachment files from `storage/attachments/` in
  this slice.
- Do not run purge work from workspace page render, settings save, or other
  request lifecycle paths.
- Do not introduce a durable job queue, retry table, or scheduler daemon.
- Do not add per-document or per-folder retention overrides.
- Do not change RAG indexing behavior for active documents.

## Data Model

Add a retention policy to `Workspace` as a Prisma enum:

```prisma
enum ArchivedDocumentRetentionPolicy {
  NEVER
  DAYS_7
  DAYS_30
  DAYS_90
}

model Workspace {
  archivedDocumentRetentionPolicy ArchivedDocumentRetentionPolicy @default(DAYS_30)
}
```

The enum keeps allowed values explicit and avoids accepting arbitrary day
counts from the browser. The default is `DAYS_30`, so existing rows receive a
30-day policy when the migration is applied.

Map policies to days in one shared server-side helper:

- `NEVER` -> no cutoff
- `DAYS_7` -> 7 days
- `DAYS_30` -> 30 days
- `DAYS_90` -> 90 days

The cutoff is calculated from `archivedAt`, not `updatedAt` or `createdAt`.
Documents without `archivedAt` are skipped even if their status is archived,
because they do not have a reliable retention start time.

## Settings UI

`WorkspaceSettingsPanel` gains a third left navigation item named `Retention`.
The section contains:

- current selected policy
- a single preset selector for `Never`, `7 days`, `30 days`, and `90 days`
- a save action
- short saved or validation status text

The section should be compact and operational. This is a data lifecycle setting,
not a marketing or explanatory page.

The workspace page reads the stored policy on the server and passes only the
current policy value into the client settings panel. The panel submits changes
through a server action. It does not use `localStorage`, because retention is a
workspace data policy rather than a personal browser preference.

Users without workspace write permission can see the current setting but cannot
change it. The save control should be disabled in the same style as the import
controls.

## Server Action Flow

Add an action such as `updateWorkspaceRetentionPolicyAction(workspaceSlug,
formData)`.

The action:

1. Requires the current user.
2. Loads the workspace by slug.
3. Requires workspace write permission.
4. Validates the submitted policy against the known enum values.
5. Updates `Workspace.archivedDocumentRetentionPolicy`.
6. Revalidates `/workspaces/{workspaceSlug}`.
7. Returns the saved policy or a stable validation error.

Invalid form values must not update the workspace. Permission failures continue
to use the existing service guard behavior rather than returning a soft UI
error.

## Purge Service

Add a focused service, for example
`purgeExpiredArchivedDocuments({ now, workspaceId, dryRun })`.

The service:

1. Loads workspaces whose retention policy is not `NEVER`, or a single
   workspace when `workspaceId` is provided.
2. Calculates a cutoff date from each workspace policy.
3. Selects documents where:
   - `workspaceId` matches the workspace
   - `status = ARCHIVED`
   - `archivedAt` is not null
   - `archivedAt <= cutoff`
4. In dry-run mode, reports counts without deleting.
5. In delete mode, hard deletes the matching documents.
6. Returns per-workspace counts and a total count.

The service should batch by workspace so policy logic stays clear and stdout can
report useful operational lines. It should be safe to run repeatedly: after a
document is deleted, later runs simply do not find it.

Hard deleting a `Document` relies on the existing Prisma relation behavior:

- `DocumentVersion` rows cascade.
- `DocumentChunk` rows cascade.
- `DocumentTag` rows cascade.
- `DocumentProperty` rows cascade.
- `Attachment` DB rows cascade.
- `Comment` rows cascade.
- Outgoing `DocumentLink` rows cascade.
- Incoming `DocumentLink.targetDocumentId` is set to null.

This slice does not remove `Tag` rows that become unused after document-tag rows
are removed. Tag cleanup can be part of a broader metadata cleanup pass if it
becomes necessary.

## CLI And Operations

Add a package script such as:

```json
"documents:purge-archived": "tsx scripts/documents/purge-archived.ts"
```

The script supports:

- default delete mode
- `--dry-run`
- optional workspace scoping with `--workspace <workspaceSlug>`

The script prints lines like:

```text
workspace company-handbook: 3 expired archived documents
total expired archived documents: 3
```

In delete mode, the count is the number deleted. In dry-run mode, the count is
the number that would be deleted. Failures should produce a non-zero exit code
so cron, GitHub Actions, or Docker tooling can detect them.

Production can run the command from the existing Docker `tools` target, for
example through host cron or a future scheduled workflow. The web app should not
depend on this command having run before rendering.

## Safety Boundaries

The first version intentionally keeps hard deletion away from user-triggered
web requests. A settings save changes future purge behavior but does not
immediately delete documents.

`NEVER` must always skip a workspace. Changing from `NEVER` to `DAYS_30` can
make old archived documents eligible on the next CLI run if their `archivedAt`
is already older than the cutoff. That is expected and should be clear in the
settings copy.

Documents with missing `archivedAt` are skipped to avoid deleting rows whose
retention clock cannot be proven.

Archived folders are left in place. A later folder cleanup design will cover
whether to delete only empty archived folders, how to order descendant folder
deletes, how to report folder counts, and whether folder audit history should be
preserved differently from document history.

Attachment files are left in storage. A later storage cleanup design should
compare DB attachment rows with files on disk or delete files transactionally
around document hard delete with clear failure recovery.

## Tests

Add focused coverage in these areas:

- Prisma/service tests:
  - default retention policy is `DAYS_30`
  - policy update persists
  - `NEVER` skips purge
  - `DAYS_7`, `DAYS_30`, and `DAYS_90` calculate the expected cutoff
  - expired archived documents are deleted
  - active documents are not deleted
  - archived documents newer than cutoff are not deleted
  - archived documents with null `archivedAt` are not deleted
  - other workspaces are not affected by scoped purge
- Server action tests:
  - valid policy updates call the service and revalidate the workspace
  - invalid policy values are rejected
  - current user is required
- Component tests:
  - settings panel shows the `Retention` nav item
  - current policy is selected
  - `30 days` appears as the default policy in fixtures
  - save submits the selected policy and shows status
  - save is disabled for read-only users
- Script tests:
  - `--dry-run` reports counts without deleting
  - delete mode deletes and reports counts
  - failures exit non-zero

## Wiki Updates

Implementation should update the smallest relevant wiki pages:

- `wiki/Document Knowledge Model.md` for the workspace retention field and
  document purge relation behavior.
- `wiki/Document Editing Workflow.md` for settings-panel retention and document
  trash lifecycle.
- `wiki/Next.js Prisma Monolith.md` for the CLI/tools purge command as a
  monolith maintenance task.
- `wiki/index.md`, `wiki/manifest.json`, and `wiki/log.md` as needed for
  navigation and chronology.

## Open Follow-Ups

- Archived folder hard delete after all active and archived descendant documents
  are gone.
- Attachment storage file cleanup for files whose DB attachment rows were
  removed by document hard delete.
- Optional scheduled GitHub Actions or server cron documentation once the
  production cadence is chosen.
- Optional unused tag cleanup if tag rows accumulate after many purges.
