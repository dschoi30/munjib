---
id: workflow-auth-and-permissions
title: Auth And Permissions Workflow
type: workflow
status: active
summary: Munjib의 launch 로그인 stack, 개발용 로그인 gate, NextAuth session, workspace role, document-level explicit permission 흐름.
created: 2026-04-29
updated: 2026-07-07
source_count: 49
tags:
  - munjib
  - auth
  - permissions
links:
  - "[[Munjib]]"
  - "[[Document Knowledge Model]]"
  - "[[Document Editing Workflow]]"
  - "[[Folder Hierarchy Model]]"
  - "[[Local Development Workflow]]"
---

# Auth And Permissions Workflow

Munjib의 현재 인증은 NextAuth 기반이며, launch login surface는 Google OAuth, email/password, read-only trial entry, 그리고 개발 환경 전용 shortcut을 분리한다. Issue #143의 email-only development login은 계속 gate되어 production에서는 명시 env 없이 열리지 않는다. SSO/SAML, invitation lifecycle, password reset은 아직 follow-up이다.

## Development login gate

Issue #143 keeps the email-only `development-login` Credentials provider for
development but gates authentication with `MUNJIB_ENABLE_DEV_LOGIN`. Local development
defaults to enabled so seed users can keep signing in, while production defaults
to disabled unless an operator explicitly sets `MUNJIB_ENABLE_DEV_LOGIN=true`.
When disabled, the provider returns `null` before querying `User`, and the login
form does not render the development shortcut section.

`/login` is forced dynamic so the disabled/enabled UI reflects the runtime env
gate rather than a statically baked build-time value. `/`, `/login`, and the
unauthenticated `/workspaces/[workspaceSlug]` entry point all pass the server
gate into `LoginForm`.

Production-style Docker also forwards `MUNJIB_ENABLE_DEV_LOGIN` into the `web`
service environment, so a host-local `/etc/munjib/env` override can reach the
runtime auth helper when operators intentionally enable the temporary
development login path.

이 gate의 목표는 개발용 provider가 운영 환경에서 실수로 열리지 않게 하는 launch hardening이다. 실제 launch 로그인은 별도 password/Google/trial provider가 처리한다.

## Session helper

서버 컴포넌트와 server action은 `requireCurrentUser()`를 통해 현재 사용자를 요구한다. 로그인되지 않은 상태에서 보호된 workspace로 접근하면 로그인 흐름으로 이동한다.

## Cookie namespace

NextAuth session cookie는 `munjib.session-token` 이름을 사용한다. 이 이름은 이전 `obsidian-clone.session-token` stale cookie가 `/login`에서 `JWT_SESSION_ERROR`를 일으키던 문제를 피하기 위해 분리된 것이다.

운영 환경에서는 기본적으로 secure cookie를 사용한다. HTTP-only IP 배포처럼 HTTPS가 아직 붙지 않은 임시 환경에서는 `NEXTAUTH_COOKIE_SECURE=false`로 session cookie의 secure flag를 끌 수 있다. Local HTTPS proxy 검증처럼 개발 환경에서 secure cookie를 강제해야 하면 `NEXTAUTH_COOKIE_SECURE=true`를 사용할 수 있다.

관련 테스트는 cookie 이름, dev fallback secret, HTTP 배포용 secure cookie override, development secure-cookie force 동작을 검증한다.

## Login redirect

`LoginForm`은 `callbackUrl`이 `/workspaces/...` 같은 app-local path이면 `signIn(..., { redirect: false })`가 반환한 absolute URL의 origin을 그대로 사용하지 않고 callback path로 이동한다. NextAuth가 server-side `NEXTAUTH_URL` 기준의 `http://localhost:3000/...` URL을 반환할 수 있기 때문에, client-side 이동은 현재 browser origin을 유지하는 relative path를 우선한다.

Callback sanitization은 단순 string prefix check가 아니라 `new URL(value, window.location.origin)` parsing 결과의 `origin`이 현재 browser origin과 같은지 확인한다. `/\evil.example`처럼 browser가 protocol-relative external URL로 normalize할 수 있는 malformed path는 기본 `/workspaces/company-handbook` callback으로 낮춰 `signIn()`에도 unsafe callback을 전달하지 않는다.

Issue #146 adds a post-auth landing step. The login form sends NextAuth to
`/login/redirect?callbackUrl=<workspace-path>` after Google, password, signup,
trial, or development shortcut sign-in. The client redirect page waits for the
hydrated display language, then POSTs that language and callback to
`/api/auth/landing`. The landing route ensures the current user has a workspace
and returns either an accessible sanitized callback workspace, the first
accessible workspace, or `/login`.

## Launch signup/login stack

Issue #146 implements the Real Auth Stack variant from the Lazyweb report. The
login UI waits for `useI18n().isHydrated` before rendering auth text, so a saved
Korean display language does not flash English copy first. The hydrated form
renders the report hierarchy: `Welcome back`, Google button, `or` divider,
email field, password field with forgot-password action and reveal icon, dark
primary sign-in button, create-account toggle, and read-only demo row. English
and Korean strings live in `lib/i18n/messages.ts`.

