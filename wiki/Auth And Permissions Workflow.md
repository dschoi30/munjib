---
id: workflow-auth-and-permissions
title: Auth And Permissions Workflow
type: workflow
status: active
summary: Munjib의 launch 로그인 stack, 개발용 로그인 gate, NextAuth session, workspace role, document-level explicit permission 흐름.
created: 2026-04-29
updated: 2026-08-25
source_count: 121
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

Munjib의 현재 인증은 NextAuth 기반이며, launch login surface는 Google OAuth, email/password, read-only trial entry, 그리고 개발 환경 전용 shortcut을 분리한다. Issue #143의 email-only development login은 개발 환경 전용이며 production에서는 항상 닫혀 있다. SSO/SAML, invitation lifecycle, password reset은 아직 follow-up이다.

## Development login gate

Issue #143 keeps the email-only `development-login` Credentials provider for
development but gates authentication with `MUNJIB_ENABLE_DEV_LOGIN`. Local development
defaults to enabled so seed users can keep signing in, while production defaults
to disabled in production; the production Compose contract hard-codes
`MUNJIB_ENABLE_DEV_LOGIN=false`, while the development override defaults it to
enabled.
When disabled, the provider returns `null` before querying `User`, and the login
form does not render the development shortcut section.

`/login` is forced dynamic so the disabled/enabled UI reflects the runtime env
gate rather than a statically baked build-time value. `/`, `/login`, and the
unauthenticated `/workspaces/[workspaceSlug]` entry point all pass the server
gate into `LoginForm`.

Production-style Docker sets `MUNJIB_ENABLE_DEV_LOGIN=false` literally. A
host-local `/etc/munjib/env` override cannot enable the temporary development
login path; the strict production runtime validator rejects an attempted
`true` value. Only `docker-compose.dev.yml` forwards a direct development
override.

이 gate의 목표는 개발용 provider가 운영 환경에서 실수로 열리지 않게 하는 launch hardening이다. 실제 계정 로그인은 password/Google provider가 처리하고, 가입 없는 Trial은 NextAuth identity가 아니라 별도 anonymous capability가 처리한다.

### Fail-closed auth runtime

`MUNJIB_DEPLOYMENT_ENV` selects one strict runtime contract. Staging and production
load `NEXTAUTH_SECRET_FILE` and optional `GOOGLE_CLIENT_SECRET_FILE` through the
same no-follow, same-FD, owner/mode/size-bounded reader; direct secret environment
values are forbidden. The runtime also requires one canonical origin, Secure cookies,
disabled development login, and closed password/OAuth signup.
The reader also compares the pre-open path identity with the opened descriptor to
reject a path swap before consuming the bounded secret bytes, and treats Unicode
line separators and all C1 controls as content violations alongside ASCII
controls/newlines. A leading UTF-8 BOM is preserved during decoding so it cannot
be normalized into an accepted secret. The
descriptor also uses close-on-exec semantics on Linux and Darwin.

Local development may leave `NEXTAUTH_SECRET` empty: `docker-compose.dev.yml`
passes an empty optional override and `resolveAuthSecret()` supplies the stable
development compatibility value. The value is assembled from non-contiguous
source fragments so a production-source secret scan cannot mistake it for a
deployable credential. Strict staging/production validation never uses that
fallback and rejects its decoded value, as well as the other known local fallback
vectors, with `AUTH_SECRET_FALLBACK`.

## Closed signup covers OAuth

Closed mode allows Google only when the exact provider account identifier already
exists in `Account` and every legacy token/expiry column is SQL `NULL`.
`email_verified` alone cannot create or link a user. A guarded adapter rejects
`createUser` and new `linkAccount` calls before delegate persistence, so callback
ordering cannot turn a verified email into signup. Password signup returns the
stable `403 SIGNUP_NOT_ALLOWED` response and the login form keeps password sign-in
and already-linked Google controls while omitting account creation.
The frozen downstream hook contract also reserves durable-state, password-admission,
OAuth start/identity, JWT/session-output, auth-mutation, and candidate policy slots;
Leaf 1 owns their call order and final media postcondition.

The callback boundary projects Google account/profile input to only
`provider`/`providerAccountId` and `email`/`email_verified` before any downstream
hook runs. Linked Google sign-in, JWT creation, and session projection each call
the durable-auth-state hook before returning protected state. JWT output is
sanitized again after downstream claims resolution and restores the original
validated `sub`, so hooks cannot add provider media or replace identity. Session
avatar resolution uses `getReadableAttachment()` with the current user's
workspace/document ACL; missing, malformed, or unauthorized attachment images
fail closed to `null`. All server-side `LoginForm` callers pass the closed signup
gate, and the component default is also fail closed.

