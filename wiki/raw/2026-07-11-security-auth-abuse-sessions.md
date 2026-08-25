# Distributed Authentication Abuse and Revocable Sessions Implementation Plan

**Tracking:** Issue #162 · remote branch `issue-162-security-auth-abuse-sessions`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make every authentication entry point fail closed under abuse or guard-store failure, and replace bearer-only JWT lifetime with database-authoritative, individually revocable sessions whose access reductions are journaled in the same transaction.

**Architecture:** Leaf 13's loopback-only Web binding is the primary network boundary. Host-managed Caddy is the sole trusted source of normalized client network identity and injects its proof through a systemd credential bridge that never uses `caddy run --environ`; Caddy is not a Compose service. Web and limiter secrets are strict file-backed values. The application converts trusted identity and normalized account identifiers into one or two versioned domain-separated HMAC keys, then consumes every active PostgreSQL bucket atomically using database time; there is no process-local admission or permissive fallback. Leaf 8 exports route-independent bounded-body, provenance, OAuth, and invitation guard primitives but owns no invitation row, route, grant, or attempt. Successful authentication creates a 256-bit session identifier whose raw value exists only inside the encrypted JWT; PostgreSQL stores only its hash and checks that registry row, the user's BigInt session version, disabled state, and expiry on every JWT resolution. Individual sign-out revokes one registry row, while access-reducing user, membership, support, and OAuth mutations bump the user's version and append the Leaf 2 security journal in the same transaction.

**Tech Stack:** Next.js 15 App Router, NextAuth v4 encrypted JWT sessions, Prisma 6/PostgreSQL, TypeScript, Node crypto/scrypt, Caddy, Vitest, Playwright, Docker Compose, GitHub Actions

## Global Constraints

- This is Issue 8. It begins only after deployed Leaf 1 authentication-runtime, Leaf 2 trial-isolation, and Leaf 13 private-binding/database-role capabilities, and it publishes the signed capability consumed by the later invitation signup gate. Leaf 8 owns only route-independent guard primitives and must not import Leaf 7 invitation schemas, routes, models, attempts, or Google link grants.
- Leaf 8 modifies Leaf 1's pre-reserved `lib/auth/downstream/leaf8.ts` slot and owns the canonical `app/api/auth/[...nextauth]/route.ts` outer request wrapper, its `lib/auth/abuse/**` and session-registry helpers, exact schema/migration, and attested host bundle. All are protected by `issue-08-auth-abuse`. It must not edit or claim Leaf 1-owned `lib/auth/config.ts`, candidate-context implementation, password verifier, adapter, downstream contract, or session-image sanitizer; the frozen hook/postcondition tests remain Leaf 1 authority.
- Authentication rate-limit authority is PostgreSQL. Process memory, an LRU cache, Redis-like optional state, or a per-worker fallback must never decide whether an authentication request is allowed.
- If PostgreSQL rate-limit state cannot be read or updated, every password, OAuth, development-login, invitation exchange, invitation acceptance, and authentication-adjacent mutation fails closed with HTTP 503 and stable code AUTH_GUARD_UNAVAILABLE, and emits a privacy-safe operational alert.
- Limit calculations use PostgreSQL CURRENT_TIMESTAMP. Application clocks do not refill buckets, expire blocks, validate support grants, or decide registry expiry.
- Only a request carrying the exact secret header injected by Caddy may supply X-Munjib-Client-IP. Direct requests, missing headers, malformed addresses, or spoofed forwarding headers fail closed on authentication routes.
- Staging/production require `MUNJIB_RATE_LIMIT_HMAC_SECRET_FILE` and `MUNJIB_TRUSTED_PROXY_HEADER_SECRET_FILE`; normal limiter-key rotation additionally uses only the fixed `MUNJIB_RATE_LIMIT_HMAC_PREVIOUS_SECRET_FILE` plus a root-generated non-secret keyring descriptor. Direct secret values are development/test fixtures only. No secret may enter Compose interpolation/config output, container env metadata, argv, `caddy --environ`, systemd/journal/access logs, preflight output, GitHub, or the image.
- Host Caddy is managed by systemd outside Compose. A checked drop-in clears the vendor `ExecStart`, removes `--environ`, loads a root-managed systemd credential, and launches a non-printing credential bridge. Caddy sends only the current proof; Web may accept one previous proof during a bounded rotation window.
- Stored limiter identifiers are domain-separated HMAC-SHA-256 values. Raw IP addresses, network prefixes, emails, provider identifiers, invitation tokens, cookies, sids, OAuth payloads, and password material never enter limiter tables, alerts, logs, traces, or wiki examples.
- Normal limiter-key rotation atomically enforces current and previous bucket identities for at least the catalog-derived maximum identity horizon after every exact-image reader has converged. Emergency compromised-key rotation first closes every auth entry point and initializes a durable database-time `EMERGENCY_LOCKED` epoch for the full horizon; a missing/early epoch fails closed and traffic reopens only after its atomic `ACTIVE` transition.
- Password authentication preserves Leaf 1's canonical scrypt v1/legacy parser, dummy work, compare-and-swap-before-session rule, and bounded local CPU/memory guard. It performs exactly one scrypt verification for every syntactically valid request, including unknown, passwordless, malformed-hash, and disabled users, and returns one public invalid-credentials shape.
- Authentication mutations are bounded before parsing. No authentication route calls request.json(), request.formData(), request.text(), or NextAuth before the bounded reader has enforced byte limits.
- Browser mutations require the exact canonical Origin and same-origin Fetch Metadata. OAuth GET callbacks are the only Origin exception, and remain valid only through NextAuth state and PKCE checks.
- The raw 256-bit sid appears only inside the encrypted JWT. PostgreSQL stores a domain-separated sidHash. Logs, session JSON, pages, APIs, alerts, tests, and operator output expose neither value.
- JWT sessionVersion is a canonical decimal string matching /^(0|[1-9]\d*)$/. PostgreSQL and Prisma keep User.sessionVersion and AuthSessionRegistry.sessionVersion as BigInt.
- Every JWT resolution queries PostgreSQL and rejects a missing, revoked, expired, disabled, legacy, malformed, or version-mismatched session. There is no positive session cache.
- The database support-grant resolver from Leaf 2 remains authorization authority. Session-version invalidation is defense in depth and never substitutes for a current WorkspaceMember and support-grant database check.
- Every access-reducing authentication, membership, support, and OAuth mutation appends a Leaf 2 SecurityJournalEvent in the same Prisma transaction as the authoritative state change.
- Every journal call uses Leaf 2's exact kind-to-subject mapping and the immutable replay target as subjectId; a parent user, document, workspace, or organization ID cannot substitute for the row/key actually revoked.
- Export `leaf8JournalReplayReducers` with exactly credential invalidation, OAuth-account revoke, one-session revoke, and all-sessions revoke. Membership/support/user-disable reducers remain Leaf 2-owned; maps are disjoint, branded-restore-only, idempotent, deny-only, and unable to append or mutate journal/checkpoint state.
- The Issue 8 capability has no TTL or age-based grace. `generatedAt` is audit metadata only; validity requires exact environment/origin/source/image/floor/policy/migration identity and current pinned trust. Any later image deployment must republish the capability before traffic promotion.
- Every task writes a concrete durable wiki/log delta, runs hook installation and staged wiki sync gates, and ends in a commit.
- Secret scans use rg -q in a stable conditional so a match changes only the exit code and never prints secret material.

---

## File Structure

- prisma/schema.prisma and the migration: distributed limiter buckets and hashed session registry.
- lib/auth/abuse/runtime.ts: strict file-backed limiter/proxy secret validation and stable guard errors.
- lib/auth/abuse/network-identity.ts: trusted Caddy contract, IP canonicalization, network prefixes, and identifier HMACs.
- lib/auth/abuse/postgres-rate-limit.ts and lib/auth/abuse/hmac-keyring.ts: atomic multi-key database-time token buckets, durable key-epoch deny state, policy horizon, and normal/emergency rotation.
- lib/auth/abuse/invitation-guard.ts: branded route-independent exchange, acceptance, and actor-mutation permits consumed later by Leaf 7.
- lib/security/bounded-request.ts and lib/auth/abuse/request-guard.ts: pre-parse size, Origin, Fetch Metadata, and no-store enforcement.
- Leaf 1-owned lib/auth/passwords.ts, lib/auth/password-credentials.ts, and lib/auth/password-work-limit.ts remain unchanged; lib/auth/abuse/password-admission.ts composes their canonical/legacy parsing, uniform dummy scrypt work, atomic upgrade, bounded resources, and public errors with distributed admission.
- lib/auth/session-registry.ts and the Leaf 1-reserved `lib/auth/downstream/leaf8.ts` slot: sid creation, encrypted JWT claims, registry checks, password/OAuth guards, and individual revocation without editing Leaf 1 protected config.
- lib/auth/access-reduction.ts and membership/support/OAuth services: version bump, registry revocation, and journaled access reduction.
- deploy/caddy, deploy/systemd, a non-printing credential bridge, Compose secret mounts, workflows, tests, runbooks, capability artifacts, and the separate attested `auth-abuse-v1` OCI host bundle consumed only by Leaf 13A's dispatcher/fixed root unit: host-edge contract, deploy enforcement, recovery, and rollout evidence.

### Task 1: Add database and runtime primitives for shared abuse control

**Files:**
- Modify: prisma/schema.prisma
- Create: prisma/migrations/20260712020000_add_auth_abuse_and_session_registry/migration.sql
- Create: lib/auth/abuse/runtime.ts
- Create: tests/auth/abuse-runtime.test.ts
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- Consumes in staging/production: MUNJIB_RATE_LIMIT_HMAC_SECRET_FILE and MUNJIB_TRUSTED_PROXY_HEADER_SECRET_FILE at fixed /run/secrets targets, plus optional fixed previous limiter/proxy files and their root-generated non-secret rotation descriptors.
- Consumes direct MUNJIB_RATE_LIMIT_HMAC_SECRET and MUNJIB_TRUSTED_PROXY_HEADER_SECRET only in explicit development/test fixtures.
- Produces: AuthGuardRuntime, assertAuthGuardRuntime(env), AuthGuardUnavailableError, AuthRateLimitBucket, AuthRateLimitKeyEpoch, AuthSessionRegistry, and AuthSessionRevocationCode.
- Reuses Leaf 1 readStrictSecretFile; current limiter and proxy secrets must be independent canonical base64url values decoding to at least 32 bytes, and an optional previous proxy secret must differ from both.
- Depends on Leaf 2 User.authDisabledAt and User.sessionVersion BigInt; the migration verifies those columns rather than creating a second authority.

- [ ] **Step 1: Write failing schema and runtime tests**

~~~ts
// tests/auth/abuse-runtime.test.ts
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertAuthGuardRuntime } from "@/lib/auth/abuse/runtime";

const generated = () => randomBytes(32).toString("base64url");
const ratePath = "/run/secrets/munjib_rate_limit_hmac_secret";
const proxyPath = "/run/secrets/munjib_trusted_proxy_header_secret";
const fileDeps = (rate = generated(), proxy = generated()) => ({
  readStrictSecretFile: ({ path }: { path: string }) => {
    if (path === ratePath) return rate;
    if (path === proxyPath) return proxy;
    throw new Error("SECRET_FILE_UNAVAILABLE");
  },
});

