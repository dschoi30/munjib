# Launch Workspace Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Issue #147 workspace management with a lower account/workspace drawer, slug-stable rename, soft archive, and localized controls.

**Architecture:** Keep the current workspace name as top sidebar chrome only, and move account/workspace actions into a lower drawer owned by `DocumentList`. Add a focused `lib/workspaces/management-service.ts` for workspace list/create/rename/archive behavior, then expose it through server actions bound by the workspace route. Use `Workspace.archivedAt` as the launch soft-archive flag and filter archived workspaces in route/auth redirect lookup.

**Tech Stack:** Next.js App Router server actions, React client components, Prisma/PostgreSQL, NextAuth client `signOut`, Vitest, Testing Library, existing `useI18n()` catalog.

---

## File Structure

- Modify: `prisma/schema.prisma` to add `Workspace.archivedAt DateTime?` and a slug/archive index.
- Create: `prisma/migrations/20260707013000_add_workspace_archive/migration.sql`.
- Modify: `lib/permissions/workspace.ts` to export `assertCanManageWorkspace`.
- Create: `lib/workspaces/management-service.ts` for list/create/rename/archive.
- Modify: `lib/auth/provisioning.ts` so auth redirects ignore archived workspaces.
- Modify: `app/workspaces/[workspaceSlug]/page.tsx` to reject archived workspaces and pass account/workspace props/actions.
- Modify: `app/workspaces/[workspaceSlug]/actions.ts` to add create/rename/archive workspace actions.
- Modify: `components/document-list.tsx` to remove the top Settings menu and add the lower account/workspace drawer.
- Modify: `components/workspace-settings-panel.tsx` to add a Workspace section for rename/archive.
- Modify: `lib/i18n/messages.ts` and `tests/i18n/messages.test.ts` for English/Korean labels.
- Test: `tests/workspaces/management-service.test.ts`, `tests/auth/provisioning.test.ts`, `tests/workspace-actions.test.ts`, `tests/components/document-list.test.tsx`, `tests/components/workspace-settings-panel.test.tsx`, `tests/permissions/workspace.test.ts`.
- Maintain: `wiki/Auth And Permissions Workflow.md`, `wiki/Munjib.md`, `wiki/Project PRD.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

## Task 1: Data Model And Permission Surface

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260707013000_add_workspace_archive/migration.sql`
- Modify: `lib/permissions/workspace.ts`
- Test: `tests/permissions/workspace.test.ts`

- [ ] **Step 1: Write the failing permission test**

Add assertions to `tests/permissions/workspace.test.ts`:

```ts
import {
  assertCanManageWorkspace,
  canManageWorkspace,
  canReadWorkspace,
  canWriteWorkspace,
} from "@/lib/permissions/workspace";

it.each(["OWNER", "ADMIN"] as const)("does not throw when %s manages", (role) => {
  expect(() => assertCanManageWorkspace(role)).not.toThrow();
});

it.each(["EDITOR", "VIEWER", null, undefined] as const)(
  "throws when %s manages",
  (role) => {
    expect(() => assertCanManageWorkspace(role)).toThrow("WORKSPACE_MANAGE_FORBIDDEN");
  },
);
```

- [ ] **Step 2: Run the red permission test**

Run: `./node_modules/.bin/vitest run tests/permissions/workspace.test.ts`

Expected: fail with `assertCanManageWorkspace` missing from `@/lib/permissions/workspace`.

- [ ] **Step 3: Add the permission helper**

Add this function to `lib/permissions/workspace.ts`:

```ts
export function assertCanManageWorkspace(role: WorkspaceRole | null | undefined) {
  if (!canManageWorkspace(role)) {
    throw new Error("WORKSPACE_MANAGE_FORBIDDEN");
  }
}
```

- [ ] **Step 4: Add the Prisma field and migration**

In `prisma/schema.prisma`, update `model Workspace`:

```prisma
  archivedAt     DateTime?

  @@unique([organizationId, slug])
  @@index([slug, archivedAt])
```

Create `prisma/migrations/20260707013000_add_workspace_archive/migration.sql`:

```sql
ALTER TABLE "Workspace" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Workspace_slug_archivedAt_idx" ON "Workspace"("slug", "archivedAt");
```