## Isolated anonymous Trial principal

Issue #212 Task 3 keeps the anonymous Trial outside NextAuth and ordinary
`User.id` identity. `resolveAnonymousTrialCapability()` defaults closed and
opens only with an explicit positive global ceiling, one canonical demo
workspace ID (with a slug used only as display metadata), an exact canonical
Turnstile hostname/action, and fixed-path secret files in staging/production.
Production and staging also require a file-backed edge-proof secret: a bounded
timestamp and HMAC bind the normalized client IP to the exact request method
and pathname, so a raw `x-munjib-trusted-client-ip` header is never sufficient.
Only development may opt into the explicit raw-header resolver, and that mode
remains closed unless separately enabled.
The signing, visitor-digest, network-bucket, and Turnstile secret bytes are
never returned to the browser. The legacy development-only
`legacy-account-2@example.invalid` Credentials provider is not queried, reactivated, or used
as the anonymous authorization principal.

Issue #212 Task 7 removes that legacy provider even from development registration.
`LoginForm` now POSTs `/api/trial/entitlement`, accepts only the server-owned
`/trial/workspaces/<exact-slug>` public entry projection, and follows it only
after the opaque HttpOnly visitor cookie can be issued. Capability, edge-proof,
challenge, malformed JSON, and non-local path failures stay on the login page.
When the server requires escalation, the form loads Cloudflare Turnstile only
from `https://challenges.cloudflare.com`, using the public
`MUNJIB_TURNSTILE_SITE_KEY`, and submits the bounded single-use token exactly
once. Missing site-key configuration, widget load/error/expiry/timeout, a
second challenge response, or malformed entry output fails closed without
storing or logging the token. The secret remains server-only.
Every server-rendered login gate (`/login`, `/`, and the unauthenticated
workspace page) resolves the same validated public site key and passes it to
`LoginForm`; therefore Turnstile escalation works consistently regardless of
which login surface a fresh visitor enters through.
The dedicated Trial viewer re-verifies the cookie plus fresh edge proof for its
own GET pathname, resolves the immutable workspace ID and exact slug together,
and loads only active documents with no explicit permission rows. It does not
use `WorkspaceMember`, USER grants, account navigation, server actions, or a
shared `User`; Workspace AI remains the stateless anonymous route from Task 5.

The DB-independent Task 7 privacy source contract additionally locks the public
entitlement projection against visitor/network identifiers or digests, keeps
the visitor cookie HttpOnly/Secure/SameSite=Lax with a maximum 180-day lifetime,
proves the legacy `trial` provider stays absent, and requires production Trial
activation to remain exact-`true` opt-in and absent from the default Compose env.

`requireAiActor(request)` preserves the existing authenticated-user shape, but
returns anonymous callers as a separate admission actor plus an
`anonymous-trial-demo` authorization principal. That principal is valid only
when the resolved workspace row's immutable ID equals the server-owned demo
workspace ID, projects only `VIEWER`, and has no `userId` or USER-grant subject.
Path slugs never authorize the principal, including a same-slug workspace in a
different organization. `resolveAiWorkspaceAuthorization()` exposes this denial
boundary to the Ask AI and Workspace AI integrations instead of letting callers
substitute the visitor subject into `WorkspaceMember.userId`.

Visitor signing-key rotation is bounded by an exact previous-key cutoff. The
previous key is accepted only strictly before that instant, and visitor tokens
with a future issued-at value or a signed lifetime over 180 days are rejected.

Workspace AI must not persist anonymous conversations under a static or legacy
`AiChatThread.userId`, because that would share history across visitors. Its
Task 5 integration must use a visitor-keyed non-shared conversation path or an
explicitly stateless Trial path. Until such a path is installed, the anonymous
conversation branch stays fail closed.

## Active-resource authorization boundary

Issue #159 reserves one shared resolver/lock boundary for future archive,
document-access, attachment, comment, link, history, AI, and retention callers.
`lib/authorization/active-resources.ts` delegates document ACL lookup to the
version-zero Leaf 6 slot and refuses normal authorization until the canonical
database-time `resolveActiveWorkspaceMembership(workspaceId, userId)` authority
is installed. It intentionally does not query `WorkspaceMember` as a fallback,
so a missing authority cannot enumerate archived resources or create a second
source of truth. `lib/authorization/active-resource-locks.ts` provides the
schema-safe actor advisory lock and deterministic workspace, sorted-folder, and
document row locks; it does not introduce archive provenance columns or mutation
callers.

