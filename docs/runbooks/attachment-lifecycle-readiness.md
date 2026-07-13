# Attachment lifecycle readiness (Issue #165)

This runbook is a public-safe handoff for the attachment lifecycle hardening
lane. It records the current application contract and the evidence needed by a
later broker-controlled implementation. It does **not** delete files, mutate
attachment rows, run a production purge, inspect host storage, or claim that a
dependency is deployed.

## Current state on `origin/main`

The current application has two attachment write paths:

- `uploadDocumentAttachment()` writes a bounded, MIME-allowlisted file under
  `storage/attachments/<workspaceId>/<uuid>-<safeFileName>`, creates the
  `Attachment` row, appends a Markdown link, creates a document version, and
  records audit entries in one database transaction. If that transaction
  fails, the newly written file is removed.
- `uploadPastedDocumentImageAttachment()` uses the same permission, size,
  MIME, and storage rules but deliberately creates only the attachment row and
  `attachment.uploaded` audit entry. The editor later persists the Markdown
  link when the document is saved.

Reads are workspace/document-ACL checked. Missing local bytes are normalized to
`ATTACHMENT_NOT_FOUND`/HTTP 404, and the Markdown preview allowlist prevents a
stale internal attachment URL from creating a browser request. The production
Compose `web_storage` volume preserves bytes across container replacement.

The archived-document purge currently deletes the `Document` row (and the
cascaded `Attachment` metadata) but does **not** remove attachment files from
`storage/attachments`. Clipboard uploads that are never committed to a saved
document also have no expiry or reconciliation job. These are the lifecycle
gaps tracked by Issue #165; they are intentionally not changed by this
preparation slice.

## Implemented preparation primitives

The preparation slice now supplies two reusable, side-effect-free boundaries:

- `lib/attachments/storage-key.ts` validates the canonical
  `<workspaceId>/<uuid>-<safeFileName>` key, rejects absolute/parent paths and
  Windows separators, checks the owning workspace, and resolves a path only
  after containment validation. The attachment service uses this guard for
  every write and read, so malformed persisted rows fail closed with
  `ATTACHMENT_STORAGE_KEY_INVALID` (the HTTP route normalizes it to the same
  non-enumerating 404 used for missing bytes).
- `lib/attachments/lifecycle-inventory.ts` accepts attachment metadata rows
  and a broker-provided file manifest and returns stable, sorted classifications
  (`referenced`, `missing-bytes`, `orphan-bytes`, `invalid-key`) plus aggregate
  counts. The returned `mutationAllowed` flag is permanently `false`; the
  primitive never queries Prisma, reads the filesystem, deletes bytes, or
  changes rows.

The inventory caller remains responsible for sourcing both inputs from the
attested candidate snapshot described below. Do not pass a live production
volume or publish the returned keys/entries to a public issue or PR comment.

## Dependency gates

The checked-in contract is
`deploy/attachments/attachment-lifecycle-readiness-v1.json` and is parsed by
`lib/attachments/lifecycle-contract.ts`. The parser validates canonical order
and rejects unknown or sensitive-looking fields; it does not assert deployment
status.

| Phase | Mode | Required dependencies | Allowed scope |
| --- | --- | --- | --- |
| A | `PREPARATION_ONLY` | Issues #2, #4, #5, #6 and Leaf 13B database authority | Read-only row/file inventory, storage-key validation, dry-run reconciliation |
| B | `CANDIDATE_ISOLATED` | Phase A plus Issue #164 provider-policy v2 | Quiesce candidate writes, manifest DB rows and bytes, isolated restore only |

No production delete or scheduler may be enabled until the dependency owners
provide a signed broker attestation for the exact release, database authority,
and storage volume. The Issue #164 dependency is specifically for the v2
policy around AI/history references; it is not a reason to send attachment
bytes to a provider during this preparation phase.

## Read-only preparation procedure

Run the following against a broker-provided candidate snapshot, never against a
live production checkout or a caller-selected host path:

1. Pin the exact application image and migration ledger. Do not use a floating
   tag or a working tree as the source of the inventory code.
2. Read attachment metadata with document/workspace identity and aggregate
   counts only. Do not export file names, document titles, user identifiers,
   URLs, or attachment bytes to public issue/PR comments.
3. Enumerate regular files below the fixed attachment root and validate that
   each relative key is workspace-scoped, contains no `..`, symlink, absolute
   path, or unexpected top-level entry. Record only counts and SHA-256 values
   in the restricted evidence store.
4. Compare the DB-key set with the file-key set and produce a dry-run
   classification: `referenced`, `missing-bytes`, `orphan-bytes`, or
   `invalid-key`. A classification is evidence, not permission to delete.
5. Re-run the same manifest calculation to prove deterministic output. Any
   change while writes are not quiesced is a failed preparation check.

The preparation command must be idempotent and side-effect free. It must not
call the purge CLI, alter the Prisma schema, create a migration, or write to
the production `web_storage` volume.

## Candidate-only continuation

After the dependency attestation is available, the isolated candidate flow is:

1. Quiesce attachment and document writes through the release broker and record
   the quiesced epoch.
2. Capture the database snapshot and attachment-byte manifest from the same
   epoch. The manifest is signed by the broker; credentials and private keys
   stay outside the repository and issue tracker.
3. Restore both into an isolated candidate volume. Recalculate the manifest,
   check the ACL/document/workspace relationship, and exercise read paths with
   synthetic identities only.
4. Review the dry-run classes and an explicit rollback receipt. No candidate
   result authorizes a production deletion by itself.

The eventual implementation must make cleanup idempotent, record an
attachment-specific audit/journal event, keep a retryable quarantine for files
whose DB authority is uncertain, and prove that a concurrent upload cannot be
deleted by a stale purge pass. Those guarantees belong to the later mutation
leaf after the database and broker gates are live.

## Explicit deferrals and unknown-unknown checks

- orphan-byte garbage collection after archived-document purge;
- expiry/quarantine for pasted images whose editor draft is abandoned;
- storage-volume/database backup consistency and restore ordering;
- symlink, path traversal, duplicate-key, and case-folding collisions in a
  future file inventory;
- concurrent upload versus purge races and retry semantics;
- references from AI/chat history or provider payloads (v2 after Issue #164);
- key rotation, signed manifest custody, and production scheduling.

Until those questions have an attested owner and candidate evidence, Issue #165
remains open and the implementation remains preparation-only.

## Verification

```bash
pnpm exec vitest run tests/attachments/lifecycle-contract.test.ts --reporter=dot
pnpm exec vitest run tests/attachments/storage-key.test.ts tests/attachments/lifecycle-inventory.test.ts tests/attachments/route.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Relevant current source evidence is `lib/attachments/service.ts`,
`app/api/attachments/[attachmentId]/route.ts`,
`lib/documents/purge-archived.ts`,
`components/document-editor/markdown-preview.tsx`, and the attachment/purge
tests. No restricted operational evidence is stored in this repository.
