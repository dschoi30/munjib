# Knowledge Graph Filter And Link Coverage Design

## Context

Issue #65 refines the workspace knowledge graph controls and link coverage. The existing graph uses `DocumentLink` rows, which currently represent YAML frontmatter `links:` entries, plus tag and scalar property metadata. The graph settings panel also exposes filters for wiki links, tags, and properties, and the display/force sections start expanded.

The new behavior keeps the graph view aligned with Obsidian-style graph exploration while preserving the existing Properties Links row contract: Properties links and backlinks continue to use frontmatter `links:` rows, but graph exploration sees wiki links throughout the document markdown.

## Goals

- Start `Display` and `Forces` closed, with closed chevrons.
- Remove `Wiki links` from the filters UI and make wiki links always included.
- Remove `Properties` graph filter and property graph rendering from this feature surface.
- Add an `Orphans` filter that controls connectedness of document nodes.
- Set `Node size` default to `3` and range to `1..10`.
- Set `Link thickness` maximum to `5`.
- Keep link width constant during selected-document or hover focus.
- Register wiki links from all document markdown, not only frontmatter `links:`, in the graph view.

## Non-Goals

- Do not change the `DocumentLink` persistence contract for Properties Links, backlinks, or broken link creation.
- Do not add a new database table for graph-only wiki links.
- Do not change preview rendering, autocomplete, or editor markdown syntax.
- Do not redesign the graph panel beyond the requested controls and defaults.

## Architecture

The graph view should be built from a graph-specific DTO that can include both persisted frontmatter link rows and markdown-scanned graph links. `app/workspaces/[workspaceSlug]/page.tsx` should continue to load readable active documents and permission-filtered graph inputs only in graph mode.

`DocumentLink` rows remain the source for frontmatter link behavior. For graph mode, the page or graph model should additionally scan each readable document's `contentMarkdown` with the existing wiki-link parser and resolve those targets with the same folder-aware, underscore-aware matching semantics used by reconciliation.

To avoid duplicating resolution rules, the target resolution helper currently embedded in `lib/wiki-links/reconcile.ts` should be moved or exported as a pure helper that can be used by both reconciliation and graph input construction. The helper should return resolved, broken, and ambiguous states without requiring a database transaction.

Graph-only scanned links should be deduplicated with persisted frontmatter links so a link listed in frontmatter and repeated in body markdown does not render as parallel duplicate edges. The dedupe key should be source document plus the resolved target document id, or source document plus broken/ambiguous raw target state when unresolved.

## Data Flow

1. Workspace page loads readable active documents for graph mode, including `id`, `title`, `path`, and `contentMarkdown`.
2. Existing persisted `DocumentLink` rows are loaded for readable source documents.
3. Graph-only wiki links are parsed from full `contentMarkdown` for each readable document.
4. Parsed links are resolved against readable active document candidates.
5. Persisted and graph-only wiki links are merged into graph link inputs.
6. `buildKnowledgeGraph()` emits document, tag, and unresolved wiki nodes plus wiki/tag edges.
7. `filterKnowledgeGraph()` always keeps wiki edges, conditionally keeps tag edges, and conditionally keeps orphan document nodes.

## Filters

Filters should expose:

- `Tags`, default on.
- `Orphans`, default on.

Wiki links are always included and no longer have a checkbox. Property graph nodes and property edges are removed from the visible graph contract for this feature, so the `Properties` checkbox, property filter path, and property edge rendering should be removed together.

`Orphans` means document nodes with no visible incident edges after applying the other filters. When `Orphans` is on, all readable document nodes remain visible. When it is off, connected document nodes remain and isolated document nodes are hidden. Non-document nodes should only appear when connected by a visible edge.

## Display And Focus

`Display` and `Forces` should initialize closed. The existing `GraphControlSection` chevron behavior already maps closed state to `ChevronRight`, so only the initial state needs to change.

Display defaults and ranges:

- `Node size`: default `3`, min `1`, max `10`, step `1`.
- `Link thickness`: default `1`, keep existing min and step, max `5`.
- `Text fade threshold` and `Arrows`: unchanged.

Selected-document and hover focus should continue to affect color and alpha. Focus should not change link width; `linkWidth` should always return the configured `display.linkThickness`.

## Testing

Model tests should cover:

- Full markdown wiki links create graph wiki edges even when the link is not in frontmatter `links:`.
- Persisted and scanned duplicates do not render duplicate wiki edges.
- Wiki links remain visible without a wiki filter.
- Tag filter hides tag edges.
- Orphans filter hides isolated document nodes when off and keeps them when on.
- Property graph links are not emitted or visible under the new contract.

Component tests should cover:

- Filters show `Tags` and `Orphans`, but not `Wiki links` or `Properties`.
- `Display` and `Forces` start collapsed and show closed chevrons through the existing accessible labels.
- `Node size` defaults to `3` and has range `1..10`.
- `Link thickness` has max `5`.
- Focused or hovered links keep the configured width.

Existing focused graph, renderer identity, force control, and document node routing tests should be updated to the new filter shape without weakening their coverage.

## Wiki Updates

Durable behavior changes should be recorded in:

- `wiki/Document Knowledge Model.md`: graph DTO now uses full-markdown graph links and no property graph rendering.
- `wiki/Wiki Links And Backlinks.md`: graph view sees all markdown wiki links while Properties Links/backlinks remain frontmatter-driven.
- `wiki/Document Editing Workflow.md`: graph controls and defaults.
- `wiki/index.md` and `wiki/log.md`: index/status and chronology updates.

## Open Questions

None. The `Orphans` filter means connectedness of document nodes and defaults to on.
