# Launch Signup Login Real Auth Stack Design

## Context

Issue #146 turns the launch account foundation into real account entry. The
screen target is Lazyweb report Hypothesis #3, "Real Auth Stack":

https://www.lazyweb.com/report/lazyweb/3d6366ab-9fe9-4a97-84c1-e3a4a70a9695/?source=create

The mockup image for Hypothesis #3 is the visual source of truth. If report
text and the image disagree, the image wins. The reference image is stored at
`.lazyweb/lazyweb-design/launch-signup-login-2026-07-06/references/hypothesis-3-real-auth-stack.jpg`.

## Goals

- Replace the development-login-first screen with the Real Auth Stack layout.
- Render login text only after the browser language setting is known.
- Support Google, email/password login, email/password signup, and public
  read-only trial entry.
- Preserve the launch-safe development-login gate as a secondary dev-only
  affordance.
- Provision a default workspace for first-time email/password and Google users.
- Redirect authenticated users to an accessible workspace instead of hard-coded
  `company-handbook`.

## Visual Contract

The default sign-in card follows Hypothesis #3:

- Centered card on the existing warm page background.
- Title: `Welcome back`.
- Subtitle: `Sign in to continue to Munjib.`
- Full-width Google button at the top.
- Horizontal `or` divider.
- Email input.
- Password input with a visibility toggle icon.
- `Forgot password?` affordance aligned with the password label.
- Full-width primary `Sign in` button.
- Inline account switch row: `Don't have an account? Create one`.
- Divider before the trial row.
- Trial row with a small compass-style icon, `Explore demo (read-only)`, and a
  `No signup` pill.

Korean UI renders the same hierarchy with localized copy. The card should not
show English text first and then swap to Korean; it should wait for i18n
hydration before rendering text.

## Auth Providers

Use separate provider ids:

- `password`: credentials provider that requires email and password and verifies
  `User.passwordHash` with `verifyPassword()`.
- `development-login`: credentials provider that keeps the existing email-only
  seed-user shortcut behind `MUNJIB_ENABLE_DEV_LOGIN`.
- `trial`: credentials provider with no browser secret. It signs in
  `legacy-account-2@example.invalid` when the seeded user exists.
- `google`: NextAuth Google provider, enabled only when
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present.

Add the Prisma adapter so Google account linking uses the `Account` table from
Issue #145. Keep JWT session strategy and the existing `munjib.session-token`
cookie.

Google sign-in accepts only profiles with `email_verified=true`. Separate Munjib
email verification and password reset remain follow-ups.

## Provisioning And Redirects

Add a provisioning service that creates a default personal organization and
workspace for users who have no workspace memberships. It creates:

- organization
- organization owner membership
- workspace with localized name
- user `OWNER` workspace membership
- launch account memberships through `ensureWorkspaceLaunchMemberships()`

Default workspace display names are `My Workspace` and `내 워크스페이스`.
Workspace URL slugs are ASCII and collision-resistant, for example
`my-workspace-<short-user-id>`, because workspace routes currently use only
`Workspace.slug` even though the database uniqueness is scoped by organization.

Post-auth flows land on `/login/redirect`. That client page reads the hydrated
UI language, calls a server endpoint to ensure provisioning and resolve the
final destination, then redirects. If a safe app-local workspace callback is
accessible, use it. Otherwise choose the first accessible workspace. The current
schema has no workspace archive field, so "non-archived" means accessible
workspace in this issue; archive filtering belongs to Issue #147.

## Error Handling

- Invalid credentials return the localized credentials error.
- Duplicate signup email returns a localized email-in-use message.
- Weak signup password returns a localized password requirement message.
- Google configuration missing hides the Google button and shows no broken
  provider path.
- Forgot password is visible to match the mockup but displays localized
  unavailable copy because reset is a follow-up.
- The existing callback URL sanitization remains app-local and current-origin
  safe.

## Testing

Use TDD:

- Auth config tests locate providers by id, not array position.
- Password provider verifies hashes and rejects missing or wrong passwords.
- Trial provider signs in only the seeded trial user and exposes no password.
- Google provider is enabled only with env credentials and rejects unverified
  Google profiles.
- Provisioning tests assert localized workspace names, collision-resistant slug
  shape, owner/admin/trial memberships, and first accessible workspace redirect.
- LoginForm tests assert the Hypothesis #3 hierarchy in English and Korean,
  language hydration before text, Google/password/trial provider ids, signup
  toggle, and callback sanitization.
- Browser screenshot verification compares local `/login` against the saved
  Hypothesis #3 reference.

## Wiki Updates

Update `Auth And Permissions Workflow`, `wiki/index.md`, `wiki/log.md`, and the
manifest so durable knowledge distinguishes Issue #145's account foundation
from Issue #146's real auth stack.
