# Active-resource boundaries readiness

Issue #159 is intentionally gated until its authority providers are available.
This note records the public-safe handoff state; it is not an activation or a
production authorization.

## Current state

- No application read or mutation path is changed by this preparatory branch.
- The active-resource resolver must consume the canonical database-time,
  two-argument workspace-membership authority from the authentication/journal
  dependency. The current release does not provide that authority yet.
- Archive locking must include the optional support-access grant row and use the
  fixed `Workspace -> WorkspaceMember -> SupportAccessGrant -> Folder ->
  Document` order. Those grant and journal contracts are not present in the
  current schema/API baseline.
- The downstream document-access and production-readiness slots remain
  reserved for their designated leaf owners. No implementation is allowed to
  claim or republish either slot before the owning dependency is merged.

## Required gate before implementation

The following evidence must be available on the rebased branch before Task 1
can safely add production resolver/lock callers:

1. The canonical two-argument active-membership resolver is migrated, tested,
   and exposed through its owning leaf contract.
2. Support-access expiry/revocation semantics and row identity are available
   to the transaction lock helper.
3. The deny-only security-journal append contract is merged and callable from
   the same transaction as archive state changes.
4. The immutable runtime/broker gate can attest the candidate migration and
   database authority before any archive code is activated.

Once these gates are satisfied, rebase this branch and implement the resolver,
deterministic locks, non-enumerating integration matrix, and protected-slot
hashes in the Task 1 order. Until then, keeping the branch documentation-only
prevents a direct-membership fallback from silently becoming an authorization
source.
