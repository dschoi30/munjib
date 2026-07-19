# Leaf 7 invite token primitives

Tracking: [Issue #161](https://github.com/dschoi30/munjib/issues/161) · branch
`issue-161-invite-token-primitives`

This implementation slice establishes the credential boundary needed by the
invite-first signup gate. It is preparation only: it does not add invitation
tables, routes, middleware, OAuth behavior, signup activation, migrations, or
production mutation.

## Boundary

- `createInvitationBearer()` produces one 256-bit random bearer for the future
  manager response boundary. It is canonical unpadded base64url and contains no
  workspace, revision, email, or URL data.
- `hashInvitationBearer()` applies the domain
  `munjib/invitation-bearer/v1` and SHA-256. Durable invitation state must store
  only this fixed-length digest.
- `createAttemptSecret()` produces a separate 256-bit random secret. The
  attempt cookie serializer accepts and returns only that canonical opaque
  value; cookie names and attributes remain the route layer's responsibility.
- `hashAttemptSecret()` applies a distinct domain
  `munjib/invitation-attempt/v1` before persistence.
- `parseInvitationExchangeBody()` accepts exactly one bounded `bearer` field and
  rejects ids, revisions, metadata, and unknown fields. The returned object is
  immutable.

All validation errors use stable generic messages and never echo bearer or
attempt values. The module has no URL, response, database, logging, telemetry,
OAuth, or route dependency, so later Leaf 7 code can compose it behind the
Leaf 8 exchange guard without recreating the guard.

## Dependency gate

The production effective signup mode remains closed until the Leaf 2 journal,
Leaf 8 abuse/session capability, exact private runtime, and attested delivery
broker are independently available. This branch does not claim those gates or
enable signup. Invitation lifecycle, atomic consumption, revision invalidation,
provider linking, and browser fragment scrubbing remain follow-up work in the
same issue.

## Verification

```bash
pnpm exec vitest run tests/auth/invite-token.test.ts --reporter=dot
pnpm exec tsc --noEmit
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

The tests cover canonical 256-bit generation, domain-separated stable hashes,
constant-time hash comparison, cookie round trips and attribute rejection,
exact exchange-body shape, immutable output, and the absence of raw credentials
from the hash-only persistence envelope.
