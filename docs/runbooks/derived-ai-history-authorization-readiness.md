# Derived AI history authorization readiness

Issue #163 is a dependency-gated readiness handoff for reauthorizing
Workspace AI history. This document is public-safe contract evidence only. It
does not change the schema, API routes, retention jobs, or production
behavior.

## Why this leaf is required

`AiChatThread` and `AiChatMessage` retain user questions, assistant answers,
conversation memory, and citation metadata. The current thread route checks
the actor's active workspace membership, but an answer that was generated from
a document can outlive the document permission that made that answer safe to
show. A citation link alone is not an authorization check: the answer body and
the rolling `memorySummary` can also contain derived document content.

The current service therefore remains a source-backed history producer, not a
claim that historical answers are permanently safe to replay. This branch
intentionally does not add a second authorization source or a best-effort
redaction path.

## Required lineage contract

Every persisted conversation turn must have an explicit, auditable lineage
classification before the runtime can replay it:

- **Source-backed** turns identify the saved-document/chunk sources used for
  retrieval or prompt context. Replaying the turn requires current actor
  authorization for every source that could have contributed content.
- **Source-free** turns prove that no saved document, attachment, or inherited
  memory source contributed content. They still require current workspace
  membership and the canonical actor/session authority.
- **Unproven legacy** rows, including rows whose source or memory lineage cannot
  be reconstructed, are not replayable. They are hidden irreversibly from
  history and follow-up context; this is a read-path decision, not a destructive
  purge.

The exact persisted field/table shape is intentionally left to the rebased
implementation after the dependency gates below. `citations` and
`contextMeta.citationChunkIds` in the current schema are useful evidence but
are not sufficient proof that all answer content came from those sources.

## Reauthorization points

The canonical authority must be applied at every point where derived content
could become visible or influence a new answer:

1. **Thread load** (`GET /assistant/thread`): authorize the workspace and
   filter each persisted turn before returning it. A denied or unproven turn
   is represented by a non-enumerating tombstone with no answer text,
   citations, source ids, title/path, counts, or denial reason.
2. **Follow-up preparation** (`POST /assistant/messages`): build conversation
   context only from currently authorized turns. A hidden turn must not remain
   in raw recent messages, retrieval query text, or memory refresh input.
3. **Memory refresh**: summarize only authorized source-backed turns and
   authorized source-free turns. A memory summary that contains a denied source
   is itself denied; it must never be used as an authorization shortcut.
4. **Finalization/persistence**: recheck authority immediately before a
   streamed or non-streamed answer is committed. A revocation race fails
   closed or stores an explicitly source-free turn; it must not commit a turn
   whose source proof is stale.
5. **Citation navigation**: source links are returned only for documents that
   pass the same current authorization check. The UI must not infer access
   from a historical citation label or document id.

The tombstone response must be shape-stable and non-enumerating. It must not
reveal whether a denied source existed, how many turns were denied, which
document changed, or whether the actor ever had access.

## Dependency gates

No runtime implementation, schema migration, data backfill, or production
activation may start from this branch until all of the following are merged
and available on the rebased branch:

1. **Leaf 2** supplies the canonical database-time active-membership/session
   authority, including revocation semantics.
2. **Leaf 4** supplies the AI output/egress boundary so history replay and
   memory refresh cannot bypass the approved answer-output policy.
3. **Leaf 6** supplies the durable document/resource authorization contract
   used for current source checks; do not fall back to a direct membership or
   citation-only check.
4. **Leaf 13B** supplies the immutable database/migration authority and the
   approved migration prefix/checksum admission. The future lineage migration
   must be admitted by that contract before any deploy candidate can qualify.

The production runtime/broker gate (Leaf 13A/13B follow-up) remains a separate
deployment prerequisite. This leaf does not request broker installation,
snapshot/restore work, retention purge, or deletion of legacy rows.

## Implementation handoff after the gates

After rebasing on the dependency contracts, implement in this order:

1. Define and migrate the lineage record with an expand/contract-safe,
   append-only migration accepted by Leaf 13B.
2. Add one shared reauthorization helper that consumes the canonical actor,
   workspace, document, and source/chunk authority; do not duplicate policy in
   the thread route, memory summarizer, or UI.
3. Apply the helper at thread load, follow-up context construction, memory
   refresh, finalization, and citation serialization.
4. Add regression coverage for revocation, removed membership, source-free
   turns, unproven legacy rows, hidden memory, citation non-enumeration, and a
   revocation race during stream finalization.
5. Run the dependency-specific migration/runtime gates and a production-safe
   read-only verification before enabling the behavior.

## Acceptance matrix

| Scenario | Required result |
| --- | --- |
| Actor loses access to one source document after an answer | The whole derived turn is a non-enumerating tombstone; no body/citation/source metadata is returned or reused. |
| Actor loses active workspace membership | Thread load, follow-up, reset, and citation navigation fail through the canonical membership authority. |
| Source-free answer with current membership | Visible only when its source-free proof is present; it must not inherit access from an old source-backed turn. |
| Legacy row with missing or ambiguous lineage | Hidden irreversibly from replay and follow-up; no migration-time guess is allowed. |
| Hidden turn appears in a rolling memory summary | The summary is denied and excluded from retrieval/prompt input. |
| Document permission changes during streaming | Finalization rechecks authority and fails closed or records a proven source-free turn. |
| Citation points at an unreadable document | Citation is omitted/denied without revealing the document's existence or prior access. |
| Retention or destructive purge | Out of scope for Issue #163; handled by the owning retention/backup leaves. |

Until these conditions can be verified on the dependency-complete branch, the
safe state is documentation-only readiness and no production change.