describe("auth guard runtime", () => {
  it("accepts independent generated guard secret files", () => {
    expect(
      assertAuthGuardRuntime({
        MUNJIB_DEPLOYMENT_ENV: "production",
        MUNJIB_RATE_LIMIT_HMAC_SECRET_FILE: ratePath,
        MUNJIB_TRUSTED_PROXY_HEADER_SECRET_FILE: proxyPath,
      }, fileDeps()),
    ).toMatchObject({ ready: true });
  });

  it("rejects direct production values and reused file values", () => {
    expect(() =>
      assertAuthGuardRuntime({
        MUNJIB_DEPLOYMENT_ENV: "production",
        MUNJIB_RATE_LIMIT_HMAC_SECRET: generated(),
        MUNJIB_RATE_LIMIT_HMAC_SECRET_FILE: ratePath,
        MUNJIB_TRUSTED_PROXY_HEADER_SECRET_FILE: proxyPath,
      }, fileDeps()),
    ).toThrow(/AUTH_GUARD_SECRET_ENV_FORBIDDEN/);
    const reused = generated();
    expect(() =>
      assertAuthGuardRuntime({
        MUNJIB_DEPLOYMENT_ENV: "production",
        MUNJIB_RATE_LIMIT_HMAC_SECRET_FILE: ratePath,
        MUNJIB_TRUSTED_PROXY_HEADER_SECRET_FILE: proxyPath,
      }, fileDeps(reused, reused)),
    ).toThrow(/AUTH_GUARD_RUNTIME_INVALID/);
  });
});
~~~

Add a schema contract test that requires all three models, every BigInt version field,
the unique sidHash, the durable limiter-key epoch state, and the listed indexes.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/auth/abuse-runtime.test.ts tests/prisma/auth-abuse-schema-contract.test.ts

Expected: FAIL because file-only guard runtime, limiter bucket/key-epoch models, registry model, and migration do not exist.

- [ ] **Step 3: Add the exact Prisma contract**

~~~prisma
enum AuthSessionRevocationCode {
  SIGN_OUT
  CURRENT_SESSION
  USER_WIDE
  PASSWORD_CHANGED
  PRIVILEGE_REMOVED
  AUTH_DISABLED
  INCIDENT_RESPONSE
  RESTORE_INVALIDATED
}

model AuthRateLimitBucket {
  keyHash              String   @id
  scope                String
  tokensMilli          BigInt
  capacityMilli        BigInt
  refillPerSecondMilli BigInt
  updatedAt            DateTime @default(now())
  blockedUntil         DateTime?
  expiresAt            DateTime

  @@index([expiresAt])
  @@index([scope, updatedAt])
}

enum AuthRateLimitKeyEpochState {
  ACTIVE
  EMERGENCY_LOCKED
  RETIRED
}

model AuthRateLimitKeyEpoch {
  version      String                     @id
  state        AuthRateLimitKeyEpochState
  admitAfter   DateTime?
  createdAt    DateTime                   @default(now())
  activatedAt  DateTime?
  retiredAt    DateTime?

  @@index([state, admitAfter])
}

model AuthSessionRegistry {
  id               String                    @id @default(cuid())
  sidHash          String                    @unique
  userId           String
  sessionVersion   BigInt
  expiresAt        DateTime
  revokedAt        DateTime?
  revocationCode   AuthSessionRevocationCode?
  createdAt        DateTime                  @default(now())
  user             User                      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt, expiresAt])
  @@index([expiresAt])
}
~~~

Add User.authSessions AuthSessionRegistry[] and use a migration precondition that aborts unless User.authDisabledAt and User.sessionVersion already exist with sessionVersion backed by bigint. The migration must not coerce a text or integer version silently. `AuthRateLimitKeyEpoch.version` is a non-secret descriptor version, never a digest or key value; absence, an unknown state, or a missing `admitAfter` for `EMERGENCY_LOCKED` fails admission closed.

- [ ] **Step 4: Implement strict independent file-backed secret validation**

Use Leaf 1 readStrictSecretFile with exact fixed paths, effective Web UID, mode 0400, and maximum 128 bytes. Reject direct secret env values in staging/production, equality between decoded current secrets, equality between current/previous proxy values, and a previous file without an explicit bounded rotation flag/deadline. Development/test may inject direct generated values only when deployment mode is development. Expose only stable codes and never include a path, value, digest, length, owner, or mode in an Error message.

~~~ts
export class AuthGuardUnavailableError extends Error {
  readonly code = "AUTH_GUARD_UNAVAILABLE";
  constructor(readonly causeCode: "RATE_STORE" | "TRUSTED_PROXY" | "SESSION_STORE") {
    super("AUTH_GUARD_UNAVAILABLE");
  }
}
~~~

- [ ] **Step 5: Migrate and confirm GREEN**

Run:

    pnpm exec prisma validate
    pnpm exec prisma generate
    pnpm exec vitest run tests/auth/abuse-runtime.test.ts tests/prisma/auth-abuse-schema-contract.test.ts

Expected: Prisma validation succeeds and both test files pass.

- [ ] **Step 6: Record the durable wiki delta**

In wiki/Auth And Permissions Workflow.md add an Issue 8 database-authority section naming AuthRateLimitBucket, AuthRateLimitKeyEpoch, AuthSessionRegistry, the two independent strict secret files, development-only fixture exception, BigInt sessionVersion, and the prohibition on local limiter fallback. Append a wiki/log.md entry citing the migration, runtime test, and Issue 8 plan.

- [ ] **Step 7: Stage, run every wiki gate, and commit**

This same candidate transitions only the Leaf 1-reserved
`lib/auth/downstream/leaf8.ts` entry from version 0 to ACTIVE version 1 under owner
`issue-08-auth-abuse`, and creates ACTIVE owner-map entries for Leaf 8-only abuse,
session-registry, capability publisher, and attested bundle paths. The exact owner map
is a required staged input; Leaf 1 core paths, shared aggregate routes, and the
protected outer NextAuth route owned by this leaf are tested according to their named
owner without duplicate ownership.

Run:

    git add prisma/schema.prisma prisma/migrations/20260712020000_add_auth_abuse_and_session_registry/migration.sql lib/auth/abuse/runtime.ts tests/auth/abuse-runtime.test.ts tests/prisma/auth-abuse-schema-contract.test.ts "wiki/Auth And Permissions Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): add shared abuse and session primitives"

Expected: every command succeeds and the commit includes source, migration, tests, and the concrete wiki/log delta.

### Task 2: Establish the trusted Caddy client-network contract

**Files:**
- Create: lib/auth/abuse/network-identity.ts
- Create: deploy/caddy/Caddyfile
- Create: deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf
- Create: internal/caddyauthcredential/credential.go
- Create: internal/caddyauthcredential/credential_test.go
- Create: cmd/munjib-caddy-credential-bridge/main.go
- Create: scripts/security/build-caddy-credential-bridge.ts
- Create: scripts/security/caddy-auth-preflight.ts
- Create: tests/auth/network-identity.test.ts
- Create: tests/security/caddy-credential-bridge.test.ts
- Create: tests/deploy/caddy-systemd-contract.test.ts
- Create: tests/deploy/caddy-secret-log.test.ts
- Modify: docker-compose.yml
- Create: docker-compose.proxy-secret-rotation.yml
- Modify: .env.example
- Modify: .github/workflows/ci-cd.yml
- Modify: tests/deploy/compose-auth-contract.test.ts
- Modify: wiki/CI CD And Monitoring Workflow.md
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- Host systemd loads a root-owned source credential into CREDENTIALS_DIRECTORY; the attested static caddy-credential-bridge validates the systemd materialized credential with observed systemd semantics, sets one child-only expansion variable, and launches caddy run without --environ.
- Caddy deletes every inbound X-Munjib-Client-IP and X-Munjib-Proxy-Authorization value, then injects the canonical remote address and current proof. Caddy is absent from Compose.
- trustedClientNetwork(request, runtime) returns a canonical IPv4 /24 or IPv6 /56 prefix only after constant-time comparison against the current and optional previous Web secret files.
- authIdentifierHmacKeys(domain, normalizedIdentifier, runtime) returns one or two lexicographically sorted `{version,keyHash}` records; each keyHash is lowercase 64-character HMAC-SHA-256, versions come only from the verified root descriptor, and domains cannot be caller-controlled strings.

- [ ] **Step 1: Write failing network contract tests**

Cover IPv4, IPv4-mapped IPv6, compressed IPv6, /24 and /56 boundaries, ports, malformed values, duplicate headers, missing proxy authorization, wrong/current/previous secret, direct app requests, spoofed X-Forwarded-For, and Unicode account normalization. Compare both configured proof slots on every request and combine results without secret-dependent early return. Assert that returned and persisted test values never contain a raw address or email.

The systemd/credential tests require:

- tracked drop-in clears vendor ExecStart and effective `systemctl show caddy -p ExecStart --value` contains neither `--environ` nor a secret/path value;
- `LoadCredential=munjib_proxy_header_current:/etc/munjib/secrets/caddy-trusted-proxy-current` is present;
- a real disposable systemd oneshot loads the credential and proves the mounted file is read-only, regular, `nlink==1`, owned by either root or the service effective UID as observed on the target, and mode exactly `0400` or `0600` with no group/other visibility; other owner/mode values fail;
- bridge uses `CREDENTIALS_DIRECTORY`, O_NOFOLLOW/CLOEXEC, same-FD fstat/read, that observed owner/mode allowlist, bounded canonical secret, child-only env, fixed caddy binary/args, signal forwarding, and no stdout/stderr of secret metadata;
- drop-in disables core dumps, uses UMask 0077, NoNewPrivileges, ProtectSystem strict, ProtectHome, PrivateTmp, and a fixed working/config path;
- a synthetic sentinel restart leaves the effective unit healthy while the test captures its start timestamp and applies a quiet `journalctl -u caddy --since "$captured_start" --output=cat | rg -q` check that finds no sentinel;
- Caddy config/adapt diagnostics and structured access logs delete X-Munjib-Proxy-Authorization and X-Munjib-Client-IP;
- production Compose contains no Caddy service, mounts only Web secret files, contains no secret interpolation/value env, and binds Web only to 127.0.0.1.

The credential integration is not a mocked filesystem test: the protected Ubuntu
24.04 systemd runner installs a disposable unit through the Leaf 13A harness, captures
only owner class/mode/read-only/nlink pass-fail, and destroys it. Missing systemd,
different materialization semantics outside the exact allowlist, or inability to run
the oneshot blocks the host-bundle release rather than silently falling back to the
static source test.

~~~ts
it("ignores forwarding headers and trusts only the authenticated Caddy value", () => {
  const request = requestWithHeaders({
    "x-forwarded-for": "203.0.113.9",
    "x-munjib-client-ip": "2001:db8:abcd:1200::7",
    "x-munjib-proxy-authorization": proxyAuthorization(),
  });
  expect(trustedClientNetwork(request, runtime())).toBe("2001:db8:abcd:1200::/56");
});
~~~

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/auth/network-identity.test.ts tests/security/caddy-credential-bridge.test.ts tests/deploy/caddy-systemd-contract.test.ts tests/deploy/caddy-secret-log.test.ts tests/deploy/compose-auth-contract.test.ts

Expected: FAIL because the trusted-header parser, host systemd bridge/drop-in, log sentinel oracle, and Web secret mounts do not exist.

- [ ] **Step 3: Implement canonical network identity and domain-separated HMACs**

Use node:net validation plus a tested canonical IPv6 library already pinned in package.json; if none exists, add ipaddr.js with an exact lockfile update. Normalize IPv4-mapped IPv6 to IPv4 before prefixing. Reject zone identifiers, comma-separated lists, control bytes, ambiguous ports, and all non-IP input.

Define closed domains:

~~~ts
export type AuthLimitIdentifierDomain =
  | "password-network"
  | "password-account"
  | "oauth-network"
  | "oauth-account"
  | "invitation-network"
  | "invitation-attempt"
  | "auth-mutation-actor"
  | "csp-report-network"
  | "csp-report-fingerprint"
  | "session-id";
~~~

Construct limiter HMAC input as UTF-8 bytes of `munjib-auth-limit-v1`, a zero byte, the verified key version, a zero byte, the domain, a zero byte, and the normalized identifier. Compute both configured limiter epochs and sort their records before database use. For proxy proof, always normalize two 32-byte comparison slots: current plus previous when a bounded rotation overlay is active, otherwise current plus a random nonmatching dummy created at startup. Run timingSafeEqual for both slots and combine numeric results; never return after the first match or reveal which slot matched. Reject unequal decoded lengths, duplicate versions, equal secret bytes, or a previous slot without the fixed verified rotation descriptor at startup.

These exact domains and the existing `trustedClientNetwork()`,
`authIdentifierHmacKeys()`, and `consumeAuthRateLimitKeys()` APIs are frozen in the
first Issue 8 capability. Later leaves, including Leaf 12 CSP-report ingress, must
compose them without adding a single-key shortcut, caller-defined domain/policy, raw
network-key helper, or second limiter implementation. Network and sanitized-report
fingerprint consumers receive the same one-or-two sorted epoch records and atomically
admit only when every active epoch admits; raw report bytes, URLs, samples, addresses,
or caller-controlled labels never enter an identifier.

- [ ] **Step 4: Configure the edge as sole header writer**

`deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf` is installed root-owned/0644 and contains:

~~~ini
[Service]
LoadCredential=munjib_proxy_header_current:/etc/munjib/secrets/caddy-trusted-proxy-current
Environment=MUNJIB_CADDY_PROXY_CREDENTIAL_NAME=munjib_proxy_header_current
ExecStart=
ExecStart=/usr/local/libexec/munjib-caddy-credential-bridge
LimitCORE=0
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
~~~

The pinned reproducible build produces a static, stripped bridge with no dynamic
runtime/interpreter dependency; its digest is a required `auth-abuse-v1` member.
Leaf 8 owns `internal/caddyauthcredential`, the one protected implementation of the
no-follow/same-FD owner/mode/nlink/size/canonical credential checks. The bridge imports
that package and reads only
`$CREDENTIALS_DIRECTORY/$MUNJIB_CADDY_PROXY_CREDENTIAL_NAME`, validates the
systemd-owned credential without printing, sets child-only
`MUNJIB_CADDY_PROXY_HEADER_SECRET`, deletes unrelated secret-like env keys from the
child environment, and launches exactly:

    /usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile

It forwards TERM/INT/HUP, returns the Caddy exit status, and never uses `--environ`, a shell, command substitution, argv secret, or an environment-file containing the value. Leaf 12 may import the protected validation package into a separately owned static validate-only binary but cannot modify or republish the package, this bridge, or this drop-in; owner-map tests enforce that seam. The tracked Caddyfile disables/loopback-binds the admin API, deletes inbound dedicated headers, then sets X-Munjib-Client-IP from the canonical remote host and X-Munjib-Proxy-Authorization from the child-only expansion. Its filter encoder deletes both headers from access/error logs.

Production installation/activation is deferred to Task 9's attested bundle. Only the
fixed `ACTIVATE_AUTH_EDGE_V1` dispatcher operation may install the Caddy assets,
generate/install the initial independent proxy-proof and limiter-HMAC files at fixed
destinations, validate the adapted config/unit/secret mounts, daemon-reload, or restart.
Task 2's source branch never runs a privileged checkout helper on the host.

Production Compose has no Caddy service. It preserves Leaf 1 NEXTAUTH/Google secret mounts, Leaf 13's `127.0.0.1` Web publication, and adds:

- `/etc/munjib/secrets/web-rate-limit-hmac-current` → `/run/secrets/munjib_rate_limit_hmac_secret`;
- `/etc/munjib/secrets/web-trusted-proxy-current` → `/run/secrets/munjib_trusted_proxy_header_secret`.

The Web environment contains only those literal `*_FILE` paths. Secret values and `${...SECRET...}` interpolation are forbidden. Host source files are atomically installed with the pinned Web UID and mode 0400; the Caddy copy is independently root-owned/0400. `caddy-auth-preflight.ts` verifies file invariants, effective ExecStart, loaded credential name, loopback upstream, header stripping/injection, and redaction, returning stable pass/fail codes only.

`docker-compose.proxy-secret-rotation.yml` is the only previous-secret overlay. The
order below is implemented only by the attested `ROTATE_AUTH_PROXY_PROOF_V1` dispatcher
operation/fixed root unit; the workflow or deploy user cannot install a file,
daemon-reload, or restart Caddy/Web directly. Rotation order is:

1. atomically install the new Web current file and retain the old Web file as previous;
2. start Web with current+previous mounts and a non-secret expiry no more than 15 minutes away; verify old proof still passes;
3. atomically install the matching new root-owned Caddy credential, daemon-reload/restart Caddy, and verify new proof plus sentinel-clean journal/access logs;
4. remove the previous Web mount/expiry, restart Web, verify old proof fails, then delete old files.

No step prints or compares secret bytes outside constant-time in-process checks. A rate-limit HMAC file is never swapped alone: Task 3's normal dual-key protocol or emergency closed-auth cooldown is the only accepted rotation path.

- [ ] **Step 5: Confirm GREEN and no raw identity leakage**

Run:

    pnpm exec vitest run tests/auth/network-identity.test.ts tests/security/caddy-credential-bridge.test.ts tests/deploy/caddy-systemd-contract.test.ts tests/deploy/caddy-secret-log.test.ts tests/deploy/compose-auth-contract.test.ts
    pnpm exec tsc --noEmit

Expected: all tests pass and TypeScript succeeds.

Run the quiet leak check:

    if rg -q 'x-forwarded-for.*trusted|req\.ip.*fallback|remoteAddress.*fallback' lib app; then
      exit 1
    fi
    if rg -q -- '--environ|MUNJIB_TRUSTED_PROXY_HEADER_SECRET:' deploy docker-compose.yml; then
      exit 1
    fi

Expected: both conditionals exit 0 with no output. The systemd integration oracle also restarts a sentinel-configured disposable unit and inspects journal/access output in memory; neither success nor failure prints the sentinel.

- [ ] **Step 6: Record the durable wiki delta**

In wiki/CI CD And Monitoring Workflow.md document that Caddy is host-systemd-managed, Leaf 13 loopback remains primary, effective ExecStart omits --environ, systemd credential/Web file ownership differs, Compose contains only Web mounts, the four-step old/new rotation order, sentinel log oracle, and header redaction. In wiki/Auth And Permissions Workflow.md document /24 and /56 normalization, dual proof comparison during rotation, and file-backed domain-separated HMAC storage. Append the exact evidence files to wiki/log.md.

- [ ] **Step 7: Stage, run every wiki gate, and commit**

Run:

    git add lib/auth/abuse/network-identity.ts deploy/caddy/Caddyfile deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf internal/caddyauthcredential/credential.go internal/caddyauthcredential/credential_test.go cmd/munjib-caddy-credential-bridge/main.go scripts/security/build-caddy-credential-bridge.ts scripts/security/caddy-auth-preflight.ts tests/auth/network-identity.test.ts tests/security/caddy-credential-bridge.test.ts tests/deploy/caddy-systemd-contract.test.ts tests/deploy/caddy-secret-log.test.ts docker-compose.yml docker-compose.proxy-secret-rotation.yml .env.example .github/workflows/ci-cd.yml tests/deploy/compose-auth-contract.test.ts "wiki/CI CD And Monitoring Workflow.md" "wiki/Auth And Permissions Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): trust only authenticated edge identity"

Expected: the edge, parser, tests, and durable documentation are committed together.

### Task 3: Implement atomic PostgreSQL token buckets with fail-closed outages

**Files:**
- Create: lib/auth/abuse/policies.ts
- Create: lib/auth/abuse/hmac-keyring.ts
- Create: lib/auth/abuse/postgres-rate-limit.ts
- Create: lib/auth/abuse/guard-alert.ts
- Create: tests/auth/postgres-rate-limit.test.ts
- Create: tests/auth/postgres-rate-limit-multiprocess.test.ts
- Create: tests/auth/rate-limit-hmac-rotation.test.ts
- Create: tests/auth/postgres-rate-limit-key-order.test.ts
- Create: tests/auth/auth-guard-outage.test.ts
- Create: docker-compose.rate-limit-key-rotation.yml
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/Production Observability Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- consumeAuthRateLimitKeys(txOrPrisma, policy, sortedVersionedKeys) locks/upserts every active epoch in canonical order and returns one allowed, remainingWholeTokens, retryAfterSeconds, and evaluatedAt decision from one atomic database transaction. Admission succeeds only when every active epoch allows it.
- enforceAuthRateLimit(input) either returns the decision, throws AuthRateLimitedError, or throws AuthGuardUnavailableError with causeCode RATE_STORE.
- reportAuthGuardUnavailable(input) records route class, deployment identity, stable cause, and request correlation ID only.
- `AUTH_RATE_LIMIT_MAX_IDENTITY_HORIZON_SECONDS` is derived from the frozen catalog's largest capacity/refill/block history and is the minimum dual-read or emergency cooldown interval.

`trustedClientNetwork()`, `authIdentifierHmacKeys()`, and
`consumeAuthRateLimitKeys()` are the only public primitives for a later route to
derive and consume a network or classification bucket. Tests pin both CSP-report
domains, lexicographic dual-key order, all-epoch admission, and the absence of raw
identifier/report material from returned values, persistence, logs, and alerts.

**Exact policies:**

| Policy | Identifier | Capacity | Refill | Additional rule |
|---|---|---:|---:|---|
| PASSWORD_NETWORK | canonical /24 or /56 HMAC | 10 | 1 per 30 seconds | applies before account lookup |
| PASSWORD_ACCOUNT | normalized-email HMAC | 5 | 1 per 180 seconds | applies whether account exists |
| OAUTH_START_NETWORK | canonical network HMAC | 20 | 1 per 15 seconds | every provider start |
| OAUTH_ACCOUNT | provider plus normalized verified-email HMAC | 10 | 1 per 90 seconds | existing and candidate identities |
| INVITATION_EXCHANGE_NETWORK | canonical network HMAC | 10 | 1 per 60 seconds | before fragment-token hash lookup |
| INVITATION_ACCEPT_NETWORK | canonical network HMAC | 5 | 1 per 120 seconds | attempt cap from signup leaf also applies |
| AUTH_MUTATION_ACTOR | authenticated user-ID HMAC | 20 | 1 per 180 seconds | create, revoke, unlink, or disable |
| CSP_REPORT_NETWORK | canonical network HMAC | 60 | 1 per second | predeclared for Leaf 12 privacy-safe report ingress |
| CSP_REPORT_FINGERPRINT | sanitized classification-tuple HMAC | 1 | 1 per 600 seconds | predeclared for Leaf 12 dedupe; raw URL/body is never an identifier |

Leaf 8 owns this frozen catalog from its first capability release. The two CSP report
policies have no active route until Leaf 12, but their exact identifiers and bounds are
already present and protected so Leaf 12 consumes `lib/auth/abuse/policies.ts`
byte-for-byte without an owner bump. Tests reject any later caller-defined policy or
catalog mutation.

- [ ] **Step 1: Write failing concurrency, refill, and outage tests**

The database integration tests must assert one winner at the last token, no over-admission across at least four independent Node worker processes, database-time refill, atomic upsert, policy mismatch rejection, deterministic Retry-After rounding, expired-row cleanup, canonical multi-key lock order, and no raw identifier columns.

