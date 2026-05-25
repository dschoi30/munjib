# Knowledge Graph Zoom And Session Display Controls Design

## Context

Issue #67 refines the workspace knowledge graph view after Issue #65 simplified graph filters to `Tags` and `Orphans`. The current `KnowledgeGraphView` still starts both filters checked, keeps display and force settings only in React state, passes the raw `Node size` slider value directly to `react-force-graph-2d`, and computes label size as `12 / globalScale`.

That behavior lets zoom make node circles and labels visually too large or too small, and label placement uses a fixed offset that does not account for effective node size. The requested behavior keeps labels below nodes, lets labels scale with zoom in a bounded way, makes the smallest node-size setting smaller than today without becoming unusably tiny, adapts that baseline by document count, and preserves graph option changes until the browser session ends.

## Goals

- Cap zoom-in and zoom-out so node circles and labels cannot become excessively large or excessively small.
- Scale label font size with zoom changes while clamping it to a usable minimum and maximum.
- Keep labels below node circles without overlapping the node, independent of node size.
- Default `Tags` and `Orphans` filters to unchecked.
- Persist graph filter, display, and force option changes in `sessionStorage` until the browser session ends.
- Redefine `Node size = 1` as a smaller baseline than the current value.
- Adapt the `Node size = 1` baseline by document count so larger workspaces render more compactly.

## Non-Goals

- Do not change the graph DTO, link coverage, tag extraction, or orphan filtering semantics from Issue #65.
- Do not remove existing graph controls.
- Do not persist these graph options to the database, URL, or cross-session `localStorage`.
- Do not change graph routing, selected-document routing, or hover/selected focus semantics.

## Visual Direction

Use a balanced automatic tier model. Small workspaces should stay legible, while large imported workspaces should get a smaller node baseline so the graph remains inspectable. The `Node size` slider remains the user's control, but its raw value is converted into an effective `nodeRelSize` using a document-count multiplier.

## Architecture

`KnowledgeGraphView` remains the owner of graph display state. It should add small pure helpers for:

- parsing and validating persisted settings from `sessionStorage`
- building workspace-scoped storage keys
- computing the document-count node-size baseline
- clamping zoom-derived label font sizes to minimum and maximum values
- computing label y-offset from node radius and font size

The component should hydrate settings after mount to avoid server/client mismatch and write changes back after hydration. Storage should be scoped by workspace slug so graph settings for one workspace do not leak into another. Invalid or stale stored JSON should be ignored and replaced on the next write.

## Defaults And Persistence

Default filters become:

```ts
const DEFAULT_FILTERS: KnowledgeGraphFilters = {
  tag: false,
  orphans: false,
};
```

Display and force defaults keep their current values unless changed by node-size scaling. The raw `display.nodeSize` default remains `3`, but the effective graph size becomes smaller because the baseline multiplier is lower.

Persist these option groups in `sessionStorage`:

- `filters`
- `display`
- `forces`

Storage keys should include the workspace slug and a version suffix, for example:

- `munjib:knowledge-graph:company-handbook:v1:filters`
- `munjib:knowledge-graph:company-handbook:v1:display`
- `munjib:knowledge-graph:company-handbook:v1:forces`

Only valid primitive values within the supported control ranges should be restored. Missing keys, malformed JSON, wrong shapes, or out-of-range values fall back to defaults.

## Node Size Scaling

Compute the number of document nodes from `graph.nodes`. The effective node size is:

```ts
effectiveNodeSize = display.nodeSize * documentCountBaseline
```

Use balanced tiers for the baseline:

- `1..24` documents: `0.85`
- `25..99` documents: `0.7`
- `100..249` documents: `0.55`
- `250+` documents: `0.45`

This makes `Node size = 1` smaller than the current raw `1` while preserving visible differences across the existing `1..10` slider range. It also keeps small workspaces from becoming too tiny, keeps larger workspaces compact, and prevents large imported workspaces from becoming visually oversized.

## Zoom And Labels

Set a bounded zoom extent for the force graph, including both a minimum zoom-out level and a maximum zoom-in level. Prefer a documented `react-force-graph-2d` prop when available. If the component's type surface does not expose one directly, pass the supported prop through the existing `ForceGraph2DProps` record and cover it in component tests.

Labels should still hide when zoomed too far out according to the existing `MIN_LABEL_GLOBAL_SCALE` and `textFadeThreshold` behavior. When labels render:

- compute font size from zoom with a bounded formula
- clamp label font size to a minimum and maximum
- compute label y-position from effective node radius plus font size padding
- draw the label with centered text alignment below the node circle

The label offset must use effective node size rather than raw `display.nodeSize`, so label placement tracks document-count scaling and slider changes.

## Testing

Component tests should cover:

- `Tags` and `Orphans` start unchecked.
- Filter toggles persist to `sessionStorage` and restore on remount for the same workspace.
- Display and force option changes persist to `sessionStorage` and restore on remount.
- Invalid stored settings fall back to defaults.
- `nodeRelSize` receives the effective document-count-scaled node size instead of the raw slider value.
- Larger document counts produce smaller `nodeRelSize` for the same slider value.
- The graph receives bounded zoom extent props or equivalent settings for both minimum and maximum zoom.
- Label drawing clamps font size and positions text below the effective node circle.

Existing component tests for filter behavior, display controls, force controls, focus dimming, renderer identity, and document node routing should remain.

## Wiki Updates

Durable behavior changes should be recorded in:

- `wiki/Document Editing Workflow.md`: graph defaults, session-scoped settings persistence, bounded zoom extent, bounded label scaling, and document-count node-size baseline.
- `wiki/index.md`: Issue #67 status entry in the graph follow-up line.
- `wiki/log.md`: chronology entry for Issue #67 after implementation.

## Open Questions

None. The session persistence mechanism is `sessionStorage`, and the accepted node-size model is the balanced automatic tier model.
