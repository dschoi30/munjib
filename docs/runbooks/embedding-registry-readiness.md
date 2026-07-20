# Embedding profile registry readiness

Issue #139 is split into a dependency-safe contract slice and a later data
operation. This runbook records the public handoff for the contract slice; it
does not authorize a profile switch, a migration, or a production operation.

## Current contract

`lib/rag/embedding-registry.ts` defines a server/client-safe description of an
embedding profile. It contains provider, model, dimensions, a versioned profile
id, and the legacy vector index id. It deliberately contains no API key, base
URL, database id, workspace id, or runtime availability claim.

The registry currently contains only the existing Ollama `bge-m3` / 1024
profile. Its legacy `indexId` remains `bge-m3`; the existing
`CURRENT_EMBEDDING_INDEX` and all live retrieval/indexing callers are unchanged.
The versioned profile id is a forward-looking identity for future settings and
backfill work, not a replacement for the current pgvector identity.

The pure helpers provide:

- strict 1024-dimension validation for future profiles;
- deterministic profile ids for provider/model/dimension triples;
- lookup by profile id or provider/model/dimension identity; and
- filtering by an externally supplied provider-availability map.

Provider availability is input-only. The helper does not inspect environment
variables, resolve credentials, call a provider, or activate a profile.

## Dependency gate

The following work remains intentionally out of this branch:

1. A `WorkspaceAiSettings` row with desired/active profile and index status.
2. Schema migration, default-row backfill, or status writes.
3. Embedding-only runtime activation, `DocumentChunk` backfill, reindex, or
   mixed-index retrieval changes.
4. Settings UI, provider activation, production rollout, or secret handling.

Those operations require the immutable runtime/delivery broker gates (#184 and
#185), the Leaf 13B database authority/migration slot, and an explicitly owned
maintenance role. A green registry test is not evidence that a workspace has
been reindexed or that a new provider is available.

## Promotion checklist for the next slice

Before adding runtime or schema behavior, the rebased branch must provide:

- an accepted exact-digest runtime and delivery-broker attestation;
- a reserved migration slot and database-time maintenance authority;
- a provider contract that proves the returned vector dimension;
- an active/desired/status transition journal with crash-safe rollback; and
- focused tests proving retrieval never mixes profile identities.

Until those checks exist, add new profiles only as reviewed registry metadata
and keep the current `bge-m3` profile active.

## Evidence boundary

Public commits and issue comments may contain profile ids, dimensions, stable
check names, and test results. They must not contain provider credentials,
base URLs, database URLs, workspace/document values, host details, or raw model
responses. Restricted production plans and operational evidence remain
local-only.

## Verification

```bash
pnpm exec vitest run tests/rag/embedding-registry.test.ts tests/rag/model-config.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```