Rotation tests start with a nearly exhausted previous bucket, introduce an empty current
bucket, and prove that the previous bucket still denies. They cover opposite caller
key order without deadlock, atomic rollback on either store fault, restart while dual
enforcement is active, rejection of cutover before every exact-image Web replica has
converged plus the maximum database-time horizon has elapsed, and normal removal of the
previous slot. Emergency tests prove auth lockdown precedes secret replacement, no
request is admitted during the full database-time cooldown, the new key version has a
durable `EMERGENCY_LOCKED` epoch row before any reader receives it, a missing/unlocked
epoch fails closed, and reopening directly onto an uninitialized empty bucket set is
impossible even across restart or dispatcher retry.

The outage matrix must cover credentials, OAuth start/callback, calls to the generic invitation exchange/acceptance guards, development login, session creation, sign-out, and administrative auth mutations. It uses no Leaf 7 route or schema fixture. Stub the database call to fail and require status 503, Cache-Control: no-store, code AUTH_GUARD_UNAVAILABLE, and one privacy-safe alert. It must reject any response that falls through to credentials, provider redirect, lookup, or mutation code.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/auth/postgres-rate-limit.test.ts tests/auth/postgres-rate-limit-multiprocess.test.ts tests/auth/rate-limit-hmac-rotation.test.ts tests/auth/postgres-rate-limit-key-order.test.ts tests/auth/auth-guard-outage.test.ts

Expected: FAIL because shared policy consumption and outage mapping do not exist.

- [ ] **Step 3: Implement one atomic database-time token-bucket statement**

Use ordered INSERT ... ON CONFLICT ... DO UPDATE operations inside one transaction that:

1. reads CURRENT_TIMESTAMP once in a CTE;
2. clamps replenished tokens to the policy capacity;
3. subtracts exactly 1000 milli-tokens only when at least 1000 remain;
4. preserves the stricter stored capacity/refill contract or rejects a policy mismatch;
5. returns allowed, remaining milli-tokens, database evaluatedAt, and retry seconds;
6. sets expiresAt far enough past complete refill for bounded cleanup.
7. locks every referenced `AuthRateLimitKeyEpoch` row first in version order, rejects
   missing/retired/early emergency epochs, then processes all current/previous
   `{version,keyHash}` rows in lexicographic order and commits token subtraction only
   when every active row allows.

Do not make an admission read then update outside the one transaction. Do not use Date.now(), application timestamps, process locks, in-memory counters, or a catch block that returns allowed.

- [ ] **Step 4: Implement normal dual-key and emergency closed-auth rotation**

`docker-compose.rate-limit-key-rotation.yml` is the only previous-limiter-secret
overlay. A root-owned exact-schema descriptor binds distinct current/previous versions,
fixed secret mounts, rotation state, exact deployment identity, and a database-derived
convergence boundary; Web cannot accept caller paths or versions. Normal or emergency
execution occurs only inside the attested `ROTATE_AUTH_RATE_LIMIT_HMAC_V1` dispatcher
operation/fixed root unit, which generates the new key locally; no workflow step writes
the secret or invokes Compose directly.

Normal rotation installs new-current plus old-previous, creates both durable key epochs,
force-recreates every exact
image reader, proves both buckets are consumed atomically, records convergence with
database time, waits at least `AUTH_RATE_LIMIT_MAX_IDENTITY_HORIZON_SECONDS`, and only
then recreates readers without previous and removes the old file. Emergency rotation
first activates a root-controlled auth lockdown returning `503`/`no-store` at every
entry point and, in the same root-dispatched transition, inserts the new version's
`EMERGENCY_LOCKED` epoch with `admitAfter = database CURRENT_TIMESTAMP +
AUTH_RATE_LIMIT_MAX_IDENTITY_HORIZON_SECONDS`. It then installs and verifies the new key
on every reader. Every admission continues to lock and deny from that epoch row during
the full horizon, including after process/host restart. Only after database time reaches
`admitAfter`, exact-image convergence is re-proved, and the global edge lockdown still
holds may one transaction change the epoch to `ACTIVE`; traffic reopens only after that
commit. The durable epoch is the initialized deny state, not an operator wait. Missing,
early, or already-active replacement epochs fail the rotation, so a compromised key
never causes an immediate clean-bucket admission window.

- [ ] **Step 5: Map every store fault to one fail-closed response and alert**

AuthGuardUnavailableError must escape limiter internals. Route wrappers map it to:

~~~ts
return Response.json(
  { error: { code: "AUTH_GUARD_UNAVAILABLE" } },
  {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "30",
    },
  },
);
~~~

The alert event name is munjib.auth.guard_unavailable. It includes only deployment, route class, stable cause code, correlation ID, and database error class. It excludes exception messages when they could contain SQL, parameters, hosts, or account data.

- [ ] **Step 6: Confirm GREEN and prove no local fallback**

Run:

    pnpm exec vitest run tests/auth/postgres-rate-limit.test.ts tests/auth/postgres-rate-limit-multiprocess.test.ts tests/auth/rate-limit-hmac-rotation.test.ts tests/auth/postgres-rate-limit-key-order.test.ts tests/auth/auth-guard-outage.test.ts
    pnpm exec tsc --noEmit

Expected: all tests pass across independent workers and TypeScript succeeds.

Run:

    if rg -q 'new Map|lru|memory.*rate|catch.*allow|fallback.*allow|fail.?open' lib/auth/abuse app/api/auth; then
      exit 1
    fi

Expected: exit 0 with no output.

- [ ] **Step 7: Record the durable wiki delta**

In wiki/Auth And Permissions Workflow.md add the exact policy table, atomic multi-key database-time semantics, normal/emergency rotation, and the universal 503 rule. In wiki/Production Observability Workflow.md add the privacy-safe alert fields and explicit forbidden data. Append concurrency, key-order, rotation, and outage evidence to wiki/log.md.

- [ ] **Step 8: Stage, run every wiki gate, and commit**

Run:

    git add lib/auth/abuse/policies.ts lib/auth/abuse/hmac-keyring.ts lib/auth/abuse/postgres-rate-limit.ts lib/auth/abuse/guard-alert.ts docker-compose.rate-limit-key-rotation.yml tests/auth/postgres-rate-limit.test.ts tests/auth/postgres-rate-limit-multiprocess.test.ts tests/auth/rate-limit-hmac-rotation.test.ts tests/auth/postgres-rate-limit-key-order.test.ts tests/auth/auth-guard-outage.test.ts "wiki/Auth And Permissions Workflow.md" "wiki/Production Observability Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): add fail-closed postgres rate limits"

Expected: shared limiter logic, outage behavior, tests, and wiki evidence are one commit.

### Task 4: Bound authentication bodies and enforce browser mutation provenance

**Files:**
- Create: lib/security/bounded-request.ts
- Create: lib/auth/abuse/request-guard.ts
- Modify: app/api/auth/[...nextauth]/route.ts
- Modify: app/api/auth/signup/route.ts
- Create: tests/security/bounded-request.test.ts
- Create: tests/auth/request-guard.test.ts
- Create: tests/auth/nextauth-request-wrapper.test.ts
- Create: tests/security/auth-request-guard-source-contract.test.ts
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- readBoundedBody(request, maximumBytes) returns Uint8Array after checking declared and streamed size.
- readBoundedJson(request, maximumBytes, schema) decodes UTF-8 once and schema-validates without request.json().
- guardBrowserAuthMutation(request, canonicalOrigin) enforces exact Origin and Sec-Fetch-Site.
- prepareBoundedNextAuthRequest(request) enforces the limit before constructing a replacement Request for NextAuth.
- The route invokes Leaf 1 `runCandidatePersistenceRequestScope()` before the NextAuth handler; the outer `finally` closes the empty request cell after every `signIn` callback and downstream adapter continuation. Leaf 8 cannot initialize the Leaf 7 candidate brand.

**Exact limits:**

| Input | UTF-8 byte limit |
|---|---:|
| NextAuth POST body | 8192 |
| Custom authentication JSON | 2048 |
| Invitation fragment exchange body | 512 |
| callbackUrl value | 4096 |
| normalized email | 320 |
| password | 256 |

- [ ] **Step 1: Write failing byte-boundary and provenance tests**

Test Content-Length below, equal to, and above every limit; missing and contradictory Content-Length; chunked streams crossing the limit; split UTF-8 sequences; invalid UTF-8; duplicate JSON keys relevant to credentials; compressed bodies; aborted streams; callbackUrl overrun; and exactly one downstream body read.

Mutation tests cover absent, opaque, wrong-scheme, wrong-port, subdomain, userinfo, and multiple Origin values; cross-site, same-site, none, and absent Sec-Fetch-Site; and no-store on every result. OAuth callback GET is accepted without Origin only when passed to a provider configured with state and PKCE.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/security/bounded-request.test.ts tests/auth/request-guard.test.ts tests/auth/nextauth-request-wrapper.test.ts tests/security/auth-request-guard-source-contract.test.ts

Expected: FAIL because authentication handlers parse before shared bounds and provenance enforcement.

- [ ] **Step 3: Implement bounded streaming before all parsers**

Reject compressed authentication bodies. Enforce Content-Length early when present, then count actual Uint8Array chunks and cancel immediately after the limit. Decode with TextDecoder fatal mode. Parse JSON only after size and UTF-8 success, reject dangerous or duplicate security-sensitive keys with a bounded parser, and validate with the route schema. The replacement NextAuth Request carries only the bounded bytes and sanitized headers.

The route then calls `runCandidatePersistenceRequestScope(() =>
nextAuthHandler(replacementRequest))`, so the scope starts before NextAuth invokes any
callback and remains active through its later `callbackHandler` adapter calls. The
wrapper creates only Leaf 1's opaque `EMPTY` cell and closes it in an outer `finally`;
it imports no Leaf 7 module and cannot authorize candidate persistence. The request
wrapper test uses a fake NextAuth execution with an awaited `signIn` phase followed by
separate adapter continuations and proves the same cell persists, concurrent requests
receive different cells, and throw/abort paths always close them.

- [ ] **Step 4: Enforce exact browser provenance**

For POST and other state-changing browser methods require:

- Origin parsed as a single origin and exactly equal to the canonical Leaf 1 origin;
- Sec-Fetch-Site equal to same-origin;
- Sec-Fetch-Mode compatible with the route;
- no callbackUrl that resolves outside the canonical origin.

Do not accept Referer as an Origin substitute. OAuth GET callbacks are routed directly to NextAuth only after the provider state and PKCE contract from Task 6 is active.

- [ ] **Step 5: Confirm GREEN and forbid direct parsers**

Run:

    pnpm exec vitest run tests/security/bounded-request.test.ts tests/auth/request-guard.test.ts tests/auth/nextauth-request-wrapper.test.ts tests/security/auth-request-guard-source-contract.test.ts
    pnpm exec tsc --noEmit

Expected: all tests pass and TypeScript succeeds.

Run:

    if rg -q 'request\.(json|formData|text)\(' app/api/auth; then
      exit 1
    fi

Expected: exit 0 with no output.

- [ ] **Step 6: Record the durable wiki delta**

In wiki/Auth And Permissions Workflow.md add the exact byte-limit table, streamed pre-parse behavior, exact Origin and Fetch Metadata contract, OAuth callback exception, and stable 413/400/403/503 response codes. Append the focused test evidence to wiki/log.md.

- [ ] **Step 7: Stage, run every wiki gate, and commit**

