# Document Title Display Path Design

## Context

Issue #131 improves path labels in Munjib's document UX. The current workspace
model stores `Document.path` and `Folder.path` as stable slug-based identity
paths such as `/operations/contextual-retrieval`. That value is correct for
database uniqueness, folder/document moves, wiki-link resolution, graph/RAG
metadata, and internal auditing.

The problem is that the same slug path is also shown directly in user-facing
surfaces, especially the center toolbar and search/sidebar descriptions. Users
expect document paths to look like the file or note names they see in the
workspace tree. For imported Markdown files, the title contract is already
filename-first, so `Document.title` is the right visible document name.

## Decisions From Brainstorming

- Treat "file name" as the saved `Document.title`, not the original file name
  with `.md` extension.
- Keep `Document.path` and `Folder.path` unchanged as internal slug identity.
- Add a display-only path derived from folder names and document titles.
- Use the display path only for user-facing path labels and descriptions.
- Keep URL routing, database schema, wiki-link matching, graph DTOs, RAG
  metadata, and audit metadata on the existing slug path.

## Goals

- Show human-readable document paths based on `Folder.name` and
  `Document.title`.
- Stop exposing slugified document path labels such as
  `operations / contextual-retrieval` in ordinary navigation chrome.
- Preserve existing duplicate-title behavior, route behavior, and path-qualified
  wiki-link behavior.
- Keep the change small and display-layer focused.
- Cover the helper and visible UI surfaces with focused tests.

## Non-Goals

- Do not add a new database column for original import file names.
- Do not show `.md` or `.markdown` extensions.
- Do not change `Document.path`, `Folder.path`, document `slug`, or folder
  `slug` generation.
- Do not rewrite existing documents or run a migration.
- Do not change path-qualified wikilink syntax or matching.
- Do not change graph, RAG, audit, or observability metadata semantics.
- Do not change URL query parameters, which already use document and folder ids.

## Architecture

Add a small display helper near the existing workspace tree/path utilities.
The helper should build a folder display path map from active folders:

- root stays `/`
- a root folder displays as its `name`
- a nested folder displays as `Parent / Child`
- an unnamed folder can fall back to the final slug segment only as a defensive
  fallback

Then derive document display paths:

- a root document displays as its `Document.title`
- a document inside a folder displays as `Folder Display Path / Document.title`
- an empty document title uses the localized untitled fallback at render time
  where that fallback is already available, or `Untitled` in shared pure helpers

The stored slug path remains available on every object for sorting, matching,
search compatibility, actions, and internal metadata. Client props that render
visible path text receive both values when needed:

- `path`: stored slug path
- `displayPath`: human-readable path label

This keeps the naming honest and avoids overloading the existing path field.

## UI Surfaces

Apply `displayPath` to user-facing path labels:

- center document toolbar current path
- selected folder toolbar path
- sidebar search result description
- document row description where the UI shows path context
- document/folder action labels that include path context to disambiguate
  duplicate names
- folder detail path label
- Settings Markdown import destination display only if it is rendering a folder
  path as a visible destination label

Keep raw `path` for:

- tree ordering
- search compatibility against stored path
- `Document.path` persistence and mutation services
- wiki-link preview/reconcile/autocomplete matching
- graph model node data
- RAG document metadata
- audit log metadata
- tests that explicitly assert stored path behavior

Search should match both forms. A query for the slug path should continue to
work for users who copied an old label or know the internal path, while a query
for the title-based display path should also work.

## Data Flow

Server page assembly remains the natural place to compute display paths because
it already has active folders and readable documents:

1. Load workspace folders and documents as today.
2. Build a `folderDisplayPathById` map from active folders.
3. For each readable document prop, compute `displayPath` from its folder's
   display path and its current title.
4. For the selected folder prop, compute `displayPath` from the folder map.
5. Pass both `path` and `displayPath` to client components that need search,
   sorting, or visible path labels.

Stored tab JSON can keep its existing `path` field for backward compatibility.
The current tab strip renders titles rather than path labels, so this feature
does not change the serialized tab shape. If a future tab surface displays path
context, it should read `displayPath` from refreshed readable document data
instead of deriving labels from the stored slug path.

## Error Handling

Display-path generation should be total:

- Missing parent folders fall back to the stored path formatted with the current
  `formatWorkspacePath()` behavior.
- Empty folder names fall back to the corresponding slug segment.
- Empty document titles use the existing untitled label policy.

These fallbacks are defensive only. They should not mutate stored data and
should not hide data integrity issues in services or tests that validate stored
paths.

## Testing

Add focused coverage for:

- folder display path generation for root, nested folders, and missing parents
- document display path generation for root and nested documents
- `WorkspaceCenterShell` or `DocumentToolbar` rendering a title-based path
  instead of the slug path
- `DocumentList` search matching title-based display paths while keeping stored
  path matching
- search result descriptions using `displayPath`

Existing tests for folder path helpers, wiki-link resolution, document service
path mutation, graph model path metadata, RAG metadata, and document tabs should
continue to assert stored slug-path behavior where relevant.

## Wiki Updates

Implementation should update the smallest durable wiki surface:

- `wiki/Folder Hierarchy Model.md`: distinguish internal stored path from
  title-based display path.
- `wiki/Document Editing Workflow.md`: update toolbar/search/sidebar path label
  behavior.
- `wiki/index.md`: add issue #131 to the current editing experience status
  summary.
- `wiki/log.md`: add the design and implementation entries as work proceeds.

Run the repo wiki sync checks before committing implementation changes.
