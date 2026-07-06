# Launch Workspace Management Design

## Context

Issue #147 adds launch-ready workspace management after the real auth stack. The target surface is the authenticated workspace app shell, especially the left sidebar chrome and settings panel.

Lazyweb report: https://www.lazyweb.com/report/lazyweb/36982f10-0f6b-4dfa-8c84-3a039c876e9a/?source=create

Chosen variant: Hypothesis #3, "Account Drawer".

The selected direction is to make account and workspace actions explicit in the lower sidebar drawer. The upper sidebar workspace title remains the single prominent display of the current workspace. The lower account drawer must not repeat "Current workspace:" or the current workspace name.

## Product Decisions

- Remove the upper one-item Settings menu from the workspace title area.
- Keep the current workspace name displayed at the top of the sidebar.
- Add a lower account/workspace drawer anchored to the signed-in user row.
- Put workspace switching, workspace creation, workspace settings, and log out in the lower drawer.
- Do not implement Personal settings in this issue. It is a separate user-account surface and would add scope without helping #147 acceptance criteria.
- Keep workspace rename URL-stable: renaming changes `Workspace.name`, not `Workspace.slug`.
- Represent soft-archived workspaces with `Workspace.archivedAt`.
- Hide archived workspaces from normal navigation and treat direct archived workspace access as not found.
- Respect the user's browser language when rendering new UI text and when choosing the default new workspace name.

## UI Design

The left sidebar top chrome shows the current workspace name as the large context label, with the existing sidebar collapse control beside it. It no longer opens a Settings-only menu.

The sidebar footer gains an account button showing the signed-in user's compact identity. Opening it reveals a drawer with:

- signed-in identity
- Switch workspace
- Add workspace, when the current role can create
- Workspace settings, when the current role can open workspace settings
- Log out

The drawer intentionally does not show `Current workspace:` and does not repeat the current workspace name. Users already see the workspace name at the top of the sidebar.

Switch workspace expands to the readable, non-archived workspace list, excluding the current workspace. Selecting a workspace navigates to `/workspaces/{slug}`. If there are no other readable workspaces, the drawer shows a localized empty state instead of repeating the current workspace name.

Workspace settings opens the existing settings dialog with a new Workspace section for rename and soft archive. Workspace-level management controls are visible only for manageable roles. Import and document-retention controls keep their existing writer checks.

VIEWER users cannot create workspaces, rename, archive, import, edit, or change workspace settings. In the drawer, restricted workspace-management actions are either hidden or disabled with a lock treatment; they must not be executable.

## Data Model

Add `Workspace.archivedAt DateTime?`.

No workspace archive enum is needed for launch. A nullable timestamp is enough to hide and guard archived records while preserving documents, folders, members, audit history, and stable slugs.

Do not add archive deletion. Archive is reversible at the data level but no restore UI is in scope.

## Service Design

Add `lib/workspaces/management-service.ts` with focused operations:

- `listReadableWorkspacesForUser(actorId)` returns readable, non-archived workspaces ordered for the drawer.
- `createWorkspace({ actorId, name, language })` creates an organization/workspace pair, gives the actor OWNER membership, and calls `ensureWorkspaceLaunchMemberships` so `legacy-account-1@example.invalid` is ADMIN and `legacy-account-2@example.invalid` is VIEWER.
- `renameWorkspace({ workspaceSlug, actorId, name })` requires workspace manage permission and updates only `name`.
- `archiveWorkspace({ workspaceSlug, actorId })` requires workspace manage permission, sets `archivedAt`, and returns a fallback active workspace slug.
- `resolveAccessibleWorkspaceRedirect` and direct workspace page lookup must ignore archived workspaces.

Add `assertCanManageWorkspace` to `lib/permissions/workspace.ts`.

Creation permission is based on the current workspace role: VIEWER cannot create. Writer-or-better roles can create a new workspace, where the creator becomes OWNER of that new workspace.

Archive prevention: the actor cannot archive the current workspace when doing so would leave them without another readable, non-archived workspace to land in. The action returns an explicit service error and the UI shows a localized failure message.

## Server Actions

Extend the workspace route actions with thin wrappers:

- `createWorkspaceAction(formData)` validates a localized name/default name and redirects to the new workspace.
- `renameWorkspaceAction(workspaceSlug, formData)` validates non-empty name, saves, and revalidates current workspace routes.
- `archiveWorkspaceAction(workspaceSlug, formData)` archives, revalidates, and redirects to the fallback workspace.

The actions should catch known service errors and return typed error codes for inline UI status. Unknown errors may still throw.

## Internationalization

Add English and Korean message keys for:

- account drawer labels
- switch workspace
- add workspace
- workspace settings
- log out
- rename workspace
- archive workspace
- locked or unavailable workspace-management actions
- archive-last-workspace error
- create/rename/archive success and failure states

All drawer and settings text must render through `useI18n()`. The app should keep the existing sidebar loading skeleton until language hydration completes.

## Testing

Use test-first implementation.

Service tests:

- creation gives actor OWNER and launch users ADMIN/VIEWER
- readable workspace listing excludes archived workspaces
- direct archived workspace resolution fails
- rename changes name but not slug
- VIEWER cannot create, rename, or archive
- archive fails when no fallback active workspace exists
- archive succeeds and returns fallback when another active workspace exists

Component tests:

- upper workspace title no longer exposes a Settings menu item
- lower account drawer contains Switch workspace, Add workspace, Workspace settings, and Log out
- lower drawer does not render `Current workspace:` or the current workspace name
- workspace switch list renders other readable active workspaces and omits the current workspace
- VIEWER cannot execute restricted actions
- UI labels render in Korean after language selection

Route/action tests:

- workspace page rejects archived workspace slugs
- create action redirects to the new workspace
- archive action redirects to fallback
- logout action clears session through NextAuth `signOut({ callbackUrl: "/login" })`

Visual verification:

- run the local app and compare the final sidebar against Lazyweb H3 Account Drawer
- confirm the intentional differences: no upper Settings card, no lower current-workspace label, no lower duplicate workspace name

## Out Of Scope

- Personal settings page or dialog
- restoring archived workspaces from the UI
- changing workspace slug on rename
- organization-level role management
- billing or plan management