The Leaf 14 production purge seam is likewise version zero and fail closed. Both
logical and physical destructive authorization raise an integration-not-installed
error until independent journal, restore, and provider evidence is composed by
its own owner. The reserved Leaf 6/Leaf 14 paths and their hashes live in
`deploy/security/protected-artifact-owners.json`; this branch changes no schema,
archive state, purge rows, or production behavior.

Issue #160 adds the dependency-safe Leaf 6 decision seam without activating a
new authority. `lib/authorization/document-acl-entrypoint.ts` must resolve the
active document resource before loading Leaf 6 access data, and
`lib/authorization/document-acl.ts` rejects missing, mismatched, or
structurally forged authority proofs. The proof carries a module-private
runtime brand, so a legacy `WorkspaceMember` or `Permission` query cannot mint
document authority. Explicit document grants are capped by the active
workspace role (`VIEWER`→`READ`, `EDITOR`→`WRITE`, `ADMIN`/`OWNER`→`MANAGE`),
preventing a higher explicit row from elevating a lower workspace role. The
resolver and Leaf 6 slot remain fail closed until the canonical DB-time
active-membership authority and its ACL implementation are installed.
The server entrypoint opens one transaction and requires the active-document
resolver to issue its proof from locked authority rows before Leaf 6 data is
read through the same transaction, preventing role/archive TOCTOU decisions.

### Leaf 2 durable auth-state and journal handoff (Issue #156)

The reviewed Leaf 2 implementation slice defines a fail-closed durable-auth
boundary in `lib/auth/durable-auth-state.ts`. Callers provide only an immutable
user id and an authoritative database interface; the helper reloads
`authDisabledAt` and `sessionVersion` by `User.id`, rejects email-shaped or
malformed identities before querying, and treats a missing column, missing user,
malformed version, or database error as an unavailable/denied state. The
injectable `createDurableAuthStateHook()` factory exposes this resolver to a
future Leaf 2 hook without changing the protected version-0 slot while the
database migration and runtime capability remain pending.

The hook contract also carries the issued session version. On initial JWT
issuance, an activated hook returns the DB-owned version for a canonical decimal
JWT claim; subsequent JWT and session checks must present that claim and match
the current durable value. Missing or stale claims fail closed, so incrementing
`sessionVersion` revokes previously issued sessions once Leaf 2 is activated.

The same slice defines the language-independent `lib/security/journal.ts`
contract. It closes the twenty-six deny-only event kinds to their allowed
subject types and `{stateCode, stateVersion: 1}` payload, preserves BIGINT
sequence values as canonical decimal strings, rejects unknown keys/noncanonical
UTC microseconds/invalid hashes or UUIDs, derives retry-stable UUIDv5 operation
ids from a length-delimited tuple, and mirrors the PostgreSQL binary hash
preimage. `appendSecurityJournalEvent()` only calls the fixed
`public.security_journal_append(...)` function through a parameterized query;
its single returned sequence must fit the positive PostgreSQL signed-BIGINT
range. It does not create tables, roles, extensions, or perform a production mutation.

This is a pre-migration handoff only. The default auth hook remains unchanged,
the `User` columns and journal tables are not present on `origin/main`, and
Trial disable, credential/session cleanup, journal genesis, support-grant, and
production migration stay gated on the deployed Leaf 1/13B proofs and the
privileged broker. Evidence is tracked in Issue #156's implementation branch.

## Versioned and bounded password verification

`User.passwordHash` accepts only the reviewed v1 envelope
`munjib-scrypt$v=1$N=16384$r=8$p=1$dk=64$se=b64url-ascii$<22-char-salt>$<86-char-key>`
or the exact legacy `scrypt:<salt>:<key>` envelope. Every base64url token is
decoded and re-encoded before use; fixed `N=16384`, `r=8`, `p=1`, 64-byte key,
UTF-8 bytes of the canonical salt token, and 64 MiB `maxmem` are never selected
from stored data. Password inputs are strings of 1-256 UTF-8 bytes and stored
envelopes are ASCII and at most 256 bytes.

