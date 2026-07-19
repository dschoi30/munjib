# Derived AI history authorization readiness

Issue #163's implementation slice is intentionally dependency-gated. This
runbook records the safe boundary for derived Workspace AI history; it does
not activate a route, migration, purge job, provider call, or production
mutation.

## Current implementation boundary

- `lib/rag/ai-history-authorization.ts` parses only explicit v1 source-backed
  document/chunk lineage and explicit `source-free-v1` proof.
- Missing, malformed, or legacy context metadata is `legacy-unproven` and
  fails closed to a non-enumerating tombstone.
- Source-backed turns require every source to pass a caller-supplied canonical
  source-authority callback. One denied source hides the whole turn.
- Tombstones omit internal message ids, timestamps, answer text, citations,
  source ids, context metadata, model ids, counts, and denial reasons.
- The serializer scopes tombstones to derived `ASSISTANT` rows. Normal
  user-authored `USER` questions remain visible and never inherit a detached
  assistant decision.
- A `source-free-v1` assistant row is visible only when citations are null or
  empty and `contextMeta` contains only the exact lineage proof. Mixed-writer
  or partial-migration rows that retain citation/source metadata fail closed
  to a tombstone.
- Source-backed rows likewise fail closed when context metadata extends beyond
  the authorized lineage or a citation names a document/chunk absent from it.
  The lineage object and each source entry must also match the exact v1 schema;
  nested title/path/denied-source fields are not serialized.
- Source-backed citations expose only authorized `documentId` and optional
  authorized `chunkId`; persisted titles, paths, headings, and arbitrary extra
  fields are unverifiable here and therefore tombstone the row.

The helper imports no Prisma client, route code, retention/purge code,
provider SDK, telemetry, or direct membership/permission lookup.

## Required activation gates

Runtime callers remain out of scope until the rebased branch has all of these
verified contracts:

1. Leaf 2's database-time active-membership/session authority, including
   revocation semantics.
2. Leaf 4's approved AI output/egress boundary for replay and memory refresh.
3. Leaf 6's canonical document/resource authorization seam.
4. Leaf 13B's immutable migration/source admission and promoted runtime
   attestation.

After those gates, the owning implementation must wire the same decision
helper into thread load, follow-up context, memory refresh, finalization, and
citation serialization, with revocation-race coverage. No direct membership
fallback or citation-only inference is permitted.

For streamed assistant responses, authorization must be established before any
token is emitted. The implementation must either reauthorize immediately before
each token is exposed (not only once per stream), or buffer the entire response
until a final authority recheck succeeds before releasing any token. A
finalization-only check after `onToken` is insufficient because a source can be
revoked between tokens.

The eventual thread DTO must not add a hidden-message count, denied-source
count, or other aggregate that lets a caller enumerate hidden history. This
slice only defines the per-row tombstone shape; list-level filtering/count
behavior remains an integration acceptance criterion for the dependency-
complete owner.

## Public-safe evidence

Focused contract coverage is in
`tests/rag/ai-history-authorization.test.ts`. Tests use synthetic identifiers
only; production answer text, document content, secrets, snapshots, and raw
telemetry are not part of this handoff.