- [ ] **Step 5: Run validation for this task**

Run:

```bash
./node_modules/.bin/vitest run tests/permissions/workspace.test.ts
./node_modules/.bin/prisma validate
```

Expected: permission tests pass and Prisma schema validates. If Prisma engine download is blocked, rerun with the already approved `pnpm exec prisma validate` path and record the exact blocker.

## Task 2: Workspace Management Service

**Files:**
- Create: `lib/workspaces/management-service.ts`
- Test: `tests/workspaces/management-service.test.ts`
- Modify: `lib/service-errors.ts`

- [ ] **Step 1: Write service tests first**

Create `tests/workspaces/management-service.test.ts` using the repository's real Prisma test pattern. Cover these behaviors:

```ts
it("lists readable non-archived workspaces and excludes archived workspaces", async () => {});
it("creates a workspace for writer-or-better users and bootstraps launch memberships", async () => {});
it("rejects workspace creation for VIEWER users", async () => {});
it("renames Workspace.name without changing Workspace.slug", async () => {});
it("rejects rename and archive for non-managers", async () => {});
it("rejects archiving the only readable active workspace", async () => {});
it("archives a workspace and returns a fallback workspace slug", async () => {});
```

The creation test must assert the actor is `OWNER`, `mjadmin@munjib.com` is `ADMIN`, and `mjtrial@munjib.com` is `VIEWER` on the new workspace.

- [ ] **Step 2: Run the red service test**

Run: `./node_modules/.bin/vitest run tests/workspaces/management-service.test.ts`

Expected: fail because `@/lib/workspaces/management-service` does not exist.

- [ ] **Step 3: Add service error codes**

Add these entries to `SERVICE_ERROR_CODES` in `lib/service-errors.ts`:

```ts
WORKSPACE_NAME_REQUIRED: "WORKSPACE_NAME_REQUIRED",
WORKSPACE_CREATE_FORBIDDEN: "WORKSPACE_CREATE_FORBIDDEN",
WORKSPACE_MANAGE_FORBIDDEN: "WORKSPACE_MANAGE_FORBIDDEN",
WORKSPACE_ARCHIVE_LAST_ACTIVE: "WORKSPACE_ARCHIVE_LAST_ACTIVE",
```

- [ ] **Step 4: Implement the service**

Create `lib/workspaces/management-service.ts` with these exports:

```ts
export type ReadableWorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
};

export async function listReadableWorkspacesForUser(actorId: string): Promise<ReadableWorkspaceSummary[]>;
export async function createWorkspace(input: {
  actorId: string;
  currentWorkspaceSlug: string;
  name: string;
  language: Language;
}): Promise<{ id: string; name: string; slug: string }>;
export async function renameWorkspace(input: {
  workspaceSlug: string;
  actorId: string;
  name: string;
}): Promise<{ id: string; name: string; slug: string }>;
export async function archiveWorkspace(input: {
  workspaceSlug: string;
  actorId: string;
}): Promise<{ archivedWorkspaceSlug: string; fallbackWorkspaceSlug: string }>;
```

Implementation rules:

- `listReadableWorkspacesForUser` reads `workspaceMember.findMany` where `userId = actorId` and `workspace.archivedAt = null`, ordered by `createdAt asc`.
- `createWorkspace` resolves the actor's role on `currentWorkspaceSlug` with `archivedAt = null`, calls `assertCanWriteWorkspace`, creates a new organization/workspace pair inside a transaction, adds organization `OWNER`, and calls `ensureWorkspaceLaunchMemberships`.
- `renameWorkspace` trims the name, rejects empty names with `WORKSPACE_NAME_REQUIRED`, requires `assertCanManageWorkspace`, and updates only `Workspace.name`.
- `archiveWorkspace` requires `assertCanManageWorkspace`, finds another readable active workspace for fallback, rejects the last active workspace with `WORKSPACE_ARCHIVE_LAST_ACTIVE`, then sets `archivedAt: new Date()`.
- Slugs are stable on rename. New workspace slugs use a name slug plus a random suffix so global route lookup remains unambiguous for launch.

- [ ] **Step 5: Run service validation**

