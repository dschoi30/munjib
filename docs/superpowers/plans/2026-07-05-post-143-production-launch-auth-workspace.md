# Post-Issue 143 Production Launch Auth and Workspace Plan

**Goal:** Continue after Issue #143 by turning the launch-safe development-login gate into production-ready account entry, default workspace provisioning, trial access, and multi-workspace management.

**Context:** Issue #143 intentionally stopped at disabling the unsafe email-only development login in production. This follow-up plan keeps that work as the base and splits the remaining production launch scope into reviewable branches.

**Confirmed product decisions:**

- Seed `admin@example.invalid` with password `local-only-fixture-1`.
- Seed `trial@example.invalid` with password `local-only-fixture-2`.
- `admin@example.invalid` must receive `ADMIN` membership on every existing and newly created workspace.
- `trial@example.invalid` must receive `VIEWER` membership on every existing and newly created workspace.
- Every normal signup creates a user-owned default workspace where the signing-up user is `OWNER`.
- Other users do not gain access to a workspace until a later sharing/collaboration feature grants `VIEWER` or `EDITOR` membership.
- Google signup/login trusts Google's verified identity and does not require a separate Munjib email verification step.
- Email/password signup is allowed to use the product immediately in the first launch slice; email verification and password reset are follow-up hardening work.
- Default workspace names follow the signup UI language: `My Workspace` for English and `내 워크스페이스` for Korean.
- Workspace deletion is soft archive, not hard delete, for the launch slice.
- The `Start trial` button signs in `trial@example.invalid` and lands in a readable demo workspace.

## Branch 1: `launch-auth-accounts-foundation`

**Purpose:** Add the durable account and seed foundation without changing the larger workspace UI yet.

### Scope

1. Add account-ready database fields and models.
   - Add `User.passwordHash` for email/password credentials.
   - Add `User.emailVerifiedAt` or map to the NextAuth-compatible `emailVerified` field.
   - Add NextAuth Prisma Adapter account/session/token models needed for Google OAuth account linking.
2. Add password hashing and verification helpers.
   - Use a server-only helper such as `lib/auth/passwords.ts`.
   - Never store plain-text passwords outside seed constants used to generate hashes.
3. Update seed/bootstrap behavior.
   - Create or update `admin@example.invalid` / `local-only-fixture-1`.
   - Create or update `trial@example.invalid` / `local-only-fixture-2`.
   - Backfill `local-only-fixture-1=ADMIN` and `local-only-fixture-2=VIEWER` on all existing workspaces.
   - Keep existing development users only as local/dev fixtures if still needed by tests.
4. Add reusable workspace membership bootstrap helper.
   - Any workspace creation path must add the owner plus global launch accounts.
   - Membership insertion must be idempotent.
5. Keep Issue #143's gated development login behavior intact.
   - Production email-only dev login remains disabled unless `MUNJIB_ENABLE_DEV_LOGIN=true`.

### Acceptance criteria

- Fresh seed creates `local-only-fixture-1` and `local-only-fixture-2` accounts with hashed passwords.
- Re-running seed is idempotent.
- Every existing workspace has exactly one `local-only-fixture-1` `ADMIN` membership and one `local-only-fixture-2` `VIEWER` membership.
- The existing Issue #143 tests for `MUNJIB_ENABLE_DEV_LOGIN` still pass.
- Workspace permission helpers do not need special-case superuser logic because global access is represented by `WorkspaceMember` rows.

### Suggested verification

```bash
pnpm prisma validate
pnpm prisma generate
pnpm db:seed
pnpm test -- tests/auth/config.test.ts tests/permissions/workspace.test.ts
pnpm lint
```

## Branch 2: `launch-signup-login`

**Purpose:** Add real user entry for email/password and Google while preserving the launch-safe dev-login gate.

### Scope

