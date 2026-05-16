# Knowledge Graph Display And Force Controls Design

## Goal

Issue #36 adds Obsidian-like `Display` and `Forces` controls to the workspace knowledge graph panel and changes graph links to a neutral gray visual treatment.

## Context

Issue #34 introduced `KnowledgeGraphView` with relation filters, zoom/pan through `react-force-graph-2d`, selected-document focus, and stable renderer objects. The current panel only controls which relation kinds are visible. The Obsidian reference also exposes display controls such as arrows, text fade, node size, and link thickness plus force controls for center, repel, link force, and link distance.

## Design

`KnowledgeGraphView` will keep the existing `Filters` section and add two collapsible sections below it:

- `Display`
  - `Arrows`: boolean toggle mapped to `linkDirectionalArrowLength`.
  - `Text fade threshold`: numeric range mapped to label opacity decisions in `nodeCanvasObject`. Display state changes resume the graph animation loop so label redraws still apply after the force simulation has cooled.
  - `Node size`: numeric range mapped to `nodeRelSize`.
  - `Link thickness`: numeric range mapped to `linkWidth` while preserving selected-neighborhood emphasis.
- `Forces`
  - `Center force`: numeric range applied through a custom `munjib-center` gravity force registered with `d3Force(name, forceFn)`. This avoids relying on `forceCenter.strength()` and makes the slider affect node velocity directly.
  - `Repel force`: numeric range applied to `charge.strength`.
  - `Link force`: numeric range applied to `link.strength`.
  - `Link distance`: numeric range applied to `link.distance`.

The graph links will no longer use wiki/tag/property colors. All links render with neutral gray, with focused links lighter and non-focused links dimmer. Nodes retain their kind-based colors because they are the main relation classifier in the graph.

When a user hovers a graph node, that hovered node's 1-hop neighborhood becomes the active focus region. The selected document focus is restored when the hover leaves the node. This makes exploration behave like the Obsidian reference: unrelated nodes and links fade back while the hovered local relationship stays readable.

Graph mode should fill the available center content area instead of sitting inside the normal editor padding. The workspace center scroll container removes padding and hides overflow in graph mode, while `KnowledgeGraphView` fills the available height. The graph canvas uses the same white background as `DocumentToolbar`; document and link grays are darkened enough to remain visible on that surface.

The panel uses native checkbox and range inputs styled with existing Tailwind classes. This avoids adding new shadcn components for a narrow control surface.

## Data Flow

Display state remains local UI state in `KnowledgeGraphView`. Force state also remains local UI state and is applied through a graph ref after the dynamic `ForceGraph2D` component is mounted. The graph ref callback increments a readiness version so default force settings are applied even when the dynamic graph component mounts after the first React effect pass. No database or URL state changes are required.

## Testing

Component tests will cover:

- `Display` and `Forces` sections render and can be collapsed.
- Link color is neutral gray, not relation-kind colored.
- Display controls update graph props for arrows, node size, label fade, and link thickness.
- Force controls call the force graph ref APIs with the expected values, including default application after a late graph ref mount.
- Hovering a node uses the hovered node's 1-hop neighborhood as the active highlight region.
- Graph mode removes editor padding and lets the graph fill the center area.

## Out Of Scope

- Persisting graph display settings between sessions.
- Group creation controls.
- Search within graph filters.
- New package dependencies.
