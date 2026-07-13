# Document authorization closure readiness

Issue #160 (`issue-160-security-document-acl`) is a dependency-gated
readiness handoff. This document records the public-safe boundary and the
evidence required before document ACL closure is activated; it does not grant
access, change authorization behavior, or authorize a production migration.

## Current baseline

The current `main` runtime has document-level explicit permissions for the
normal document service, workspace page filtering, wiki-link panels, Ask AI,
Workspace AI, comments, and attachment reads/writes. The following paths still
need one shared active-resource and ACL authority before they can be closed as
one contract:

- folder rename/move/cascade operations must authorize every active descendant
  document before changing any row;
- broken-link document creation must verify the source document's current read
  and write authority, not only workspace write access;
- attachment, comment, version, audit, and history reads must re-check the
  current active workspace/document and document permission at the boundary;
- server-rendered document data must expose only the current-view fields, with
  history loaded through authenticated, bounded pages;
- explicit permissions must be evaluated only for the actor's current,
  same-tenant subject tuples and capped by the actor's workspace role.

These are documented gaps in the current baseline, not an authorization
fallback to be patched independently. A direct membership lookup or a second
permission helper would create competing authorization sources.

## Required dependency gate

Implementation can start only after the owning active-resource boundary
capability is available and verified. The dependency must provide:

1. database-time active workspace/document resolution for the actor;
2. a transaction-safe membership/active-state lock boundary shared by reads and
   mutations;
3. a single document-access seam that can be consumed by folder, broken-link,
   history, attachment, comment, and AI callers;
4. a production candidate attestation proving that the same authority is
   present in the promoted runtime.

After that gate, rebase this branch on the dependency, implement the ACL
closure in its owning leaf, and add the corresponding focused and route-level
tests. Until then, this branch intentionally contains no schema change,
authorization mutation, journal write, purge, attachment lifecycle change, or
production operation.

## Verification handoff

The next implementation pass should verify, with synthetic fixtures only:

- restricted source documents cannot create or repair broken-link targets;
- mixed-ACL folder descendants reject the whole transaction with zero writes;
- role ceilings prevent explicit grants from exceeding the actor's workspace
  role;
- archived or inactive workspaces/documents cannot be read or mutated through
  direct attachment, comment, history, version, or AI routes;
- unreadable resources reveal no count, cursor, internal id, or historical
  content;
- current-view and history DTOs contain only fields needed by their rendering
  surface and never expose storage keys or full Prisma rows.

No production snapshot, purge, secret, private incident evidence, or raw
document content belongs in this handoff.