Run:

    git add lib/security/bounded-request.ts lib/auth/abuse/request-guard.ts 'app/api/auth/[...nextauth]/route.ts' app/api/auth/signup/route.ts tests/security/bounded-request.test.ts tests/auth/request-guard.test.ts tests/auth/nextauth-request-wrapper.test.ts tests/security/auth-request-guard-source-contract.test.ts "wiki/Auth And Permissions Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): bound and authenticate auth requests"

Expected: every parser and provenance change is committed with tests and durable documentation.

### Task 5: Equalize password authentication work and public outcomes

**Files:**
- Create: lib/auth/abuse/password-admission.ts
- Modify: lib/auth/downstream/leaf8.ts
- Create: tests/auth/password-enumeration.test.ts
- Create: tests/auth/password-abuse-integration.test.ts
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/Production Observability Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- Leaf 1 `verifyPasswordHash`/`authorizePasswordCredential` perform exactly one fixed-parameter scrypt verification for every syntactically valid candidate and preserve canonical v1 plus exact legacy parsing.
- credentialLogin(input) consumes PASSWORD_NETWORK before lookup, consumes PASSWORD_ACCOUNT whether or not a user exists, then returns the user or the one public invalid-credentials error.
- Leaf 1's process-random dummy scrypt envelope and bounded local work permit remain timing/resource controls only. They never store an admission decision, count a request, bypass PostgreSQL, or survive restart as authority.

- [ ] **Step 1: Write failing enumeration and limiter-order tests**

Instrument scrypt calls and require exactly one for valid-shape requests against an existing password user, unknown email, passwordless account, disabled account, and malformed stored hash. Require the same public status/body/header shape for every rejected account state. Measure distributions over repeated samples with a deliberately wide non-flaky ceiling and fail obvious early-return gaps.

Assert PASSWORD_NETWORK and PASSWORD_ACCOUNT are both consumed before any User query, with the account key computed after syntax validation and normalization for existing and nonexistent accounts. A limiter-store error returns AUTH_GUARD_UNAVAILABLE without a User query or scrypt call.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/auth/password-enumeration.test.ts tests/auth/password-abuse-integration.test.ts

Expected: FAIL because unknown, disabled, and passwordless paths do different work and shared limiter ordering is absent.

- [ ] **Step 3: Implement process-random dummy scrypt material**

`password-admission.ts` wraps, but never modifies, Leaf 1's process-random canonical v1
dummy envelope/verifier. For each syntactically valid request, select either the real
validated envelope or the dummy without revealing account state, then call the same
fixed verifier exactly once under the local work permit. A corrupt real hash selects
the dummy and emits a privacy-safe integrity alert after the public decision. A
verified legacy envelope must win its exact compare-and-swap rewrite before session
issuance; a zero-row race or database failure denies the attempt. The assigned Leaf 8
slot invokes this wrapper before returning to Leaf 1's frozen config pipeline.

Malformed email, oversize email, invalid UTF-8, oversize password, and structurally invalid request bodies may reject before scrypt because they are not syntactically valid credential attempts; they still consume the network policy when a trusted network can be established.

- [ ] **Step 4: Use one public invalid-credentials contract**

Unknown, wrong-password, passwordless, disabled, revoked, and corrupt-hash cases return the same NextAuth credentials failure and Cache-Control: no-store. Do not expose whether Google is linked or whether an account exists. Keep detailed stable cause codes only in redacted internal metrics with HMAC account keys.

- [ ] **Step 5: Confirm GREEN and inspect early-return patterns**

Run:

    pnpm exec vitest run tests/auth/password-enumeration.test.ts tests/auth/password-abuse-integration.test.ts
    pnpm exec tsc --noEmit

Expected: all tests pass and TypeScript succeeds.

Run:

    if rg -q 'userNotFound|passwordless.*return|authDisabledAt.*return' lib/auth/abuse/password-admission.ts lib/auth/downstream/leaf8.ts; then
      exit 1
    fi

Expected: exit 0 with no output.

- [ ] **Step 6: Record the durable wiki delta**

In wiki/Auth And Permissions Workflow.md document exactly-one-scrypt behavior, which malformed inputs may reject earlier, limiter ordering, and the single public error. In wiki/Production Observability Workflow.md document HMAC-only rejected-account metrics and corrupt-hash alert redaction. Append test evidence to wiki/log.md.

- [ ] **Step 7: Stage, run every wiki gate, and commit**

Run:

    git add lib/auth/abuse/password-admission.ts lib/auth/downstream/leaf8.ts tests/auth/password-enumeration.test.ts tests/auth/password-abuse-integration.test.ts "wiki/Auth And Permissions Workflow.md" "wiki/Production Observability Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): equalize credential rejection paths"

Expected: password work, limiter order, public errors, tests, and wiki evidence are committed together.

### Task 6: Apply OAuth controls and export invitation guard primitives

**Files:**
- Modify: lib/auth/downstream/leaf8.ts
- Create: lib/auth/abuse/oauth-guard.ts
- Create: lib/auth/abuse/invitation-guard.ts
- Modify: app/api/auth/[...nextauth]/route.ts
- Create: tests/auth/oauth-abuse.test.ts
- Create: tests/auth/oauth-state-pkce-contract.test.ts
- Create: tests/auth/invitation-guard.test.ts
- Create: tests/security/invitation-guard-boundary.test.ts
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- Google provider `checks` is exactly `["pkce", "state"]`.
- `guardOAuthStart` consumes OAUTH_START_NETWORK before provider redirect.
- `guardOAuthIdentity` consumes OAUTH_ACCOUNT for every normalized verified identity before the Leaf 1 exact-linked policy. This leaf does not know a Google link grant.
- `guardAuthMutationActor` consumes AUTH_MUTATION_ACTOR for an authoritative session user before link, unlink, disable, or other auth-adjacent state change.
- `guardInvitationExchange`, `guardInvitationAcceptance`, and `guardInvitationMutation` return branded route-independent permits after shared network/actor policies. They import no Leaf 7 module, schema, route, Account-link grant, or attempt type.

- [ ] **Step 1: Write failing OAuth and generic invitation-guard tests**

OAuth tests cover start and callback from multiple workers, existing token-free exact
links, rejected unlinked identities, missing/unverified email, state replay, PKCE
mismatch, callback limiter outage, and equal fail-closed `503` behavior before Account
or User persistence. Leaf 8 admits only Leaf 1 exact-linked Google identities; Leaf 7
later composes a one-time grant without changing these guard functions.

Invitation-guard tests use opaque synthetic identifiers only. They require exchange
network admission before token hashing, acceptance network admission before attempt
cookie lookup, and actor admission before browser manager create/renew/revoke. Database outage
returns `AUTH_GUARD_UNAVAILABLE`; raw token, cookie, verified email, provider payload,
and actor ID never enter bucket rows or alerts. A source-boundary test rejects imports
from `lib/invitations`, invitation routes/models, `WorkspaceInvitationAttempt`, and
`GoogleAccountLinkGrant`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/auth/oauth-abuse.test.ts tests/auth/oauth-state-pkce-contract.test.ts tests/auth/invitation-guard.test.ts tests/security/invitation-guard-boundary.test.ts

Expected: FAIL because OAuth guards and route-independent invitation permits do not exist.

- [ ] **Step 3: Enforce OAuth network and identity policies**

Verify Leaf 1's protected Google provider config still has exact
`checks: ["pkce", "state"]`; this leaf cannot edit it. Through the reserved Leaf 8 slot,
consume OAUTH_START_NETWORK before
constructing a redirect. On callback, let NextAuth validate state and PKCE, consume
OAUTH_ACCOUNT from provider plus normalized verified email, then require Leaf 1's exact
token-free linked identity before any persistence. Do not import or anticipate Leaf 7's
grant schema. Every guard-store fault maps to `503` plus the privacy-safe alert; never
convert it to an account-state redirect or retry without the guard.

- [ ] **Step 4: Implement branded, route-independent invitation permits**

Each permit closes over only the evaluated policy, key version set, database timestamp,
and request correlation identity. It contains no raw token/account/network/user value,
cannot be constructed by a caller, and is single-operation scoped. Leaf 7 must consume
the matching permit before its own schema lookup or mutation; Leaf 8 contains no durable
attempt/revision/cap logic.

- [ ] **Step 5: Confirm GREEN and prove the dependency direction**

Run:

    pnpm exec vitest run tests/auth/oauth-abuse.test.ts tests/auth/oauth-state-pkce-contract.test.ts tests/auth/invitation-guard.test.ts tests/security/invitation-guard-boundary.test.ts
    pnpm exec tsc --noEmit

Expected: all tests pass, outage creates zero auth persistence, and the boundary test proves `8 -> 7` without a reverse source dependency.

- [ ] **Step 6: Record the durable wiki delta**

In wiki/Auth And Permissions Workflow.md add OAuth state plus PKCE, exact limiter
ordering, fail-closed callback semantics, generic invitation permits, and Leaf 7
ownership of invitation persistence/integration. Append focused evidence to wiki/log.md.

- [ ] **Step 7: Stage, run every wiki gate, and commit**

Run:

    git add lib/auth/downstream/leaf8.ts lib/auth/abuse/oauth-guard.ts lib/auth/abuse/invitation-guard.ts 'app/api/auth/[...nextauth]/route.ts' tests/auth/oauth-abuse.test.ts tests/auth/oauth-state-pkce-contract.test.ts tests/auth/invitation-guard.test.ts tests/security/invitation-guard-boundary.test.ts "wiki/Auth And Permissions Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): publish oauth and invitation abuse guards"

Expected: OAuth, generic guard primitives, tests, and durable documentation are one commit.

### Task 7: Create hashed per-session registry authority for encrypted JWTs

**Files:**
- Create: lib/auth/session-registry.ts
- Modify: lib/auth/downstream/leaf8.ts
- Modify: lib/auth/session.ts
- Modify: app/api/auth/[...nextauth]/route.ts
- Create: scripts/security/revoke-auth-sessions.ts
- Create: scripts/security/cleanup-auth-sessions.ts
- Modify: package.json
- Create: tests/auth/session-registry.test.ts
- Create: tests/auth/session-registry-races.test.ts
- Create: tests/auth/session-cleanup.test.ts
- Create: tests/security/session-authority-source-contract.test.ts
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/Local Development Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- createAuthSessionRegistry(tx, userId, expiresAt) returns rawSid and canonicalVersion; rawSid is 32 random bytes encoded as 43-character canonical base64url.
- hashAuthSessionId(rawSid) returns SHA-256 over the fixed munjib-auth-session-id-v1 domain, one zero byte, and the decoded 32 sid bytes; callers never log either input or the stored sidHash.
- resolveAuthSession(token) queries AuthSessionRegistry and User on every call and returns the user only when every invariant holds.
- resolveAuthoritativeAuthSession(request) is the only application API allowed to decode/accept encrypted auth claims; it distinguishes invalid credentials from SESSION_STORE outage so callers fail closed rather than treating outage as logout.
- revokeAuthSessionByRegistryId(tx, {registryId, code, rootOperationId}) revokes one row without accepting raw sid input and appends AUTH_SESSION_REVOKED with subjectType AUTH_SESSION and that immutable registry ID in the same transaction.
- revokeAllAuthSessionsForUser(tx, userId, code) increments User.sessionVersion and revokes every active registry row using database CURRENT_TIMESTAMP.

- [ ] **Step 1: Write failing registry, JWT, sign-out, and race tests**

Require:

