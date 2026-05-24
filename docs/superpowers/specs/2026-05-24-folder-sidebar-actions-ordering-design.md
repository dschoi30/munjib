---
title: Folder Sidebar Actions And Ordering
date: 2026-05-24
issue: 57
status: approved
---

# Folder Sidebar Actions And Ordering

## Context

The workspace sidebar currently builds each folder subtree by merging folders and
documents, then sorting by path in ascending order. Folder rows reveal both a
direct `+` document action and a `...` action menu on hover.

The updated interaction should make folder rows quieter and more predictable:
folder rows expose only the menu trigger on hover, creation commands live in the
menu, and folder/document creation from that menu should avoid the visible
redirect flicker of progressive form submits.

The folder hierarchy wiki also still documents a path-qualified visual label for
duplicate document titles. The sidebar should instead display document titles
only.

## Requirements

- In each folder level, folders sort before documents.
- Folder rows sort by folder title/name in descending order.
- Document rows sort by document title in descending order.
- Sorting must be deterministic when titles match.
- Visible document row labels in the sidebar should always use `title` only.
- Remove the hover `+` button from folder rows.
- Add `Add folder` and `Add document` menu items to the folder `...` menu.
- `Add folder` creates a child folder under the selected folder.
- `Add document` creates a document under the selected folder.
- Folder-menu creation should avoid full redirect-style flicker and preserve the
  current sidebar state as much as possible.
- Update `wiki/Folder Hierarchy Model.md` to remove the `Title · /folder/title`
  display rule and document the title-only sidebar rule.

## Proposed Design

### Tree Ordering

`components/document-navigation/tree.ts` will own the ordering rule. The
comparator will first compare row kind so folders come before documents. It will
then compare folder `name` or document `title` in descending locale order.

When two same-kind rows have the same visible label, the comparator will fall
back to `path` and then `id` so rendered order is stable across refreshes.

### Title-Only Row Labels

The visible document label should render `document.title` directly in navigation
rows. Path-qualified context may remain in internal accessible labels or action
labels where it helps distinguish duplicate-title controls, but the visible row
text should not render `Title · /folder/title`.

### Folder Row Menu

`FolderToggleRow` will remove the inline `+` form. The hover/focus action area
will contain only the `...` button.

For writable users, the folder menu will show:

1. `Add folder`
2. `Add document`
3. `Rename`
4. `Move to trash`
5. `Add to favorites` or `Remove from favorites`

Read-only users will see creation, rename, and trash commands disabled, matching
the current disabled action style.

### No-Flicker Creation

Folder menu creation will be handled through async client-side callbacks in
`DocumentNavigation` instead of direct form submission from the row. The callback
will construct `FormData`, call the existing server action, close the menu, and
refresh the route inside a transition.

If the current server action contract only redirects and cannot be awaited
without navigation, the implementation will adjust the workspace action contract
for menu-scoped creation to return a result instead. Top-level toolbar creation
can keep its existing progressive form behavior.

Creation from a folder menu should not collapse expanded folders, switch panels,
or visibly clear/reload the sidebar before the route refresh resolves.

## Tests

- Component test for folder-first, descending title ordering within one parent.
- Component test that duplicate/path-backed documents render visible title text
  only.
- Component test that folder hover/actions no longer expose a direct `+` button.
- Component tests that folder menu `Add folder` and `Add document` pass the
  selected folder id to the correct creation action.
- Existing folder rename, archive, favorites, search, and settings tests should
  continue to pass.

## Wiki Updates

Update `wiki/Folder Hierarchy Model.md` to replace the old path-qualified visual
label rule with the title-only sidebar rule. Append a `wiki/log.md` entry for
issue #57 and regenerate `wiki/manifest.json`.
