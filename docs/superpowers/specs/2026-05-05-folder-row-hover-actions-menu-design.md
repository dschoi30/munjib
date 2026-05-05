# Folder Row Hover Actions Menu Design

Date: 2026-05-05
Issue: #26 Folder row hover actions menu

## Context

Issue #20 added the real folder hierarchy. The current sidebar can render folders as accordion rows, create documents in the selected folder, and call existing folder services for rename and archive through server-side code paths. The remaining gap is the row-level interaction pattern shown in `wiki/designs/notion1.png`: folder rows should expose contextual actions on hover instead of requiring global buttons or always-visible icons.

The active #25 branch is separate work for markdown heading folding. This feature is isolated on `issue-26-folder-row-hover-actions-menu` and should avoid changing #25 files or assumptions unless source verification shows a direct dependency.

## Chosen Approach

Implement a narrow Notion-style folder row interaction on top of the existing sidebar and folder service model.

Folder rows will highlight on hover and keyboard focus. The row will reveal two compact actions on the right:

- `...` opens the folder action menu.
- `+` creates a new document inside that folder.

The menu will contain:

- Rename
- Move to trash
- Add to favorites

Rename and Move to trash will be real server-backed mutations using existing folder service behavior. Folder favorites will follow the current document favorites pattern and use browser `localStorage` scoped by workspace. This keeps the first implementation small and consistent with existing user-level favorites without adding schema, migration, or account-level sync.

## UI Behavior

### Folder Row

Default state:

- The folder row keeps the existing accordion behavior.
- The disclosure chevron remains the primary expand/collapse target.
- The folder name remains truncated within the row.
- `...` and `+` are visually hidden until hover or focus-within.

Hover/focus state:

- The entire folder row receives a light muted background, matching the reference image.
- The `...` and `+` buttons become visible.
- The selected folder row keeps its selected styling while still exposing the actions.

Interaction:

- Clicking the chevron/name toggles the folder expansion.
- Clicking `+` must not toggle the folder. It submits the existing create document action with that folder id and redirects to the new document.
- Clicking `...` must not toggle the folder. It opens a small menu aligned to the folder row.
- Escape or clicking another menu trigger closes the active menu.

### Menu

The menu is a compact popover rendered near the triggering row.

Items:

- Rename opens an inline rename state for that folder row.
- Move to trash submits an archive action.
- Add to favorites stores the folder id in workspace-scoped `localStorage`.

The menu labels use the requested lowercase wording style from the prompt only where the UI text already follows sentence-style casing. The visible labels will be `Rename`, `Move to trash`, and `Add to favorites` to match the existing app's concise command labels.

### Rename

Rename uses an inline text input in the folder row.

Behavior:

- The input starts with the current folder name.
- Enter submits the rename server action.
- Escape cancels the rename state.
- Blur does not submit automatically. This avoids accidental renames when the menu loses focus.
- Empty names are rejected client-side by disabling submit, while server validation remains authoritative.

After a successful rename, the folder service recalculates folder and descendant paths. The route should remain on the renamed folder when possible.

### Move To Trash

Move to trash calls a server action backed by `archiveFolder`.

Behavior:

- If the folder is empty, archive succeeds and the user returns to the workspace root or a valid remaining selection.
- If the folder is not empty, the existing service guard rejects the mutation. The UI should surface a concise error rather than silently doing nothing.
- No recursive archive is introduced in this feature.

### Add To Favorites

Folder favorites use `localStorage` with a workspace-scoped key. They should not require a database migration.

Behavior:

- Add to favorites stores the folder id.
- Once stored, the menu item reads `Remove from favorites` for that folder.
- The Favorites section may include both documents and folders. Folder favorites open/select the folder detail view instead of the editor.
- Favorite rows do not need a visible star button.

### Existing Star Icon Removal

The existing always-visible star icon on document rows will be removed as part of this feature. To avoid regressing document favorite behavior, document rows will also expose their favorite action through a row-level `...` menu using the same hover/focus pattern.

Document row menu items:

- Add to favorites or Remove from favorites

This keeps the visible sidebar consistent: favorite actions live in contextual menus, not in a dedicated star icon.

## Components And Data Flow

Primary component:

- `components/document-navigation.tsx`

Expected changes:

- Extend `FolderToggleRow` into a row with nested action buttons and menu state.
- Add a compact document row `...` menu for document favorite add/remove after removing the visible star icon.
- Pass `createAction` or a folder-specific create document form handler into `DocumentNavigation` so row-level `+` can create inside the target folder.
- Add server actions for folder rename and archive in `app/workspaces/[workspaceSlug]/actions.ts`.
- Keep favorite ids in client state, split by document and folder ids or use typed keys to avoid id collisions.

Server actions:

- `renameFolderAction(workspaceSlug, formData)`
- `archiveFolderAction(workspaceSlug, formData)`

Both actions must verify the current session through the existing `requireWorkspace` path or equivalent workspace authorization helper already used by create actions. They should redirect back to a stable workspace URL after success.

## Error Handling

- Rename validation errors should not corrupt client state. If the server rejects the rename, the UI should keep the row available and show a small error message or route-level error pattern consistent with existing actions.
- Archive of non-empty folders should show a clear message that the folder must be emptied first.
- Menu and rename state should be local UI state only. Reloading the page can clear them.
- `localStorage` parsing must tolerate invalid JSON and reset to empty favorites, matching the existing document favorite behavior.

## Accessibility

- `...` has an accessible label such as `Open actions for <folder name>`.
- `+` has an accessible label such as `New document in <folder name>`.
- The menu uses `role="menu"` and menu items are buttons/forms with descriptive labels.
- Inline rename input has an accessible label tied to the folder name.
- Keyboard users can tab into the row actions, open the menu, submit rename with Enter, and cancel with Escape.

## Testing

Focused tests:

- Server action or service-level coverage for folder rename and archive paths if not already covered by `tests/folders/service.test.ts`.
- Component behavior where practical: folder actions do not toggle expansion accidentally.
- E2E smoke for folder row hover/actions:
  - create a document with the row-level `+`
  - rename a folder from the menu
  - attempt moving a non-empty folder to trash and confirm it is blocked
  - favorite a folder and confirm it appears in Favorites
  - favorite a document through the document row menu and confirm the star icon is no longer present

Existing tests likely affected:

- `tests/e2e/login.spec.ts`
- `tests/folders/service.test.ts`
- `tests/workspace-tree.test.ts`

## Wiki Maintenance Requirements

This feature changes durable UI workflow knowledge for folder hierarchy. Implementation should update:

- `wiki/Folder Hierarchy Model.md`
- `wiki/Document Editing Workflow.md`
- `wiki/designs/index.md` if `notion1.png` becomes a durable design reference
- `wiki/index.md` only if navigation changes are needed
- `wiki/manifest.json`
- `wiki/log.md`

Before commit, run:

- `pnpm wiki:manifest`
- `pnpm wiki:lint`
- `pnpm wiki:sync-check --staged`

## Out Of Scope

- Database-backed favorites
- Folder-specific permissions
- Recursive trash/archive
- Drag-and-drop move UI
- Full document row action menu parity beyond favorite add/remove
- Persisting open menus or rename drafts across reloads

## Open Questions

No blocking open questions remain for the first implementation plan.