- raw sid has 256 bits of randomness and is present only in the encrypted JWT payload;
- database rows and Prisma query logs contain only sidHash;
- token sessionVersion is a canonical decimal string and registry/user values are BigInt;
- every JWT resolution performs a fresh registry plus User query;
- every protected page, route, mutation, middleware handoff, websocket upgrade, and server helper either calls resolveAuthoritativeAuthSession in the Node runtime or defers authorization to a Node handler that does;
- repository inventory finds no direct getToken, JWT/JWE decode, jose decode, auth-claim cast, cached-session authority, or getServerSession authorization outside the exact canonical allowlist; when the baseline result is zero, the test pins zero;
- Edge middleware performs routing hints only and cannot grant access from a decrypted cookie/JWT;
- missing sid, missing version, malformed version, negative version, leading zero, legacy token, missing row, revoked row, expired row, disabled user, registry/token mismatch, user/token mismatch, and database outage all reject;
- session callbacks scrub sid, sidHash, sessionVersion, authDisabledAt, and registry ID from browser-visible session JSON;
- two concurrent sessions remain independent; sign-out revokes only the current row and appends exactly one AUTH_SESSION_REVOKED row whose subjectId is that registry ID;
- a forced journal failure rolls back current-session revocation, and an already-revoked retry appends no duplicate event;
- concurrent sign-out versus request and user-wide revoke versus refresh never reauthorize;
- cleanup deletes only rows already expired past the configured retention boundary using database time.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/auth/session-registry.test.ts tests/auth/session-registry-races.test.ts tests/auth/session-cleanup.test.ts tests/security/session-authority-source-contract.test.ts

Expected: FAIL because JWT validity is still bearer-only and no hashed registry exists.

- [ ] **Step 3: Implement sid creation and canonical version claims**

Generate rawSid with randomBytes(32).toString("base64url") and assert the exact canonical 43-character form. Hash with a distinct munjib-auth-session-id-v1 domain. Insert AuthSessionRegistry in the successful authentication transaction using User.sessionVersion and a database-derived expiry. Put only rawSid and sessionVersion.toString(10) into the encrypted NextAuth JWT.

Do not put a registry ID into the JWT. Never return sid, its hash, or the version from session callbacks.

- [ ] **Step 4: Recheck database authority on every JWT resolution**

Parse sessionVersion only after the canonical regex succeeds, then convert to BigInt. In one query load registry by sidHash with User. Accept only when:

1. the registry exists and revokedAt is null;
2. database CURRENT_TIMESTAMP is before registry.expiresAt;
3. User.authDisabledAt is null;
4. token, registry, and User session versions are equal;
5. normal User and current authorization resolvers still allow the requested action.

A database read fault throws AuthGuardUnavailableError with causeCode SESSION_STORE and every protected caller returns 503/no-store or the equivalent unavailable page; it must not redirect as unauthenticated or continue from cached claims. Legacy tokens without both claims are invalid immediately; there is no grace decoder.

Inventory all existing direct `getToken`, NextAuth/JWT/JWE decode, `jose`, `getServerSession`, middleware authorization, websocket upgrade, route helper, and cached-session consumers before refactoring. Move claim decoding into `lib/auth/session-registry.ts`; keep an exact source-test allowlist only for that module and the NextAuth framework adapter that invokes it. If inventory is empty, encode an empty baseline rather than adding a speculative exception. Middleware may check only public path shape and must defer authentication/authorization.

- [ ] **Step 5: Revoke current and user-wide sessions safely**

Before handing sign-out to NextAuth, call resolveAuthoritativeAuthSession; the route itself never calls getToken or decodes the JWT. Use the returned internal registry ID to conditionally update only that active row with database time and SIGN_OUT. In the same transaction append AUTH_SESSION_REVOKED with subjectType AUTH_SESSION, the AuthSessionRegistry ID as immutable replay target, a derived operation UUID, and exact two-key payload. If the conditional update claims zero rows, append nothing. The operator CLI accepts either --registry-id plus one non-sensitive database ID or --user-id plus one database user ID; it never accepts or prints raw sid or sidHash. User-wide mode increments the BigInt version, marks active registries, and appends AUTH_USER_SESSIONS_REVOKED with subjectType USER and the immutable user ID in one transaction.

- [ ] **Step 6: Confirm GREEN and scan browser-visible surfaces**

Run:

    pnpm exec vitest run tests/auth/session-registry.test.ts tests/auth/session-registry-races.test.ts tests/auth/session-cleanup.test.ts tests/security/session-authority-source-contract.test.ts
    pnpm exec tsc --noEmit

Expected: all tests pass and TypeScript succeeds.

Run:

    if rg -q 'sidHash|sessionVersion|authDisabledAt|rawSid' app components; then
      exit 1
    fi
    if rg -q '(getToken[[:space:]]*\(|getServerSession[[:space:]]*\(|jwtDecode|decodeJwt|compactDecrypt|jwtVerify|from[[:space:]]+["'\"']jose["'\"']|from[[:space:]]+["'\"']next-auth/jwt["'\"'])' app components lib middleware.ts --glob '!lib/auth/session-registry.ts'; then
      exit 1
    fi

Expected: both conditionals exit 0 with no output. The source-contract test separately inventories route helpers, middleware, websocket upgrades, and caches and accepts no decoder/authority exception beyond lib/auth/session-registry.ts; a zero-result repository remains pinned to zero.

- [ ] **Step 7: Record the durable wiki delta**

In wiki/Auth And Permissions Workflow.md document encrypted JWT claims, hashed registry authority, canonical decimal BigInt conversion, per-request queries, the sole-decoder/source allowlist, middleware/websocket deferral, outage-vs-invalid behavior, immediate legacy invalidation, sign-out behavior, and browser-visible claim scrubbing. In wiki/Local Development Workflow.md document registry-ID and user-ID operator revocation plus database-time cleanup without sensitive output. Append inventory, source-contract, race, and cleanup evidence to wiki/log.md.

- [ ] **Step 8: Stage, run every wiki gate, and commit**

Run:

    git add lib/auth/session-registry.ts lib/auth/downstream/leaf8.ts lib/auth/session.ts 'app/api/auth/[...nextauth]/route.ts' scripts/security/revoke-auth-sessions.ts scripts/security/cleanup-auth-sessions.ts package.json tests/auth/session-registry.test.ts tests/auth/session-registry-races.test.ts tests/auth/session-cleanup.test.ts tests/security/session-authority-source-contract.test.ts "wiki/Auth And Permissions Workflow.md" "wiki/Local Development Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): add revocable jwt session registry"

Expected: session authority, operator tools, tests, and documentation are committed together.

### Task 8: Journal every access reduction and invalidate affected sessions

**Files:**
- Create: lib/auth/access-reduction.ts
- Create: lib/auth/journal-replay.ts
- Modify: lib/organizations/membership-service.ts
- Modify: lib/workspaces/membership-service.ts
- Modify: lib/workspaces/support-access.ts
- Create: lib/auth/google-account-revocation.ts
- Modify: lib/auth/session-registry.ts
- Create: tests/auth/access-reduction.test.ts
- Create: tests/auth/journal-replay.test.ts
- Create: tests/auth/google-token-bearing-account-revocation.test.ts
- Create: tests/organizations/access-reduction-journal.test.ts
- Create: tests/workspaces/access-reduction-journal.test.ts
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/Document Knowledge Model.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- `disableUserAuthentication(tx, input)` sets `authDisabledAt` from database time, increments `sessionVersion`, revokes all active registries, and appends `AUTH_USER_DISABLED` plus `AUTH_USER_SESSIONS_REVOKED` before commit. It does not create, update, null, unlink, or delete any Account row. OAuth Account reduction is a separate exact-target `revokeGoogleAccountAccess()` transaction that must append `AUTH_OAUTH_ACCOUNT_REVOKED` for that Account before commit.
- reduceUserAccess(tx, input) performs the authoritative membership, support, OAuth, or privilege mutation, increments the affected user's sessionVersion, revokes active registries when required, and appends the exact Leaf 2 journal kind in the same transaction.
- Support resolution still reads WorkspaceMember plus the database support-grant resolver. A version bump only shortens stale sessions and cannot grant access.
- `leaf8JournalReplayReducers` owns exactly `AUTH_CREDENTIAL_INVALIDATED`, `AUTH_OAUTH_ACCOUNT_REVOKED`, `AUTH_SESSION_REVOKED`, and `AUTH_USER_SESSIONS_REVOKED`.
- `revokeLegacyTokenBearingGoogleAccounts()` consumes the already verified recovery/JOURNAL_READY gate, processes bounded exact Account rows, and uses only existing `AUTH_OAUTH_ACCOUNT_REVOKED`; the canonical twenty-six-kind union is unchanged.
- `revokeGoogleAccountAccess()` is a Leaf 8-owned transaction primitive parameterized only by an exact Account target and branded authorization context. It imports no Leaf 7 link/grant module; Leaf 7 may call it later but Leaf 8 never calls into Leaf 7.

- [ ] **Step 1: Write failing transaction and rollback tests**

Cover authentication disable, password/email credential change, Google Account unlink/token scrub, organization and workspace membership revoke, support revoke, support database-time expiry, role downgrade, owner transfer removal, and incident response. For each access reduction, assert:

- authoritative state, version increment, registry revocation, and SecurityJournalEvent commit together;
- a forced journal append failure rolls back every state and session change;
- a forced state mutation failure appends no event;
- concurrent reductions monotonically increase BigInt sessionVersion without lost updates;
- all already-issued sessions fail on their next resolution;
- membership/support authorization still denies from current database state even if session invalidation is artificially delayed.
- disabling authentication leaves every Account row and token column byte-for-byte unchanged; a test that observes any Account write fails. Exact OAuth unlink/token scrub runs only through `revokeGoogleAccountAccess()` and rolls back if its per-Account `AUTH_OAUTH_ACCOUNT_REVOKED` append fails.

Legacy Google tests seed synthetic values in `access_token`, `refresh_token`,
`id_token`, `session_state`, `scope`, `token_type`, and `expires_at`. Without the exact
recovery/JOURNAL_READY gate, cleanup and Google containment removal fail. With the gate,
each transaction locks one bounded Account batch, revokes/removes the exact Account and
appends `AUTH_OAUTH_ACCOUNT_REVOKED` with subject type `OAUTH_ACCOUNT`, Account ID as
subject, and the exact two-key payload. Journal failure rolls back revocation, a state
failure appends nothing, replay is idempotent, and output exposes only a final boolean
that no token-bearing Google row remains—never counts, IDs, fields, or values. Token-free
minimal Accounts are untouched.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

    pnpm exec vitest run tests/auth/access-reduction.test.ts tests/auth/journal-replay.test.ts tests/auth/google-token-bearing-account-revocation.test.ts tests/organizations/access-reduction-journal.test.ts tests/workspaces/access-reduction-journal.test.ts

Expected: FAIL because access reductions do not share one journaled transaction, the
exact Leaf 8 reducer map is absent, and stale sessions remain valid.

- [ ] **Step 3: Implement the common transactional primitive**

Use SQL increment or Prisma update that returns the new BigInt version; never read then write an application-computed value. Use CURRENT_TIMESTAMP inside the transaction for disabledAt and revokedAt. For every journal row, derive its deterministic UUID from the root operation UUID, exact kind, canonical subject type, and immutable replay target with Leaf 2 `deriveSecurityJournalOperationId`. Put that target only in subjectId and use the exact two-key payload `{stateCode: kind, stateVersion: 1}`. Do not pass parent resource IDs, reason codes, or any other payload field.

Authentication disable is one-way in this leaf. No enableUserAuthentication function, admin UI, or reverse migration is added.

Create the exact Leaf 8 reducer map under Leaf 2's branded restore context. Each
handler locks the immutable user/account/session target when present and idempotently
scrubs credentials/tokens or revokes one/all sessions. It never creates a credential,
links OAuth, enables a user, appends, or mutates journal/checkpoint state. Membership,
support, Trial, and `AUTH_USER_DISABLED` remain in the disjoint Leaf 2 map.

