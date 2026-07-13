# Auth abuse controls and session revocation readiness

Issue #162 (`issue-162-security-auth-abuse-sessions`) is intentionally a
readiness handoff on the current release line. This note records the public-safe
dependency state; it is not an activation approval and does not authorize
production mutations.

## Current state

- `origin/main` (`545e8cb`) has the Leaf 1 authentication runtime and the
  bounded, process-local password work guard, but it does not yet have a
  database-authoritative authentication limiter or revocable session registry.
- `User` has no `authDisabledAt` or `sessionVersion` authority on this branch.
  The existing Auth.js `Session` table is not the runtime authority because
  `lib/auth/config.ts` uses encrypted JWT sessions.
- `lib/auth/downstream/leaf2.ts` currently exposes a no-op durable-state hook;
  the deny-only security-journal and support-grant contracts required for
  access-reduction invalidation are not available on the dependency line.
- The auth abuse design requires the Leaf 13 private binding, database-role,
  host-edge, and broker attestation gates before any limiter/session migration
  or authentication-route wrapper is activated. Those capabilities are tracked
  separately by Issues #184 and #185 and remain draft/uninstalled on the target
  host.
- Leaf 1-owned auth configuration, password verification, adapter, and
  session-image paths are protected seams. This branch does not edit or claim
  them, and it does not add a second local limiter or session decoder.

## Required gates before implementation

Rebase this branch against the dependency commits and collect the following
public-safe evidence before implementing the first schema or route task:

1. Leaf 2 has merged and deployed the canonical `authDisabledAt`, BigInt
   `sessionVersion`, support-access, and same-transaction deny-only journal
   contracts. The journal replay ownership map must remain disjoint from the
   Issue #162 credential/OAuth/session reducers.
2. Leaf 13 has a verified private Web binding and database role, and the
   delivery broker has an attested host installation/trust path. The production
   host must report the broker policy/socket readiness without exposing
   credentials or logs.
3. The exact runtime image, migration identity, owner map, and protected Leaf 1
   hook slot are pinned on the rebased branch. No migration may create a second
   disabled-user or session-version authority, and no route may call a process
   memory fallback when PostgreSQL is unavailable.
4. The canonical origin and trusted proxy proof contract are available for the
   authentication request wrapper. Direct app-port requests, spoofed forwarding
   headers, and missing guard-store state must have a stable fail-closed outcome
   before NextAuth parses a request body.

## Safe next slice

Until the gates above are satisfied, only documentation and contract review are
safe. The first implementation slice after rebasing should be the exact schema
and strict runtime contract, followed by focused tests and wiki synchronization.
It must not create production rows, rotate secrets, install Caddy/systemd
assets, or change the live authentication path.

## Verification boundary

This handoff intentionally contains no secret values, private topology, raw
addresses, session identifiers, limiter identifiers, or operator evidence.
Production verification must use stable pass/fail and readiness codes only.
