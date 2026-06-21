# Workspace UI State Persistence Design

## Context

Issue #122 preserves workspace UI chrome state across page navigation and browser refresh. The affected surfaces are browser-owned preferences, not server data:

- left workspace sidebar open or closed
- right metadata sidebar open or closed
- active left sidebar menu: `documents`, `search`, or `favorites`
- knowledge graph controls panel open or closed
- knowledge graph `Filters`, `Display`, and `Forces` section open states
- existing knowledge graph filter/display/force option persistence
- floating Workspace AI chat open or closed

The current implementation keeps these values in local component state. Knowledge graph filter/display/force options already persist in `sessionStorage`, but the controls panel and section open states do not persist. Document tabs, recents, favorites, heading folds, and AI model override settings already use browser storage patterns elsewhere in the app.

## Decisions From Brainstorming

- Use `localStorage`, not `sessionStorage`, so the state survives refresh, route changes, and browser restart in the same browser profile.
- Keep each component as the owner of its state. Add shared storage helpers only for parsing, validation, and safe read/write behavior.
- Restore stored values after mount to avoid server/client hydration mismatch.
- Do not persist transient content such as chat message draft text, pending requests, loaded message history, hover state, graph layout positions, or workspace settings modal state.

## Goals

- Preserve the requested UI state across page navigation and reloads.
- Scope stored values by workspace slug so one workspace does not affect another.
- Keep browser storage failures non-fatal.
- Avoid hydration mismatch warnings in Next.js client components.
- Keep the implementation small and local to current UI owners.
- Update tests and wiki pages so the durable behavior is documented.

## Non-Goals

- Do not add database columns or server APIs for UI state.
- Do not put this state in the URL.
- Do not sync these preferences across browsers, users, or devices.
- Do not persist the Workspace AI chat input draft or in-flight request state.
- Do not persist graph simulation node positions or zoom/pan state in this slice.
- Do not build a global UI preferences provider unless local wiring becomes insufficient.

## Architecture

Add a small browser storage helper under `lib/workspace-ui-state.ts` that exposes safe workspace-scoped storage functions. The helper should:

- build versioned keys
- read JSON values from `localStorage`
- validate shapes before returning data
- write JSON values after hydration
- catch storage exceptions and fall back silently

The UI components continue to own their state:

- `AppShell` receives `workspaceSlug` and persists `leftPanelOpen` and `rightPanelOpen`.
- `DocumentList` persists the active navigation panel.
- `KnowledgeGraphView` persists settings panel visibility, section visibility, and existing graph option groups.
- `WorkspaceChatbot` persists `isOpen`.

This avoids a broad provider while keeping storage behavior consistent and testable.

## Storage Keys

Use one versioned, workspace-scoped aggregate key:

```text
munjib:workspace-ui:<workspaceSlug>:v1
```

Suggested shape:

```ts
type WorkspaceUiState = {
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
  activeSidebarPanel?: "documents" | "search" | "favorites";
  workspaceChatOpen?: boolean;
  graph?: {
    settingsOpen?: boolean;
    filtersOpen?: boolean;
    displayOpen?: boolean;
    forcesOpen?: boolean;
    filters?: { tag: boolean; orphans: boolean };
    display?: {
      arrows: boolean;
      linkThickness: number;
      nodeSize: number;
      textFadeThreshold: number;
    };
    forces?: {
      center: number;
      link: number;
      linkDistance: number;
      repel: number;
    };
  };
};
```

Keeping one key makes cleanup/versioning simple and prevents many small writes from spreading across the storage namespace. Updates should merge the changed surface into the existing object rather than replacing unrelated stored surfaces.

## Defaults

The default UI should match current behavior:

- left sidebar: open
- right metadata sidebar: open
- active left sidebar menu: `documents`
- graph settings panel: open
- graph `Filters`: open
- graph `Display`: closed
- graph `Forces`: closed
- graph filters: `Tags` false, `Orphans` false
- graph display and force values: current defaults
- Workspace AI chat: closed

## Hydration Strategy

Client components should initialize React state with deterministic defaults. They should read `localStorage` only after mount in `useEffect`.

Each persisted surface should use a hydration guard:

1. Initialize default state during first render.
2. Read and apply stored state after mount.
3. Mark the surface hydrated.
4. Write subsequent state changes only when hydrated.

This prevents the server-rendered HTML from disagreeing with the first client render. A short visual correction after mount is acceptable for this slice; no loading skeleton is required.

## Data Flow

### AppShell

`AppShell` currently owns `leftPanelOpen` and `rightPanelOpen`. Add `workspaceSlug` to its props and hydrate both booleans from workspace UI storage. `requestTagSearch()` should continue to force the left sidebar open; that explicit user intent should be written back as the new state after hydration.

### DocumentList

`DocumentList` currently owns `activePanel`. Hydrate it from storage with validation against `documents`, `search`, and `favorites`.

Explicit navigation still wins:

- toolbar buttons set and persist the chosen panel
- tag search request opens `search`, sets the query, and persists `search`
- graph route can still make the toolbar active view display as `graph`, but it should not replace the stored active sidebar panel unless the user chooses a sidebar panel

### KnowledgeGraphView

`KnowledgeGraphView` currently owns both panel open states and graph option groups. Extend persistence to include:

- `settingsOpen`
- `filtersOpen`
- `displayOpen`
- `forcesOpen`

Move existing `filters`, `display`, and `forces` persistence from `sessionStorage` to the aggregate workspace UI `localStorage` key. Preserve the existing validation ranges and fallback behavior.

Invalid legacy `sessionStorage` values do not need migration. If a user has old session-scoped settings, they can re-apply graph preferences once and the new local storage path will keep them.

### WorkspaceChatbot

`WorkspaceChatbot` currently owns `isOpen`. Hydrate and persist only that boolean.

Workspace changes should reset request/message state as they do today. The open/closed state should be workspace-scoped, so opening chat in one workspace does not force it open in another.

## Error Handling

Storage errors should never block the workspace page. The helper should return defaults when:

- `window` is unavailable
- `localStorage` throws
- JSON parsing fails
- stored values have unknown versions or wrong shapes
- enum values are not recognized
- number ranges fall outside supported graph controls

On write failure, keep the in-memory UI state and skip persistence.

## Testing

Component tests should cover:

- `AppShell` restores left and right sidebar states from `localStorage`.
- `AppShell` writes sidebar changes to workspace-scoped storage.
- `DocumentList` restores and writes the active `search` or `favorites` panel.
- `DocumentList` lets tag-search intent override a stored non-search panel.
- `KnowledgeGraphView` restores and writes settings panel and section open states.
- `KnowledgeGraphView` restores and writes graph filter/display/force options through `localStorage`.
- Invalid stored graph and UI values fall back to defaults.
- `WorkspaceChatbot` restores open state and writes open/close changes.
- State from one workspace slug does not apply to another.

Existing component tests for graph filters, display controls, force controls, sidebar collapse, metadata panel collapse, document navigation panels, and workspace chatbot thread loading should remain.

## Wiki Updates

Durable behavior should be recorded in:

- `wiki/Document Editing Workflow.md`: describe persisted workspace UI chrome state, graph controls persistence, and Workspace AI chat open state.
- `wiki/index.md`: add Issue #122 to the current editing experience or graph/AI UI status section.
- `wiki/log.md`: add the chronology entry after implementation.

No files under `raw/sources/` should be edited.

## Open Questions

None. The accepted persistence mechanism is workspace-scoped `localStorage`.
