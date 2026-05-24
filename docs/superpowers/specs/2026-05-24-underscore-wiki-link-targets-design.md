---
title: Underscore Wiki Link Targets
date: 2026-05-24
issue: 59
status: approved
---

# Underscore Wiki Link Targets

## Context

Munjib resolves Obsidian-style wiki links in two related places:

- Markdown preview renders body `[[Target]]` text as a navigation link when the
  target resolves to one readable document.
- Frontmatter `links:` entries are reconciled into `DocumentLink` rows that
  power Properties links, backlinks, and graph edges.

Both flows currently use title/path slug matching. A wiki link written as
`[[수에즈_운하_위기]]` should resolve to the existing document titled
`수에즈 운하 위기`, but the raw markdown text should remain unchanged.

## Requirements

- Body preview links with underscores in the target should resolve to matching
  documents whose titles use spaces.
- Frontmatter `links:` entries with underscores in the target should resolve to
  matching documents whose titles use spaces.
- Path-qualified targets should apply the same rule per path segment.
- Raw target text should not be rewritten in markdown or in
  `DocumentLink.targetTitleRaw`.
- Existing ambiguous-title behavior must remain unchanged: if the normalized
  title target still matches multiple documents, do not pick an arbitrary one.
- The change must not alter document slug or folder path creation rules outside
  wiki-link target matching.

## Proposed Design

### Matching Helper

Add a wiki-link target matching helper near the existing target helpers in
`lib/wiki-links/targets.ts`.

The helper will normalize only for lookup comparison by replacing one or more
underscores with a single space before applying the existing `slugifyTitle()`
logic. This keeps the new rule scoped to wiki-link target resolution instead of
changing global document slug behavior.

### Reconciliation

`lib/wiki-links/reconcile.ts` will use the helper when comparing title-only
targets against active document titles.

For path-qualified links, each path segment will use the same underscore-aware
lookup normalization before comparing with document paths. If a path match is
not found, the existing title fallback for slash-containing titles will still run
with the same title lookup helper.

The created `DocumentLink` row will still store the parsed raw target. For
example, `[[수에즈_운하_위기]]` stores `targetTitleRaw:
"수에즈_운하_위기"` while filling `targetDocumentId` with the matched
document id.

### Preview Rendering

`lib/wiki-links/preview.ts` will build and query candidate maps with the same
underscore-aware lookup keys. A body link such as `[[수에즈_운하_위기]]` will
render as a navigation link to the `수에즈 운하 위기` document when there is a
single readable match.

Unresolved and ambiguous links will keep the current behavior: render the label
without a navigation target.

## Tests

- Add a reconciliation test where frontmatter `links:` contains
  `[[수에즈_운하_위기]]` and resolves to a document titled `수에즈 운하 위기`.
- Add a preview test where body markdown contains `[[수에즈_운하_위기]]` and
  renders an href for a candidate titled `수에즈 운하 위기`.
- Cover at least one path-qualified underscore target, either in reconciliation
  or preview, to protect segment-level behavior.
- Run the existing wiki-link preview and reconciliation test suites.

## Wiki Updates

Update `wiki/Wiki Links And Backlinks.md` to document underscore-tolerant wiki
link target matching for preview rendering and frontmatter reconciliation. Append
a `wiki/log.md` entry for issue #59 and regenerate `wiki/manifest.json`.
