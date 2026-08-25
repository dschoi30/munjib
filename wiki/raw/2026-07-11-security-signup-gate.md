# Production Signup Gate Implementation Plan

**Tracking:** Issue #161 · remote branch `issue-161-security-signup-gate`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fail-closed invite-first onboarding using provider-verified Google identities, one active workspace invitation, and a raw-token-zero fragment-to-opaque-attempt flow.

**Architecture:** A URL fragment is scrubbed by a nonce-bearing pre-hydration script before telemetry or network activity, then exchanged through Leaf 8's bounded same-origin and distributed guard primitives for a short-lived 256-bit opaque attempt cookie; only the attempt hash is stored. Leaf 7 alone owns invitation rows, routes, attempts, revisions, grants, and acceptance. New Google identities use a short-lived guarded grant and persist only minimal provider identity with `User.image=null`. An existing password User is never linked from an unauthenticated OAuth callback or email/invitation match: the exact current session must create a one-time Origin/CSRF-bound Link Google intent through recent password step-up, and callback, session, user, provider, and email must all match before the guarded adapter consumes the intent/grant. Blind email linking is forbidden.

**Tech Stack:** Next.js 15 App Router, NextAuth v4, Prisma 6/PostgreSQL, Node crypto, React 19, Vitest, Playwright, Leaf 2 security journal

## Global Constraints

- Start from deployed Leaf 1, Leaf 2 journal/auth tombstones, Leaf 8 abuse/session capability, and Leaf 13 delivery gate.
- Leaf 7 owns every invitation schema, route, attempt, revision, cap, Google link grant, and durable transition. It reuses Leaf 8 `readBoundedJson`, browser-mutation, OAuth, and branded invitation guards and never recreates a local limiter, body reader, or Origin policy.
- Leaf 7 modifies only Leaf 1's pre-reserved `lib/auth/downstream/leaf7.ts` slot plus its own signup/link modules and claims those paths in `invite-signup-gate`. It reuses, but must not edit/claim, Leaf 1 `lib/auth/config.ts`, downstream contract, token-zero adapter/minimal Account helper, password verifier, or session-image sanitizer.
- Leaf 7 permanently owns root `middleware.ts`. It creates the broad Node-runtime
  request shell and the separately protected
  `lib/security/downstream/leaf12-edge-middleware.ts` version-0 pass-through seam.
  The program's fixed ninth reservation tuple is
  `invite-signup-gate -> edge-minimal-csp-nonce -> lib/security/downstream/leaf12-edge-middleware.ts`;
  Leaf 12 may transition only that seam and must keep the root middleware byte-identical.
- `MUNJIB_SIGNUP_MODE=closed|invite|public-verified`; production requested default is `invite`.
- Production effective mode remains `closed` until Issue 8 publishes a verified capability SHA and `MUNJIB_INVITE_ABUSE_CONTROLS_READY=true`.
- Missing verified Google credentials also makes requested invite effectively closed.
- Invalid explicit `public-verified` provider contract fails startup.
- Existing password and exact linked Google accounts continue login.
- Control of an invitation or provider-verified email is never proof of an existing password account. Without that exact user's active registry session plus recent password step-up and explicit one-time Link Google intent, an OAuth collision returns one generic existing-account sign-in response and persists no User, Account, proof, intent grant, or membership.
- New identity onboarding requires current Google `email_verified=true`; historical `User.emailVerified` is never proof.
- Google OAuth payload tokens and profile media are discarded. New users set `image:null`; linking never updates historical `User.image`; Account persistence uses only Leaf 1's minimal provider-identity helper.
- Password signup/reset remains closed.
- Invitation v1 is workspace-scoped, one active row per normalized email, expiring, role-capped, hashed, renewable, and single-use.
- OWNER grants ADMIN|EDITOR|VIEWER; ADMIN grants EDITOR|VIEWER; invitation never grants OWNER.
- Create/revoke requires current active OWNER|ADMIN. Acceptance rechecks the latest inviter using the Leaf 2 DB-time active-membership resolver.
- `createdById` is nullable with `ON DELETE SET NULL`; missing creator makes invitation unusable.
- The raw invitation bearer appears only in the manager create response, shared fragment, pre-hydration memory, and bounded exchange request body. It never appears in an HTTP URL, server component prop, cookie, DB, audit, journal, log, Sentry envelope, OAuth callback, or history entry.
- The attempt cookie contains only a 256-bit opaque random secret. DB stores only a domain-separated hash.
- Attempt and invitation are consumed atomically in one serializable transaction.
- Renewal increments invitation revision and invalidates every prior attempt.
- GET never consumes invitation or creates membership. Only authenticated confirmation POST accepts.
- Consumed, revoked, and explicitly expired transitions append the Leaf 2 deny journal event in the same transaction.
- Export `leaf7JournalReplayReducers` for invitation credential invalidation, consume, revoke, and expire; handlers are branded-restore-only, exact invitation-target validating, idempotent, deny-only, and unable to append or mutate journal/checkpoint state.
- Pending/issuance/attempt caps exist in this leaf; Issue 8 must already provide the shared limiter, AuthSessionRegistry, sole session validator, and signed capability before the signup schema/app deploys.
- The Issue 8 capability has no TTL. `generatedAt` is audit metadata; any environment/origin/source/image/floor/policy identity mismatch keeps effective mode `closed`, and every later deployment republishes it for the exact candidate before traffic promotion.
- Every success/error/401/403/409/413/500 response is `Cache-Control: private, no-store`.
- Every mutation uses bounded streaming input, canonical Origin, and Fetch Metadata checks.
- Every task updates durable wiki/log knowledge, runs install-hooks/sync-plan/manifest/lint/sync-check, and commits.
- Quiet secret scans use `rg -q` and never print matches.

---

## File Structure

- Signup mode/readiness modules and runtime/Compose tests.
- Prisma invitation/attempt/proof/link-grant models and crypto primitives.
- Invitation management/expiry service with locks, caps, audit, and journal.
- Google sign-in/link policy with guarded adapter and session assurance.
- Nonce bootstrap, Leaf 8-guarded bounded exchange, opaque attempt cookie, and APIs.
- Leaf 7-owned Node middleware plus the complete version-0 Leaf 12 edge-extension
  context/result contract.
- Atomic acceptance and race tests.
- Workspace manager UI and localized acceptance UI.
- Browser/privacy/access-log/Sentry/history tests and rollout handoff.

### Task 1: Resolve requested signup mode against Google and Issue 8 capability

**Files:**
- Create: `lib/auth/signup-mode.ts`
- Create: `lib/auth/invite-readiness.ts`
- Create: `tests/auth/signup-mode.test.ts`
- Create: `tests/auth/invite-readiness.test.ts`
- Modify: `lib/auth/runtime.ts`
- Modify: `scripts/security/auth-preflight.ts`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `.env.example`
- Modify: `.env.docker.example`
- Modify: `tests/auth/runtime.test.ts`
- Modify: `tests/security/auth-preflight.test.ts`
- Modify: `tests/docker/compose.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: `SignupMode`, `SignupModeResolution`, `resolveSignupMode`, and branded `VerifiedAuthAbuseCapability`.

- [ ] **Step 1: Write failing mode/readiness tests**

```ts
const googleRuntime = {
  googleClientId: "synthetic-client",
  googleClientSecret: "synthetic-credential",
};

it("defaults production to requested invite but stays closed before Issue 8", () => {
  expect(resolveSignupMode({}, "production", googleRuntime)).toMatchObject({
    requested: "invite",
    effective: "closed",
    reason: "AUTH_ABUSE_CAPABILITY_NOT_READY",
  });
});

it("activates invite only with exact verified capability", () => {
  const expectedDeploymentIdentitySha256 = "b".repeat(64);
  const capability = verifySyntheticAuthAbuseCapability({
    capabilitySha256: "a".repeat(64),
    deploymentIdentitySha256: expectedDeploymentIdentitySha256,
  });
  expect(
    resolveSignupMode(
      {
        MUNJIB_INVITE_ABUSE_CONTROLS_READY: "true",
        MUNJIB_AUTH_ABUSE_CAPABILITY_SHA256: "a".repeat(64),
      },
      "production",
      googleRuntime,
      {
        capability,
        expectedDeploymentIdentitySha256,
      },
    ),
  ).toMatchObject({ requested: "invite", effective: "invite" });
});