`lib/auth/config.ts` now exposes distinct NextAuth providers:

- `password`: credentials provider that finds `User.passwordHash` by normalized email and verifies it with `verifyPassword()`.
- `trial`: credentials provider with no browser-visible secret; it signs in the seeded `mjtrial@munjib.com` account.
- `development-login`: gated seed-user shortcut controlled by `MUNJIB_ENABLE_DEV_LOGIN`.
- `google`: OAuth provider added only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present. The `signIn` callback rejects Google profiles whose email is not verified.

`/api/auth/signup` creates email/password accounts through
`createPasswordSignup()`. It normalizes email, enforces an 8-character minimum
password, hashes the password with the existing `scrypt` helper, creates the
`User`, and provisions a personal organization plus default workspace. The
workspace name is localized from the hydrated UI language: `My Workspace` for
English and `내 워크스페이스` for Korean. Workspace creation also calls the
launch membership bootstrap so the new user is `OWNER`, `mjadmin@munjib.com`
is `ADMIN`, and `mjtrial@munjib.com` is `VIEWER`.

## Launch workspace management

Issue #147 implements the Lazyweb Hypothesis #3 Account Drawer direction with
two product adjustments: the upper sidebar Settings-only menu is removed, and
the lower account drawer does not repeat either `Current workspace:` or the
current workspace name because the workspace title is already prominent at the
top of the sidebar.

`DocumentList` now renders the top workspace name as static chrome and owns a
lower account/workspace drawer for workspace switch, add workspace, workspace
settings, and log out. The drawer gets localized text from `useI18n()`, lists
readable non-archived workspaces other than the current workspace, creates a
workspace using the hydrated language default name, shows localized failure
feedback when creation is rejected, and logs out through
`signOut({ callbackUrl: "/login" })`. The settings entry stays reachable from
the lower drawer for all signed-in workspace members; manager-only identity
controls are disabled inside the settings panel when the actor cannot manage the
workspace.

`WorkspaceSettingsPanel` now opens to a `Workspace` section by default. Workspace
managers can rename the workspace and soft archive it there; Import, AI,
Retention, and Language remain settings nav sections. Rename updates only
`Workspace.name`, preserving `Workspace.slug`.

`Workspace.archivedAt` is the launch soft-archive flag.
`app/workspaces/[workspaceSlug]/page.tsx` uses `buildWorkspacePageWhere()` so a
direct workspace route must match the requested slug, `archivedAt: null`, and a
membership for the current actor. This avoids false 404s when different
organizations reuse the same workspace slug. `resolveAccessibleWorkspaceRedirect()`
and `ensureDefaultWorkspaceForUser()` ignore archived memberships for landing
fallback/provisioning, and `listReadableWorkspacesForUser()` excludes archived
workspaces from the drawer. Archive is blocked when the actor has no other
readable active workspace to land in. Browser-tab write paths also reject
archived workspaces in document and folder services, including document version
restore and broken-link document creation, so a tab opened before archive cannot
keep creating or editing workspace data after archive.

`lib/workspaces/management-service.ts` owns the focused workspace operations.
Workspace creation requires writer-or-better permission on the current
workspace, creates a new organization/workspace pair, makes the actor `OWNER`,
and reuses the launch membership bootstrap for `mjadmin@munjib.com` as `ADMIN`
and `mjtrial@munjib.com` as `VIEWER`. Workspace rename/archive require
`OWNER` or `ADMIN` via `assertCanManageWorkspace()`.

## Workspace role

현재 runtime 권한의 기본값은 `WorkspaceMember.role`이다.

- 읽기 가능: `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`
- 쓰기 가능: `OWNER`, `ADMIN`, `EDITOR`
- 관리 가능: `OWNER`, `ADMIN`

`assertCanReadWorkspace()`와 `assertCanWriteWorkspace()`는 role이 없거나 권한이 부족하면 명시적 error를 던진다.

## Document-level explicit permission

`Permission` table은 `resourceType=DOCUMENT`, `subjectType=USER`, `permission=READ|WRITE|MANAGE` 형태의 explicit document permission을 지원한다.

문서에 explicit permission row가 하나라도 있으면 workspace role만으로는 충분하지 않다. `canReadDocument()`와 `canWriteDocument()`는 workspace role, explicit permission count, actor의 highest permission을 함께 판단한다.

- explicit permission이 없는 문서: workspace role 기준으로 읽기/쓰기를 허용한다.
- explicit permission이 있는 문서: 사용자에게 충분한 document permission이 있어야 읽기/쓰기 가능하다.
- `MANAGE`는 read/write보다 높은 권한으로 취급된다.

Workspace page는 문서 목록과 search 대상에서 읽을 수 없는 문서를 제외한다. Link panel도 outgoing target과 backlink source document를 permission-aware하게 필터링한다.

## 문서 service에서의 권한 적용

`createDocument()`는 workspace slug와 actor id로 membership을 찾고 write 권한을 요구한다.