`authorizePasswordCredential()` queries a normalized email, then selects either
the validated account envelope or one process-random valid v1 dummy envelope.
Every valid-shaped attempt performs one fixed scrypt and one equal-length
constant-time comparison under `withPasswordWorkPermit()`: two calls may run,
eight may queue, and queued work expires after two seconds. The permit is a
resource guard only; saturation has a stable non-sensitive cause code and does
not emit account, email, password, hash, salt, path, or duration data.

Successful current hashes are not rewritten. A verified legacy value is wrapped
with the same salt/key into v1 and conditionally updated with `WHERE id AND the
exact old passwordHash`; a zero-row compare-and-swap or database failure returns
no user before session issuance. Seed and one-shot provisioning use `hashPassword()`
so new rows are v1, while `/api/auth/signup` remains a stable `403
SIGNUP_NOT_ALLOWED` closed boundary.

Production signup invariant: password account creation and unlinked OAuth are both
closed. Google `email_verified` is checked, then the exact provider account must
already exist. Callback denial plus the adapter persistence guard produce zero new
User/Account rows. Google credentials and profile media are never persisted; only a
canonical internal attachment URL whose exact ID is server-authorized for the current
user/request may appear in a session. Password verification uses
one bounded, parameter-pinned scrypt path and upgrades the exact legacy envelope before
session issuance. The `auth-runtime` Playwright oracle exercises this boundary with
synthetic `example.test` identities only; it never calls Google.

### Invite-first signup readiness handoff

Issue #161 (`issue-161-security-signup-gate`) is the reserved Leaf 7 follow-up
for invite-first onboarding. Its public preparation contract is
`deploy/security/signup/invite-first-readiness-v1.json`, and its effective
production mode remains `closed` until the prerequisite capabilities are
independently deployed and attested. The preparation branch deliberately adds
no invitation schema, attempt cookie, link grant, route, middleware, OAuth
behavior, migration, or production mutation.

The future gate accepts only a provider-verified Google identity with one active
workspace invitation. A raw invitation bearer may exist only in the client-side
URL fragment used to begin the exchange and in one guarded, bounded exchange
request body; the fragment must be scrubbed before history/navigation persists
it. It must not enter any other request or server-visible URL, cookie, database,
server component prop, history entry, log, telemetry payload, or OAuth callback;
the post-exchange attempt remains opaque and its domain-separated hash is the
only durable lookup value. Invitation consumption, role checks, invalidation,
and the deny-only journal transition must be atomic, and invitation roles can
never grant `OWNER`. Matching an invitation or email is not proof of a
password account, so unauthenticated OAuth collisions must not perform blind
email linking or create partial rows. Password signup stays closed and all
responses remain private/no-store with bounded-body, canonical-Origin, and
Fetch-Metadata checks inherited from the abuse-control owner.

Before implementation starts, the branch must be rebased on the deployed Leaf 1
auth runtime, Leaf 2 journal/auth-tombstone authority, Issue #162 auth-abuse and
session capability, and the Leaf 13B/13A private runtime and delivery-broker
gates tracked by Issues #180/#184/#185. The readiness note at
`docs/runbooks/invite-signup-gate-readiness.md` records this dependency boundary
without publishing capability contents or operational evidence.
### Invite token primitive boundary (Issue #161)

The dependency-safe Leaf 7 slice in `lib/auth/invite-token.ts` generates
independent 256-bit invitation and attempt secrets, encodes them as canonical
unpadded base64url, and hashes each with a distinct domain-separated SHA-256
context before durable persistence. The attempt cookie value is only the opaque
secret; cookie names and attributes are intentionally outside this module.
`parseInvitationExchangeBody()` accepts exactly one bounded `bearer` field and
returns an immutable object, rejecting workspace ids, revisions, and unknown
metadata. Validation errors are generic and never echo credentials. This is a
pure preparation boundary: it adds no schema, route, middleware, OAuth, signup
activation, or production behavior. The exchange parser and each canonical
contract array check `Reflect.ownKeys` so non-enumerable and symbol own metadata
cannot bypass the exact shape; array length is bounded before key scanning and
indexed values and top-level contract fields must be own data properties rather
than accessors, and Node proxy inputs are rejected before reflective inspection.
Atomic
invitation consumption, revision
invalidation, Leaf 8 exchange guards, and provider-link policy remain gated
follow-ups. See `docs/runbooks/invite-token-primitives.md` and Issue #161.

### Leaf 1 downstream handoff and rollback contract

