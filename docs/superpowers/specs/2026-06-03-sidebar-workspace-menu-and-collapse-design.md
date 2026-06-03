# Sidebar Workspace Menu And Collapse Design

## Context

Issue #85 refines the left workspace sidebar header. The current
`DocumentList` header renders the workspace name as static text and places a
gear icon button at the right edge. Clicking the gear opens
`WorkspaceSettingsPanel` directly.

The right metadata panel already has a close/reopen pattern owned by
`AppShell`: `PanelRightClose` collapses the panel, and `PanelRightOpen` restores
it. The left sidebar should use the mirrored version of that visual language
instead of an unrelated close icon.

## Goals

- Make the workspace name text the trigger for a workspace dropdown menu.
- Do not show a chevron or arrow next to the workspace name.
- Make the dropdown width fill the left sidebar content width.
- Include one dropdown item in this slice: `Settings`.
- Open the existing `WorkspaceSettingsPanel` when `Settings` is selected.
- Replace the old gear slot with `PanelLeftClose`.
- Collapse the left sidebar when the close button is clicked.
- Show a matching `PanelLeftOpen` affordance so the sidebar can be reopened.
- Preserve existing document/search/favorites/graph toolbar behavior.

## Non-Goals

- Do not add new workspace menu items beyond `Settings`.
- Do not redesign `WorkspaceSettingsPanel`.
- Do not persist left sidebar open/closed state to localStorage or the server.
- Do not change folder/document navigation, search semantics, graph routing, or
  favorites behavior.
- Do not introduce a dropdown library unless the local codebase already has a
  suitable primitive.

## User Experience

The left sidebar header has one row:

- the workspace name text on the left
- `PanelLeftClose` icon button on the right

The workspace name is a button even though it keeps the current heading visual
treatment. It has no visible chevron. Hover and focus states should be subtle
and consistent with existing sidebar icon buttons.

Clicking the workspace name opens a menu directly below the header row. The menu
is full width within the sidebar content area and contains one row:

- `Settings`

Clicking `Settings` closes the menu and opens the existing workspace settings
dialog. Opening search, documents, favorites, graph, or responding to tag-search
requests should close the menu and settings dialog just like the current
settings toggle is closed by navigation changes.

Clicking `PanelLeftClose` collapses the left sidebar column. The center content
expands into the freed space. A floating `PanelLeftOpen` button appears near the
top-left edge of the workspace shell. Clicking it restores the sidebar.

## Component Architecture

### AppShell

`AppShell` should own left sidebar layout state, mirroring the existing right
metadata panel state.

Add a left panel control context:

```ts
type LeftPanelControls = {
  collapse: () => void;
};
```

Expose it with `useLeftPanel()`. `DocumentList` can call `collapse()` without
threading props through `app/workspaces/[workspaceSlug]/page.tsx`.

When the left panel is open, the shell keeps the existing three-column grid when
the right panel is open:

```text
280px | center | 320px
```

When the left panel is closed, the shell removes the left column:

```text
center | optional 320px right panel
```

When both side panels are closed, the shell renders only the center column plus
floating reopen buttons for any closed panels.

### DocumentList

`DocumentList` owns the workspace menu open state, similar to its current
settings open state.

The header becomes a relative container:

- workspace title button uses `truncate` and fills available space
- close button uses lucide `PanelLeftClose`
- menu surface is absolutely positioned below the header row with `left-0`
  and `right-0`

The menu item should be a button with `role="menuitem"` inside a `role="menu"`
surface. Selecting the item opens the existing `WorkspaceSettingsPanel`.

`settingsOpen` can remain as the state for the modal dialog. Add separate
`workspaceMenuOpen` state so users can open the small menu without immediately
opening the settings dialog.

The menu should close when:

- `Settings` is selected
- the user clicks outside the menu/trigger
- `Escape` is pressed while the menu is open
- the user switches to documents/search/favorites/graph
- an external tag-search request opens the search panel
- the settings dialog opens

## Accessibility

The workspace title button should have `aria-label="Workspace menu"` and
`aria-expanded` reflecting menu state. The menu should have
`aria-label="Workspace menu"` and the Settings row should be discoverable as
`menuitem` with accessible name `Settings`.

The close button should use `aria-label="Close sidebar"`. The reopen button
should use `aria-label="Open sidebar"`.

Keyboard behavior:

- `Enter` or `Space` on the workspace title toggles the menu.
- `Escape` closes the open menu.
- Focus remains in normal document order; no focus trap is needed for a
  one-item non-modal menu.

## Error Handling

There is no new server failure path. If `useLeftPanel()` is unavailable because
`DocumentList` is rendered outside `AppShell` in a test or future isolated
surface, clicking the close button should no-op rather than throwing.

Settings import behavior remains owned by `WorkspaceSettingsPanel`.

Long workspace names truncate in the title button and do not push the close
button offscreen. The dropdown still spans the sidebar content width.

## Testing Plan

- `tests/components/document-list.test.tsx`
  - Workspace title is a button and no longer shows a separate gear settings
    button.
  - Clicking the workspace title opens a full-width workspace menu.
  - The menu contains one `Settings` menu item.
  - Clicking `Settings` opens the existing workspace settings dialog.
  - Opening documents/search/favorites/graph closes the workspace menu.
  - Tag-search requests close the workspace menu and open search.
  - Clicking `Close sidebar` hides the left sidebar and shows `Open sidebar`.
  - Clicking `Open sidebar` restores the document list.

- Existing focused bundle:
  - `pnpm exec vitest run tests/components/document-list.test.tsx`
  - `pnpm exec tsc --noEmit`

## Wiki Updates

Implementation should update `wiki/Document Editing Workflow.md` with the new
left sidebar header behavior, workspace title dropdown, and left sidebar
collapse/reopen controls.

`wiki/index.md` should mention Issue #85 in the current editing experience
status line. `wiki/log.md` should record the issue, spec, source files, tests,
and review evidence.

## Open Decisions Closed

- The workspace name text is the dropdown trigger.
- The trigger has no chevron or arrow.
- The dropdown spans the sidebar content width.
- The only first-slice menu item is `Settings`.
- The old gear slot becomes `PanelLeftClose`.
- The left sidebar collapse and matching `PanelLeftOpen` reopen behavior are in
  scope for this issue.