Run: `./node_modules/.bin/vitest run tests/workspaces/management-service.test.ts tests/workspaces/membership-bootstrap.test.ts tests/permissions/workspace.test.ts`

Expected: all listed tests pass.

## Task 3: Archived Workspace Redirects, Route Guard, And Server Actions

**Files:**
- Modify: `lib/auth/provisioning.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Test: `tests/auth/provisioning.test.ts`
- Test: `tests/workspace-actions.test.ts`

- [ ] **Step 1: Add redirect tests first**

In `tests/auth/provisioning.test.ts`, add coverage that `resolveAccessibleWorkspaceRedirect` rejects a callback path for an archived workspace and falls back to the first non-archived workspace.

Use a mocked `workspaceMember.findFirst` sequence:

```ts
tx.workspaceMember.findFirst
  .mockResolvedValueOnce(null)
  .mockResolvedValueOnce({ workspace: { slug: "active-workspace" } });
```

Assert the function returns `/workspaces/active-workspace`.

- [ ] **Step 2: Add action tests first**

Extend `tests/workspace-actions.test.ts` mocks with:

```ts
createWorkspace: vi.fn(),
renameWorkspace: vi.fn(),
archiveWorkspace: vi.fn(),
```

Add tests:

```ts
test("createWorkspaceAction creates and redirects to the new workspace", async () => {});
test("renameWorkspaceAction returns typed errors for invalid names", async () => {});
test("archiveWorkspaceAction redirects to the fallback workspace", async () => {});
```

- [ ] **Step 3: Run the red route/action tests**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/provisioning.test.ts tests/workspace-actions.test.ts
```

Expected: fail because archived filters/actions are missing.

- [ ] **Step 4: Update redirect filtering**

In `lib/auth/provisioning.ts`, update both workspace membership lookups in `resolveAccessibleWorkspaceRedirect`:

```ts
workspace: {
  slug: decodeURIComponent(callbackWorkspaceSlug),
  archivedAt: null,
}
```

and:

```ts
where: {
  userId: input.userId,
  workspace: { archivedAt: null },
}
```

- [ ] **Step 5: Update route guard and page props**

In `app/workspaces/[workspaceSlug]/page.tsx`:

- Add `archivedAt: null` to the `prisma.workspace.findFirst` where clause.
- Fetch `listReadableWorkspacesForUser(user.id)` after user authentication.
- Pass `workspaceName={workspace.name}`, `currentUser={{ name: user.name, email: user.email }}`, `readableWorkspaces={readableWorkspaces}`, `canManageWorkspace={canManageWorkspace(role)}`, and new bound workspace actions to `DocumentList`.

- [ ] **Step 6: Add server actions**

In `app/workspaces/[workspaceSlug]/actions.ts`, add:

```ts
export async function createWorkspaceAction(currentWorkspaceSlug: string, formData: FormData) {
  const user = await requireCurrentUser();
  const language = parseLanguage(formData.get("language")) ?? "en";
  const name = String(formData.get("name") ?? "").trim() || defaultWorkspaceNameForLanguage(language);
  const workspace = await createWorkspace({ actorId: user.id, currentWorkspaceSlug, name, language });
  revalidatePath(`/workspaces/${currentWorkspaceSlug}`);
  redirect(`/workspaces/${workspace.slug}`);
}
```

Add `renameWorkspaceAction` and `archiveWorkspaceAction` with typed return errors for known service codes, `revalidatePath`, and fallback redirect on archive.

- [ ] **Step 7: Run route/action validation**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/provisioning.test.ts tests/workspace-actions.test.ts
```

Expected: all listed tests pass.

## Task 4: I18n Catalog

**Files:**
- Modify: `lib/i18n/messages.ts`
- Modify: `tests/i18n/messages.test.ts`

- [ ] **Step 1: Write catalog tests first**

Add English/Korean expectations for:

```ts
account.menu
account.signedInAs
account.switchWorkspace
account.noOtherWorkspaces
account.addWorkspace
account.workspaceSettings
account.logOut
settings.workspace.nav
settings.workspace.title
settings.workspace.renameLabel
settings.workspace.renameSave
settings.workspace.archiveTitle
settings.workspace.archiveAction
settings.workspace.archiveLastWorkspace
```

- [ ] **Step 2: Run the red catalog tests**

Run: `./node_modules/.bin/vitest run tests/i18n/messages.test.ts`

Expected: fail because the keys are missing.

- [ ] **Step 3: Add English/Korean messages**

Add concise English and Korean strings. Use `signed in as {email}` in English and `{email}로 로그인됨` in Korean. Do not add current-workspace label copy.

- [ ] **Step 4: Run catalog validation**

Run: `./node_modules/.bin/vitest run tests/i18n/messages.test.ts`

Expected: catalog tests pass.

## Task 5: Lower Account Drawer And Top Menu Removal

**Files:**
- Modify: `components/document-list.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Add component tests first**