it("fails invite closed when validated Google runtime is unavailable", () => {
  expect(resolveSignupMode({}, "production", undefined)).toMatchObject({
    requested: "invite",
    effective: "closed",
    reason: "VERIFIED_GOOGLE_UNAVAILABLE",
  });
});
```

`verifySyntheticAuthAbuseCapability` is a test-only fixture that runs the real verifier
over a synthetic signed envelope; production code exports no brand constructor or cast
helper. Capability tests reject missing/wrong environment, origin,
source/image/floor/policy or deployment-identity digest, Issue 8 test digest, signature,
and SHA. Exact-schema tests reject `expiresAt`, `notAfter`, `ttlSeconds`, or any other
TTL field; `generatedAt` is not a validity clock. They accept only Leaf 13 pinned trust
and the exact current candidate identity. A test with a valid capability SHA but a
different `expectedDeploymentIdentitySha256` must stay closed.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/auth/signup-mode.test.ts tests/auth/invite-readiness.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement requested/effective resolution**

```ts
export type SignupMode = "closed" | "invite" | "public-verified";
export type SignupModeResolution = {
  requested: SignupMode;
  effective: SignupMode;
  reason:
    | "CONFIGURED"
    | "VERIFIED_GOOGLE_UNAVAILABLE"
    | "AUTH_ABUSE_CAPABILITY_NOT_READY"
    | "PUBLIC_VERIFIED_CONTRACT_INVALID"
    | "SIGNUP_MODE_INVALID";
  errors: Array<"PUBLIC_VERIFIED_CONTRACT_INVALID" | "SIGNUP_MODE_INVALID">;
};

declare const verifiedAuthAbuseCapabilityBrand: unique symbol;
export type VerifiedAuthAbuseCapability = Readonly<{
  verifiedCapabilitySha256: string;
  verifiedDeploymentIdentitySha256: string;
  [verifiedAuthAbuseCapabilityBrand]: true;
}>;

type VerifiedSignupReadiness = Readonly<{
  capability: VerifiedAuthAbuseCapability;
  expectedDeploymentIdentitySha256: string;
}>;

export function resolveSignupMode(
  env: Record<string, string | undefined>,
  deployment: "development" | "staging" | "production",
  authRuntime: Pick<AuthRuntimeConfig, "googleClientId" | "googleClientSecret"> | undefined,
  readiness?: VerifiedSignupReadiness,
): SignupModeResolution {
  const raw = env.MUNJIB_SIGNUP_MODE?.trim().toLowerCase();
  const fallback: SignupMode = deployment === "production" ? "invite" : "closed";
  const allowed = new Set<SignupMode>(["closed", "invite", "public-verified"]);
  if (raw && !allowed.has(raw as SignupMode)) {
    return {
      requested: "closed",
      effective: "closed",
      reason: "SIGNUP_MODE_INVALID",
      errors: ["SIGNUP_MODE_INVALID"],
    };
  }
  const requested = (raw as SignupMode | undefined) ?? fallback;
  const googleReady = Boolean(
    authRuntime?.googleClientId?.trim() && authRuntime.googleClientSecret?.trim(),
  );
  if (requested !== "closed" && !googleReady) {
    return {
      requested,
      effective: "closed",
      reason: "VERIFIED_GOOGLE_UNAVAILABLE",
      errors: [],
    };
  }
  if (
    requested === "public-verified" &&
    env.MUNJIB_PUBLIC_VERIFIED_PROVIDER?.trim() !== "google"
  ) {
    return {
      requested,
      effective: "closed",
      reason: "PUBLIC_VERIFIED_CONTRACT_INVALID",
      errors: ["PUBLIC_VERIFIED_CONTRACT_INVALID"],
    };
  }
  if (
    deployment === "production" &&
    requested !== "closed" &&
    (env.MUNJIB_INVITE_ABUSE_CONTROLS_READY !== "true" ||
      !readiness ||
      readiness.capability.verifiedCapabilitySha256 !==
        env.MUNJIB_AUTH_ABUSE_CAPABILITY_SHA256 ||
      readiness.capability.verifiedDeploymentIdentitySha256 !==
        readiness.expectedDeploymentIdentitySha256)
  ) {
    return {
      requested,
      effective: "closed",
      reason: "AUTH_ABUSE_CAPABILITY_NOT_READY",
      errors: [],
    };
  }
  return { requested, effective: requested, reason: "CONFIGURED", errors: [] };
}
```

Import `AuthRuntimeConfig` from Leaf 1. Every production call first executes
`assertValidAuthRuntimeEnv`, then passes only its returned `googleClientId` and
file-loaded `googleClientSecret` to `resolveSignupMode`; raw
`env.GOOGLE_CLIENT_SECRET` is never read and is a source-contract failure. Auth
preflight reuses that same validated config instance for readiness.

The non-exported brand property is constructed only inside
`verifyAuthAbuseCapability()`, after same-FD exact-schema/signature/trust verification
and direct comparison with the current deployment identity supplied by Leaf 13's
validated runtime object. `resolveSignupMode` accepts only that branded result plus the
same current expected identity; a plain object, caller cast, capability-file claim, or
matching SHA without matching deployment identity is not a valid call boundary and is
also rejected by the source-contract test.

- [ ] **Step 4: Integrate runtime, preflight, and Compose**

Production defaults:

```yaml
MUNJIB_SIGNUP_MODE: ${MUNJIB_SIGNUP_MODE:-invite}
MUNJIB_INVITE_ABUSE_CONTROLS_READY: ${MUNJIB_INVITE_ABUSE_CONTROLS_READY:-false}
MUNJIB_AUTH_ABUSE_CAPABILITY_SHA256: ${MUNJIB_AUTH_ABUSE_CAPABILITY_SHA256:-}
MUNJIB_AUTH_ABUSE_CAPABILITY_FILE: /run/munjib-capabilities/auth-abuse.json
```

Production Web mounts only the immutable Leaf 8 generation's `capability.json`
read-only at the literal container path above. The Leaf 13A dispatcher, not Compose or
the caller, resolves the single root-owned `current` regular pointer to
`/var/lib/munjib/security/capabilities/auth-abuse/generations/<generation>/`, verifies
its manifest cross-hashes for `capability.json`, `capability.sha256`, and `deploy.env`,
and supplies that exact generation path to the fixed root unit. The host parent is root
mode `0700`; the mounted leaf is owned by runtime UID `10001`, mode `0400`, and is
installed only after exact-SHA deployment. No caller-selected capability path is
accepted. Compose tests assert the fixed container path, dispatcher-selected immutable
host generation, read-only mount, absence of generated content and secret
interpolation, and effective-UID readability. Preflight prints requested/effective/
reason only. The capability is same-FD bounded and verified with Leaf 13 pinned trust
plus exact current environment/source/image/origin/floor/policy deployment identity and
the same generation's manifest-bound `capability.sha256`/`deploy.env`. Only that
non-secret lowercase digest populates the Compose env above; the workflow never accepts
an operator-entered SHA. The branded object includes the verified deployment-identity
SHA and can be created only by the verifier; a matching capability file plus stale
deployment identity remains closed. Live database limiter/session/journal health is
rechecked independently; a signed file alone never activates signup.

- [ ] **Step 5: Run GREEN, update the durable wiki evidence, and commit through every gate**

```bash
pnpm exec vitest run tests/auth/signup-mode.test.ts tests/auth/invite-readiness.test.ts tests/auth/runtime.test.ts tests/security/auth-preflight.test.ts tests/docker/compose.test.ts
git add lib/auth/signup-mode.ts lib/auth/invite-readiness.ts lib/auth/runtime.ts scripts/security/auth-preflight.ts docker-compose.yml docker-compose.dev.yml .env.example .env.docker.example tests/auth/signup-mode.test.ts tests/auth/invite-readiness.test.ts tests/auth/runtime.test.ts tests/security/auth-preflight.test.ts tests/docker/compose.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(auth): gate invite readiness"
```

Expected: mode/runtime/wiki gates PASS.

### Task 2: Add invitation, opaque attempt, identity proof, and link-grant persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712030000_add_secure_workspace_invitations/migration.sql`
- Create: `lib/invitations/token.ts`
- Create: `lib/invitations/attempt-secret.ts`
- Create: `lib/invitations/roles.ts`
- Create: `tests/invitations/schema.test.ts`
- Create: `tests/invitations/token.test.ts`
- Create: `tests/invitations/attempt-secret.test.ts`
- Create: `tests/invitations/roles.test.ts`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: Prisma models, `issueInvitationToken`, `issueInvitationAttemptSecret`, domain-separated hash functions, role caps, and stronger-role preservation.

- [ ] **Step 1: Write failing schema/crypto/role tests**

Tests assert:

- both bearer values are 32 random bytes/43 base64url characters
- hashes use distinct domain prefixes and are 64 lowercase hex
- raw invitation/attempt values are absent from schema/migration
- one nullable unique activeKey
- BIGINT revision
- nullable creator with SetNull
- attempt revision/expiry/consumed/invalidated fields
- attempt hash unique
- link intent stores only 256-bit intent-secret/CSRF hashes, exact user/session, canonical origin, DB passwordVerifiedAt/expiry, one activeKey, and one-time consumedAt
- explicit link grant requires expectedUserId, expectedSessionRegistryId, and unique linkIntentId; NEW_IDENTITY requires all three null
- link grant uses a nullable unique activeKey for one live provider identity; consumed/expired grants retain immutable history but cannot block a later guarded grant
- DB constraint/trigger rejects purpose-field mismatch, provider other than google, expiry beyond five minutes for intent/two minutes for grant, consumed intent reuse, or a session owned by another user
- role matrix never grants OWNER

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/invitations/schema.test.ts tests/invitations/token.test.ts tests/invitations/attempt-secret.test.ts tests/invitations/roles.test.ts`

Expected: FAIL because models/primitives do not exist.

- [ ] **Step 3: Add complete models**

```prisma
enum GoogleAccountLinkPurpose {
  NEW_IDENTITY
  EXPLICIT_PASSWORD_STEP_UP_LINK
}

model AuthIdentityProof {
  id                String   @id @default(cuid())
  userId            String
  provider          String
  providerAccountId String
  emailNormalized   String
  verifiedAt        DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId, provider, emailNormalized])
}

model GoogleAccountLinkGrant {
  id                String                   @id @default(cuid())
  provider          String
  providerAccountId String
  emailNormalized   String
  expectedUserId    String?
  expectedSessionRegistryId String?
  linkIntentId      String?                  @unique
  activeKey         String?                  @unique
  purpose           GoogleAccountLinkPurpose
  expiresAt         DateTime
  consumedAt        DateTime?
  createdAt         DateTime                 @default(now())
  expectedUser      User?                    @relation(fields: [expectedUserId], references: [id], onDelete: SetNull)
  linkIntent        GoogleAccountLinkIntent? @relation(fields: [linkIntentId], references: [id], onDelete: Restrict)

  @@index([provider, providerAccountId, expiresAt])
  @@index([expiresAt])
}

model GoogleAccountLinkIntent {
  id                    String   @id @default(cuid())
  userId                String
  authSessionRegistryId String
  provider              String
  emailNormalized       String
  intentSecretHash      String   @unique
  csrfTokenHash         String
  canonicalOrigin       String
  returnPath            String
  activeKey             String?  @unique
  passwordVerifiedAt    DateTime
  expiresAt             DateTime
  consumedAt            DateTime?
  createdAt             DateTime @default(now())
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  authSessionRegistry   AuthSessionRegistry @relation(fields: [authSessionRegistryId], references: [id], onDelete: Cascade)
  linkGrant             GoogleAccountLinkGrant?

  @@index([userId, authSessionRegistryId, expiresAt])
  @@index([expiresAt])
}