Issue #20의 folder hierarchy MVP에서 folder 생성, 이름 변경, 이동, archive는 workspace write 권한을 요구한다. Folder-specific permission과 folder-to-document inherited ACL은 MVP 범위에서 제외한다. 기존 document-level explicit permission은 문서 read/write 판단에만 적용된다.

`updateDocument()`와 `archiveDocument()`는 document id로 document와 workspace membership을 함께 찾고 read/write 권한을 요구한다.

`createDocumentFromBrokenLink()`는 link id로 workspace membership을 찾고 read/write 권한을 모두 요구한다.

`restoreDocumentVersion()`, attachment upload, comment creation도 document-level permission을 확인한다. Attachment download는 document read permission을 요구하고, upload/comment는 write 가능한 사용자만 수행한다.

## Launch account foundation

Issue #145 added durable account columns and OAuth-ready NextAuth adapter tables. `User.passwordHash` stores a server-generated `scrypt:<salt>:<derived-key>` password hash, `User.emailVerified` is the NextAuth-compatible timestamp used by email/password and OAuth flows, and Prisma `User.image` maps to the existing `avatarUrl` database column so adapter-backed OAuth can use the expected field name. `Account`, `Session`, and `VerificationToken` are present so Google OAuth account linking can use normal adapter rows.

`lib/auth/passwords.ts` owns password hashing and verification. It generates a random salt for each hash, uses Node `scrypt`, and compares derived keys with `timingSafeEqual`; plaintext launch passwords remain only seed constants used to generate hashes.

`lib/workspaces/membership-bootstrap.ts` defines the launch global accounts and idempotent membership bootstrap helper. Workspace creation code can pass an owner membership, and the helper also upserts `mjadmin@munjib.com` as `ADMIN` plus `mjtrial@munjib.com` as `VIEWER` whenever those launch users exist. If the owner is also a launch account, the explicit owner role wins. Existing launch-account `OWNER` rows also stay `OWNER` during backfill. The backfill helper fetches launch users once and applies the same launch memberships to every existing workspace, so permission helpers continue to reason only about `WorkspaceMember.role` rows rather than hard-coded superusers.

## Seed 사용자

`prisma/seed.ts`는 다음 사용자와 workspace를 만든다.

- `mjadmin@munjib.com` / password seed constant `mjadmin` / global `ADMIN` membership
- `mjtrial@munjib.com` / password seed constant `mjtrial` / global `VIEWER` membership
- `owner@example.com`
- `editor@example.com`
- `viewer@example.com`
- workspace: `company-handbook`

Seed reruns preserve existing launch account hashes and email verification timestamps, preserve the local development fixture users, and upsert launch memberships so each existing workspace has one admin launch row and one trial viewer row unless a launch account is already an explicit `OWNER`. 테스트나 수동 검증에서 이 seed data를 기준으로 역할별 동작을 확인할 수 있다.

## 근거

- `lib/auth/config.ts`
- `lib/auth/session.ts`
- `app/login/login-form.tsx`
- `app/login/page.tsx`
- `app/login/redirect/page.tsx`
- `app/page.tsx`
- `app/workspaces/[workspaceSlug]/page.tsx`
- `app/api/auth/signup/route.ts`
- `app/api/auth/landing/route.ts`
- `lib/auth/provisioning.ts`
- `lib/workspaces/management-service.ts`
- `lib/workspaces/page-query.ts`
- `lib/documents/service.ts`
- `lib/folders/service.ts`
- `components/document-list.tsx`
- `components/workspace-settings-panel.tsx`
- `tests/workspaces/management-service.test.ts`
- `docker-compose.yml`
- `lib/i18n/messages.ts`
- `docs/superpowers/specs/2026-07-06-launch-signup-login-real-auth-stack-design.md`
- `docs/superpowers/specs/2026-07-07-launch-workspace-management-design.md`
- `docs/superpowers/plans/2026-07-07-launch-workspace-management.md`
- `docs/superpowers/plans/2026-07-06-launch-signup-login-real-auth-stack.md`
- `docs/superpowers/specs/2026-07-04-launch-auth-foundation-design.md`
- `docs/superpowers/specs/2026-07-06-launch-auth-accounts-foundation-design.md`
- `docs/superpowers/plans/2026-07-06-launch-auth-accounts-foundation-completion.md`
- `lib/permissions/workspace.ts`
- `lib/permissions/document.ts`
- `lib/wiki-links/service.ts`
- `lib/attachments/service.ts`
- `tests/auth/config.test.ts`
- `tests/auth/provisioning.test.ts`
- `tests/auth/login-gate-callers.test.ts`
- `tests/components/login-form.test.tsx`
- `tests/docker/compose.test.ts`
- `tests/permissions/document.test.ts`
- `prisma/seed.ts`
- `prisma/migrations/20260705090000_add_auth_accounts_foundation/migration.sql`
- `lib/auth/passwords.ts`
- `lib/workspaces/membership-bootstrap.ts`
- `tests/auth/passwords.test.ts`
- `tests/workspaces/membership-bootstrap.test.ts`