Update `baseProps` in `tests/components/document-list.test.tsx` with:

```ts
workspaceName: "Company Handbook",
currentUser: { name: "Noura", email: "noura@example.com" },
readableWorkspaces: [
  { id: "workspace-current", name: "Company Handbook", slug: "company-handbook", role: "OWNER" },
  { id: "workspace-eng", name: "Engineering", slug: "engineering", role: "EDITOR" },
],
canManageWorkspace: true,
createWorkspaceAction: async () => ({ error: undefined }),
renameWorkspaceAction: async () => ({ workspaceName: "Company Handbook" }),
archiveWorkspaceAction: async () => ({ error: undefined }),
```

Add tests that assert:

- The top workspace title is not a menu button and no top Settings menu exists.
- The lower account button opens a menu with signed-in identity, Switch workspace, Add workspace, Workspace settings, and Log out.
- The lower drawer does not contain `Current workspace:` and does not contain `Company Handbook`.
- The switch list includes `Engineering` and omits the current workspace.
- Korean language renders the account drawer labels in Korean.
- Read-only users cannot execute Add workspace and do not see Workspace settings.

Scope the lower-drawer absence assertions with `within(drawer)` so the expected top sidebar title `Company Handbook` does not fail the test.

- [ ] **Step 2: Run the red drawer tests**

Run: `./node_modules/.bin/vitest run tests/components/document-list.test.tsx`

Expected: fail because the current component still exposes the top workspace menu and has no lower account drawer.

- [ ] **Step 3: Implement the top chrome change**

In `components/document-list.tsx`:

- Replace the top `Button` workspace menu trigger with non-interactive title text using `workspaceName`.
- Keep the `PanelLeftClose` button.
- Remove `workspaceMenuOpen`, `workspaceMenuRef`, `openWorkspaceSettings` from the top chrome path.
- Ensure existing sidebar view switches still close `settingsOpen` and drawer state.

- [ ] **Step 4: Implement the lower account drawer**

Add state:

```ts
const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
```

Render a footer after the navigation body:

```tsx
<div className="sticky bottom-0 mt-4 border-t border-border bg-muted pt-3">
  <Button type="button" aria-label={t("account.menu")} aria-expanded={accountDrawerOpen}>
    <UserCircle className="h-4 w-4" aria-hidden="true" />
    <span className="min-w-0 truncate">{currentUser.email}</span>
  </Button>
  {accountDrawerOpen ? <AccountWorkspaceDrawer /> : null}
</div>
```

The drawer must:

- Render signed-in identity using email.
- Render a Switch workspace section that lists only `readableWorkspaces.filter((workspace) => workspace.slug !== workspaceSlug)`.
- Render no current workspace name and no `Current workspace:` label.
- Call `router.push(`/workspaces/${workspace.slug}`)` for workspace switching.
- Call `createWorkspaceAction` with `language` from `useI18n()`.
- Open settings with `setSettingsOpen(true)`.
- Call `signOut({ callbackUrl: "/login" })` for Log out.

- [ ] **Step 5: Run component validation**

Run: `./node_modules/.bin/vitest run tests/components/document-list.test.tsx tests/components/sidebar-loading-skeleton.test.tsx`

Expected: listed tests pass.

## Task 6: Workspace Settings Section

**Files:**
- Modify: `components/workspace-settings-panel.tsx`
- Test: `tests/components/workspace-settings-panel.test.tsx`
- Test: `tests/components/document-list.test.tsx`

- [ ] **Step 1: Write settings tests first**

Add props to settings panel tests:

```ts
workspaceName="Company Handbook"
canManageWorkspace={true}
renameWorkspaceAction={async () => ({ workspaceName: "Company Handbook" })}
archiveWorkspaceAction={async () => ({ error: undefined })}
```

Add tests:

```ts
it("opens Workspace settings from the lower account drawer", async () => {});
it("renames the workspace without changing the route slug", async () => {});
it("shows a localized archive-last-workspace error", async () => {});
it("disables workspace management controls for users without manage permission", () => {});
```

- [ ] **Step 2: Run the red settings tests**

Run:

```bash
./node_modules/.bin/vitest run tests/components/workspace-settings-panel.test.tsx tests/components/document-list.test.tsx
```

Expected: fail because the Workspace settings section is missing.

- [ ] **Step 3: Add Workspace section state and nav**

Change `SettingsSection` to include `"workspace"` and add a nav button with a settings/building icon:

```ts
type SettingsSection = "workspace" | "import" | "ai" | "retention" | "language";
```

Default `initialSection` should be `"workspace"` when opened from the account drawer and remain `"import"` for existing import-centric open paths if any remain.

- [ ] **Step 4: Add rename/archive UI**

The Workspace section contains:

- A text input labeled `settings.workspace.renameLabel`, initialized from `workspaceName`.
- A save button that calls `renameWorkspaceAction` with `name`.
- An archive button that calls `archiveWorkspaceAction`.
- A status line for saved/error states.

Disable rename/archive controls when `canManageWorkspace` is false. On archive success, the server action redirects, so no client redirect code is needed.

- [ ] **Step 5: Run settings validation**

Run:

```bash
./node_modules/.bin/vitest run tests/components/workspace-settings-panel.test.tsx tests/components/document-list.test.tsx
```

Expected: listed tests pass.

## Task 7: Integration Verification And Wiki Maintenance

**Files:**
- Modify: affected wiki pages from `pnpm wiki:sync-plan --staged`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Run focused implementation tests**

Run:

```bash
./node_modules/.bin/vitest run \
  tests/permissions/workspace.test.ts \
  tests/workspaces/management-service.test.ts \
  tests/auth/provisioning.test.ts \
  tests/workspace-actions.test.ts \
  tests/i18n/messages.test.ts \
  tests/components/document-list.test.tsx \
  tests/components/workspace-settings-panel.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run type and Prisma checks**

Run:

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/prisma validate
```

Expected: both commands exit 0. If Prisma engine download is blocked, capture the exact 403 or sandbox error and do not claim Prisma validation passed.

- [ ] **Step 3: Visual check**

Run the app with the existing dev-server workflow and inspect `/workspaces/company-handbook`. Confirm:

- top sidebar shows the workspace name and close icon only
- top Settings menu is absent
- lower account drawer contains account/workspace actions
- lower drawer does not render `Current workspace:` or `Company Handbook`
- Switch workspace lists other workspaces only

- [ ] **Step 4: Wiki maintenance**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

If the `pnpm` wrapper hits the ignored-builds guard, run the equivalent local scripts:

```bash
./node_modules/.bin/tsx scripts/wiki/sync-plan.ts --staged
./node_modules/.bin/tsx scripts/wiki/manifest.ts
./node_modules/.bin/tsx scripts/wiki/lint.ts
./node_modules/.bin/tsx scripts/wiki/sync-check.ts --staged
```

- [ ] **Step 5: Commit and PR workflow**

Run:

```bash
git diff --check
git status --short
git add <changed source files> <changed tests> <changed wiki files>
git commit -m "Add launch workspace management"
git push -u origin issue-147-launch-workspace-management
gh pr create --draft --fill
gh pr ready
```

Then wait at least 5 minutes and inspect PR review threads and checks with `gh pr view`, `gh pr checks`, and the review-thread script if needed.

## Self-Review Notes

- Spec coverage: the tasks cover top menu removal, lower drawer, no current-workspace label/name in the lower drawer, workspace switch/create/settings/logout, slug-stable rename, soft archive, archived route/auth guard, launch membership bootstrap, and English/Korean i18n.
- Placeholder scan: no unresolved placeholders remain in this plan.
- Type consistency: service action names and component prop names are consistent across server, component, and test tasks.
