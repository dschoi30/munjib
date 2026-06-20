# Knowledge Graph Hide Unresolved Targets Design

## Context

The current workspace graph view builds a graph DTO from readable active documents,
persisted frontmatter `DocumentLink` rows, full-markdown wiki-link scans, and parsed
tags. Since Issue #65, `buildKnowledgeGraph()` can emit three node kinds:
`document`, `tag`, and `wiki`. The `wiki` node kind is used for unresolved wiki-link
targets, such as broken or ambiguous raw target text.

That raw DTO shape is useful for model-level completeness, but it creates an
incorrect default screen: with `Tags` and `Orphans` disabled, users can still see
nodes that are not actual documents. The graph view should default to real document
navigation, not a broken-link inspection surface.

## Goals

- Keep the existing `Orphans` filter contract.
- Keep `Tags` disabled by default; tag nodes and tag edges appear only when enabled.
- Hide broken and ambiguous wiki target nodes from the visible graph.
- Show wiki edges only when they connect two readable, existing document nodes.
- Preserve `buildKnowledgeGraph()` raw DTO behavior because the consistency review
  finds the issue in visible filtering, not raw graph construction.
- Update tests so the default visible graph no longer includes unresolved target
  values such as `wiki:broken:*` or `wiki:ambiguous:*`.

## Non-Goals

- Do not add a new UI filter for broken or ambiguous wiki targets.
- Do not remove broken-link creation or repair behavior from Properties links.
- Do not change wiki-link parsing, target resolution, autocomplete, or preview
  rendering.
- Do not change the database schema.

## `buildKnowledgeGraph()` Consistency Review

`buildKnowledgeGraph()` currently has a defensible raw-model responsibility:

1. It creates a `document` node for every readable active document input.
2. It adds persisted and scanned wiki links.
3. If a wiki link resolves to a readable document, the edge targets that document
   node.
4. If a wiki link is broken or ambiguous, the edge targets a synthetic `wiki` node
   that preserves the raw unresolved value.
5. It deduplicates source-to-target wiki edges.
6. It adds tag nodes and tag edges from parsed tags.

The logical tension is naming and visibility, not the raw graph construction itself.
A synthetic `wiki` node is not a document; it is an unresolved target placeholder.
That means it should not be included in the default visible graph when the user
expects document nodes plus resolved document wiki links. Keeping it in the raw DTO
is still coherent as long as `filterKnowledgeGraph()` owns the visible graph
contract and removes unresolved wiki-target edges before node filtering.

Therefore the implementation should keep `buildKnowledgeGraph()` mostly unchanged
and tighten `filterKnowledgeGraph()`.

## Visible Graph Contract

`filterKnowledgeGraph(graph, filters)` should produce the graph passed to
`react-force-graph-2d`.

Visible links:

- Keep `wiki` links only when both endpoints are `document` nodes.
- Keep `tag` links only when `filters.tag` is true.
- Drop links whose source or target is a `wiki` unresolved target node.

Visible nodes:

- Keep non-document nodes only when connected by a visible edge.
- For document nodes, keep connected documents.
- Also keep disconnected document nodes when `filters.orphans` is true.

This preserves the existing `Orphans` meaning: it controls isolated document nodes
after all other visible-link filtering has been applied.

## Data Flow

1. The workspace page enters graph mode with `?graph=1`.
2. The server loads readable active documents, persisted links from readable source
   documents, and parsed tags.
3. `buildKnowledgeGraph()` builds the raw graph DTO, including unresolved target
   placeholders when needed.
4. `KnowledgeGraphView` calls `filterKnowledgeGraph()` with the user's filter state.
5. The filtered graph renders only actual document nodes and optional tag nodes.
6. Document node clicks continue to open `?document=<id>`.
7. Tag node clicks continue to open sidebar tag search when `Tags` is enabled.

## Testing

Model tests should cover:

- The raw graph can still include unresolved wiki target nodes.
- Default visible graph with `{ tag: false, orphans: false }` excludes unresolved
  wiki target nodes and their edges.
- Resolved wiki links between two document nodes remain visible.
- `Orphans` still restores isolated document nodes.
- `Tags` still controls tag nodes and tag edges.
- Ambiguous unresolved targets are excluded from the visible graph the same way as
  broken targets.

Component tests should cover:

- The graph renderer receives no unresolved wiki target nodes in the default view.
- Enabling `Orphans` does not bring back unresolved wiki target nodes.
- Existing selected/hover focus behavior still works with the filtered graph.

## Wiki Updates

Durable behavior should be recorded in:

- `wiki/Document Editing Workflow.md`: default graph now hides unresolved wiki target
  placeholders.
- `wiki/Wiki Links And Backlinks.md`: graph scanning still resolves full-markdown
  wiki links, but unresolved values are not default graph nodes.
- `wiki/index.md` and `wiki/log.md`: status and chronology updates if source changes
  land.