- [ ] **Step 4: Route every access-reducing service through the primitive**

Organization membership removal or role downgrade appends ORGANIZATION_MEMBERSHIP_REVOKED with subjectType ORGANIZATION_MEMBERSHIP and the membership row/key, then replays as full membership removal. Workspace membership removal or role downgrade uses WORKSPACE_MEMBERSHIP_REVOKED, subjectType WORKSPACE_MEMBERSHIP, and its membership row/key, likewise replaying as full removal rather than a grant. Support revoke/expiry uses SUPPORT_ACCESS_REVOKED or SUPPORT_ACCESS_EXPIRED, subjectType SUPPORT_GRANT, and the grant ID. Google Account unlink uses AUTH_OAUTH_ACCOUNT_REVOKED, subjectType OAUTH_ACCOUNT, and the Account row/key. Password or email credential change uses AUTH_CREDENTIAL_INVALIDATED, subjectType USER, and the user ID; user-wide session revocation uses AUTH_USER_SESSIONS_REVOKED with the same USER target. Authentication disable appends AUTH_USER_DISABLED and AUTH_USER_SESSIONS_REVOKED as two USER rows with distinct derived operation UUIDs. Preserve the Trial Admin account and the Leaf 2 no-broad-support contract.

The legacy token-bearing cleanup is the same Leaf 8-owned Google Account revoke
operation, not a
new journal kind or a token-null-only state. Public Google start/callback stays edge
contained until the final no-token-bearing-row boolean, journal continuity, token-zero
adapter source contract, and exact deployed image all pass. A revoked legacy row may be
linked again only later through Leaf 7's fresh guarded minimal-identity flow.

This task neither modifies nor imports any Leaf 7 link/grant/invitation module,
model, or route. The boundary test scans both the Task 8 file list and source graph for
that reverse dependency. Future Leaf 7 unlink calls compose the exported Leaf 8
revocation primitive from the downstream leaf.

- [ ] **Step 5: Confirm GREEN and prove journal atomicity**

Run:

    pnpm exec vitest run tests/auth/access-reduction.test.ts tests/auth/journal-replay.test.ts tests/auth/google-token-bearing-account-revocation.test.ts tests/organizations/access-reduction-journal.test.ts tests/workspaces/access-reduction-journal.test.ts tests/auth/session-registry-races.test.ts
    pnpm exec tsc --noEmit

Expected: all tests pass, including forced rollback and concurrent version increments.

Run:

    if rg -q 'sessionVersion:.*\+|authDisabledAt: new Date|revokedAt: new Date' lib app; then
      exit 1
    fi

Expected: exit 0 with no output.

- [ ] **Step 6: Record the durable wiki delta**

In wiki/Auth And Permissions Workflow.md add the access-reduction transaction matrix, one-way disable rule, session invalidation semantics, and restore boundary. In wiki/Document Knowledge Model.md state that current membership/support database resolution is authority, journal plus business state commit atomically, and session invalidation is defense in depth. Append rollback and race evidence to wiki/log.md.

- [ ] **Step 7: Stage, run every wiki gate, and commit**

Run:

    git add lib/auth/access-reduction.ts lib/auth/journal-replay.ts lib/organizations/membership-service.ts lib/workspaces/membership-service.ts lib/workspaces/support-access.ts lib/auth/google-account-revocation.ts lib/auth/session-registry.ts tests/auth/access-reduction.test.ts tests/auth/journal-replay.test.ts tests/auth/google-token-bearing-account-revocation.test.ts tests/organizations/access-reduction-journal.test.ts tests/workspaces/access-reduction-journal.test.ts "wiki/Auth And Permissions Workflow.md" "wiki/Document Knowledge Model.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "feat(auth): journal and invalidate access reductions"

Expected: authoritative reductions, registry invalidation, journal events, rollback tests, and wiki deltas are one commit.

### Task 9: Verify end to end, publish the Issue 8 capability, and complete rollout

**Files:**
- Create: tests/e2e/auth-abuse-and-sessions.spec.ts
- Create: scripts/security/verify-auth-abuse-capability.ts
- Create: scripts/security/emit-auth-abuse-capability.ts
- Create: deploy/security/auth-abuse-capability-contract-v1.json
- Create: deploy/security/capabilities/issue-08-auth-abuse.json
- Modify: deploy/security/protected-artifact-owners.json
- Create: deploy/host-bundles/auth-abuse-v1/manifest-v1.json
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-abuse-capability-publisher
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-abuse-capability-publish.service
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-edge-activate
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-edge-activate.service
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-proxy-proof-rotate
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-proxy-proof-rotate.service
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-rate-limit-key-rotate
- Create: deploy/host-bundles/auth-abuse-v1/munjib-auth-rate-limit-key-rotate.service
- Include in bundle: deploy/caddy/Caddyfile
- Include in bundle: deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf
- Include in bundle: the exact static `munjib-caddy-credential-bridge` build output
- Create: scripts/security/build-auth-abuse-host-bundle.ts
- Create: tests/security/auth-abuse-capability.test.ts
- Create: tests/deploy/auth-abuse-host-bundle.test.ts
- Create: tests/deploy/auth-abuse-capability-activation.test.ts
- Modify: scripts/security/auth-preflight.ts
- Modify: .github/workflows/ci-cd.yml
- Modify: wiki/Auth And Permissions Workflow.md
- Modify: wiki/CI CD And Monitoring Workflow.md
- Modify: wiki/Local Development Workflow.md
- Modify: wiki/log.md
- Modify: wiki/manifest.json

**Interfaces:**
- The tracked public contract fixes schema/trust/policy only. The untracked capability
  envelope names issue 8, exact environment, canonical origin, git SHA/ref, image and
  security-floor digest, migration identity,
  policy-catalog SHA-256, CI test-evidence SHA-256, post-deploy probe digest, deployed
  identity SHA-256, generated time, nonce, signer/trust version, and detached
  KMS signature. It contains no secret, raw count, raw network, account key, sid, hash,
  or production account value.
- The envelope has no `expiresAt`, `notAfter`, `ttlSeconds`, or age-based grace. `generatedAt` is audit metadata only. Signup readiness consumes only a verified capability whose entire deployment identity equals the running candidate and whose policy catalog includes distributed fail-closed rate limiting, bounded requests, state plus PKCE, hashed session registry, generic invitation guards, and journaled access reduction.
- Restore invalidates restored registries with RESTORE_INVALIDATED, replays each user's minimum safe BigInt version and authDisabledAt, and verifies journal continuity before allowing authentication.

The static floor fragment exists only at
`deploy/security/capabilities/issue-08-auth-abuse.json` and is exact:

~~~json
{"format":"munjib-security-capability-v1","id":"issue-08-auth-abuse","version":1,"leaf":8,"requires":["auth-runtime-fail-closed@1","security-journal-auth-tombstones@1","immutable-private-runtime@1"],"evidenceTests":["tests/auth/network-identity.test.ts","tests/auth/postgres-rate-limit.test.ts","tests/auth/nextauth-request-wrapper.test.ts","tests/auth/postgres-rate-limit-multiprocess.test.ts","tests/auth/rate-limit-hmac-rotation.test.ts","tests/auth/invitation-guard.test.ts","tests/security/invitation-guard-boundary.test.ts","tests/auth/session-registry-races.test.ts","tests/auth/access-reduction.test.ts","tests/auth/google-token-bearing-account-revocation.test.ts","tests/security/caddy-credential-bridge.test.ts","tests/deploy/caddy-systemd-contract.test.ts","tests/deploy/auth-abuse-host-bundle.test.ts","tests/deploy/auth-abuse-capability-activation.test.ts","tests/security/auth-abuse-capability.test.ts"]}
~~~

Its protected-artifact list claims the reserved
`lib/auth/downstream/leaf8.ts` baseline, the canonical
`app/api/auth/[...nextauth]/route.ts` outer wrapper, `lib/auth/abuse/**`,
`internal/caddyauthcredential/**`, session-registry, limiter schema/migration, and the
`auth-abuse-v1` host bundle. The
capability test requires an Issue 8 owner-version bump for any route change and proves
the bounded/provenance wrapper plus outer candidate request scope remain reachable
before NextAuth. It explicitly excludes
Leaf 1 config/password/adapter/session-image and Leaf 7 paths. Capability tests compare
the reserved baseline hash/owner map, reject a Leaf 1-owned path, and require this first
slot change to publish Issue 8 capability version 1.

- [ ] **Step 1: Write failing browser, capability, deploy, and restore tests**

The browser suite covers:

- password network/account throttling without account enumeration;
- OAuth state and PKCE rejection, exact token-free linked login, and guard-store outage;
- oversize, cross-origin, and cross-site authentication mutations;
- two simultaneous sessions, current sign-out, user-wide revoke, membership revoke, support expiry, Google unlink, disabled user, and immediate legacy-token invalidation;
- every browser-visible response and error is no-store and contains no internal identifiers.

The capability tests reject wrong SHA/image/origin/environment/floor, missing
migration/policy/probe, stale deployment identity, unsigned or wrong-key envelopes,
modified evidence, every TTL/expiry field, and any forbidden sensitive field. They
accept a restart only when exact identity and pinned trust are unchanged. Host-bundle
and activation tests reject mutable-checkout root execution, app-image bundle
substitution, wrong `auth-abuse-v1` OCI digest/manifest/member, deploy-user sudoers,
direct helper or unit invocation, extra dispatcher fields, caller
paths/image/Compose/KMS overrides, stale capability reuse, partial generation
publication, power loss at every fsync/pointer boundary, and promotion without
candidate Web force-recreation. They also prove no generated capability path is
tracked and only the canonical leaf fragment path is committed.

The host-bundle test enumerates every root mutation introduced in Tasks 2, 3, and 9:
Caddyfile/drop-in/static bridge, initial secret install, proxy-proof rotation,
limiter-HMAC normal/emergency rotation, capability publication, daemon-reload, service
restart, and rollback. Each must map to one manifest member plus fixed dispatcher
operation/root unit. It rejects `/usr/bin/node` or any dynamic bridge interpreter, an
unbundled root asset, a unit that accepts arguments/environment, or a checkout-derived
destination.

Restore tests prove restored active registry rows are marked RESTORE_INVALIDATED,
session versions never decrease, disabled users remain disabled, raw sid and sidHash
are absent from evidence, and journal replay is continuous.

- [ ] **Step 2: Run focused verification and confirm RED**

Run:

    pnpm exec vitest run tests/auth tests/security tests/workspaces tests/deploy
    pnpm exec playwright test tests/e2e/auth-abuse-and-sessions.spec.ts

Expected: the new E2E, capability, deployment, or restore assertions fail until the rollout wiring and artifact scripts exist.

- [ ] **Step 3: Wire preflight, CI, deploy, and capability publication**

Production preflight must validate both current Web guard secret files without printing them, optional previous-proof deadline/mount consistency, effective Caddy systemd ExecStart without --environ, systemd credential/drop-in/bridge/Caddyfile digests, sentinel-clean journal/access logs, Leaf 13 loopback-only Web exposure, required migration, database limiter health, session-registry health, sole session-decoder source contract, Leaf 2 journal append health, and exact deployed SHA. A failed check blocks startup or deployment.

CI emits signed test evidence for the exact tested commit/image but never emits the
final capability. The envelope binds the Caddyfile, systemd drop-in, credential bridge,
Compose secret/loopback contract, session-authority and generic-invitation-guard source
inventories, and policy catalog digests.