The accepted Leaf 1 deployment evidence is the prerequisite for **Leaf 2**. Leaf 2
may change only the reserved `lib/auth/downstream/leaf2.ts` baseline from version 0
to `security-journal-auth-tombstones@1`; Leaf 1 config, callback, password,
candidate-context, session-image, and adapter paths remain byte-identical. **Leaf 7**
may replace the closed OAuth behavior only through its guarded invitation/link
contract and the Leaf 1 minimal Account/session-image helpers. **Leaf 13** must
preserve loopback-only Web binding, strict file-backed generated secrets, exact-image
selection, and the closed-signup preflight.

**Leaf 8** must preserve the canonical scrypt v1 parser, dummy work,
compare-and-swap-before-session rule, and local resource guard while adding PostgreSQL
admission authority. The four downstream slot baselines and their reserved owners are
machine-checked in `deploy/security/protected-artifact-owners.json`; a downstream
fragment cannot name a Leaf 1 core path and a slot cannot move from version 0 without
its reserved owner.

Google start/callback containment remains at the edge after Leaf 1. After a verified
recovery gate and `JOURNAL_READY`, a bounded transaction may lock each legacy
token-bearing Google Account, append the existing `AUTH_OAUTH_ACCOUNT_REVOKED` event
with subject type `OAUTH_ACCOUNT`, and revoke/remove that Account in the same
transaction. Journal failure rolls back revocation; replay is deny-only and idempotent.
Only a fresh boolean proof that no token-bearing Google row remains permits
containment removal. Evidence contains no row count, Account/user ID, provider
payload, or token, and the canonical twenty-six-kind journal union does not change.

Rollback retains the current root-managed signing/provider secret files and their
owner/mode/mount contract, closed password signup, closed unlinked OAuth, Secure
cookies, canonical origin, disabled development login, production seed prohibition,
token/profile-media zero persistence, and v1 password-hash readability. No rollback
image may rely only on `email_verified`; once any canonical v1 password row exists,
an image unable to parse it is rollback-ineligible. The exact `auth-runtime-fail-closed`
v1 capability fragment lists the evidence tests and required `secure-next-runtime@1`
capability. Generated candidate envelopes remain untracked and are published only by
Leaf 13A's dispatcher.

Issue #156's Trial-isolation work is intentionally staged behind this handoff:
the reserved `lib/auth/downstream/leaf2.ts` slot remains a no-op until the broker
issues matching Leaf 1/Leaf 13 deployment proofs. No auth tombstone, session
version bump, Trial quarantine, or support grant may run from the preparatory seam
alone.

The verifier rejects nullish or partial parsed envelopes with `LEAF2_INPUT_INVALID`,
requires the caller environment to be the literal `production`, and accepts proof
flags only when they are literal booleans. This prevents a parsed staging envelope
or truthy string field from being promoted into a production dependency proof.

The closed production invariant is intentionally explicit: Google accepts only the
**exact linked Google Account**, and callback denial plus the adapter guard produce
**zero User or Account creation**. Provider credentials and an **external profile image**
are not persisted or copied into session state. These terms are the stable
handoff language for Leaf 2, Leaf 7, Leaf 8, and Leaf 13.

### Runtime-backed login availability

The server-rendered login surfaces use the same validated runtime snapshot as
NextAuth for Google availability. In staging/production, `GOOGLE_CLIENT_SECRET`
must remain absent from the environment; `resolveGoogleAuthCredentials()` reads
the fixed secret file through the strict reader and returns only a boolean-safe
credential projection for provider registration/UI gating. A blank direct Google
secret is treated as disabled in development, while strict runtimes remain
fail-closed. The trial provider and its `Explore demo` button are both limited to
the development deployment gate, so production/staging never advertise an
unregistered provider. The root-gated owner bootstrap normalizes email addresses
before the transactional upsert, matching the password login normalizer.

## Session helper

서버 컴포넌트와 server action은 `requireCurrentUser()`를 통해 현재 사용자를 요구한다. 로그인되지 않은 상태에서 보호된 workspace로 접근하면 로그인 흐름으로 이동한다.

## Issue #162 auth-abuse/session-revocation readiness

Issue #162 (`issue-162-security-auth-abuse-sessions`) remains a dependency-gated
readiness handoff on the current release line. The eventual authority is
PostgreSQL, not the existing process-local password work limiter: every
authentication entry point must fail closed when the guard store is unavailable,
and each encrypted JWT must resolve against a database registry row, user
`sessionVersion`, disabled state, and expiry on every request. Raw session IDs,
limiter identifiers, account identifiers, and client addresses must never enter
logs, alerts, or persisted limiter records.

