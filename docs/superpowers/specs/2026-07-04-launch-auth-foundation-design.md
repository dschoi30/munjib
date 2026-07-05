# Launch Auth Foundation Design

## Context

Issue #143 prepares Munjib's existing authentication path for launch without
expanding the product into full account management yet. The app already uses
NextAuth, a custom `munjib.session-token` cookie, JWT sessions, workspace roles,
and document-level permission checks.

The risky part is the current Credentials provider. It is intentionally useful
for local development: a seeded user can sign in by email only. That is not a
safe launch default because any existing database user email would be enough to
authenticate if the provider is available in production.

## Decisions From Brainstorming

- Keep the first slice focused on launch-safe hardening of the existing
  development login path.
- Default development email login to enabled outside production.
- Default development email login to disabled in production unless an operator
  explicitly enables it with an environment flag.
- Treat missing `NEXTAUTH_SECRET` in production as an auth configuration error,
  not an implicit fallback secret.
- Leave password auth, OAuth, SSO/SAML, invitation flows, and user lifecycle
  management for follow-up issues.

## Goals

- Gate the email-only Credentials provider behind an explicit runtime decision.
- Preserve the current local development login experience for seeded users.
- Prevent production email-only login from being accidentally available.
- Make auth configuration behavior small, testable, and documented.
- Keep existing session cookie, redirect sanitization, workspace role, and
  document permission behavior unchanged.

## Non-Goals

- Do not add password hashes, password reset, or email verification.
- Do not add OAuth, SSO/SAML, SCIM, or external identity-provider setup.
- Do not change the Prisma `User` schema in this slice.
- Do not redesign the login page beyond the minimal disabled-state messaging.
- Do not change workspace membership or document permission semantics.

## Options Considered

### Recommended: Gate Existing Development Login

Add an auth helper that decides whether the development Credentials provider is
enabled. It returns true outside production by default, false in production by
default, and accepts an explicit env override for local/staging edge cases.

This is the smallest launch-safe slice because it directly removes the unsafe
production default while preserving the current local workflow.

### Password Auth Now

Add password fields, hashing, account bootstrap, and login form changes. This
would make production login possible without dev credentials, but it also pulls
in reset, invite, audit, and bootstrap decisions that are larger than this
foundation issue.

### OAuth Or SSO Foundation

Introduce a provider structure for Google/GitHub or enterprise SSO. This is a
good later direction, but the provider choice and organization policy are
product decisions. It should follow after the unsafe dev-login exposure is
closed.

## Design

Add a small auth configuration seam in `lib/auth/config.ts`:

- `resolveDevLoginEnabled()` reads `MUNJIB_ENABLE_DEV_LOGIN`.
- Accepted true values: `true`, `1`, `yes`.
- Accepted false values: `false`, `0`, `no`.
- Missing value defaults to `false` in production and `true` outside
  production.
- Invalid values fail closed in production and default to local-friendly enabled
  outside production, with test coverage documenting the behavior.

The Credentials provider should remain the same when enabled. When disabled, it
should not authenticate users. The provider can still exist in the NextAuth
provider list so the login page and route shape remain stable, but its
`authorize()` branch must return `null` before querying Prisma.

The login page should receive a boolean such as `isDevLoginEnabled` from the
server. When disabled, the form should disable the email input and submit
button, hide or disable seeded-user shortcuts, and show a product-safe message
that development email login is not enabled for this environment. The clear
session button can remain available so operators can recover from stale local
sessions.

## Environment Contract

```text
MUNJIB_ENABLE_DEV_LOGIN=true
```

This flag is optional. Local development does not need it unless an operator
explicitly disabled dev login. Production must set it deliberately if a temporary
production-style environment still needs the development provider.

Production still needs `NEXTAUTH_SECRET`. The current helper already avoids a
hardcoded production fallback; this issue should preserve that behavior and add
coverage around the launch-safe login gate.

## User-Facing Behavior

- Local development: `/login` behaves as it does today for
  `owner@example.com`, `editor@example.com`, and `viewer@example.com`.
- Production without `MUNJIB_ENABLE_DEV_LOGIN=true`: the development login form
  is visibly disabled and a sign-in attempt cannot authenticate by email only.
- Production with `MUNJIB_ENABLE_DEV_LOGIN=true`: the existing email-only
  development login is available for controlled temporary use.
- Invalid credentials continue to use the existing localized login error path.

## Testing

Add focused coverage for:

- `resolveDevLoginEnabled()` defaulting true outside production.
- `resolveDevLoginEnabled()` defaulting false in production.
- true/false env override parsing.
- disabled provider returning `null` without querying Prisma.
- login form rendering disabled controls and disabled-state copy when dev login
  is off.
- existing redirect sanitization tests staying green.

## Wiki Updates

Update `Auth And Permissions Workflow` with the dev-login gate and environment
contract. Update `wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json` to
record that Issue #143 is a launch hardening slice rather than a password,
OAuth, or SSO implementation.

## Risks

This does not create a production-grade end-user login method. If production dev
login is disabled before OAuth, password auth, or SSO exists, only already
authenticated sessions can continue using the app. That is intentional for this
slice: it prevents accidental email-only authentication while leaving the real
identity-provider decision explicit.
