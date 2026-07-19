# Invite-first signup gate readiness

Status: dependency-safe preparation for Issue #161. This document is a public
contract and review aid; it is not an activation or production acceptance
record.

## Scope

The checked-in contract at
`deploy/security/signup/invite-first-readiness-v1.json` records the Leaf 7
handoff boundary. The parser in `lib/auth/invite-readiness.ts` is
side-effect-free and fail-closed: it accepts only the exact public contract and
returns an immutable preparation value. It does not enable signup, read
production state, accept a capability, or create an account.

The requested production mode is `invite`; until every prerequisite is
independently attested, the effective mode remains `closed`. The current branch
does not add invitation tables, attempt cookies, link grants, routes,
middleware, OAuth behavior, or migration files.

## Dependency gate

The following evidence must be available on a rebased branch before the Leaf 7
implementation can start:

| Capability | Tracking issue or branch | Required evidence | Current state |
| --- | --- | --- | --- |
| Leaf 1 auth runtime | merged Leaf 1 release (`auth-runtime-fail-closed@1`) | Exact linked-account login and closed password/unlinked-provider signup contract is deployed and attested | prerequisite; recheck on target release |
| Leaf 2 journal/auth tombstones | Leaf 2 owner assignment in the hardening program | DB-time membership authority and deny-only journal append/replay contract | not available on `origin/main` |
| Leaf 8 abuse/session controls | [#162](https://github.com/dschoi30/munjib/issues/162), `issue-162-security-auth-abuse-sessions` | Shared bounded guards, registry/session validator, and signed capability | open |
| Leaf 13B private runtime | [#180](https://github.com/dschoi30/munjib/issues/180) / [#184](https://github.com/dschoi30/munjib/issues/184), `issue-184-security-immutable-runtime-gate` | Exact-digest candidate, database-role admission, and promotion/rollback gate | open; draft PR |
| Leaf 13A delivery broker | [#185](https://github.com/dschoi30/munjib/issues/185), `issue-185-delivery-substrate-install` | Root-installed broker, trust bootstrap, and independent socket/policy attestation | open; host installation blocked |

Issue #161 remains open until those gates are satisfied. A green contract test
does not prove that signup is enabled, a capability is valid, an invitation was
issued, or production is ready.

## Future implementation boundary

After the dependency gate, the implementation must preserve these public
invariants:

- New accounts use provider-verified Google identities and one active
  workspace-scoped invitation; password signup remains closed.
- A raw invitation bearer may exist only in a client-side URL fragment for the
  immediate exchange and must be scrubbed before navigation/history persists
  it. It must never enter a request or server-visible URL, cookie, database,
  server component prop, history entry, log, telemetry payload, or OAuth
  callback. Only a short-lived opaque attempt cookie and its domain-separated
  hash may cross the exchange boundary.
- Invitation consumption, attempt invalidation, role checks, and the deny-only
  journal transition are one atomic transaction. Invitation acceptance never
  grants `OWNER`.
- Control of an invitation or a matching email is not proof of an existing
  password account. Unauthenticated OAuth collisions must not perform blind
  email linking or create partial rows.
- Every success and error response is private and `no-store`; bounded body,
  canonical Origin, and Fetch Metadata checks are inherited from Leaf 8 rather
  than reimplemented locally.

The Leaf 7 branch may claim only its reserved downstream slot and its own
invitation/link modules after rebasing on the deployed prerequisites. It must
not edit Leaf 1 core auth paths, recreate Leaf 8 guards, or activate an edge
handler before the corresponding owner contract is admitted.

## Public evidence boundary

Commits, issue comments, and PR descriptions may include only contract version,
stable check names, test results, and dependency references. Do not publish
credentials, bearer values, cookies, provider payloads, database URLs, host
names, row IDs, attachment paths, capability contents, or restricted planning
material.

## Verification

Run the preparation checks from the isolated worktree:

```bash
pnpm exec vitest run tests/auth/invite-readiness.test.ts tests/security/invite-signup-readiness.test.ts --reporter=dot
```

The later implementation must add independent browser/privacy, race,
database, and rollout evidence before this status can change from
`PREPARATION_ONLY`.