model WorkspaceInvitation {
  id              String        @id @default(cuid())
  workspaceId     String
  emailNormalized String
  tokenHash       String        @unique
  activeKey       String?       @unique
  revision        BigInt        @default(1)
  role            WorkspaceRole
  expiresAt       DateTime
  expiredAt       DateTime?
  createdById     String?
  consumedAt      DateTime?
  consumedById    String?
  revokedAt       DateTime?
  revokedById     String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  workspace       Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy       User?         @relation("InvitationCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  consumedBy      User?         @relation("InvitationConsumedBy", fields: [consumedById], references: [id], onDelete: SetNull)
  revokedBy       User?         @relation("InvitationRevokedBy", fields: [revokedById], references: [id], onDelete: SetNull)
  attempts        WorkspaceInvitationAttempt[]

  @@index([workspaceId, emailNormalized, expiresAt])
  @@index([workspaceId, activeKey])
}

model WorkspaceInvitationAttempt {
  id                    String              @id @default(cuid())
  invitationId          String
  attemptSecretHash     String              @unique
  invitationRevision    BigInt
  expiresAt             DateTime
  consumedAt            DateTime?
  invalidatedAt         DateTime?
  createdAt             DateTime            @default(now())
  invitation            WorkspaceInvitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)

  @@index([invitationId, expiresAt])
  @@index([expiresAt])
}
```

Add corresponding User, AuthSessionRegistry, and Workspace relation fields and complete additive SQL with matching FKs/indexes plus purpose/session/expiry integrity triggers. `AuthIdentityProof` intentionally retains permanent provider-account uniqueness because it is ownership state, not a retry credential. In contrast, an active grant has the exact derived `activeKey = "google:" + providerAccountId`; a serializable provider-ID lock clears that key only from consumed or DB-expired grant history before issuing a replacement. Consumption clears it in the same transaction as Account/proof creation. `GoogleAccountLinkGrant` has no permanent unique constraint on `(provider, providerAccountId)`, so immutable expired/consumed history cannot prevent a later fresh guarded attempt. The signup migration is ordered after Issue 8's AuthSessionRegistry migration; it cannot deploy first and later acquire the session binding.

- [ ] **Step 4: Implement distinct domain hashes**

```ts
function hashOpaqueValue(domain: string, value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("OPAQUE_VALUE_INVALID");
  return createHash("sha256")
    .update(`${domain}\0`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export const hashInvitationToken = (value: string) =>
  hashOpaqueValue("munjib-invitation-v1", value);
export const hashInvitationAttemptSecret = (value: string) =>
  hashOpaqueValue("munjib-invitation-attempt-v1", value);
```

- [ ] **Step 5: Run GREEN, update wiki, and commit**

```bash
DATABASE_URL=postgresql://schema_check:schema_check@127.0.0.1:5432/schema_check pnpm exec prisma validate
DATABASE_URL=postgresql://schema_check:schema_check@127.0.0.1:5432/schema_check pnpm exec prisma generate
pnpm exec vitest run tests/invitations/schema.test.ts tests/invitations/token.test.ts tests/invitations/attempt-secret.test.ts tests/invitations/roles.test.ts
```

Document models/revision/hash-only persistence in the data wiki and append log evidence. Run:

```bash
git add prisma/schema.prisma prisma/migrations/20260712030000_add_secure_workspace_invitations/migration.sql lib/invitations/token.ts lib/invitations/attempt-secret.ts lib/invitations/roles.ts tests/invitations/schema.test.ts tests/invitations/token.test.ts tests/invitations/attempt-secret.test.ts tests/invitations/roles.test.ts wiki/Document\ Knowledge\ Model.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(auth): add secure invitation persistence"
```

Expected: schema, hashing, tests, concrete wiki/log delta, and every gate PASS.

### Task 3: Enforce one active invitation, renewal, caps, expiry, and journaled denial

**Files:**
- Create: `lib/invitations/journal-replay.ts`
- Create: `tests/invitations/journal-replay.test.ts`
- Create: `lib/invitations/service.ts`
- Create: `app/api/workspaces/[workspaceSlug]/invitations/route.ts`
- Create: `tests/invitations/management.test.ts`
- Create: `tests/invitations/management-route.test.ts`
- Create: `tests/invitations/management-race.test.ts`
- Create: `tests/invitations/expiry-journal.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: `createOrRenewWorkspaceInvitation`, `listWorkspaceInvitations`, `revokeWorkspaceInvitation`, `expireDueWorkspaceInvitations`, `hasUsableInvitationForEmail`, and exact `leaf7JournalReplayReducers`.

- [ ] **Step 1: Write failing management/race/expiry tests**

Tests require:

- activeKey uniqueness under concurrent create
- renewal keeps row ID, increments revision, rotates token hash, invalidates attempts
- renewal appends `INVITATION_CREDENTIAL_INVALIDATED` in the same transaction with the invitation ID as subject and exact two-key Leaf 2 payload
- old token and attempt unusable
- active pending maximum 100/workspace
- issuance/renewal maximum 20/actor/workspace/rolling hour under advisory lock
- no arbitrary `take`
- OWNER/ADMIN caps and reserved rejection
- creator deletion yields unusable invitation
- revoke/expiry clears activeKey and appends Leaf 2 journal event atomically
- crash before journal append rolls back state
- retry operation UUID idempotent
- restore reducers cover all four invitation deny kinds, exact-validate the immutable
  invitation id/payload, and cannot create/renew/grant or touch journal/checkpoint rows
- every browser manager create/renew/revoke route uses Leaf 8 bounded JSON and browser provenance, resolves the authoritative session, then consumes a branded `guardInvitationMutation` permit before any invitation lock or mutation
- the scheduled expiry sweeper is not a browser route and accepts no actor/request body; it runs only through the fixed internal job authority, while any future manual expiry route must consume the same Leaf 8 actor permit
- a Leaf 8 guard outage returns `AUTH_GUARD_UNAVAILABLE` with zero invitation/audit/journal persistence

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/invitations/management.test.ts tests/invitations/management-route.test.ts tests/invitations/management-race.test.ts tests/invitations/expiry-journal.test.ts tests/invitations/journal-replay.test.ts`

Expected: FAIL because service/locks/caps, Leaf 8 guard integration, and the exact Leaf 7 reducer map do not exist.

- [ ] **Step 3: Implement active-key locked create/renew**

Inside a serializable transaction:

1. resolve current manager through Leaf 2 DB-time resolver;
2. lock workspace+email, workspace pending, and actor issuance advisory keys;
3. count `workspace.invitation.created|renewed` audits in previous DB hour;
4. find activeKey;
5. renew existing or clear expired active keys and enforce pending cap;
6. create/update token hash, role, expiry, creator;
7. renewal increments revision and sets every active attempt `invalidatedAt=CURRENT_TIMESTAMP`;
8. renewal appends `INVITATION_CREDENTIAL_INVALIDATED` using `subjectType:"INVITATION"`, the immutable invitation row ID, `deriveSecurityJournalOperationId`, and exact payload `{stateCode:"INVITATION_CREDENTIAL_INVALIDATED",stateVersion:1}`;
9. write token-free create/renew audit.

Return raw token once. Initial creation is access-increasing credential issuance and does not enter the deny-only journal.

The manager route uses Leaf 8's `readBoundedJson` and
`guardBrowserAuthMutation`, resolves the exact active manager session, then calls
`guardInvitationMutation` before entering this service. It cannot call the lower-level
PostgreSQL limiter directly or synthesize a permit.

- [ ] **Step 4: Implement revoke and expiry journal transitions**

Revoke and expiry transactions clear `activeKey`, set DB timestamp, invalidate attempts, write audit, and append respectively `INVITATION_REVOKED` or `INVITATION_EXPIRED` with `subjectType:"INVITATION"`, the immutable invitation row ID, exact two-key payload, and deterministic per-event operation UUID. Expired-but-unswept invitations are denied by `expiresAt > CURRENT_TIMESTAMP`; the fixed internal sweeper records the durable transition later without pretending to have a browser actor permit.

`hasUsableInvitationForEmail` uses no arbitrary `take`; it filters all active/unexpired rows and DB-time reauthorizes the nullable creator.

Create `leaf7JournalReplayReducers` with exactly
`INVITATION_CREDENTIAL_INVALIDATED`, `INVITATION_CONSUMED`,
`INVITATION_REVOKED`, and `INVITATION_EXPIRED`. Under Leaf 2's branded restore context,
each locks the invitation target if present and idempotently invalidates credentials/
attempts or terminates the invitation. No reducer issues a credential, renews, creates
membership, appends, or mutates journal/checkpoint state.

- [ ] **Step 5: Run GREEN, update the durable wiki evidence, and commit through every gate**

```bash
pnpm exec vitest run tests/invitations/management.test.ts tests/invitations/management-route.test.ts tests/invitations/management-race.test.ts tests/invitations/expiry-journal.test.ts tests/invitations/journal-replay.test.ts tests/security/journal.test.ts
```

Document caps/renewal/journal and append log evidence. Run:

```bash
git add lib/invitations/service.ts lib/invitations/journal-replay.ts app/api/workspaces/\[workspaceSlug\]/invitations/route.ts tests/invitations/management.test.ts tests/invitations/management-route.test.ts tests/invitations/management-race.test.ts tests/invitations/expiry-journal.test.ts tests/invitations/journal-replay.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(auth): manage bounded invitations"
```

Expected: management, concurrency, journal rollback, wiki evidence, and every gate PASS.

### Task 4: Gate Google sign-in and require explicit password-step-up linking

**Files:**
- Create: `lib/auth/google-signin-policy.ts`
- Create: `lib/auth/google-link-grant.ts`
- Create: `lib/auth/google-link-intent.ts`
- Create: `lib/auth/guarded-google-adapter.ts`
- Modify: `lib/auth/downstream/leaf7.ts`
- Modify: `types/next-auth.d.ts`
- Modify: `lib/auth/provisioning.ts`
- Create: `app/api/auth/google-link-intents/route.ts`
- Create: `app/account/security/page.tsx`
- Create: `components/link-google-account.tsx`
- Create: `tests/auth/google-signin-policy.test.ts`
- Create: `tests/auth/google-link-grant.test.ts`
- Create: `tests/auth/google-link-intent.test.ts`
- Create: `tests/auth/google-link-takeover.test.ts`
- Create: `tests/auth/guarded-google-adapter.test.ts`
- Create: `tests/auth/nextauth-candidate-context.test.ts`
- Create: `tests/auth/google-link-token-media-zero.test.ts`
- Create: `tests/auth/google-link-race.test.ts`
- Create: `tests/security/google-link-source-contract.test.ts`
- Modify: `tests/auth/provisioning-current-user.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: verified Google extraction, explicit password-step-up Link Google intent, link-grant issuance/consumption, guarded adapter, persisted proof, and signed `googleVerifiedEmail`.

- [ ] **Step 1: Write failing sign-in/link/race/conflict tests**

Tests cover:

- unverified profile denied
- reserved identity denied
- existing exact linked active user allowed
- closed mode new identity denied
- invite mode new identity requires usable invitation
- public-verified new identity allowed
- an unauthenticated invited Google identity colliding with a password User gets only generic `EXISTING_ACCOUNT_SIGN_IN_REQUIRED` and creates zero User/Account/proof/intent/grant/membership rows
- an attacker controlling a reassigned provider-verified email plus matching invitation still cannot link to the historical password User
- exact active AuthSessionRegistry user plus fresh DB-time password step-up, canonical Origin/Fetch Metadata, valid one-time CSRF, and explicit Link Google click creates one five-minute intent
- missing/stale password step-up, wrong password, stale/replayed CSRF, wrong Origin, cross-session/cross-user callback, changed email, missing intent cookie, or expired/consumed intent creates no grant/link
- callback may issue one two-minute `EXPLICIT_PASSWORD_STEP_UP_LINK` grant only for the intent's exact user, session, provider, and normalized email
- no invite, conflicting providerAccountId, conflicting Google Account/proof, disabled user, mismatched email all denied
- concurrent intent/callback/link attempts create one Account/proof and consume one intent/grant
- two callback requests interleaved at barriers retain distinct branded contexts; neither can consume, acknowledge, or close the other's grant/provider identity, and a context is unusable after success, throw, or callback `finally`
- duplicate User/email race creates no second User
- adapter link without valid grant fails before Account persistence
- source contract rejects a stock/blind Google adapter
- both new-identity and explicit-link callbacks may carry synthetic OAuth token/profile-image fields, but Account contains only minimal identity, a new User has `image:null`, an existing User image is unchanged, and session/proof/grant/audit contain no token or profile URL
- every OAuth start/callback and link-intent mutation consumes the matching Leaf 8 guard; outage produces zero intent/grant/User/Account/proof persistence

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/auth/google-signin-policy.test.ts tests/auth/google-link-grant.test.ts tests/auth/google-link-intent.test.ts tests/auth/google-link-takeover.test.ts tests/auth/guarded-google-adapter.test.ts tests/auth/nextauth-candidate-context.test.ts tests/auth/google-link-token-media-zero.test.ts tests/auth/google-link-race.test.ts tests/security/google-link-source-contract.test.ts`

Expected: FAIL because guarded linking does not exist.

- [ ] **Step 3: Implement current-session password step-up and explicit Link Google intent**

`POST /api/auth/google-link-intents` uses Issue 8 `resolveAuthoritativeAuthSession`, `readBoundedJson`, `guardBrowserAuthMutation`, and `guardAuthMutationActor`; a decrypted JWT or caller-supplied user/session ID is never sufficient. It requires the branded guard before lookup/mutation, a valid one-time CSRF value bound to the current session, bounded password input, and an explicit `intent:"LINK_GOOGLE"`. In one transaction it:

1. locks the exact User and AuthSessionRegistry rows and rechecks active session/version/authDisabledAt;
2. requires a passwordHash and verifies the submitted password through the canonical scrypt verifier;
3. takes DB `CURRENT_TIMESTAMP` as passwordVerifiedAt;
4. generates a 256-bit intent secret and stores only its domain-separated hash plus CSRF hash, canonical origin, exact user/session, provider google, normalized User email, allowlisted return path, activeKey, and DB expiry no more than five minutes;
5. invalidates the session's older active intent and returns the raw intent secret once in a `__Host-munjib.google-link-intent` Secure/HttpOnly/SameSite=Lax/Path=/ cookie.

The UI exists only for an authenticated password User, labels the action `Link Google`, asks for the current password, and starts Google OAuth only after the intent POST succeeds. It never reuses invitation exchange as account-ownership proof.

- [ ] **Step 4: Implement collision-safe link-grant policy**

For an unlinked provider account with no existing User, first consume Leaf 8 `guardOAuthIdentity`, then require exact normalized verified email, unclaimed provider ID, current effective mode, and a usable invitation in invite mode. Under the provider-ID lock, clear `activeKey` only on consumed/DB-expired grant history and issue one two-minute `NEW_IDENTITY` grant with the exact active key; a live grant causes the generic denial.

When the normalized email already belongs to a User, ordinary/unauthenticated OAuth always returns `EXISTING_ACCOUNT_SIGN_IN_REQUIRED` with zero persistence, regardless of invitation or provider email verification. Only the explicit link flow may issue a two-minute `EXPLICIT_PASSWORD_STEP_UP_LINK` grant, after locking and rechecking:

- raw intent cookie hash resolves one active, unconsumed, DB-unexpired intent;
- current authoritative session registry ID and User ID exactly equal the intent;
- passwordVerifiedAt is no older than five DB minutes and predates neither session creation nor latest credential invalidation;
- callback provider is google, verified normalized email equals intent/User email, providerAccountId is unclaimed, and User remains active with no Google Account/proof;
- canonical Origin binding and one-time CSRF/intent evidence match;
- conditional intent claim wins once; the grant records expectedUserId, expectedSessionRegistryId, and unique linkIntentId.

- [ ] **Step 5: Implement guarded adapter transaction**

`guardedGoogleAdapter` never calls the stock Google `linkAccount`. Leaf 8's already
deployed route wrapper enters Leaf 1's opaque request cell before invoking NextAuth;
the cell is still `EMPTY` when the framework enters `callbacks.signIn`. After
`guardOAuthIdentity` and the exact DB grant have been locked/revalidated, Leaf 7's
`signIn` extension uses the only branded initializer to conditionally set that current
cell to `READY`. It never starts a nested scope, and there is no module-global current
grant, user, or provider identity. The ready context binds a fresh request nonce,
purpose, grant id, normalized email, providerAccountId, and optional expected
user/session.

For `NEW_IDENTITY`, the `createUser` hook requires that exact store, conditionally
advances `READY→CREATING`, and in one serializable transaction rechecks
mode/invitation/provider/email conflicts, consumes the grant, creates
`User.image=null`, inserts Account only through Leaf 1
`minimalGoogleAccountData()`, asserts every token/expiry column is null, and creates
the proof. On commit it records only the exact new User/Account ids in the context and
advances to `CREATED`; the immediately following `linkAccount` must match every bound
and created identity, performs no database write, and conditionally advances
`CREATED→ACKNOWLEDGED`. For `EXPLICIT_PASSWORD_STEP_UP_LINK`, `createUser` is forbidden
and `linkAccount` performs the existing-user transaction once from
`READY→ACKNOWLEDGED`, rechecking consumed intent, authoritative session/user, password
step-up freshness, email, provider, and conflicts without updating `User.image`.

The Leaf 8 outer callback wrapper always marks the context `CLOSED` in `finally` and
disables its store before control returns; error cleanup cannot make a consumed grant reusable.
Every transition is compare-and-set, a second adapter call fails closed, and durable
grant consumption rejects replay in another request or process. Tests use barriers to
interleave two callbacks, force throws before and after commit, omit the store, swap
provider IDs/grants, replay an acknowledged context, and prove zero cross-request or
second persistence. `tests/auth/nextauth-candidate-context.test.ts` executes the actual
NextAuth order—`callbacks.signIn` returns before the separate callback handler invokes
`createUser` and `linkAccount`—through the outer route wrapper and proves the ready
cell survives precisely until outer `finally`. Any mismatch returns the generic existing-account outcome. The
reserved Leaf 7 slot composes this service into Leaf 1's frozen pipeline; non-Google
calls may delegate only through the reviewed adapter boundary.

Never enable NextAuth's dangerous/provider-email auto-link option. The explicit callback invokes only the branded guarded link service after consuming the intent/grant; no ordinary sign-in callback and no stock Prisma adapter `linkAccount` call may attach Google to an existing User. The source-contract test rejects the option string, email-based User selection in a link path, any Google `linkAccount` delegate, payload spread, token-field Account write, `profile.image` persistence, and a guard bypass.

- [ ] **Step 6: Persist current-session assurance**

After successful link/existing login, verify Account ownership, upsert `AuthIdentityProof`, set JWT `googleVerifiedEmail`, and expose only that assurance in session. Discard provider token fields and `profile.image`/`picture`; apply Leaf 1's internal-only session-image sanitizer with the exact server-built authorized attachment-ID set. A path-shaped value without that authorization remains null, new users remain null, and historical external `User.image` is never emitted. Credential login deletes Google assurance. Invite/closed users without an accepted membership do not auto-create a personal workspace.

- [ ] **Step 7: Run GREEN, update the durable wiki evidence, and commit through every gate**

```bash
pnpm exec vitest run tests/auth/google-signin-policy.test.ts tests/auth/google-link-grant.test.ts tests/auth/google-link-intent.test.ts tests/auth/google-link-takeover.test.ts tests/auth/guarded-google-adapter.test.ts tests/auth/nextauth-candidate-context.test.ts tests/auth/google-link-token-media-zero.test.ts tests/auth/google-link-race.test.ts tests/security/google-link-source-contract.test.ts tests/auth/config.test.ts tests/auth/provisioning-current-user.test.ts
```

Document the no-email-ownership rule, exact session/password-step-up/CSRF/Origin intent, generic collision response, guarded linking, and takeover/race evidence; append log evidence. Run:

```bash
git add lib/auth/google-signin-policy.ts lib/auth/google-link-grant.ts lib/auth/google-link-intent.ts lib/auth/guarded-google-adapter.ts lib/auth/downstream/leaf7.ts types/next-auth.d.ts lib/auth/provisioning.ts app/api/auth/google-link-intents/route.ts app/account/security/page.tsx components/link-google-account.tsx tests/auth/google-signin-policy.test.ts tests/auth/google-link-grant.test.ts tests/auth/google-link-intent.test.ts tests/auth/google-link-takeover.test.ts tests/auth/guarded-google-adapter.test.ts tests/auth/nextauth-candidate-context.test.ts tests/auth/google-link-token-media-zero.test.ts tests/auth/google-link-race.test.ts tests/security/google-link-source-contract.test.ts tests/auth/provisioning-current-user.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(auth): guard invited Google linking"
```

Expected: policy, guarded persistence, race proofs, wiki evidence, and every gate PASS.

### Task 5: Scrub fragment before hydration and exchange it for an opaque attempt

**Files:**
- Create: `lib/invitations/attempt-cookie.ts`
- Create: `middleware.ts`
- Create: `lib/security/downstream/leaf12-edge-middleware.ts`
- Create: `app/invitations/layout.tsx`
- Create: `app/invitations/page.tsx`
- Create: `components/invitation-bootstrap.tsx`
- Create: `app/api/invitation-attempts/route.ts`
- Create: `tests/invitations/attempt-cookie.test.ts`
- Create: `tests/invitations/attempt-exchange.test.ts`
- Create: `tests/components/invitation-bootstrap.test.tsx`
- Create: `tests/security/invitation-bootstrap-source-contract.test.ts`
- Create: `tests/security/invitation-guard-integration.test.ts`
- Create: `tests/security/leaf12-edge-middleware-extension-contract.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify: `next.config.mjs`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: Leaf 8 `readBoundedJson`, `guardBrowserAuthMutation`, and branded `guardInvitationExchange`.
- Produces: nonce-bearing pre-hydration fragment scrub, `createInvitationAttempt`, Secure opaque attempt cookie, and the version-0 `runLeaf12EdgeMiddleware()` extension. It owns no second body/provenance/limiter implementation.

The reserved seam freezes this complete future context before Leaf 12 exists:

```ts
export type Leaf12EdgeMiddlewareContext = Readonly<{
  request: NextRequest;
  requestHeaders: Headers;
  responseHeaders: Headers;
  invitation: Readonly<{
    matched: boolean;
    nonce: string | null;
    enforcedPolicy: string | null;
  }>;
}>;

export type Leaf12EdgeMiddlewareResult =
  | Readonly<{ decision: "continue"; requestHeaders: Headers; responseHeaders: Headers }>
  | Readonly<{ decision: "respond"; response: Response }>;
```

Version 0 returns the supplied request/response headers unchanged with decision
`continue`. It performs no fetch, file read, authentication, parsing, mutation, or
telemetry and cannot replace or weaken an invitation policy.

- [ ] **Step 1: Write failing bootstrap/exchange/privacy tests**

Tests assert:

- `/invitations#token=<raw>` produces initial HTTP path `/invitations`
- nonce script appears before Next/Sentry scripts
- script reads fragment, immediately calls `history.replaceState(...,"/invitations")`, then exposes token in one configurable non-enumerable in-memory slot
- component deletes the slot before awaiting network
- callback/reload paths are `/invitations`
- exchange body >512 bytes or chunked overflow returns 413 before service
- cross-origin or cross-site mutation returns 403
- guard-store outage occurs before token hash/lookup and persists no attempt
- cookie is Path=/, Secure, HttpOnly, SameSite=Lax, max-age 600
- cookie value is a 43-character attempt secret, not invitation token/hash
- DB stores only attemptSecretHash
- at most five unconsumed attempts/invitation
- all responses include private,no-store
- root middleware exports `runtime: "nodejs"`, matches API/RSC/application paths while
  excluding only `_next/static`, `_next/image`, and `favicon.ico`, and invokes the
  version-0 seam after creating the invitation nonce/enforced policy
- the root middleware owner/hash is Leaf 7 `ACTIVE`; the ninth-tuple downstream seam is
  version `0`, state `RESERVED`, and its version-0 result is structural pass-through

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/invitations/attempt-cookie.test.ts tests/invitations/attempt-exchange.test.ts tests/components/invitation-bootstrap.test.tsx tests/security/invitation-bootstrap-source-contract.test.ts tests/security/invitation-guard-integration.test.ts`

Expected: FAIL because bootstrap/exchange/cookie modules and exact Leaf 8 guard integration do not exist.

- [ ] **Step 3: Reuse Leaf 8 bounded parsing, provenance, and exchange admission**

`POST /api/invitation-attempts` first applies Leaf 8's exact canonical Origin/Fetch
Metadata guard, then parses the body once through `readBoundedJson(request, 512,
schema)`, then consumes `guardInvitationExchange` before hashing or looking up the raw
token. No Leaf 7 file calls `request.json()`, implements its own stream reader, invokes
the low-level PostgreSQL limiter, or constructs a permit. The integration source test
pins this order and fails on a bypass.

- [ ] **Step 4: Implement the permanent Node middleware shell, reserved seam, and minimal pre-hydration scrub**

Root `middleware.ts` is owned permanently by Leaf 7. It exports
`config.runtime = "nodejs"` and a broad matcher that includes API, RSC, and application
requests while excluding only `/_next/static`, `/_next/image`, and `/favicon.ico`.
For `/invitations` it creates one per-request nonce, passes it in an internal request
header, and sets the invitation's enforced CSP using that nonce. It then invokes the
version-0 seam with the request, mutable request/response header copies, and exact
invitation `{matched,nonce,enforcedPolicy}` context. A `respond` result is returned;
otherwise its returned header copies are used without replacing the invitation CSP.
`app/invitations/layout.tsx` renders this first head script:

```ts
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
} as const;
```

The matcher must not exclude `/api`, RSC requests, or invitation routes.

```js
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("token");
  history.replaceState(history.state, "", "/invitations");
  if (/^[A-Za-z0-9_-]{43}$/.test(token || "")) {
    Object.defineProperty(window, "__munjibInvitationBootstrapToken", {
      value: token,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }
})();
```

The script has the request nonce and no external import. The page receives no token prop.

Create the version-0 seam with the frozen context/result types above. The extension
contract test hashes root middleware and requires every later owner transition to touch
only the seam. It also rejects a narrower matcher, Edge runtime, missing invitation
policy context, header replacement, network/auth work in v0, or any owner-map entry
other than the fixed ninth reservation tuple.

- [ ] **Step 5: Implement attempt creation and cookie**

`createInvitationAttempt`:

1. hashes raw invitation token immediately;
2. locks invitation;
3. checks activeKey, revision, DB expiry, nullable creator authority, reserved policy;
4. clears expired attempts;
5. rejects at five active attempts;
6. generates 256-bit attempt secret;
7. stores only domain-separated hash, invitation revision, and DB expiry `min(invitation expiry, CURRENT_TIMESTAMP + 10 minutes)`;
8. returns raw attempt secret once plus masked display.

Cookie name: `__Host-munjib.invitation-attempt`; attributes: Path=/, Secure, HttpOnly, SameSite=Lax, Max-Age=600, no Domain.

- [ ] **Step 6: Implement POST exchange and GET current display**

`POST /api/invitation-attempts` accepts only `{token}` through the Step 3 Leaf 8 guards, creates an attempt only after the branded permit, sets the cookie, and returns masked display without token/hash.

`GET /api/invitation-attempts` reads cookie, hashes attempt secret, validates attempt/invitation/revision/creator/expiry read-only, and returns display. It never consumes or creates membership.

Every branch uses a shared private/no-store response helper; unexpected errors serialize only `INVITATION_REQUEST_FAILED`.

- [ ] **Step 7: Run GREEN, update the durable wiki evidence, and commit through every gate**

```bash
pnpm exec vitest run tests/invitations/attempt-cookie.test.ts tests/invitations/attempt-exchange.test.ts tests/components/invitation-bootstrap.test.tsx tests/security/invitation-bootstrap-source-contract.test.ts tests/security/invitation-guard-integration.test.ts
if rg -q 'invitations/\\[token\\]|callbackUrl:.*token|tokenHash.*cookie' app components lib tests; then exit 1; fi
```

Document fragment/attempt boundaries and append log evidence. Run:

```bash
git add lib/invitations/attempt-cookie.ts middleware.ts lib/security/downstream/leaf12-edge-middleware.ts app/invitations/layout.tsx app/invitations/page.tsx components/invitation-bootstrap.tsx app/api/invitation-attempts/route.ts tests/invitations/attempt-cookie.test.ts tests/invitations/attempt-exchange.test.ts tests/components/invitation-bootstrap.test.tsx tests/security/invitation-bootstrap-source-contract.test.ts tests/security/invitation-guard-integration.test.ts tests/security/leaf12-edge-middleware-extension-contract.test.ts deploy/security/protected-artifact-owners.json next.config.mjs wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(auth): exchange invitation fragments safely"
```

Expected: first-script scrub, bounded exchange, opaque cookie, privacy tests, wiki evidence, and every gate PASS.

### Task 6: Consume attempt and invitation atomically with verified Google assurance

**Files:**
- Modify: `lib/invitations/service.ts`
- Create: `app/api/invitation-attempts/accept/route.ts`
- Create: `tests/invitations/acceptance.test.ts`
- Create: `tests/invitations/acceptance-race.test.ts`
- Create: `tests/invitations/acceptance-journal.test.ts`
- Create: `tests/invitations/acceptance-route.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: Leaf 8 `guardBrowserAuthMutation` and branded `guardInvitationAcceptance` before attempt-cookie lookup.
- Produces: `acceptWorkspaceInvitationAttempt({permit, attemptSecretHash, actorId, googleVerifiedEmail, operationId})`.

- [ ] **Step 1: Write failing acceptance/race/journal tests**

Tests cover:

- missing/expired/consumed/invalidated attempt
- invitation revision mismatch after renewal
- attempt/invitation expiry
- current JWT Google email, User.email, AuthIdentityProof, and linked Account exact match
- password/development session rejected even with old proof
- reserved identity rejected
- nullable/deauthorized inviter rejected
- role cap rechecked
- existing stronger membership preserved
- two simultaneous POSTs produce one success, one failure, one membership, one consumed attempt/invitation, one journal event
- limiter outage occurs before attempt-cookie hash/lookup and creates no membership/consume/journal state
- crash before journal append rolls back both consumption fields and membership
- replay operation UUID idempotent
- cookie cleared on success and terminal failure

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/invitations/acceptance.test.ts tests/invitations/acceptance-race.test.ts tests/invitations/acceptance-journal.test.ts tests/invitations/acceptance-route.test.ts`

Expected: FAIL because atomic attempt acceptance does not exist.

- [ ] **Step 3: Implement serializable acceptance**

Within one serializable transaction:

1. lookup attempt by hash and lock;
2. require unconsumed/uninvalidated and DB unexpired;
3. load/lock invitation;
4. require attempt revision equals invitation revision;
5. require invitation active/unconsumed/unrevoked/unexpired;
6. require current Google session email equals invitation and User.email;
7. require matching Google proof and Account;
8. require nonreserved identity;
9. resolve latest creator through DB-time active-membership resolver and role cap;
10. claim attempt and invitation with conditional `updateMany`;
11. set invitation `activeKey=null`, invalidate sibling attempts;
12. create/update membership without downgrade;
13. write acceptance audit;
14. append `INVITATION_CONSUMED` with `subjectType:"INVITATION"`, `subjectId=invitation.id`, a derived operation UUID, and exact payload `{stateCode:"INVITATION_CONSUMED",stateVersion:1}`.

P2034 and zero-count claims normalize to `INVITATION_UNAVAILABLE`.

- [ ] **Step 4: Implement route**

The route requires authoritative authenticated user, current `googleVerifiedEmail`, Leaf 8 canonical Origin/Fetch Metadata, attempt cookie, and no request body. Before hashing or looking up that cookie, it consumes `guardInvitationAcceptance`; only the branded permit reaches the service. It then hashes the cookie secret, calls service, clears cookie, and returns only workspace slug. Every response is private,no-store. Neither route nor service calls the lower-level limiter directly.

- [ ] **Step 5: Run repeated race GREEN**

```bash
for run in 1 2 3 4 5; do
  pnpm exec vitest run tests/invitations/acceptance-race.test.ts || exit 1
done
pnpm exec vitest run tests/invitations/acceptance.test.ts tests/invitations/acceptance-journal.test.ts tests/invitations/acceptance-route.test.ts
```

Expected: all runs PASS with exactly one winner.

- [ ] **Step 6: Update the durable wiki evidence and commit through every gate**

Document current-session proof and atomic attempt+invitation+journal transaction; append log evidence. Run:

```bash
git add lib/invitations/service.ts app/api/invitation-attempts/accept/route.ts tests/invitations/acceptance.test.ts tests/invitations/acceptance-race.test.ts tests/invitations/acceptance-journal.test.ts tests/invitations/acceptance-route.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(auth): accept invitation attempts atomically"
```

Expected: acceptance, race, journal rollback, route, wiki evidence, and every gate PASS.

### Task 7: Add invitation management and acceptance UI without raw-token URLs

**Files:**
- Create: `components/workspace-invitations-panel.tsx`
- Create: `components/invitation-acceptance.tsx`
- Modify: `components/invitation-bootstrap.tsx`
- Modify: `components/workspace-settings-panel.tsx`
- Modify: `components/document-list.tsx`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `lib/i18n/messages.ts`
- Create: `tests/components/workspace-invitations-panel.test.tsx`
- Create: `tests/components/invitation-acceptance.test.tsx`
- Modify: `tests/components/workspace-settings-panel.test.tsx`
- Modify: `tests/components/document-list.test.tsx`
- Modify: `tests/i18n/messages.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Manager UI produces `/invitations#token=<encoded>` only; acceptance UI consumes current opaque attempt and uses callback `/invitations`.

- [ ] **Step 1: Write failing role/link/confirmation tests**

Tests assert:

- OWNER options ADMIN/EDITOR/VIEWER
- ADMIN options EDITOR/VIEWER
- no OWNER option; nonmanager no section
- create/renew returns link with `#token=`, never `/invitations/<token>`
- link only component state, not storage
- initial acceptance render performs no acceptance POST
- unauthenticated click calls `signIn("google",{callbackUrl:"/invitations"})`
- authenticated explicit confirm calls `/api/invitation-attempts/accept`
- full email visible only in authenticated manager list; acceptance uses masked email

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/components/workspace-invitations-panel.test.tsx tests/components/invitation-acceptance.test.tsx tests/components/workspace-settings-panel.test.tsx tests/components/document-list.test.tsx tests/i18n/messages.test.ts`

Expected: FAIL because UI and message keys do not exist.

- [ ] **Step 3: Implement manager panel**

Fetch bounded manager APIs, render lifecycle state, create/renew/revoke, and construct:

```ts
const link =
  `${window.location.origin}/invitations#token=${encodeURIComponent(result.token)}`;
```

Clear old link before request and on unmount. Never write storage, telemetry, toast body, or query parameters.

- [ ] **Step 4: Implement bootstrap/acceptance UI**

On mount, read and delete the in-memory bootstrap token, exchange once, or GET current attempt after OAuth/reload. Display masked invitation. Google button callback is `/invitations`. Explicit authenticated confirmation POSTs with no token/body and redirects to returned workspace.

- [ ] **Step 5: Run GREEN, update the durable wiki evidence, and commit through every gate**

Run:

```bash
pnpm exec vitest run tests/components/workspace-invitations-panel.test.tsx tests/components/invitation-acceptance.test.tsx tests/components/workspace-settings-panel.test.tsx tests/components/document-list.test.tsx tests/i18n/messages.test.ts
pnpm exec tsc --noEmit
```

Expected: component/i18n tests and TypeScript PASS.

Document the UI/token boundary and append log evidence. Run:

```bash
git add components/workspace-invitations-panel.tsx components/invitation-acceptance.tsx components/invitation-bootstrap.tsx components/workspace-settings-panel.tsx components/document-list.tsx 'app/workspaces/[workspaceSlug]/page.tsx' lib/i18n/messages.ts tests/components/workspace-invitations-panel.test.tsx tests/components/invitation-acceptance.test.tsx tests/components/workspace-settings-panel.test.tsx tests/components/document-list.test.tsx tests/i18n/messages.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(workspaces): add secure invitation settings"
```

Expected: UI, tests, wiki evidence, and every gate PASS.

### Task 8: Prove raw-token zero across scripts, network, telemetry, history, and logs

**Files:**
- Create: `tests/e2e/invitations.spec.ts`
- Modify: `playwright.auth-runtime.config.ts`
- Create: `tests/security/invitation-observability.test.ts`
- Create: `tests/security/invitation-access-log.test.ts`
- Create: `tests/security/invitation-response-headers.test.ts`
- Create: `tests/security/invitation-guard-source-contract.test.ts`
- Create: `tests/wiki/signup-gate-docs.test.ts`
- Modify: `lib/observability/sentry-scrub-event.ts`
- Modify: `tests/observability/sentry-scrub-event.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: first-script, request URL/body, Sentry, browser history, OAuth callback, Caddy access-log, DB/audit/journal, and response-header oracles.

- [ ] **Step 1: Write failing privacy/browser/docs tests**

The browser test navigates with a synthetic raw token and asserts:

- first executable app script is the nonce scrub
- after first script: pathname `/invitations`, empty hash, no token in history state
- back/forward never restores token
- every observed request URL lacks token
- intercepted Sentry envelopes/transactions/breadcrumbs lack token
- OAuth callback URL exactly `/invitations`
- exchange request body is the only network payload containing token
- server response, Set-Cookie, DB, audit, journal lack token
- cookie differs from invitation token and DB contains only its hash
- acceptance remains GET-read-only/POST-explicit
- all route statuses have private,no-store
- every exchange/accept and browser manager create/renew/revoke route consumes the exact Leaf 8 branded guard before Leaf 7 lookup or mutation; no route calls the low-level limiter or maintains a second body/provenance implementation, and scheduled expiry is reachable only through the fixed internal job authority

Access-log test sends `/invitations#token=<synthetic>` through the local Caddy test harness and asserts its structured request URI is `/invitations`; a quiet token grep of captured logs returns zero.

Docs test asserts modes, capability gate, activeKey, revision, attempt cookie/hash, guarded linking, journal, rollback, and raw-token-zero contracts.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/invitation-observability.test.ts tests/security/invitation-access-log.test.ts tests/security/invitation-response-headers.test.ts tests/security/invitation-guard-source-contract.test.ts tests/wiki/signup-gate-docs.test.ts`

Expected: FAIL until scrubber/docs/contracts are complete.

- [ ] **Step 3: Harden Sentry scrubbing**

Remove fragments, query, cookies, authorization, request bodies, form data, and invitation bootstrap fields from events/spans/breadcrumbs. Tests use sentinel values and assert absent without printing production data.

- [ ] **Step 4: Run production-like browser and full verification**

```bash
pnpm run build
pnpm exec playwright test --config=playwright.auth-runtime.config.ts tests/e2e/invitations.spec.ts
pnpm exec vitest run tests/security/invitation-observability.test.ts tests/security/invitation-access-log.test.ts tests/security/invitation-response-headers.test.ts tests/security/invitation-guard-source-contract.test.ts tests/observability/sentry-scrub-event.test.ts tests/wiki/signup-gate-docs.test.ts
if rg -q 'invitations/\\[token\\]|/invitations/\\$\\{.*token|tokenHash.*cookie' app components lib/invitations; then exit 1; fi
if rg -q 'request\\.json\\(\\)' 'app/api/invitation-attempts' 'app/api/auth/google-link-intents' 'app/api/workspaces/[workspaceSlug]/invitations'; then exit 1; fi
```

Expected: build/browser/tests PASS and forbidden-design scan exits `0`.

- [ ] **Step 5: Complete durable wiki evidence and commit through every gate**

Write all durable contracts and update index/log. Run:

```bash
git add tests/e2e/invitations.spec.ts playwright.auth-runtime.config.ts tests/security/invitation-observability.test.ts tests/security/invitation-access-log.test.ts tests/security/invitation-response-headers.test.ts tests/security/invitation-guard-source-contract.test.ts tests/wiki/signup-gate-docs.test.ts lib/observability/sentry-scrub-event.ts tests/observability/sentry-scrub-event.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/Document\ Knowledge\ Model.md wiki/Local\ Development\ Workflow.md wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "test(auth): prove invitation privacy boundaries"
```

Expected: E2E/privacy evidence, observability scrubber, wiki contracts, and every gate PASS.

### Task 9: Roll out only after Issue 8 and complete PR review

**Files:**
- Create: `tests/security/signup-gate-rollout-contract.test.ts`
- Create: `deploy/security/capabilities/invite-signup-gate.json`
- Create: `tests/security/invite-signup-capability.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: deployed Issue 8 capability SHA, exact image digest, Leaf 2 journal health, and Tasks 1–8.
- Produces: canonical `invite-signup-gate` v1 protected-artifact fragment, activation/rollback evidence, and downstream handoff.

- [ ] **Step 1: Write failing rollout contract**

The test requires:

- signup schema/app deploys only after Issue 8 AuthSessionRegistry migration/capability and remains effective closed
- readiness activation only after Issue 8 shared limiter/session controls pass
- preflight exact capability SHA plus deployment identity; TTL/expiry fields are forbidden
- the Leaf 7 candidate starts closed/off-traffic, republishes Issue 8 for its own exact image only through the Leaf 13A dispatcher and installed `auth-abuse-v1` fixed root unit, force-recreates Web to acquire the new bind-mounted inode, then promotes traffic
- every later deployment retaining `issue-08-auth-abuse` performs the same exact-candidate republish; an old capability cannot authorize a new image
- rollback sets readiness false and signup closed
- consumed/revoked/expired invitations and journal events never reverse
- raw token never enters URL/log
- the only committed Leaf 7 fragment is `deploy/security/capabilities/invite-signup-gate.json`, with stable id/version and exact protected source/test artifacts; generated envelopes are untracked

The exact initial fragment is:

```json
{"format":"munjib-security-capability-v1","id":"invite-signup-gate","version":1,"leaf":7,"requires":["auth-runtime-fail-closed@1","security-journal-auth-tombstones@1","issue-08-auth-abuse@1","immutable-private-runtime@1"],"evidenceTests":["tests/auth/google-link-grant.test.ts","tests/auth/guarded-google-adapter.test.ts","tests/auth/nextauth-candidate-context.test.ts","tests/auth/google-link-race.test.ts","tests/auth/google-link-token-media-zero.test.ts","tests/auth/invite-readiness.test.ts","tests/invitations/management-race.test.ts","tests/invitations/acceptance-race.test.ts","tests/security/invitation-guard-source-contract.test.ts","tests/security/leaf12-edge-middleware-extension-contract.test.ts","tests/security/signup-gate-rollout-contract.test.ts","tests/security/invite-signup-capability.test.ts"]}
```

Its protected-artifact list claims the reserved `lib/auth/downstream/leaf7.ts` baseline,
root `middleware.ts` as permanent Leaf 7 `ACTIVE` owner, Leaf 7
invitation/link/provisioning modules, schema/migration, routes, and tests. It also creates
the program's sole ninth tuple for
`lib/security/downstream/leaf12-edge-middleware.ts`: creator
`invite-signup-gate`, reserved owner `edge-minimal-csp-nonce`, version `0`, state
`RESERVED`, with the exact pass-through hash. The capability test requires the exact
reserved owner/hash transition from version 0 to `invite-signup-gate@1`, rejects every
Leaf 1 core config/password/adapter/session-image path or Leaf 8 guard implementation
path, and proves Leaf 12 can later change only the seam without claiming or modifying
root middleware.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm exec vitest run tests/security/signup-gate-rollout-contract.test.ts tests/security/invite-signup-capability.test.ts`

Expected: FAIL because exact Issue 8 capability activation, effective-closed rollback, irreversible invitation state, and raw-token-zero rollout contracts are not yet present in the public-safe wiki.

- [ ] **Step 3: Write exact activation, rollback, and handoff knowledge**

Update only the public-safe CI/CD wiki and rollout fixture with the required capability
SHA/deployment-identity check, no-TTL schema, closed/off-traffic candidate deployment,
Leaf 13A signed-envelope dispatcher activation of the installed `auth-abuse-v1` root
unit plus Web recreation proof, rollback denial state, and
raw-token-zero evidence. The restricted design is local-only and must not be read,
changed, or staged on this branch. Add index navigation and append a dated wiki/log.md
entry citing the rollout-contract test, canonical Leaf 7 fragment, and signed Issue 8
capability interface. No deploy-user sudoers or direct helper/systemd command exists.

- [ ] **Step 4: Run complete GREEN verification and quiet scans**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec prisma validate
pnpm audit --prod
if rg -q '(invitations/\\[token\\]|BEGIN PRIVATE KEY|MUNJIB_.*SECRET=.)' docs/superpowers/plans/2026-07-11-security-signup-gate.md wiki; then exit 1; fi
```

Expected: all verification PASS and quiet scan exits `0`.

- [ ] **Step 5: Commit rollout knowledge through every staged wiki gate**

Run:

```bash
git add tests/security/signup-gate-rollout-contract.test.ts tests/security/invite-signup-capability.test.ts deploy/security/capabilities/invite-signup-gate.json deploy/security/protected-artifact-owners.json wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "docs(auth): hand off secure signup gate"
```

Expected: rollout contract, design/wiki handoff, and every gate PASS.

- [ ] **Step 6: Push, create PR, and poll reviews plus CI for at least five minutes**

Run:

```bash
branch=$(git branch --show-current)
git push -u origin "$branch"
gh pr create --draft --title "security: add capability-gated invitation signup" --body "Implements the reviewed signup gate with effective-closed readiness, bounded invitations, guarded Google linking, fragment scrubbing, opaque attempts, atomic acceptance, and privacy evidence."
gh pr ready
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=$(printf '%s' "$repo" | cut -d/ -f1)
name=$(printf '%s' "$repo" | cut -d/ -f2-)
number=$(gh pr view --json number --jq .number)
for attempt in 1 2 3 4 5 6; do
  gh pr checks
  gh pr view --json reviewDecision,reviews,statusCheckRollup
  gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{author{login}path line body}}}}}}}' --jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved == false))'
  sleep 50
done
```

Expected: at least five minutes elapse, required checks pass, and the final unresolved-thread result is `[]`. Fix feedback on the same branch, rerun affected tests and the exact wiki gates, commit/push, and repeat.

- [ ] **Step 7: Deploy closed, then activate**

1. verify Leaf 1/2/13, Google token-bearing Account revocation gate, and exact digest;
2. verify the deployed Issue 8 shared PostgreSQL limiter/session registry, generic invitation guards, sole-decoder contract, and attested `auth-abuse-v1` host bundle/root unit;
3. apply the Leaf 7 schema only after AuthSessionRegistry exists and start its exact candidate off-traffic with readiness false; the old Issue 8 capability must mismatch and effective mode must remain closed;
4. verify closed-mode existing logins, minimal Account/token-profile-image zero persistence, and the no-auto-link collision oracle;
5. submit only the bounded signed Leaf 13A release envelope selecting fixed `PUBLISH_AUTH_ABUSE_CAPABILITY_V1`; the dispatcher verifies `auth-abuse-v1` and internally runs the fixed root unit, which derives candidate identity, emits the no-TTL exact-deployment generation, atomically switches its one regular pointer, and force-recreates candidate Web;
6. verify the mounted capability SHA/deployment identity, distributed races, Origin/body/session/invitation guards, live health, and requested/effective invite before atomically promoting traffic;
7. run synthetic create→fragment scrub→guarded attempt exchange→Google assurance→guarded accept canary;
8. run password-user collision canaries for no-session denial and explicit same-session password-step-up linking;
9. verify one membership, minimal Account plus proof only, `User.image=null` for the new identity, attempt/invitation consumption, journal event, and quiet Caddy/Sentry token/profile-media scans;
10. record that every later exact-image deployment republishes the Issue 8 capability before traffic promotion.

Publisher or candidate-readiness failure leaves the previous live slot untouched and the candidate closed/off-traffic. Rollback sets readiness false and signup mode closed, keeps current secure image/schema/journal, and never restores consumed tokens, invalidated attempts, linked conflicts, profile media, disabled identities, or removed memberships.
