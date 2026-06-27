# Document List Sidebar UX Design

## Context

Issue #137 fixes four small but related UX problems in the left document
sidebar:

- top-level `New document` and `New folder` toolbar actions flash the screen
  because they still rely on direct server-action redirect behavior
- after creating a document or folder, the sidebar does not intentionally scroll
  to the newly created row
- normal `Documents` navigation shows document path descriptions even though
  the user only needs the document title in that tree
- row `...` menus near the bottom of the list can open downward and disturb the
  visible sidebar area

The current code already has the right server-action contract for client-owned
creation. `createDocumentAction` and `createFolderAction` return the created id
when the submitted `FormData` includes `redirect=false`. Folder-scoped creation
from folder action menus already uses that path. The top-level toolbar is the
remaining direct form-submit surface.

Issue #131 also matters here: title-based display paths are still useful in
search and favorites, where path context disambiguates otherwise similar rows.
This follow-up only removes path descriptions from the normal document tree and
recents view.

## Decisions From Brainstorming

- Use the existing client-controlled creation path instead of adding new server
  actions.
- Keep top-level creation scoped to the workspace root.
- After creation, route to the created document or folder and scroll its sidebar
  row into view once the refreshed list contains it.
- Show title-only document rows in the normal `Documents` panel, including
  recents and the full tree.
- Keep title-based display path descriptions in `Search` and `Favorites`.
- Keep the current row menu implementation, but choose upward placement when a
  menu would collide with the lower viewport or sidebar scroll area.
- Do not introduce a new floating-menu dependency for this small correction.

## Goals

- Remove the visible full-page or sidebar flash from top-level document/folder
  creation.
- Make the created item easy to find immediately after creation.
- Make the normal document tree quieter and closer to a title list.
- Preserve search/favorites path context and stored-path search compatibility.
- Prevent bottom row menus from pushing or expanding the visible list area.
- Keep changes local to the document sidebar/navigation component family.

## Non-Goals

- Do not change the `Document.path` or `Folder.path` internal identity contract.
- Do not remove display paths from search results, favorite rows, action labels,
  settings import destinations, folder detail, or toolbar path chrome.
- Do not change folder-scoped creation semantics.
- Do not add a new UI menu library in this slice.
- Do not redesign sidebar row spacing, icons, sorting, favorites, or recents
  behavior beyond the requested path-description removal.

## Architecture

### Top-Level Creation

Move top-level toolbar creation from native form redirect to explicit click
handlers owned by `DocumentList`.

`DocumentCreateControls` should receive creation callbacks for the top-level
buttons. The callbacks create `FormData`, set the root ids to empty strings,
set `redirect=false`, then call the existing bound server action:

- document: `folderId=""`, `redirect="false"`
- folder: `parentFolderId=""`, `redirect="false"`

On success, `DocumentList` routes to the created item:

- document: `workspaceDocumentHref({ workspaceSlug, documentId })`
- folder: `/workspaces/${workspaceSlug}?folder=${folderId}`

The buttons should be disabled while the matching creation request is pending,
and failed creation should show the same style of toast used for folder menu
creation failures.

### Created Row Scrolling

`DocumentList` should keep a pending created target:

- `{ kind: "document", id }`
- `{ kind: "folder", id }`

Rows should expose stable DOM targets, for example:

- `data-document-row-id={document.id}`
- `data-folder-row-id={folder.id}`

After route/navigation refresh brings the created item into `documents` or
`folders`, an effect finds the matching row and calls:

```ts
row.scrollIntoView({ block: "nearest" });
```

The effect should clear the pending target after a successful scroll. If the row
is not present yet, it should leave the target pending for the next render. This
keeps the behavior robust across server refresh timing.

### Document Row Description Modes

`DocumentLinkRow` should accept an explicit description mode or boolean such as
`showDescription`.

- `Documents` panel recents: `showDescription={false}`
- `Documents` panel tree rows: `showDescription={false}`
- `Search`: default or `showDescription={true}`
- `Favorites`: default or `showDescription={true}`

This keeps the previous display-path helper intact. It only changes which
surfaces render the helper output.

Action labels should continue to use `documentActionLabel()`. Even when the row
body is title-only, the menu button accessible label can keep path context for
duplicate-title disambiguation.

### Row Menu Placement

Keep row menus rendered by the row components and add simple collision-aware
placement.

When a row action menu opens, measure the trigger button and the nearest
scroll/viewport boundary. If there is not enough room below for the menu height,
store an upward placement for that menu id. The menu class then switches between
the existing downward placement and an upward placement:

- down: `top-8`
- up: `bottom-8`

The same placement rule should apply to document rows, favorite folder rows, and
folder toggle rows. The target is a practical bottom-edge fix, not a full
floating-positioning system.

## Data Flow

1. User clicks top-level `New document` or `New folder`.
2. `DocumentList` marks the matching toolbar action pending.
3. `DocumentList` calls the existing create action with `redirect=false`.
4. The server action creates the item, revalidates the workspace route, and
   returns the created id.
5. `DocumentList` stores the pending created target and pushes the route to the
   created item.
6. Server-rendered props refresh with the new item.
7. A client effect detects that the pending item exists in the current list,
   scrolls the row into view, and clears the pending target.

If creation fails before returning an id, the pending state clears, no route is
pushed, no scroll target is stored, and a localized failure toast appears.

## Testing

Add focused component coverage in `tests/components/document-list.test.tsx`:

- top-level new document submits `redirect=false`, routes to the created
  document id, and does not rely on native redirect
- top-level new folder submits `redirect=false`, routes to the created folder
  id, and does not rely on native redirect
- top-level creation buttons guard against repeated clicks while pending
- a created document/folder target scrolls into view when it appears in the
  refreshed list
- normal `Documents` recents/tree rows show document titles without path
  descriptions
- search results still show title-based display paths
- favorite document rows still show title-based display paths
- bottom-edge menu placement chooses upward placement when there is insufficient
  room below

Existing server-action tests already cover returning ids when `redirect=false`
is present. They should remain unchanged unless the component tests reveal a
type mismatch in the action props.

## Wiki Updates

Implementation should update the smallest durable wiki surface if the behavior
change is committed:

- `wiki/Document Editing Workflow.md`: note that normal sidebar document rows
  are title-only while search/favorites keep display-path context.
- `wiki/index.md`: mention Issue #137 in the current editing experience status
  only if the implementation lands.
- `wiki/log.md`: record the design and implementation evidence when source
  changes are staged.

The known unresolved pasted-image warning in `wiki/designs/sidebar.md` should be
treated as unrelated baseline lint noise unless this task directly touches that
asset.