Build `auth-abuse-v1` as a separate deterministic OCI host bundle, never as an app-image
directory. Its exact manifest allowlists the root-owned capability publisher,
auth-edge activation/proxy-proof rotation/rate-limit-key rotation orchestrators, their
fixed root units, the Caddyfile, Caddy systemd drop-in, and the reproducibly built static
credential bridge, with destination, owner/group, mode, size, and SHA-256 for every
member. The signed Leaf 13A release envelope binds the exact host-bundle digest. Leaf
13A's preinstalled forced-command dispatcher independently verifies
provenance/attestation, strictly parses the layer, installs only those members, runs
`systemd-analyze verify`, reopens every destination, performs daemon-reload, and starts
or restarts a service only through a manifest-named unit/operation. A failed unit
install/reload/health check restores the previous complete attested generation. No root
process reads or executes checkout bytes, no host Node/interpreter is required, and the
application image contains no host helper.

The deploy principal has no sudoers entry, shell, Docker access, `systemctl` authority,
or direct publisher path. It may submit only the bounded signed release envelope to the
Leaf 13A forced command. The dispatcher may select only fixed
`ACTIVATE_AUTH_EDGE_V1`, `ROTATE_AUTH_PROXY_PROOF_V1`,
`ROTATE_AUTH_RATE_LIMIT_HMAC_V1`, or `PUBLISH_AUTH_ABUSE_CAPABILITY_V1` operations from
the signed exact-schema envelope, derives candidate/bundle/evidence identity itself,
and internally starts the matching installed root unit with no caller paths, arguments,
secret bytes, or environment. Rotation units generate fresh secret bytes locally and
use only fixed descriptors/paths. Every unit holds
`/run/lock/munjib-security-state.lock`, validates before switching, and rolls back or
leaves auth locked on failure. Any direct deploy-user helper/unit invocation or root
operation outside this allowlist is a contract-test failure.

The publisher derives environment, canonical origin, fixed base/Google Compose
selection, KMS trust, and evidence from root-owned descriptors; rechecks non-sensitive
live limiter/session/journal probes; then emits and verifies an immutable generation
directory containing `capability.json`, `capability.sha256`, `deploy.env`, and a manifest
that cross-hashes all three plus the exact deployment identity. It writes temporary
regular files with `O_NOFOLLOW|O_EXCL`, fsyncs each file and the temporary generation
directory, renames the generation to its immutable final name, then fsyncs the
`generations/` parent so the name is durable. It writes/fsyncs a temporary root-owned
canonical regular `current` pointer containing only that generation ID, renames it over
`current`, and fsyncs the capability parent directory before reporting publication.
No current symlink exists. Consumers resolve that pointer under
the locked root publisher and never observe independently updated JSON/SHA/env files. Crash
recovery chooses either the complete previous or complete new pointer; incomplete
generations are never current, and a post-pointer/pre-recreate restart resumes candidate
recreation while traffic remains off-candidate and signup remains closed.

Using the exact generation selected by that pointer, the fixed root unit force-recreates
candidate Web because pointer/host inode replacement does not update an existing bind
mount, verifies the mounted regular file, manifest cross-hashes, exact identity, and
readiness, and only then records a promotion permit for the dispatcher. Failure leaves
or restores the prior single pointer when it belongs to the same deployment; otherwise
it stops the candidate and leaves the previous live slot plus signup-closed state
untouched. Power-loss tests inject failure before/after every file fsync, generation
directory fsync, immutable generation rename, `generations/` parent fsync, pointer-file
fsync/rename, capability-parent fsync, and Web recreation.

The capability parent is root mode `0700`; the leaf is runtime UID `10001` mode `0400`,
gitignored, and never uploaded. Web/Leaf 7 receive only the fixed read-only mount at
`/run/munjib-capabilities/auth-abuse.json`; startup verifies exact signature,
environment/origin/source/image/floor/policy identity. Every later candidate retaining
`issue-08-auth-abuse` republishes before its traffic switch. A self-referential,
pre-deploy, tracked, TTL-grace, or stale-deployment capability is impossible.

The immutable generation's `capability.sha256` contains only the lowercase digest and
its `deploy.env` contains only the reviewed
`MUNJIB_AUTH_ABUSE_CAPABILITY_SHA256=<same-digest>` line; the manifest binds both. The
dispatcher selects the fixed host generation path and fixed container mount and reads
the env from that same manifest-verified generation; neither value is printed or caller
selected. Leaf 7 consumes the mounted capability plus same-generation digest. Any
pointer, manifest, digest, env, or mounted-file mismatch keeps signup closed.

- [ ] **Step 4: Implement explicit secret-safe restore recovery**

After restoring PostgreSQL:

1. install a fresh proxy proof through the bounded old/new Web-then-Caddy rotation;
2. rotate a fresh rate-limit HMAC only through Task 3's emergency auth-lockdown plus a new durable `EMERGENCY_LOCKED` epoch and full database-time horizon; never hot-swap, omit the epoch, or reopen before its atomic `ACTIVE` transition;
3. mark every restored non-expired registry RESTORE_INVALIDATED using database time;
4. set each User.sessionVersion to at least the replayed journal minimum and never lower an existing value;
5. preserve authDisabledAt;
6. replay journal sequence/hash continuity;
7. verify limiter and registry schema/migration identity;
8. keep authentication unavailable until all checks pass.

Operator output reports only aggregate pass/fail categories, never production counts, registry IDs, sidHash values, users, IPs, emails, or journal payloads.

- [ ] **Step 5: Run the complete verification matrix**

Run:

    pnpm exec prisma validate
    pnpm exec prisma generate
    pnpm exec tsc --noEmit
    pnpm test
    pnpm run test:e2e -- tests/e2e/auth-abuse-and-sessions.spec.ts
    pnpm exec tsx scripts/security/run-auth-runtime-e2e.ts --build-only --origin https://staging.munjib.example
    pnpm exec tsx scripts/security/auth-preflight.ts
    pnpm exec tsx scripts/security/caddy-auth-preflight.ts
    pnpm exec vitest run tests/security/auth-abuse-capability.test.ts tests/deploy/auth-abuse-host-bundle.test.ts tests/deploy/auth-abuse-capability-activation.test.ts

Expected: every command exits 0; synthetic capability fixtures verify against the
tested SHA and contain no sensitive fields. Production emission occurs only in the
post-deploy workflow.

Run the quiet secret and forbidden-fallback scan:

    if rg -q '(NEXTAUTH_SECRET|MUNJIB_RATE_LIMIT_HMAC_SECRET|MUNJIB_TRUSTED_PROXY_HEADER_SECRET)=.+' deploy/security wiki tests/e2e; then
      exit 1
    fi
    if git ls-files | rg -q 'auth-abuse/(current|generations/.+)|issue-0?8-auth-abuse-capability\.json$'; then
      exit 1
    fi

Expected: both conditionals exit 0 with no output.

- [ ] **Step 6: Record the final durable wiki delta**

In wiki/Auth And Permissions Workflow.md add the verified Issue 8 capability schema, complete request/session flow, sole decoder, failure matrix, and dependency consumed by signup readiness. In wiki/CI CD And Monitoring Workflow.md add exact-SHA preflight, host-Caddy/systemd credential contract, proof that effective ExecStart omits `--environ`, loopback boundary, Web secret mounts, deploy/rotation, capability verification, outage response, and restore order. In wiki/Local Development Workflow.md add individual registry-ID revocation, user-wide invalidation, and cleanup commands. Append the full verification commands and artifact SHA evidence to wiki/log.md without sensitive values.

- [ ] **Step 7: Stage, run every wiki gate, and commit**

Run:

    git add tests/e2e/auth-abuse-and-sessions.spec.ts tests/security/auth-abuse-capability.test.ts tests/deploy/auth-abuse-host-bundle.test.ts tests/deploy/auth-abuse-capability-activation.test.ts deploy/security/auth-abuse-capability-contract-v1.json deploy/security/capabilities/issue-08-auth-abuse.json deploy/security/protected-artifact-owners.json deploy/host-bundles/auth-abuse-v1/manifest-v1.json deploy/host-bundles/auth-abuse-v1/munjib-auth-abuse-capability-publisher deploy/host-bundles/auth-abuse-v1/munjib-auth-abuse-capability-publish.service deploy/host-bundles/auth-abuse-v1/munjib-auth-edge-activate deploy/host-bundles/auth-abuse-v1/munjib-auth-edge-activate.service deploy/host-bundles/auth-abuse-v1/munjib-auth-proxy-proof-rotate deploy/host-bundles/auth-abuse-v1/munjib-auth-proxy-proof-rotate.service deploy/host-bundles/auth-abuse-v1/munjib-auth-rate-limit-key-rotate deploy/host-bundles/auth-abuse-v1/munjib-auth-rate-limit-key-rotate.service scripts/security/build-auth-abuse-host-bundle.ts scripts/security/verify-auth-abuse-capability.ts scripts/security/emit-auth-abuse-capability.ts scripts/security/auth-preflight.ts .github/workflows/ci-cd.yml "wiki/Auth And Permissions Workflow.md" "wiki/CI CD And Monitoring Workflow.md" "wiki/Local Development Workflow.md" wiki/log.md
    pnpm wiki:install-hooks
    pnpm wiki:sync-plan --staged
    pnpm wiki:manifest
    git add wiki/manifest.json
    pnpm wiki:lint
    pnpm wiki:sync-check --staged
    git commit -m "test(auth): verify abuse controls and revocable sessions"

Expected: E2E evidence, deploy enforcement, the public capability contract/emitter/
verifier, recovery runbook, and final wiki/log delta are committed; no generated
capability is tracked.

- [ ] **Step 8: Push, create a ready PR, and monitor review plus CI for at least five minutes**

Run:

    branch=$(git branch --show-current)
    git push -u origin "$branch"
    gh pr create --fill
    gh pr ready
    for attempt in 1 2 3 4 5 6; do
      gh pr checks
      gh pr view --json reviewDecision,reviews,statusCheckRollup
      sleep 50
    done

Expected: six checks are separated by 50 seconds, totaling at least five minutes; required checks pass and no actionable review is ignored.

- [ ] **Step 9: Query unresolved review threads and repeat fixes on the same branch**

Run:

    repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
    owner=$(printf '%s' "$repo" | cut -d/ -f1)
    name=$(printf '%s' "$repo" | cut -d/ -f2-)
    number=$(gh pr view --json number --jq .number)
    gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{author{login}path line body}}}}}}}' --jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved == false))'

Expected: [] before completion. If the array is non-empty or a check fails, implement the fix on this branch, repeat the affected RED/GREEN verification, update the real wiki/log delta, run the staged wiki gates, commit, push, and repeat the five-minute polling plus GraphQL query.

- [ ] **Step 10: Verify deployed behavior before declaring completion**

Deploy the exact merged SHA through the approved deployment workflow. Verify the public readiness endpoint reports Issue 8 ready only through the signed exact-deployment capability, authentication guard-store health is non-sensitive, external direct application-port access is unavailable while Caddy reaches the Leaf 13 loopback port, effective Caddy ExecStart omits `--environ`, journal/access logs contain no synthetic sentinel, password/OAuth/generic invitation-guard outage probes return `AUTH_GUARD_UNAVAILABLE`, and a test session revoked by registry ID fails on its next request. The legacy token-bearing Google cleanup must use `AUTH_OAUTH_ACCOUNT_REVOKED` and pass before Google containment is removed. Do not use production identities or print production counts.

Expected: deployed SHA, verified capability SHA, and health evidence agree; signup remains effectively closed until its own readiness conditions are satisfied.