The canonical `authDisabledAt`, BigInt `sessionVersion`, and same-transaction
deny-only journal helpers are present as preparation code in PRs #199 and #202,
but the support-grant contract and runtime activation remain pending until the
Issue #166 host-edge contract, database migration, verified private
binding/database role, and attested delivery-broker host path are accepted
(Issues #166, #184, and #185). The current
`Session` adapter table is not a substitute because runtime auth uses encrypted
JWTs. Leaf 1's config/password/adapter/session-image paths remain protected
seams; Issue #162 must compose the reserved downstream slot without claiming
those files or adding a second session decoder.

The public-safe handoff and gate checklist live in
`docs/runbooks/auth-abuse-sessions-readiness.md`.

## Cookie namespace

NextAuth session cookie는 `munjib.session-token` 이름을 사용한다. 이 이름은 이전 `obsidian-clone.session-token` stale cookie가 `/login`에서 `JWT_SESSION_ERROR`를 일으키던 문제를 피하기 위해 분리된 것이다.

운영 환경에서는 기본적으로 secure cookie를 사용한다. HTTP-only IP 배포처럼 HTTPS가 아직 붙지 않은 임시 환경에서는 `NEXTAUTH_COOKIE_SECURE=false`로 session cookie의 secure flag를 끌 수 있다. Local HTTPS proxy 검증처럼 개발 환경에서 secure cookie를 강제해야 하면 `NEXTAUTH_COOKIE_SECURE=true`를 사용할 수 있다.

관련 테스트는 cookie 이름, dev fallback secret, HTTP 배포용 secure cookie override, development secure-cookie force 동작을 검증한다.

## Login redirect

`LoginForm`은 `callbackUrl`이 `/workspaces/...` 같은 app-local path이면 `signIn(..., { redirect: false })`가 반환한 absolute URL의 origin을 그대로 사용하지 않고 callback path로 이동한다. NextAuth가 server-side `NEXTAUTH_URL` 기준의 `http://localhost:3000/...` URL을 반환할 수 있기 때문에, client-side 이동은 현재 browser origin을 유지하는 relative path를 우선한다.

Callback sanitization은 단순 string prefix check가 아니라 `new URL(value, window.location.origin)` parsing 결과의 `origin`이 현재 browser origin과 같은지 확인한다. `/\evil.example`처럼 browser가 protocol-relative external URL로 normalize할 수 있는 malformed path는 기본 `/workspaces/company-handbook` callback으로 낮춰 `signIn()`에도 unsafe callback을 전달하지 않는다.

Logout도 같은 client-side redirect helper를 사용한다. Lower account drawer는 `signOut({ redirect: false, callbackUrl: "/login" })`로 세션 종료 결과를 받은 뒤, NextAuth가 `NEXTAUTH_URL`에서 만든 `http://localhost:3000/login` 같은 absolute URL을 그대로 따르지 않고 현재 browser origin 기준 app-local `/login` path로 이동한다. Shared helper의 browser-origin read는 `window`가 없는 환경에서도 throw하지 않도록 guard한다.

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

- `password`: credentials provider that finds `User.passwordHash` by normalized email and delegates to `authorizePasswordCredential()` for bounded dummy work, fixed verification, and legacy compare-and-swap migration.
- `trial`: credentials provider with no browser-visible secret; it signs in the seeded `legacy-account-2@example.invalid` account.
- `development-login`: gated seed-user shortcut controlled by `MUNJIB_ENABLE_DEV_LOGIN`.
- `google`: OAuth provider added only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present. The `signIn` callback rejects Google profiles whose email is not verified.

`createPasswordSignup()` remains the one-shot provisioning helper for internal
callers: it normalizes email, enforces an 8-character minimum password, hashes
with the versioned helper, creates the `User`, and provisions a personal
organization plus default workspace. The public `/api/auth/signup` route is
closed with `403 SIGNUP_NOT_ALLOWED`. The
workspace name is localized from the hydrated UI language: `My Workspace` for
English and `내 워크스페이스` for Korean. Workspace creation also calls the
launch membership bootstrap so the new user is `OWNER`, `legacy-account-1@example.invalid`
is `ADMIN`, and `legacy-account-2@example.invalid` is `VIEWER`.
For returning users whose only memberships are archived, default provisioning
ignores archived memberships and reactivates the deterministic personal default
workspace row by clearing `archivedAt` when that row already exists.

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
keep creating or editing workspace data after archive. Ask AI and Workspace AI
service loaders also require active workspace membership; archived workspace
slugs return `WORKSPACE_NOT_FOUND` before Ask AI reads saved context or Workspace
AI creates/persists chat threads and messages.

`lib/workspaces/management-service.ts` owns the focused workspace operations.
Workspace creation requires writer-or-better permission on the current
workspace, creates a new organization/workspace pair, makes the actor `OWNER`,
and reuses the launch membership bootstrap for `legacy-account-1@example.invalid` as `ADMIN`
and `legacy-account-2@example.invalid` as `VIEWER`. Workspace rename/archive require
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

### Issue #160 document authorization closure

Issue #160은 문서 ACL을 개별 helper의 모음이 아니라 하나의 active-resource
권한 경계로 닫는 후속 작업이다. 현재 baseline은 일반 문서 service, workspace
page, wiki-link panel, Ask AI/Workspace AI, comments, attachments에서
document-level permission을 확인하지만, folder descendant mutation, broken-link
source authorization, history/metadata DTO, direct attachment/comment/history
route의 active-state 재확인은 같은 authority로 아직 통합되지 않았다.

이 작업은 Leaf 5 active-resource authority가 제공하는 database-time active
workspace/document resolver와 transaction-safe membership boundary를 선행
조건으로 한다. 그 전에는 직접 membership 조회나 별도 ACL helper를 추가하지
않으며, 공개 handoff와 다음 구현 검증 목록은
`docs/runbooks/document-authorization-readiness.md`에 기록한다.
해당 runbook은 검증 항목을 문장부호가 있는 문장으로 유지하고, 내부 식별자는
`ID`처럼 표준 표기로 기록한다.

## 문서 service에서의 권한 적용

`createDocument()`는 workspace slug와 actor id로 membership을 찾고 write 권한을 요구한다.

Issue #20의 folder hierarchy MVP에서 folder 생성, 이름 변경, 이동, archive는 workspace write 권한을 요구한다. Folder-specific permission과 folder-to-document inherited ACL은 MVP 범위에서 제외한다. 기존 document-level explicit permission은 문서 read/write 판단에만 적용된다.

`updateDocument()`와 `archiveDocument()`는 document id로 document와 workspace membership을 함께 찾고 read/write 권한을 요구한다.

`createDocumentFromBrokenLink()`는 link id로 workspace membership을 찾고 read/write 권한을 모두 요구한다.

`restoreDocumentVersion()`, attachment upload, comment creation도 document-level permission을 확인한다. Attachment download는 document read permission을 요구하고, upload/comment는 write 가능한 사용자만 수행한다.

## Launch account foundation

Issue #145 added durable account columns and OAuth-ready NextAuth adapter tables. `User.passwordHash` stores the reviewed versioned `munjib-scrypt` envelope described above, `User.emailVerified` is the NextAuth-compatible timestamp used by email/password and OAuth flows, and Prisma `User.image` maps to the existing `avatarUrl` database column so adapter-backed OAuth can use the expected field name. `Account`, `Session`, and `VerificationToken` are present so Google OAuth account linking can use normal adapter rows.

`lib/auth/passwords.ts` owns the canonical parser, fixed-cost hashing, and constant-time verification. It generates a random salt for each hash, uses Node `scrypt` with explicit options, and compares derived keys with `timingSafeEqual`; plaintext launch passwords remain only seed constants used to generate v1 rows.

`lib/workspaces/membership-bootstrap.ts` defines the launch global accounts and idempotent membership bootstrap helper. Workspace creation code can pass an owner membership, and the helper also upserts `legacy-account-1@example.invalid` as `ADMIN` plus `legacy-account-2@example.invalid` as `VIEWER` whenever those launch users exist. If the owner is also a launch account, the explicit owner role wins. Existing launch-account `OWNER` rows also stay `OWNER` during backfill. The backfill helper fetches launch users once and applies the same launch memberships to every existing workspace, so permission helpers continue to reason only about `WorkspaceMember.role` rows rather than hard-coded superusers.

## Seed 사용자

`prisma/seed.ts`는 다음 사용자와 workspace를 만든다.

- `legacy-account-1@example.invalid` / password seed constant `local-only-fixture-1` / global `ADMIN` membership
- `legacy-account-2@example.invalid` / password seed constant `local-only-fixture-2` / global `VIEWER` membership
- `owner@example.com`
- `editor@example.com`
- `viewer@example.com`
- workspace: `company-handbook`

Seed reruns preserve existing launch account hashes and email verification timestamps, preserve the local development fixture users, and upsert launch memberships so each existing workspace has one admin launch row and one trial viewer row unless a launch account is already an explicit `OWNER`. 테스트나 수동 검증에서 이 seed data를 기준으로 역할별 동작을 확인할 수 있다.

## Leaf 4 zero-media boundary

Issue #158의 Leaf 4는 Auth.js identity DTO와 JWT/session callback에서 provider·adapter가 제공한 ambient media를 출력하지 않는 경계를 유지한다. `lib/auth/downstream/leaf4.ts`의 `leaf4AuthUserOutput()`은 `image: null`인 identity-only shape를 만들고 `leaf4SessionMediaHook()`은 Auth.js `picture`/`image` claims를 제거한다. 이 훅은 Leaf 1의 downstream contract와 합성되며, 저장 attachment가 session에 투영되는 경우에도 `getReadableAttachment()` ACL 검증과 canonical internal path sanitizer를 통과한 값만 허용한다.

Leaf 4의 zero-egress browser oracle은 saved Markdown preview와 Workspace AI answer가 외부 image URL을 자동 fetch/render하지 않는지 실제 Next/Node 경로에서 확인한다. test-only provider transport와 egress calibration은 명시적 test/development gate 뒤에만 열리고 production/staging에서는 거부된다.

## Issue #162 bounded auth guard runtime slice

`lib/auth/abuse/runtime.ts`는 아직 라우트에 연결하지 않은 Leaf 8 소유 경계다. staging/production에서 `MUNJIB_AUTH_GUARD_SECRET_FILE=/run/secrets/munjib_auth_guard_secret`만 허용하고 `readStrictSecretFile()`의 파일 권한·소유자·내용 검증을 통과한 경우에만 runtime snapshot을 만든다. 직접 secret 환경값, 누락/실패한 파일, 비 HTTPS canonical origin은 `AUTH_GUARD_UNAVAILABLE`로 분류되며 secret 값은 오류·로그·store 입력에 포함하지 않는다.

`evaluateAuthOrigin()`과 `evaluateFetchMetadata()`는 unsafe method의 canonical Origin, `Sec-Fetch-Site`, 선택적 mode/dest를 각각 bounded header로 검사하고, 누락·교차 사이트·형식 오류를 stable deny code로 반환한다. `authorizeAuthRequest()`는 raw identifier나 process-local map을 만들지 않고 opaque bucket을 외부 durable store에 위임하며 store 오류와 알 수 없는 결과를 fail-closed 처리한다. `deriveAuthGuardBucket()`은 runtime secret으로 scope/value를 domain-separated HMAC digest로 바꿔 persisted key가 원문이 되지 않도록 한다. 이 slice는 Prisma migration, session registry, Leaf 1/2 protected path, route activation, host mutation을 포함하지 않는다.

## 근거

- `lib/auth/config.ts`
- `lib/auth/client-redirects.ts`
- `lib/auth/session.ts`
- `app/login/login-form.tsx`
- `app/login/page.tsx`
- `app/login/redirect/page.tsx`
- `app/page.tsx`
- `app/workspaces/[workspaceSlug]/page.tsx`
- `app/api/auth/signup/route.ts`
- `app/api/auth/landing/route.ts`
- `lib/auth/provisioning.ts`
- `lib/auth/passwords.ts`
- `lib/auth/password-credentials.ts`
- `lib/auth/password-work-limit.ts`
- `lib/workspaces/management-service.ts`
- `lib/workspaces/page-query.ts`
- `lib/documents/service.ts`
- `lib/folders/service.ts`
- `lib/rag/ask.ts`
- `lib/rag/workspace-chat.ts`
- `components/document-list.tsx`
- `components/workspace-settings-panel.tsx`
- `tests/rag/ask.test.ts`
- `tests/rag/workspace-chat.test.ts`
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
- `tests/auth/client-redirects.test.ts`
- `tests/components/login-form.test.tsx`
- `tests/components/document-list.test.tsx`
- `tests/docker/compose.test.ts`
- `tests/permissions/document.test.ts`
- `prisma/seed.ts`
- `prisma/migrations/20260705090000_add_auth_accounts_foundation/migration.sql`
- `lib/auth/passwords.ts`
- `lib/workspaces/membership-bootstrap.ts`
- `tests/auth/passwords.test.ts`
- `tests/workspaces/membership-bootstrap.test.ts`
- `docs/superpowers/specs/2026-07-08-logout-redirect-normalization-design.md`
