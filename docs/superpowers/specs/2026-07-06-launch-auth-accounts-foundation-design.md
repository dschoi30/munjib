# Launch Auth Accounts Foundation Design

## Context

Issue #143 made the existing email-only development login safe for launch by
gating it behind `MUNJIB_ENABLE_DEV_LOGIN`. Issue #145 is the next foundation
slice: add durable account storage and seed identities that later signup,
password login, Google OAuth, trial login, and workspace creation can reuse.

This slice prepares the data model and seed/bootstrap behavior, but it does not
change the production login UI or introduce a new public signup flow.

## Decisions From Brainstorming

- Keep this branch limited to account-ready schema, password hashing, launch
  seed accounts, and workspace membership bootstrap.
- Represent global launch access through normal `WorkspaceMember` rows rather
  than a hidden superuser role.
- Seed `admin@example.invalid` as `ADMIN` on every workspace.
- Seed `trial@example.invalid` as `VIEWER` on every workspace.
- Keep production password auth, Google OAuth UI, signup provisioning, trial
  button behavior, invitations, and workspace-management UI for follow-up
  branches.

## Goals

- Add account fields and NextAuth adapter tables needed by later credentials
  and OAuth flows.
- Store launch passwords as salted hashes, never as database plaintext.
- Make seed reruns idempotent for launch users and launch memberships.
- Provide one reusable helper that later workspace-creation paths can call to
  add an owner plus launch admin/trial memberships.
- Preserve Issue #143 development-login gating exactly as-is.

## Non-Goals

- Do not add production email/password login to NextAuth in this branch.
- Do not add Google OAuth provider configuration or login buttons.
- Do not add signup routes, password reset, email verification mail, or
  invitation flows.
- Do not add workspace switcher, workspace creation UI, rename, archive, or
  logout controls.
- Do not bypass workspace permissions with hard-coded admin checks.

## Options Considered

### Recommended: Minimal Account Foundation

Add schema, password helper, seed accounts, and membership bootstrap now. This
keeps Issue #145 independently reviewable and gives later branches stable
primitives without changing user-facing auth behavior prematurely.

### Bundle Signup And Login

Add schema plus production signup/login in one PR. This would prove the new
fields end-to-end, but it also pulls in UI, callback, provisioning, OAuth, and
trial-login decisions that belong in the next branch.

### Add A Global Superuser Flag

Store admin/trial behavior as special-case user flags. This looks convenient,
but it would fork the permission model and make future workspace checks harder
to reason about. Normal `WorkspaceMember` rows keep access semantics explicit.

## Design

`prisma/schema.prisma` adds nullable `User.passwordHash` and
`User.emailVerified`. `emailVerified` intentionally matches the field name used
by the NextAuth Prisma adapter. `User.image` maps to the existing `avatarUrl`
database column so later adapter-backed OAuth can receive the field name it
expects without rewriting existing storage. The schema also adds `Account`,
`Session`, and `VerificationToken` models with the provider/account uniqueness
and session token uniqueness expected by OAuth account linking and
adapter-backed sessions.

`lib/auth/passwords.ts` owns password hashing and verification. Hashes use the
format `scrypt:<salt>:<derived-key>`, where the salt is random per hash and the
derived key is encoded with `base64url`. Verification rejects missing or
malformed hashes, derives the candidate key with the stored salt, checks buffer
length, and uses `timingSafeEqual` for the final comparison.

`lib/workspaces/membership-bootstrap.ts` owns launch account identity/role
constants and membership helpers. `ensureWorkspaceLaunchMemberships()` accepts a
Prisma transaction-like client, a workspace id, and an optional owner
membership. It looks up the launch users by email and upserts one membership row
per owner, admin seed, and trial seed. If the owner is also a launch account,
the explicit owner role wins. Existing launch-account `OWNER` rows also stay
`OWNER` during backfill. `backfillLaunchMembershipsForAllWorkspaces()` fetches
the launch users once, loops over existing workspaces, and applies the same
helper.

`prisma/seed.ts` creates the launch users with password hashes and
`emailVerified` timestamps, preserves existing launch password hashes and
verification timestamps on rerun, preserves the existing development fixture
users, seeds the handbook workspace, then ensures owner/admin/trial memberships
and backfills launch memberships across any other existing workspace.

## Error Handling And Data Safety

The launch passwords are plain strings only in `prisma/seed.ts` so seed can
generate hashes for new launch users. They are not exported from the runtime
membership helper and are not stored in the database as plaintext. The
membership helper tolerates the launch users not existing yet by only inserting
memberships for users it finds; the seed creates the users before calling it.

The helper updates existing membership roles to the launch policy so reruns can
repair drift for `mjadmin` and `mjtrial`. Later product flows that call the
helper must be explicit about the owner membership they want to preserve.

## Testing

Focused tests cover:

- Password hashes use the expected version prefix and do not contain plaintext.
- Correct passwords verify and wrong, missing, or malformed hashes fail.
- Launch account constants encode the final email and role policy.
- Workspace membership bootstrap upserts owner, admin, and trial rows.
- Backfill applies launch memberships to every workspace returned by Prisma.
- Existing Issue #143 auth config and workspace permission tests stay green.

## Wiki Updates

Update `Auth And Permissions Workflow`, `Document Knowledge Model`,
`wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json` so durable project
knowledge distinguishes Issue #143's login gate from Issue #145's account
foundation.

## Risks

This branch intentionally creates stored password hashes before production
password login exists. The hashes are seed-only primitives until the next branch
adds real credentials authorization. The main integration risk is schema drift:
Prisma validation/generation must run before the PR is considered complete.
