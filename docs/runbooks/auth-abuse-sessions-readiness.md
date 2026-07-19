# Auth abuse controls and session revocation readiness

Issue #162 (`issue-162-security-auth-abuse-sessions`) is intentionally a
readiness handoff on the current release line. This note records the public-safe
dependency state; it is not an activation approval and does not authorize
production mutations.

## Current state

- As of commit `c742a62` on `origin/main`, the branch includes the reviewed
  Leaf 1 authentication runtime, the Leaf 2 journal/durable-auth contract from
  PR #199, and the bounded auth-abuse runtime contract from PR #202. It still
  does not have a database-authoritative authentication limiter or revocable
  session registry activated in production.
- `User` still has no deployed `authDisabledAt` or `sessionVersion` authority
  on this release line. The existing Auth.js `Session` table is not the runtime
  authority because `lib/auth/config.ts` uses encrypted JWT sessions.
- `lib/auth/downstream/leaf2.ts` remains a protected no-op activation slot;
  the merged journal/durable-state helpers are preparation contracts, while
  the migration, journal genesis, support-grant, and runtime capability needed
  for access-reduction invalidation are still pending.
- The auth abuse design requires the Leaf 13 private binding, database-role,
  host-edge, and broker attestation gates before any limiter/session migration
  or authentication-route wrapper is activated. The host-edge contract is
  tracked separately by Issue #166 and remains `PREPARATORY`/`DISABLED`; the
  private runtime and broker capabilities are tracked by Issues #184 and #185
  and remain draft/uninstalled on the target host.
- Leaf 1-owned auth configuration, password verification, adapter, and
  session-image paths are protected seams. This branch does not edit or claim
  them, and it does not add a second local limiter or session decoder.

## Required gates before activation

Only the merged journal/durable-state helpers and bounded auth-guard
preparation contracts are present in the reviewed tree; the support-grant and
runtime activation contracts are still implementation work. Collect the
following public-safe evidence before adding the schema migration, route
wrapper, or runtime activation:

1. Leaf 2 has merged and deployed the canonical `authDisabledAt`, BigInt
   `sessionVersion`, support-grant, and same-transaction deny-only journal
   contracts. The journal replay ownership map must remain disjoint from the
   Issue #162 credential/OAuth/session reducers.
2. Issue #166 has a verified host-edge binding/probe contract, Leaf 13 has a
   verified private Web binding and database role, and the delivery broker has
   an attested host installation/trust path. The production host must report
   the broker policy/socket readiness without exposing credentials or logs.
3. The exact runtime image, migration identity, owner map, and protected Leaf 1
   hook slot are pinned on the rebased branch. No migration may create a second
   `authDisabledAt` or `sessionVersion` authority, and no route may call a process
   memory fallback when PostgreSQL is unavailable.
4. The canonical origin and trusted proxy proof contract are available for the
   authentication request wrapper. Direct app-port requests, spoofed forwarding
   headers, and missing guard-store state must have a stable fail-closed outcome
   before NextAuth parses a request body.

## Safe next slice

Until the gates above are satisfied, only documentation, contract review, and
non-mutating test coverage are safe. The next implementation slice is the
reviewed schema/migration and route integration on top of PRs #199 and #202,
followed by focused tests and wiki synchronization. It must not create
production rows, rotate secrets, install Caddy/systemd assets, or change the
live authentication path before the broker and database-authority evidence is
accepted.

## Verification boundary

This handoff intentionally contains no secret values, private topology, raw
addresses, session identifiers, limiter identifiers, or operator evidence.
Production verification must use stable pass/fail and readiness codes only.