1. Replace the current dev-only login UX with production entry modes.
   - Login mode: email/password, Google, Start trial.
   - Signup mode: email/password signup and Google signup/login.
   - Keep development-login shortcuts only when the dev-login gate is enabled.
2. Add credentials password authentication.
   - Credentials authorize by verified password hash, not by email alone.
   - Dev email-only login must either become a distinct provider/id or remain visibly separated and gated.
3. Add Google OAuth.
   - Use NextAuth Google provider and Prisma adapter account linking.
   - Trust Google `email_verified` for immediate access.
   - Store provider identity through `Account`, not email-only assumptions.
4. Add signup provisioning.
   - On first email/password signup, create user, organization if required by the current model, default workspace, owner membership, `local-only-fixture-1` admin membership, and `local-only-fixture-2` viewer membership in one transaction.
   - On first Google login, run the same provisioning flow.
   - Resolve default workspace name from the signup UI language: English `My Workspace`, Korean `내 워크스페이스`.
5. Add trial login.
   - `Start trial` signs in `trial@example.invalid` using the seeded password path or a server action that does not expose secrets to the browser.
   - Redirect to the demo/readable workspace.
6. Redirect users to the first accessible non-archived workspace after login.

### Acceptance criteria

- New email/password users can sign up, immediately sign in, and land in their owned default workspace.
- New Google users can sign in without a separate Munjib email verification and land in their owned default workspace.
- `local-only-fixture-2` can read the demo workspace but cannot write documents or settings.
- `local-only-fixture-1` can manage every workspace through normal `ADMIN` membership.
- Existing unauthenticated redirects continue to sanitize callback URLs.
- Production still cannot use email-only dev login unless explicitly enabled.

### Suggested verification

```bash
pnpm prisma validate
pnpm test -- tests/auth/config.test.ts tests/components/login-form.test.tsx
pnpm test -- tests/auth/signup.test.ts tests/auth/google.test.ts
pnpm lint
```

## Branch 3: `launch-workspace-management`

**Purpose:** Add the workspace management surfaces users need after signup/login works.

### Scope

1. Add workspace list data to the app shell/dropdown.
   - Show current workspace name instead of the hard-coded `Company Handbook` label.
   - List all non-archived workspaces the user can read.
   - Preserve language hydration behavior from prior sidebar work.
2. Extend the workspace dropdown.
   - Switch workspace entries.
   - Add `Workspace settings`.
   - Add `Add workspace`.
   - Add `Log out` as the bottom action.
3. Add workspace creation.
   - Creator receives `OWNER`.
   - `local-only-fixture-1` receives `ADMIN`.
   - `local-only-fixture-2` receives `VIEWER`.
   - Default name follows current UI language unless the user supplies a name.
4. Add workspace settings management.
   - Rename current workspace.
   - Soft archive current workspace.
   - Prevent deleting the last owner-accessible workspace without a clear fallback path.
5. Add archived workspace guards.
   - Archived workspaces disappear from dropdown and default redirect queries.
   - Direct navigation to an archived workspace returns not-found or access-denied behavior consistently.

### Acceptance criteria

- Users can create multiple workspaces and switch between them.
- Renaming a workspace updates the dropdown and page chrome.
- Soft-archiving a workspace removes it from normal navigation without deleting documents.
- `VIEWER` users, including `local-only-fixture-2`, cannot create, rename, archive, import, edit, or change settings.
- Logout from the workspace dropdown clears the session and returns to `/login`.

### Suggested verification

```bash
pnpm test -- tests/workspaces/membership-bootstrap.test.ts tests/workspaces/management.test.ts
pnpm test -- tests/components/workspace-menu.test.tsx tests/components/settings-panel.test.tsx
pnpm lint
```

## Follow-up issues after the three launch branches

- Email verification for password accounts.
- Password reset and password change UX.
- Kakao social login.
- Workspace sharing/collaboration invitations and role management.
- Audit events for auth, workspace creation, rename, archive, and membership changes.
- Trial/demo content refresh workflow and abuse controls.
