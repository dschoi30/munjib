# Security Attachment Lifecycle Implementation Plan

**Tracking:** Issue #165 · remote branch `issue-165-security-attachment-lifecycle`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve explicit image import while making attachment validation, quotas, authorization, storage, egress, and deletion durable and fail closed.

**Architecture:** The application creates quota-reserving `PENDING` rows, but Web never mounts attachment storage, imports the native storage addon, or imports Sharp/libvips after Child A v1. A no-network/no-database Unix-socket storage authority alone owns the retained root descriptor and native openat2/no-follow/no-replace/fsync operations. Web's exact peer UID may request bounded verified READ or a CREATE_NOREPLACE workflow only. Every local upload, clipboard/data image, legacy backfill, and remote import is decoded, canonically re-encoded, and reprobed by a credential-free, no-network, no-database one-shot media canonicalizer. The storage authority opens the exclusive output FD, passes it to that one-shot process, verifies the process/cgroup is empty before same-FD adoption/sealing, and returns a signed canonical receipt; no writable FD may survive. Leaf 11 ships as two monotonic child releases: Child Release A publishes `attachment-integrity-lifecycle@1` with expand-only schema, storage/canonicalizer authorities, resumable backfill tooling, canonical legacy conversion, and fail-closed readers; Child Release B is cut only after v1 production convergence and the deployed Leaf 10 `20260712060000_ai_provider_policy` migration, allocates a later repository-monotonic contract migration, and prepares explicit import, an exclusive attested raw-fetch lifecycle, and durable logical deletion. Only a final activation after Tasks 4–7 publishes `attachment-integrity-lifecycle@2`. Physical deletion uses a distinct UID/socket/operation and an independently signed remote-journal fence. `DELETE_PENDING` reserves `deletingBytes` until verified absence and finalization. Issue 11 exports only candidate-scoped attachment readiness leaves; Issue 14 owns signed recovery composition through the existing Leaf 5 reservation.

**Tech Stack:** Next.js App Router and Server Actions, React 19, Prisma 6/PostgreSQL, Node.js 22, Sharp, Docker Compose, nftables, Vitest, Playwright.

## Global Constraints

- Dependency order is exact: Child A rebases on merged Issues 2, 4, 5, 6, and 13.
  Child B is not created, rebased, or assigned a contract migration until Child A v1
  has deployed and produced signed convergence evidence and Leaf 10 migration
  `20260712060000_ai_provider_policy` has deployed. It then allocates an identifier
  strictly greater than every migration present on current `main`. Attachment core
  imports only Issue 5 purge-readiness types and never imports Issue 9 or Issue 14.
- Remote imports allow only effective HTTP port 80 and HTTPS port 443. Reject URL credentials, alternate ports, protocol-relative URLs, redirects, and every special IPv4/IPv6 destination.
- A rich HTML remote image is staged with count and origin. No browser or server fetch occurs before explicit confirmation. A plain image URL remains a link until `Import as image` is selected. AI output uses the same explicit importer.
- Explicit confirmation invokes one authenticated Server Action. That action establishes the current user, locks and authorizes the active writable document, creates the quota-reserving `PENDING` row, and only then sends the URL to the worker. The former paste-before-auth compatibility path (`fetchPastedImageUrl`, a URL-taking `pasteDocumentImageAttachmentAction`, or equivalent) is deleted and source-contract tests forbid its return.
- Persisted Markdown contains only `/api/attachments/<id>` after import. Original remote URL path/query is never persisted, logged, traced, audited, or emitted to telemetry.
- Before confirmation, a raw remote URL may exist only in the Issue 4 click closure/
  post-click request and a module-private `WeakMap`; serializable candidate React state
  and DOM contain only opaque id/origin. After confirmation it exists transiently only
  in one `FormData`, the Server Action local, one bounded app-to-fetcher request, and
  fetcher/canonicalizer pipe memory. It never enters a DB field, filename, redirect,
  audit, telemetry, log, long-lived server state, or serialized client state.
- Clipboard `File` and `data:` images may upload immediately, but every image is checked by magic bytes, full decode, bytes, width, height, pixels, and animation frames.
- Every accepted image is decoded and canonically re-encoded before storage by the
  one-shot media canonicalizer, never Web or the raw fetcher. Re-encoding applies
  orientation, converts pixels to sRGB, uses pinned per-format options, and strips
  EXIF/XMP/IPTC/ICC profiles, comments, filenames, thumbnails, unknown ancillary/
  application chunks, and trailing/polyglot bytes. No `keepMetadata`/`withMetadata`
  path is allowed. The canonical output is independently re-probed and must satisfy the
  byte/dimension/pixel/frame limits.
- The canonicalizer is authoritative for bytes, and Web is authoritative only for
  authenticated authorization/quota state plus strict receipt validation. Quota,
  `size`, MIME, extension, and `contentSha256` derive from the signed canonical receipt
  and a same-FD storage-authority verification. Web bounds framing, validates the exact
  receipt signature/container/MIME/size/hash, and never imports Sharp/libvips or the
  native storage addon. Pending and READY responses use only bounded verified READ over
  the storage-authority socket; no Web response reopens or pathname-streams storage.
- The egress worker receives only a remote URL plus non-secret limits. It has no database, auth, provider, telemetry, cloud, Docker, host, or application credentials and cannot reach PostgreSQL, trusted service networks, cloud metadata, provider control planes, the host network, or the Docker socket.
- The remote worker only fetches bounded undecoded raw bytes and streams them to the
  same one-shot canonicalizer. It contains no Sharp/libvips or storage API. Local upload,
  clipboard/data, backfill, and remote-import paths cannot bypass that canonicalizer.
- URL validation and the firewall are independent controls. DNS results are checked in full, one approved address is pinned for the request, redirects are denied, and one total deadline covers DNS, connect, TLS, headers, and body.
- The app revalidates worker-returned bytes and reauthorizes an active writable document in the finalization transaction. The worker never makes authorization decisions.
- `PENDING` reserves quota atomically, is bound to uploader and document, is unavailable on the normal route, and expires after `MUNJIB_ATTACHMENT_PENDING_TTL_HOURS` (default `24`). `READY` is active-document authorized. `DELETE_PENDING` is unreadable and owns the durable unlink retry. `DELETED` and `FAILED` retain only minimal audit/retry metadata.
- Every production security, quota, expiry, lease, queue-claim, and retry timestamp is
  PostgreSQL statement/clock time read after the canonical locks are acquired. Caller
  `now`, `Date.now()`, and `new Date()` are allowed only through explicit test-only clock
  dependencies; production decisions never trust a process clock.
- Per-file defaults are exactly 5 MiB, 8,192 pixels per dimension, 25,000,000 decoded pixels, and 10 animation frames. Per-user remote-import concurrency defaults to 2. Workspace quota defaults to 1 GiB. All limits remain server-enforced.
- File-write/DB-failure and DB-write/file-failure paths must compensate. Storage keys are server-generated and path-confined; user names and remote URLs never choose paths.
- `contentSha256` and `size` are verified against actual stored bytes before pending preview, READY read, finalization, restore, or deletion processing. A null/mismatch row is quarantined to unreadable `DELETE_PENDING`, remains quota-charged in `deletingBytes`, and appends canonical Issue 2 `ATTACHMENT_QUARANTINED`/`ATTACHMENT_DELETE_REQUESTED` events atomically.
- Every logical delete atomically persists the returned
  `ATTACHMENT_DELETE_REQUESTED` journal sequence and entry hash as a write-once proof
  tuple. Physical deletion requires an independent signed immutable remote journal
  batch/high-water proof covering that exact tuple; a local checkpoint, caller Boolean,
  cached result, or queue provenance alone never authorizes unlink.
- Legacy image backfill canonically re-encodes before READY promotion. It either commits the canonical file, exact MIME/size/hash/quota delta, and retirement of the old bytes with crash-safe compensation, or leaves the old bytes non-servable and quarantines the row; a decode-only/hash-only legacy promotion is forbidden.
- The deletion worker and remote importer deploy disabled by default. Expired PENDING
  cleanup may create logical delete intent without destructive document authorization;
  archived-document and legacy-orphan intent require the injected Issue 5 typed
  readiness port. Physical unlink remains impossible until Leaf 14 activates the
  existing Leaf 5 `productionPurgeReadiness` reservation. No readiness Boolean exists.
- RAG chunk retention remains owned by document purge, AI message/memory retention by Issue 9, physical file retention by this issue, and audit retention by its separate policy.
- Leaf 11 is decomposed into two GitHub child issues, branches, PRs, and deployments.
  Child Release A contains Tasks 1–3 plus v1 capability/backfill tooling. Child Release
  B prepares the separately allocated contract migration and Tasks 4–7 while the Leaf 4
  external-import seam remains at version 0. Final Task 8 applies the guarded contract,
  activates that seam, and only then publishes v2. The contract migration must not
  exist in the Child A branch or image.
- Before v1 promotion, rollback may use an eligible pre-v1 digest. After `attachment-integrity-lifecycle@1` promotion, rollback to code that can serve null, mismatched, noncanonical, or unverified attachment bytes is forbidden; rollback disables writers/import/deletion while retaining an eligible v1 reader. After v2 promotion, only another eligible v2 digest or fix-forward is allowed.
- Issue 6 current-view/history core already delegates through the separately protected `lib/documents/downstream/leaf11-attachments.ts` seam. Leaf 11 transitions only that reserved path from version 0 to `attachment-integrity-lifecycle@1`; it never edits or republishes Issue 6 `lib/documents/current-view.ts` or `lib/documents/history.ts`. The activated slot returns verified `READY` attachments only. Non-image attachments are downloads with sandbox CSP; only allowlisted verified image types may render inline.
- Issue 4 safe-media/interstitial cores already delegate post-click image intent and controls through the separately protected `components/markdown/downstream/leaf11-external-image-import.tsx` seam. Child A and Child B Tasks 4–7 preserve its passive version-0 baseline. Final Task 8 transitions only that reserved path `0 -> 1`, owned by `attachment-integrity-lifecycle`, plus Leaf 11-owned helper/context/dialog files. Leaf 11 never edits, republishes, or stages Issue 4 `components/markdown/safe-media.tsx` or `components/markdown/external-media-interstitial.tsx`.
- Final Task 8 may transition the Issue 4 seam only after the merged
  `zero-ambient-media-egress@1` prerequisite includes the safe-URL/backslash closure;
  it carries forward the exact `safeMarkdownLinkHref` and renderer-core hashes and
  rejects any stale pre-fix baseline.
- After v1 promotion, Web has no attachment volume, native addon, storage root path, or
  writable attachment FD. The storage authority accepts Web's exact `SO_PEERCRED` UID
  only for bounded READ and CREATE_NOREPLACE workflow requests. Physical DELETE uses a
  distinct UID, socket, opcode, independently signed fence, and exact peer credential;
  neither Web nor the fetcher/canonicalizer can reach that operation.
- CREATE_NOREPLACE is root-descriptor confined. The authority opens an exclusive output
  FD, passes only that FD to one one-shot writer/canonicalizer, waits for its process and
  cgroup to be empty, proves no retained writable FD can survive, then adopts, seals,
  fsyncs, verifies, and publishes the same FD with no-replace semantics. A pathname
  reopen, long-lived writer, or Web-held writable FD is forbidden.
- The native Rust storage authority is built for ARM64 from an exact digest-pinned
  builder with checked `rust-toolchain.toml`, `Cargo.lock`, `--frozen --offline` or a
  verified vendor tree, a closed dependency/build-script inventory, no downloaded
  prebuild, SBOM plus audit evidence, and a runtime addon digest/self-test before its
  socket becomes ready.
- Production worker services use the exact immutable Issue 13 app image digest with provenance attestation; production base Compose contains no worker, worker profile, or `build:` path. The worker exists only in the fixed root-installed overlay.
- Production operators/deploy accounts have neither Docker-group membership, Docker-socket access, sudoers entry, nor direct helper execution. Only Leaf 13A's forced `/usr/local/libexec/munjib-release-dispatch` accepts a bounded signed lifecycle envelope with literal operation `attachment-fetch-lifecycle` and action `start|verify|stop`; it selects the internal fixed root unit, overlay, and deny policy. Direct Docker/Compose/helper operation is invalid, and the worker rejects a missing or stale root-issued start generation.
- No file from a mutable checkout or app-image filesystem is executed or copied as root. Leaf 13A's dispatcher internally resolves the separately attested deterministic `attachment-fetch-v2` OCI artifact from the signed release envelope, verifies artifact provenance plus exact app-digest/source/floor binding, and invokes the internal fixed root installer/unit. No caller install command, path, tag, artifact reference, Compose path, destination, or environment is accepted.
- The host-bundle archive parser is bounded and fail closed: only manifest-listed regular files with exact path, size, SHA-256, owner/group, mode, and destination are allowed. It rejects extra/duplicate/trailing members, absolute/traversal/empty/NUL/backslash-confusable paths, symlinks, hardlinks, sparse entries, directories, FIFO/socket/device entries, oversized archive/member/count, and any app/artifact/manifest binding mismatch.
- The worker entrypoint clears and rejects `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` and lowercase variants, `NODE_USE_ENV_PROXY`, `GLOBAL_AGENT_HTTP_PROXY`, `GLOBAL_AGENT_HTTPS_PROXY`, `UNDICI_PROXY`, and `NODE_OPTIONS`. Both remote fetch and Web-to-worker transport use direct Node core HTTP(S), strict parsing, no proxy/custom dispatcher, and explicit header allowlists.
- Export `leaf11JournalReplayReducers` for attachment quarantine, delete-request, and delete; handlers are branded-restore-only, exact attachment-target validating, idempotent, deny-only, preserve quota until verified physical deletion, and cannot append or mutate journal/checkpoint state.
- Every task follows RED -> GREEN -> an actual durable wiki page plus `wiki/log.md` delta -> all wiki install/sync/manifest/lint/sync-check gates -> commit. Secret scans use non-printing `rg -q`; ready PR checks/reviews are polled at no more than 60-second intervals and GraphQL unresolved threads block completion.
- This plan and detailed design are local-only restricted material. Remote commits must omit them, remote URL path/query values, private document content, attachment bytes, secrets, provider responses, incident evidence, and exact quarantined identities.

---

## File Structure

- Modify: `prisma/schema.prisma` — attachment lifecycle/source enums, nullable document/storage ownership, quota ledger, retry metadata, and write-once delete-request sequence/hash.
- Create: `prisma/migrations/20260712050000_attachment_lifecycle_transition/migration.sql` — canonical migration-ledger v1 expand-only lifecycle/integrity/quota schema and legacy quarantine bootstrap.
- Create: `tests/prisma/attachment-lifecycle-migration.test.ts`.
- Create: `native/attachment-storage/` — narrow Rust addon loaded only by the isolated
  storage authority; it retains the root directory descriptor and performs Linux
  `openat2`/`renameat2`/`unlinkat` operations. Web never imports it.
- Create: `services/attachment-storage-authority/` — no-network/no-DB UDS server,
  exact `SO_PEERCRED` opcode policy, CREATE_NOREPLACE/read/delete socket separation,
  same-FD one-shot adoption, and runtime addon self-test.
- Create: `services/attachment-media-canonicalizer/` — credential-free no-network/no-DB
  one-shot Sharp/libvips decoder/re-encoder/reprobe that reads/writes only inherited FDs.
- Create: `lib/attachments/storage.ts` — bounded UDS client and signed canonical-receipt
  verifier; it imports neither the native addon nor Sharp.
- Create: `rust-toolchain.toml`, `native/attachment-storage/Cargo.lock`, deterministic
  vendor/build-script inventory, SBOM/audit evidence, and exact ARM64 builder pin.
- Create: `tests/attachments/storage-linux.integration.test.ts` — descriptor-confinement,
  peer-credential/opcode, same-FD/cgroup-empty, addon digest, and syscall-race contract.
- Create: `tests/attachments/media-canonicalizer.integration.test.ts` and
  `tests/security/attachment-media-compromise-chain.test.ts` — every ingestion path
  crosses the one-shot canonicalizer; Web/fetcher contain no Sharp/native/volume escape.
- Create: `scripts/attachments/backfill-integrity.ts` and `tests/attachments/backfill-integrity.test.ts` — resumable canonical legacy conversion and exact digest/size backfill used only after v1 is live.
- Create: `lib/attachments/backfill-gate.ts`, `scripts/attachments/create-backfill-gate.ts`, `scripts/attachments/verify-backfill-gate.ts`, and `tests/attachments/backfill-gate.test.ts` — exact-key KMS-signed Child B candidate gate.
- Create in Child Release B only: a Prisma migration allocated at that child branch cut with the next repository-monotonic UTC migration id and suffix `_require_attachment_integrity`; record its exact path in the child issue before implementation and never reserve/create it in Child Release A.
- Create: `deploy/security/capabilities/attachment-integrity-lifecycle.json` and `tests/security/attachment-capability.test.ts` — stable v1/v2 monotonic capability record.
- Modify: `lib/documents/downstream/leaf11-attachments.ts`, `deploy/security/protected-artifact-owners.json`, and `tests/security/document-downstream-extension-contract.test.ts` — reserved-owner `0 -> 1` activation with Issue 6 core byte-identical.
- Modify: `package.json`, `pnpm-lock.yaml` — parse5 and attachment scripts only in Web;
  native storage and Sharp/libvips remain isolated in their digest-pinned authority/
  canonicalizer build inputs and are absent from the Web importer.
- Create: `lib/attachments/validation.ts` — magic-byte, full decode, canonical re-encoding, metadata/polyglot stripping, and output limits.
- Create: `tests/attachments/image-normalization.test.ts` — deterministic canonical-output corpus and metadata/polyglot stripping.
- Rewrite: `lib/attachments/service.ts` — reserve, persist, finalize, read, and compensate lifecycle.
- Modify: `lib/documents/service.ts` — finalize referenced pending attachments in the save transaction.
- Create: `app/api/attachments/[attachmentId]/pending/route.ts` — uploader-only pending preview.
- Modify: `app/api/attachments/[attachmentId]/route.ts` — `READY` plus active-document authorization only.
- Modify: `tests/attachments/service.test.ts`, `tests/attachments/route.test.ts`, `tests/documents/service.test.ts`.
- Create: `components/document-editor/remote-image-candidates.ts` — deterministic remote candidate extraction/filtering.
- Create: `components/document-editor/clipboard-html.ts` — one bounded pure parse5 AST pass for rich-HTML-to-Markdown, data images, and remote candidates; replaces every clipboard `DOMParser` path.
- Modify: `components/document-editor.tsx` and `components/document-editor/types.ts`; create `components/markdown/leaf11-external-image-import-controls.tsx` — staged confirmation helpers prepared while the reserved seam remains version 0. Final Task 8 alone modifies `components/markdown/downstream/leaf11-external-image-import.tsx` for the `0 -> 1` explicit-import activation with Leaf 4 renderer cores byte-identical.
- Create: `tests/security/external-image-import-slot.test.ts` — reserved-owner transition, Leaf 4 core hash, no-fetch-before-confirm, and no direct renderer modification contract.
- Modify: `app/workspaces/[workspaceSlug]/actions.ts` — local pending upload and explicit remote import actions.
- Modify: `tests/components/document-editor-preview.test.tsx`, `tests/workspace-actions.test.ts`.
- Create: `tests/e2e/explicit-image-import.spec.ts`.
- Create: `services/attachment-fetch-worker/url-policy.mjs` — URL, hostname, IP, port, and DNS policy.
- Create: `services/attachment-fetch-worker/fetch-image.mjs` — pinned, redirect-free,
  deadline-bounded raw fetch that pipes undecoded bytes to the media canonicalizer.
- Create: `services/attachment-fetch-worker/server.mjs` — bounded URL-only control endpoint.
- Create: `deploy/attachments/attested-root-bundle/manifest.json`, `deploy/attachments/attested-root-bundle/munjib-attachment-egress-policy`, `deploy/attachments/attested-root-bundle/munjib-attachment-fetch-lifecycle`, and `deploy/attachments/attested-root-bundle/docker-compose.attachment-fetch.yml` — deterministic source payload for the separately attested `attachment-fetch-v2` OCI host-bundle artifact; never execute these checkout paths as root.
- Create: `scripts/attachments/build-egress-root-bundle-manifest.ts` and `scripts/attachments/verify-egress-policy.ts` — deterministic artifact/member hashes, signed forced-dispatch lifecycle schema, internal fixed-root-unit contract, and non-root policy verification. Create no leaf sudoers file.
- Create: `tests/attachments/egress-bootstrap.test.ts`, `tests/attachments/worker-lifecycle.test.ts` — OCI release binding/archive parser/install and fail-deny start/verify/stop ordering contracts.
- Create: `lib/attachments/fetch-readiness.ts` and `tests/attachments/fetch-readiness.test.ts` — fixed root-issued live worker capability verification; no Boolean enables import alone.
- Modify: `Dockerfile`, `scripts/docker/release-entrypoint.sh`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `.env.docker.example` — same Leaf 13 app image for worker code, base-production Compose with no worker/profile, fixed root-installed overlay, isolated control network, disabled defaults, and non-secret limits. The host bundle is not copied from the app image.
- Create: `lib/attachments/remote-import.ts` — app-to-worker client with repeated validation and no URL logging.
- Create: `tests/attachments/url-policy.test.ts`, `tests/attachments/remote-import.test.ts`.
- Create: `tests/attachments/worker-errors.test.ts` — bounded-body destruction, corrupt/truncated decode matrix, and fixed-code non-leakage.
- Create: `tests/attachments/worker-transport.test.ts` — proxy-env, direct-socket, content-encoding, CL/TE, redirect, and header-allowlist contracts.
- Modify: `tests/docker/compose.test.ts`.
- Create: `lib/attachments/deletion.ts` — fail-closed core logical transition, durable
  journal proof tuple, quota release, retry, tombstone, and injected authorization port;
  it does not import the Leaf 14 reservation.
- Create: `scripts/attachments/deletion-worker-adapter.ts` — the only outer adapter that
  imports unchanged Leaf 5
  `lib/retention/downstream/leaf14-production-readiness.ts`, verifies the independent
  remote fence, exact delete peer, and shared global lock, then invokes the core.
- Create: `lib/attachments/journal-replay.ts` and `tests/attachments/journal-replay.test.ts` — exact attachment restore reducers.
- Create: `scripts/attachments/process-deletion-queue.ts`, `scripts/attachments/gc.ts` — disabled worker and dry-run legacy orphan inventory.
- Modify: `lib/documents/purge-archived.ts` — enqueue physical attachment deletion before document deletion.
- Create: `tests/attachments/deletion.test.ts`, `tests/attachments/gc-cli.test.ts`.
- Create: `lib/attachments/purge-readiness.ts`, `tests/attachments/purge-readiness.test.ts` — Issue 5 type-only candidate leaf.
- Modify: `tests/documents/purge-archived-cli.test.ts`.
- Maintain after disclosure review: `wiki/Markdown Import And Clipboard Paste Workflow.md`, `wiki/Auth And Permissions Workflow.md`, `wiki/RAG Process Workflow.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

### Task 1: Add Durable Attachment States and Quota Ownership

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260712050000_attachment_lifecycle_transition/migration.sql`
- Create: `tests/prisma/attachment-lifecycle-migration.test.ts`

**Interfaces:**
- Consumes: existing `Attachment`, `Document`, `Workspace`, and `User` relations.
- Produces: `AttachmentStatus`, `AttachmentSource`, nullable `Attachment.documentId`/`storageKey`, required `Attachment.workspaceId`, `WorkspaceAttachmentUsage`, and retry/expiry fields used by Tasks 2–6.

- [ ] **Step 1: Write the failing migration contract**

Create `tests/prisma/attachment-lifecycle-migration.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260712050000_attachment_lifecycle_transition/migration.sql",
);

describe("attachment lifecycle migration", () => {
  it("quarantines legacy files as non-servable PENDING until byte verification", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain('CREATE TYPE "AttachmentStatus"');
    expect(sql).toContain('CREATE TYPE "AttachmentSource"');
    expect(sql).toContain('CREATE TABLE "WorkspaceAttachmentUsage"');
    expect(sql).toContain('UPDATE "Attachment" a');
    expect(sql).toContain('"status" = \'PENDING\'');
    expect(sql).toContain('"contentSha256" TEXT');
    expect(sql).toContain('"deleteRequestSequence" BIGINT');
    expect(sql).toContain('"deleteRequestEntryHash" TEXT');
    expect(sql).toContain('Attachment_delete_request_write_once');
    expect(sql).toContain('"workspaceId" = d."workspaceId"');
    expect(sql).toContain('DROP NOT NULL');
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"Attachment"/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+"Attachment"/i);
  });
});
```

- [ ] **Step 2: Run the migration test to verify red**

Run: `pnpm exec vitest run tests/prisma/attachment-lifecycle-migration.test.ts --reporter=dot`

Expected: FAIL with `ENOENT` for the migration file.

- [ ] **Step 3: Add lifecycle and quota models**

Add to `prisma/schema.prisma`:

```prisma
enum AttachmentStatus {
  PENDING
  READY
  DELETE_PENDING
  DELETED
  FAILED
}

enum AttachmentSource {
  MANUAL_UPLOAD
  CLIPBOARD_FILE
  REMOTE_IMPORT
}

enum AttachmentDeletionReason {
  PENDING_EXPIRED
  COMPENSATION
  DOCUMENT_RETENTION
  LEGACY_ORPHAN
}

model WorkspaceAttachmentUsage {
  workspaceId   String   @id
  quotaBytes    BigInt   @default(1073741824)
  reservedBytes BigInt   @default(0)
  readyBytes    BigInt   @default(0)
  deletingBytes BigInt   @default(0)
  updatedAt     DateTime @updatedAt
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Restrict)
}
```

Replace `Attachment` and extend `Workspace`/`Document`:

```prisma
model Workspace {
  // existing fields remain
  attachments     Attachment[]
  attachmentUsage WorkspaceAttachmentUsage?
}

model Document {
  // existing fields remain
  attachments Attachment[]
}

model Attachment {
  id                   String           @id @default(cuid())
  workspaceId          String
  documentId           String?
  fileName             String
  mimeType             String
  size                 Int
  contentSha256        String?
  reservedBytes        BigInt           @default(0)
  deletingChargeBytes  BigInt           @default(0)
  storageKey           String?
  status               AttachmentStatus @default(PENDING)
  source               AttachmentSource @default(MANUAL_UPLOAD)
  uploadedById         String
  expiresAt            DateTime?
  readyAt              DateTime?
  deleteAttempts       Int              @default(0)
  nextDeleteAttemptAt  DateTime?
  failureCode          String?
  deletionReason       AttachmentDeletionReason?
  deleteOperationId    String?
  deleteRequestSequence BigInt?
  deleteRequestEntryHash String?
  deletedAt            DateTime?
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt
  workspace            Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Restrict)
  document             Document?        @relation(fields: [documentId], references: [id], onDelete: SetNull)
  uploadedBy           User             @relation(fields: [uploadedById], references: [id])

  @@index([documentId, status])
  @@index([workspaceId, status, expiresAt])
  @@index([uploadedById, source, status, expiresAt])
  @@index([status, nextDeleteAttemptAt])
}
```

`size` is the exact validated stored-byte count and `contentSha256` is the lowercase SHA-256 of stored bytes. New code refuses null/mismatch. `Attachment.reservedBytes` is non-zero only while `PENDING`; `Attachment.deletingChargeBytes` is non-zero only while `DELETE_PENDING|FAILED` still owns physical bytes and exactly matches the workspace `deletingBytes` contribution. That charge remains until descriptor-confined unlink succeeds. Enforced workspace total is `reservedBytes + readyBytes + deletingBytes`. `deleteRequestSequence` and `deleteRequestEntryHash` are both null before delete intent and both non-null afterward. The database permits their first same-transaction assignment from the returned journal row, rejects changing/clearing either value thereafter, and preserves both on `DELETED`.

- [ ] **Step 4: Create the non-destructive backfill migration**

Create `prisma/migrations/20260712050000_attachment_lifecycle_transition/migration.sql` with the complete enum/table/index DDL plus these exact transition statements:

```sql
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'DELETE_PENDING', 'DELETED', 'FAILED');
CREATE TYPE "AttachmentSource" AS ENUM ('MANUAL_UPLOAD', 'CLIPBOARD_FILE', 'REMOTE_IMPORT');
CREATE TYPE "AttachmentDeletionReason" AS ENUM ('PENDING_EXPIRED', 'COMPENSATION', 'DOCUMENT_RETENTION', 'LEGACY_ORPHAN');

CREATE TABLE "WorkspaceAttachmentUsage" (
  "workspaceId" TEXT NOT NULL,
  "quotaBytes" BIGINT NOT NULL DEFAULT 1073741824,
  "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  "readyBytes" BIGINT NOT NULL DEFAULT 0,
  "deletingBytes" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceAttachmentUsage_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "Attachment"
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "deletingChargeBytes" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "contentSha256" TEXT,
  ADD COLUMN "status" "AttachmentStatus",
  ADD COLUMN "source" "AttachmentSource" NOT NULL DEFAULT 'MANUAL_UPLOAD',
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "readyAt" TIMESTAMP(3),
  ADD COLUMN "deleteAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextDeleteAttemptAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "deletionReason" "AttachmentDeletionReason",
  ADD COLUMN "deleteOperationId" TEXT,
  ADD COLUMN "deleteRequestSequence" BIGINT,
  ADD COLUMN "deleteRequestEntryHash" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Attachment" a
SET "workspaceId" = d."workspaceId",
    "status" = 'PENDING',
    "reservedBytes" = a."size",
    "readyAt" = NULL
FROM "Document" d
WHERE d."id" = a."documentId";

ALTER TABLE "Attachment"
  ALTER COLUMN "workspaceId" SET NOT NULL,
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ALTER COLUMN "documentId" DROP NOT NULL,
  ALTER COLUMN "storageKey" DROP NOT NULL;

INSERT INTO "WorkspaceAttachmentUsage" (
  "workspaceId", "quotaBytes", "reservedBytes", "readyBytes", "deletingBytes", "updatedAt"
)
SELECT w."id", 1073741824, COALESCE(SUM(a."size"), 0)::BIGINT, 0, 0, CURRENT_TIMESTAMP
FROM "Workspace" w
LEFT JOIN "Attachment" a ON a."workspaceId" = w."id" AND a."status" = 'PENDING'
GROUP BY w."id"
ON CONFLICT ("workspaceId") DO NOTHING;

ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_documentId_fkey";
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkspaceAttachmentUsage"
  ADD CONSTRAINT "WorkspaceAttachmentUsage_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

In the same expand migration add an exact pair constraint (`both NULL` or positive
sequence plus lowercase 64-hex hash) and a narrow trigger that permits only the first
NULL-pair to non-NULL-pair assignment. It rejects partial assignment, overwrite, clear,
or reuse of a tuple belonging to another journal row. The transition function must set
the pair from the `ATTACHMENT_DELETE_REQUESTED` insert's returned `sequence` and
`entryHash` before the transaction commits. Tests prove rollback leaves both null and
that later status/metadata updates, including `DELETED`, retain the pair.

Append the four `CREATE INDEX` statements generated from the schema after these foreign keys. The migration does not unlink files or delete attachment rows.

- [ ] **Step 5: Run schema and migration checks to verify green**

Run:

```bash
pnpm exec vitest run tests/prisma/attachment-lifecycle-migration.test.ts --reporter=dot
pnpm exec prisma validate
pnpm run db:generate
```

Expected: PASS; Prisma generation exits 0 and the test confirms the migration has no attachment delete.

- [ ] **Step 6: Commit the additive schema**

```bash
pnpm wiki:install-hooks
git add prisma/schema.prisma prisma/migrations/20260712050000_attachment_lifecycle_transition/migration.sql tests/prisma/attachment-lifecycle-migration.test.ts wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: add durable attachment lifecycle"
```

Expected: commit succeeds with additive/backfill SQL only.

### Task 2: Establish Descriptor Storage and Resumable Canonical Backfill for Child Release A

**Files:**
- Create: `scripts/attachments/backfill-integrity.ts`
- Create: `tests/attachments/backfill-integrity.test.ts`
- Create: `native/attachment-storage/`
- Create: `services/attachment-storage-authority/`
- Create: `services/attachment-media-canonicalizer/`
- Create: `lib/attachments/storage.ts`
- Create: `tests/attachments/storage-linux.integration.test.ts`
- Create: `tests/attachments/media-canonicalizer.integration.test.ts`
- Create: `tests/security/attachment-media-compromise-chain.test.ts`
- Create: `rust-toolchain.toml`
- Create: `native/attachment-storage/Cargo.lock`
- Create: `native/attachment-storage/vendor/` or an equivalently verified offline source tree
- Create: `native/attachment-storage/build-inventory.json`
- Create: `native/attachment-storage/sbom.spdx.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 1 legacy `PENDING` rows, the pre-created authority-owned attachment root, exact Web/storage/canonicalizer UIDs, and the digest-pinned offline Rust/Sharp build inputs.
- Produces: committed descriptor-confined storage authority, bounded Web UDS client, one-shot canonicalizer, signed canonical receipts, exact `size`/`contentSha256`, resumable dry-run/execute backfill, and quarantined logical-delete work for unsafe bytes. Task 3 consumes only the UDS client; no legacy row is servable during the expand/backfill window, Web has no storage volume/native addon/Sharp, and this Child A task contains no contract migration.

- [ ] **Step 1: Write the failing bounded canonical-backfill tests**

Create `tests/attachments/backfill-integrity.test.ts`. The fixture must prove all of these behaviors: a 6 MiB object is read through bounded 64 KiB UDS frames rather than Web `readFile`; hash and byte count come from the authority's same no-follow descriptor; an intermediate symlink, final symlink, hardlink (`nlink !== 1`), file replacement, short read, and missing object are rejected; legacy images cross the one-shot canonicalizer before promotion; EXIF/ICC/XMP/comments/ancillary chunks and appended ZIP/HTML/JS/PDF polyglot bytes disappear; the authority rejects a forged canonicalizer result or caller-crafted receipt/signature and signs only its independently same-FD-verified MIME/size/hash; exact signed canonical MIME/size/hash and quota delta commit together; file-before-DB and DB-before-file failures compensate without losing the old bytes; invalid rows move atomically to unreadable `DELETE_PENDING` with a persisted journal proof tuple; duplicate non-null storage keys converge to distinct no-replace canonical keys without deleting a still-referenced object; a retry is idempotent; and a crash between batches resumes after `(createdAt,id)` without double charging quota. Tests also assert quota-before-attachment lock order and post-lock DB time.

- [ ] **Step 2: Run the new tests to verify red**

Run: `pnpm exec vitest run tests/attachments/storage-linux.integration.test.ts tests/attachments/backfill-integrity.test.ts --reporter=dot`

Expected: FAIL because the isolated authority/canonicalizer, pinned offline native build,
bounded UDS client, canonical replacement/compensation harness, backfill command, and
compromise-chain contracts do not exist.

- [ ] **Step 3: Implement the isolated descriptor authority and one-shot canonicalizer**

Create the narrow Rust addon under `native/attachment-storage/`, but load it only from
`services/attachment-storage-authority/`. Web source/import graphs and images must not
contain or load the addon. Lexical key normalization is input validation only. At
authority startup the addon opens the root once with
`O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC`, verifies the pre-created service-owned root, records
its identity, and never reopens it by pathname.

The authority exposes three separate UDS listeners/opcode allowlists. The Web UID may
use bounded `READ_VERIFIED` and `CREATE_NOREPLACE_BEGIN`; a distinct maintenance UID may
use descriptor inventory; physical `DELETE_VERIFIED` is on a separate socket and
accepts only the deletion-worker UID plus a verified signed fence. Every accepted
connection obtains kernel `SO_PEERCRED`; claimed identity fields are ignored. A wrong
UID, socket, opcode, message length, ancillary-FD count, or state transition closes the
connection before storage work. The authority has no network or database access and
never accepts a root path, destination path, arbitrary command, raw readiness Boolean,
or caller-supplied proof verifier.

For CREATE_NOREPLACE/replacement, the authority resolves parents using retained-FD
`openat2(RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS|RESOLVE_NO_MAGICLINKS)`, opens a random
temporary output with `O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC`, verifies regular
same-device `nlink == 1`, and passes exactly that FD plus a bounded input FD to a fresh
one-shot media canonicalizer using `SCM_RIGHTS`. The canonicalizer has an empty
credential/env allowlist, no network namespace, no database/socket access, read-only
rootfs, memory/CPU/pid limits, and Sharp/libvips only. It fully decodes, canonicalizes,
reprobes, writes to the inherited output FD, fsyncs, returns only an unsigned bounded
MIME/size/SHA-256 result, then exits. It has no signing key, signer socket, or receipt
authority.

Before adoption the authority waits for the canonicalizer process *and its cgroup* to
be empty, enumerates/invalidates inherited descendants, and proves no writable FD can
survive. It then uses the same still-open output FD to re-fstat, hash, seal, fsync, and
compare the independently derived MIME/size/SHA-256 with the untrusted result. Only the
storage authority binds operation id, storage key, output identity, and verified values
into the signed canonical receipt before publishing with
`renameat2(...,RENAME_NOREPLACE)`; a forged result or signature is rejected. There is no
pathname reopen or long-lived writer. Replacement uses an authority-owned recovery
record and pinned same-FD exchange.
`READ_VERIFIED` opens the final component no-follow, computes bytes/count/hash from the
same descriptor with pre/post identity checks, and returns at most the bounded complete
buffer plus a signed identity receipt. DELETE is specified in Task 6.

`lib/attachments/storage.ts` is only a bounded UDS client:

```ts
export type VerifiedAttachmentRead = Readonly<{
  bytes: Uint8Array;
  size: number;
  contentSha256: string;
  identityToken: string;
}>;

export type CanonicalAttachmentReceipt = Readonly<{
  operationId: string;
  storageKey: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  contentSha256: string;
  identityToken: string;
  signature: string;
}>;

export interface AttachmentStorageClient {
  createCanonicalNoReplace(input: BoundedCanonicalizeInput): Promise<CanonicalAttachmentReceipt>;
  replaceCanonical(input: BoundedCanonicalizeReplacement): Promise<CanonicalAttachmentReceipt>;
  readVerified(storageKey: string): Promise<VerifiedAttachmentRead>;
}
```

There is no public Web `writeExclusive(bytes)`, `unlinkVerified`, `listVerifiedFiles`,
native constructor, storage-root env, or writable FD. Web validates canonical receipt
framing, closed MIME/container, exact size/hash/signature, operation binding, and then
re-reads through `READ_VERIFIED` before database promotion. Source/OCI/Compose tests
reject `sharp`, `libvips`, `@munjib/attachment-storage`, attachment volume mounts, or
native prebuilds in Web; they also reject Sharp/native imports in the raw fetcher.

Pin the ARM64 Rust builder by exact image digest. Commit `rust-toolchain.toml`,
`Cargo.lock`, and either a hash-verified vendor tree or complete offline cache; build
with `--frozen --offline`, deny unlisted build scripts/native downloads, emit SBOM plus
audit evidence, and prohibit downloaded prebuilt addons. At runtime the authority
verifies the addon digest and runs no-follow/no-replace/read/delete self-tests before
marking its socket ready. Integration tests pause at each syscall/process/cgroup/socket
boundary and exercise wrong peer/opcode, FD smuggling, descendant FD retention, root/
parent/final replacement, symlink/hardlink/device changes, no-replace races, crash
recovery, receipt forgery, and addon digest drift.

- [ ] **Step 4: Implement canonical legacy conversion and exact-digest backfill**

Create `scripts/attachments/backfill-integrity.ts`. Export
`backfillAttachmentIntegrity({batchSize,cursor,dryRun,rootOperationId,storage})`; require
a stable persisted UUID `rootOperationId` for execute mode. Select candidate identities
in canonical order, then inside each Serializable transaction lock workspace quota rows
first and attachment rows second, each sorted, and read database statement/clock time
only after those locks. Open bytes only through bounded authority `READ_VERIFIED`. Every
image is passed by inherited input/output FDs through the same one-shot canonicalizer
used for new uploads and remote imports; Web/backfill code never imports Sharp or the
native addon. The authority stages the canonical replacement against the verified old
identity and Web accepts only its signed receipt plus a same-FD re-read. Input and
canonical output are each capped at 5 MiB; no symlink, hardlink, pathname reopen,
metadata-bearing original, retained writer, or polyglot bytes may become READY.

For a valid object, exchange the staged canonical file and update canonical MIME,
`contentSha256`, exact `size`, `status: "READY"`, DB-time `readyAt`, and exact
reserved/ready quota delta in the transaction, then commit authority recovery. A
database rollback invokes authority rollback; startup recovery resolves a crash using
the signed receipt and persisted expected hash. Group duplicate non-null `storageKey`
rows before promotion. Canonicalize once per row into distinct server-generated
no-replace keys, update every row atomically with compensation, and retire the shared
old object only after a fresh query proves zero references. Child A completion requires
duplicate count zero.

For missing, changed, symlinked, hardlinked, over-limit, decode-invalid,
noncanonicalizable, or compensation-failed bytes, leave them non-servable, move the row
to `DELETE_PENDING`, preserve the exact physical charge in `deletingBytes`, and append
both canonical events with deterministic derived operation IDs. Capture the returned
delete-request journal row and persist its write-once proof tuple before commit:

```ts
for (const kind of ["ATTACHMENT_QUARANTINED", "ATTACHMENT_DELETE_REQUESTED"] as const) {
  const entry = await appendSecurityJournalEvent(tx, {
    kind,
    subjectType: "ATTACHMENT",
    subjectId: attachment.id,
    operationId: deriveSecurityJournalOperationId({
      rootOperationId: input.rootOperationId,
      kind,
      subjectType: "ATTACHMENT",
      subjectId: attachment.id,
    }),
    payload: { stateCode: kind, stateVersion: 1 },
  });
  if (kind === "ATTACHMENT_DELETE_REQUESTED") {
    await persistWriteOnceDeleteRequestProof(tx, attachment.id, {
      sequence: entry.sequence,
      entryHash: entry.entryHash,
    });
  }
}
```

Persist the next cursor only after the batch transaction commits. Print counts and opaque IDs only; never print storage keys, names, hashes, paths, URLs, or bytes. Add `attachments:integrity-backfill` to `package.json`; it defaults to `--dry-run`, and execute requires explicit `--execute --root-operation-id <persisted-uuid>`.

- [ ] **Step 5: Preserve the Child A deployment boundary**

Before v1 promotion, run only dry-run backfill. Child Release A must include Task 3's
fail-closed UDS reader on every pending preview, READY read, finalization, restore,
current-view/history projection, and deletion attempt. A null, mismatch, noncanonical
image, forged receipt, wrong peer, or changed descriptor is never served or finalized
and is quarantined atomically through the canonical journal transition. New writes
publish only canonicalizer/authority-verified bytes and exact digest.

The v1 production overlay removes every attachment volume and storage-root variable
from Web, excludes the native addon and Sharp/libvips from the Web image/import graph,
and gives Web only the read/create UDS. Storage authority, one-shot canonicalizer, and
their socket directories use distinct UIDs and mounts. A v1 rollback must preserve this
privilege floor; disabling writers never restores a Web volume, addon, Sharp import, or
direct filesystem fallback.

Execute-mode canary/full backfill is forbidden until the v1 image and `attachment-integrity-lifecycle@1` floor are live. After that promotion, rollback disables writers/import/deletion while retaining an eligible v1 reader; it never selects a pre-v1 image.

- [ ] **Step 6: Verify green, document, gate, and commit the Child A storage/backfill tooling**

Run:

```bash
pnpm exec vitest run tests/attachments/storage-linux.integration.test.ts tests/attachments/media-canonicalizer.integration.test.ts tests/security/attachment-media-compromise-chain.test.ts tests/attachments/backfill-integrity.test.ts tests/prisma/attachment-lifecycle-migration.test.ts tests/docker/compose.test.ts --reporter=dot
pnpm exec prisma validate
pnpm run db:generate
pnpm wiki:install-hooks
git add native/attachment-storage rust-toolchain.toml services/attachment-storage-authority services/attachment-media-canonicalizer lib/attachments/storage.ts tests/attachments/storage-linux.integration.test.ts tests/attachments/media-canonicalizer.integration.test.ts tests/security/attachment-media-compromise-chain.test.ts scripts/attachments/backfill-integrity.ts tests/attachments/backfill-integrity.test.ts Dockerfile docker-compose.yml docker-compose.dev.yml package.json pnpm-lock.yaml wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: verify legacy attachment integrity"
```

Expected: tests and wiki gates pass; the Child A commit contains the isolated authority,
one-shot canonicalizer, digest-pinned offline ARM64 native build/SBOM/self-test, bounded
Web UDS client, canonical resumable backfill, actual workflow/wiki delta, no contract
migration, no Web storage volume/native/Sharp capability, and no storage metadata.

### Task 3: Validate Receipts, Reserve, Persist, Finalize, and Read Attachments

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `lib/attachments/validation.ts` — strict canonical-receipt/container verifier;
  no decoder
- Create: `tests/attachments/image-normalization.test.ts`
- Create: `lib/attachments/lifecycle.ts`
- Rewrite: `lib/attachments/service.ts`
- Modify: `lib/documents/service.ts`
- Modify: `lib/documents/downstream/leaf11-attachments.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Create: `app/api/attachments/[attachmentId]/pending/route.ts`
- Modify: `app/api/attachments/[attachmentId]/route.ts`
- Modify: `tests/attachments/service.test.ts`
- Modify: `tests/attachments/route.test.ts`
- Modify: `tests/documents/service.test.ts`
- Modify: `tests/security/document-downstream-extension-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 lifecycle models, Task 2 bounded storage/canonicalizer-authority
  client and signed receipts, Issue 5 `lockDocumentBoundary(db, documentId)` /
  `resolveActiveDocumentForActor(db, { documentId, actorId, access })`, and Issue 6's
  exact version-0 attachment projection slot contract.
- Produces: `verifyCanonicalAttachmentReceipt()`, `createPendingAttachment()`,
  `abandonPendingAttachment()`, `lockAttachmentQuota()`,
  `finalizeReferencedPendingAttachments()`, `getReadableAttachment()`,
  `getPendingAttachmentForUploader()`, `verifyRestoredAttachmentIntegrity()`, and the
  version-1 Leaf 11 projection-slot implementation for Tasks 4–6 and Issue 14.

- [ ] **Step 1: Pin the isolated decoder and write failing receipt/lifecycle tests**

Sharp/libvips is installed only in the digest-pinned one-shot canonicalizer image/package
from Task 2. Root/Web dependencies, Web lockfile importer, Web build layers, and the raw
fetcher must not contain it. Run the canonicalizer's frozen/offline install/build and
record its exact dependency/SBOM digest; do not run `pnpm add sharp` in the Web package.

Create `tests/attachments/image-normalization.test.ts` against the one-shot canonicalizer
with pinned fixtures containing EXIF GPS/orientation, ICC/XMP/IPTC, JPEG comments/
thumbnails, PNG ancillary chunks, GIF comments/application extensions, WebP EXIF/XMP,
and valid images with appended ZIP/HTML/JS/PDF payloads. Assert deterministic canonical
bytes/hash/MIME, applied orientation, preserved bounded animation, absence of every
metadata/polyglot sentinel, output-limit rejection, cgroup-empty/same-FD adoption, and
canonicalizer processing of an already remote-worker-bounded image. Web tests receive
only a signed receipt and bounded verified read. In `tests/attachments/route.test.ts`,
replace the stored file after the UDS verified read completes but before response body
consumption: the current response contains only the completed buffer, while the next
request detects the changed descriptor and quarantines it.

Add these cases to `tests/attachments/service.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createPendingAttachment,
  finalizeReferencedPendingAttachments,
  getPendingAttachmentForUploader,
  getReadableAttachment,
} from "@/lib/attachments/lifecycle";
import {
  assertValidAttachmentStorageKey,
  createAttachmentStorageClient,
} from "@/lib/attachments/storage";
import { verifyCanonicalAttachmentReceipt } from "@/lib/attachments/validation";
import { startSyntheticAttachmentAuthorities } from "../helpers/attachment-authorities";

const onePixelPng = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

it("requires a signed matching canonical receipt", async () => {
  const authorities = await startSyntheticAttachmentAuthorities();
  const receipt = await authorities.canonicalize(onePixelPng, "image/png");
  await expect(verifyCanonicalAttachmentReceipt(receipt)).resolves.toMatchObject({
    mimeType: "image/png",
    size: expect.any(Number),
    contentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  await expect(verifyCanonicalAttachmentReceipt({ ...receipt, mimeType: "image/jpeg" }))
    .rejects.toThrow("ATTACHMENT_MIME_TYPE_FORBIDDEN");
  await expect(verifyCanonicalAttachmentReceipt({ ...receipt, signature: "forged" }))
    .rejects.toThrow("ATTACHMENT_CANONICAL_RECEIPT_INVALID");
});

it("rejects metadata bombs inside the isolated canonicalizer", async () => {
  const authorities = await startSyntheticAttachmentAuthorities();
  const wide = await loadPinnedImageFixture("wide-8193.png");
  await expect(authorities.canonicalize(wide, "image/png"))
    .rejects.toThrow("ATTACHMENT_DIMENSIONS_EXCEEDED");
  await expect(authorities.canonicalizeFixture("pixels-exceeded"))
    .rejects.toThrow("ATTACHMENT_PIXELS_EXCEEDED");
  await expect(authorities.canonicalizeFixture("frames-11"))
    .rejects.toThrow("ATTACHMENT_FRAMES_EXCEEDED");
  await expect(authorities.canonicalizeFixture("total-pixels-exceeded"))
    .rejects.toThrow("ATTACHMENT_TOTAL_PIXELS_EXCEEDED");
});

it("binds UDS operations to peer credentials, a retained root, and no-replace", async () => {
  const authorities = await startSyntheticAttachmentAuthorities();
  const client = createAttachmentStorageClient(authorities.webSocket);
  await expect(authorities.canonicalize(onePixelPng, "image/png", {
    storageKey: "workspace/pending/attachment-1",
  })).resolves.toMatchObject({ storageKey: "workspace/pending/attachment-1" });
  await expect(authorities.canonicalize(onePixelPng, "image/png", {
    storageKey: "workspace/pending/attachment-1",
  })).rejects.toThrow("ATTACHMENT_TARGET_EXISTS");
  await expect(client.readVerified("workspace/pending/attachment-1"))
    .resolves.toMatchObject({ size: expect.any(Number), contentSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  await expect(authorities.connectAsWrongPeer()).rejects.toThrow("ATTACHMENT_STORAGE_PEER_DENIED");
});

it.each([
  "intermediate-symlink",
  "final-symlink",
  "hardlink-target",
  "parent-swap-during-write",
  "target-created-before-publish",
  "file-swap-during-read",
])("fails closed for the %s storage race", async (scenario) => {
  const harness = await storageRaceHarness(scenario);
  await expect(harness.run()).rejects.toThrow(/^ATTACHMENT_STORAGE_/);
  await expect(harness.outsideBytes()).resolves.toBeUnchanged();
});

it("keeps using the retained root descriptor when its pathname is replaced", async () => {
  const harness = await storageRaceHarness("root-replaced-by-symlink");
  await harness.run();
  await expect(harness.outsideBytes()).resolves.toBeUnchanged();
  await expect(harness.bytesThroughOriginalRootFd()).resolves.toEqual(onePixelPng);
});
```

- [ ] **Step 2: Write failing lifecycle, quota, compensation, and authorization tests**

Add these complete cases to `tests/attachments/service.test.ts` (use the existing `seedWorkspaceFixture()` and `createDocument()` imports):

```ts
async function createAttachmentTarget() {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: `Attachment ${fixture.workspace.id}`,
    contentMarkdown: "# Attachment target",
  });
  return { fixture, document };
}

it("reserves quota atomically so only one concurrent pending upload fits", async () => {
  const { fixture, document } = await createAttachmentTarget();
  await prisma.workspaceAttachmentUsage.upsert({
    where: { workspaceId: fixture.workspace.id },
    create: {
      workspaceId: fixture.workspace.id,
      quotaBytes: BigInt(onePixelPng.byteLength * 2 - 1),
    },
    update: { quotaBytes: BigInt(onePixelPng.byteLength * 2 - 1) },
  });
  const results = await Promise.allSettled(["first", "second"].map((suffix) =>
    createPendingAttachment({
      documentId: document.id,
      actorId: fixture.user.id,
      fileName: `${suffix}.png`,
      declaredMimeType: "image/png",
      bytes: onePixelPng,
      source: "CLIPBOARD_FILE",
    }),
  ));
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(results.filter(({ status }) => status === "rejected")).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ message: "ATTACHMENT_QUOTA_EXCEEDED" }) }),
  ]);
  await expect(prisma.workspaceAttachmentUsage.findUniqueOrThrow({
    where: { workspaceId: fixture.workspace.id },
    select: { reservedBytes: true, readyBytes: true },
  })).resolves.toEqual({ reservedBytes: BigInt(onePixelPng.byteLength), readyBytes: 0n });
});

it("releases reservation when the isolated canonicalizer fails", async () => {
  const { fixture, document } = await createAttachmentTarget();
  syntheticAttachmentAuthorities.failCanonicalizerOnce("ATTACHMENT_DECODE_FAILED");
  await expect(createPendingAttachment({
    documentId: document.id,
    actorId: fixture.user.id,
    fileName: "write-failure.png",
    declaredMimeType: "image/png",
    bytes: onePixelPng,
    source: "CLIPBOARD_FILE",
  })).rejects.toThrow("ATTACHMENT_CANONICALIZE_FAILED");
  const failed = await prisma.attachment.findFirstOrThrow({
    where: { workspaceId: fixture.workspace.id, fileName: "write-failure.png" },
  });
  expect(failed).toMatchObject({ status: "FAILED", failureCode: "ATTACHMENT_CANONICALIZE_FAILED" });
  expect(failed.storageKey).toBeNull();
  await expect(prisma.workspaceAttachmentUsage.findUniqueOrThrow({
    where: { workspaceId: fixture.workspace.id },
    select: { reservedBytes: true },
  })).resolves.toEqual({ reservedBytes: 0n });
});

it("queues durable deletion rather than giving Web unlink when DB publish fails", async () => {
  const { fixture, document } = await createAttachmentTarget();
  failAttachmentPublishOnce("synthetic DB publish failure");
  await expect(createPendingAttachment({
    documentId: document.id,
    actorId: fixture.user.id,
    fileName: "db-failure.png",
    declaredMimeType: "image/png",
    bytes: onePixelPng,
    source: "CLIPBOARD_FILE",
  })).rejects.toThrow("ATTACHMENT_DB_PUBLISH_FAILED");
  expect(syntheticAttachmentAuthorities.physicalDeleteCalls).toBe(0);
  const failed = await prisma.attachment.findFirstOrThrow({
    where: { workspaceId: fixture.workspace.id, fileName: "db-failure.png" },
  });
  expect(failed).toMatchObject({
    status: "DELETE_PENDING",
    deleteRequestSequence: expect.any(BigInt),
    deleteRequestEntryHash: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  await expect(prisma.workspaceAttachmentUsage.findUniqueOrThrow({
    where: { workspaceId: fixture.workspace.id },
    select: { reservedBytes: true, deletingBytes: true },
  })).resolves.toEqual({ reservedBytes: 0n, deletingBytes: expect.any(BigInt) });
});

it("keeps pending bytes uploader-only and promotes only a saved internal reference", async () => {
  const { fixture, document } = await createAttachmentTarget();
  const other = await prisma.user.create({
    data: { email: `attachment-other-${document.id}@example.com`, name: "Other Editor" },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: fixture.workspace.id, userId: other.id, role: WorkspaceRole.EDITOR },
  });
  const pending = await createPendingAttachment({
    documentId: document.id,
    actorId: fixture.user.id,
    fileName: "pending.png",
    declaredMimeType: "image/png",
    bytes: onePixelPng,
    source: "CLIPBOARD_FILE",
  });
  await expect(getReadableAttachment(pending.id, fixture.user.id))
    .rejects.toThrow("ATTACHMENT_NOT_FOUND");
  await expect(getPendingAttachmentForUploader(pending.id, other.id))
    .rejects.toThrow("ATTACHMENT_NOT_FOUND");
  await expect(getPendingAttachmentForUploader(pending.id, fixture.user.id))
    .resolves.toMatchObject({ attachment: { id: pending.id, status: "PENDING" } });

  await updateDocument({
    documentId: document.id,
    actorId: fixture.user.id,
    title: document.title,
    contentMarkdown: `# Attachment target\n\n![pending](/api/attachments/${pending.id})`,
  });
  await expect(getReadableAttachment(pending.id, fixture.user.id))
    .resolves.toMatchObject({ attachment: { id: pending.id, status: "READY" } });
  await expect(prisma.workspaceAttachmentUsage.findUniqueOrThrow({
    where: { workspaceId: fixture.workspace.id },
    select: { reservedBytes: true, readyBytes: true },
  })).resolves.toEqual({ reservedBytes: 0n, readyBytes: BigInt(onePixelPng.byteLength) });
});

it("does not finalize a pending attachment when the document archives in the save transaction", async () => {
  const { fixture, document } = await createAttachmentTarget();
  const pending = await createPendingAttachment({
    documentId: document.id,
    actorId: fixture.user.id,
    fileName: "archive-race.png",
    declaredMimeType: "image/png",
    bytes: onePixelPng,
    source: "CLIPBOARD_FILE",
  });
  await prisma.document.update({
    where: { id: document.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await expect(prisma.$transaction((tx) => finalizeReferencedPendingAttachments(tx, {
    workspaceId: fixture.workspace.id,
    documentId: document.id,
    actorId: fixture.user.id,
    attachmentIds: [pending.id],
    rootOperationId: "6f080172-7c65-4f86-9256-463e29ea0d42",
  }))).rejects.toThrow("DOCUMENT_NOT_FOUND");
  await expect(prisma.attachment.findUniqueOrThrow({ where: { id: pending.id } }))
    .resolves.toMatchObject({ status: "PENDING" });
});
```

- [ ] **Step 3: Run focused tests to verify red**

Run: `pnpm exec vitest run tests/attachments/service.test.ts tests/attachments/route.test.ts tests/documents/service.test.ts --reporter=dot`

Expected: FAIL because validation, lifecycle services, quota integration, pending read, and finalization do not exist. Task 2 storage integration tests remain green and are not reimplemented here.

- [ ] **Step 4: Implement isolated canonical decoding and Web receipt verification**

Create the following decoder only inside
`services/attachment-media-canonicalizer/canonicalize-image.mjs`. It runs once with
inherited input/output FDs and returns its result to the storage authority, not Web.
Keep signature detection as an explicit allowlist and emit canonical bytes rather than
metadata about the untrusted input. No code from this block may appear in
`lib/attachments/**`, Web, or the raw fetcher:

```ts
import { createHash } from "node:crypto";
import sharp from "sharp";

export const ATTACHMENT_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxDimension: 8_192,
  maxTotalPixels: 25_000_000,
  maxFrames: 10,
} as const;

const signatures = [
  { mimeType: "image/png", matches: (b: Uint8Array) =>
    b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => b[index] === value) },
  { mimeType: "image/jpeg", matches: (b: Uint8Array) =>
    b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: "image/gif", matches: (b: Uint8Array) =>
    b.length >= 6 && (Buffer.from(b.subarray(0, 6)).toString("ascii") === "GIF87a" ||
      Buffer.from(b.subarray(0, 6)).toString("ascii") === "GIF89a") },
  { mimeType: "image/webp", matches: (b: Uint8Array) =>
    b.length >= 12 && Buffer.from(b.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(b.subarray(8, 12)).toString("ascii") === "WEBP" },
] as const;

export type CanonicalImage = {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  frames: number;
  size: number;
  contentSha256: string;
};

export async function validateImageBytes(
  bytes: Uint8Array,
  declaredMimeType: string,
): Promise<CanonicalImage> {
  if (bytes.byteLength === 0) throw new Error("ATTACHMENT_EMPTY");
  if (bytes.byteLength > ATTACHMENT_LIMITS.maxBytes) throw new Error("ATTACHMENT_TOO_LARGE");
  const signature = signatures.find(({ matches }) => matches(bytes));
  if (!signature || signature.mimeType !== declaredMimeType.toLowerCase()) {
    throw new Error("ATTACHMENT_MIME_TYPE_FORBIDDEN");
  }
  const input = sharp(bytes, {
    animated: true,
    failOn: "error",
    limitInputPixels: ATTACHMENT_LIMITS.maxTotalPixels,
    unlimited: false,
  });
  const metadata = await input.metadata().catch(() => { throw new Error("ATTACHMENT_DECODE_FAILED"); });
  const decoded = {
    width: metadata.width ?? 0,
    height: metadata.pageHeight ?? metadata.height ?? 0,
    frames: metadata.pages ?? 1,
  };
  if (
    decoded.width < 1 || decoded.height < 1 ||
    decoded.width > ATTACHMENT_LIMITS.maxDimension ||
    decoded.height > ATTACHMENT_LIMITS.maxDimension
  ) throw new Error("ATTACHMENT_DIMENSIONS_EXCEEDED");
  if (decoded.frames < 1 || decoded.frames > ATTACHMENT_LIMITS.maxFrames) {
    throw new Error("ATTACHMENT_FRAMES_EXCEEDED");
  }
  if (decoded.width * decoded.height * decoded.frames > ATTACHMENT_LIMITS.maxTotalPixels) {
    throw new Error("ATTACHMENT_TOTAL_PIXELS_EXCEEDED");
  }
  await input.clone().stats().catch(() => { throw new Error("ATTACHMENT_DECODE_FAILED"); });

  // Sharp/libvips drops metadata unless keepMetadata()/withMetadata() is called.
  // rotate() consumes EXIF orientation; toColourspace() removes the input ICC dependency.
  const pixels = sharp(bytes, {
    animated: decoded.frames > 1,
    failOn: "error",
    limitInputPixels: ATTACHMENT_LIMITS.maxTotalPixels,
    unlimited: false,
  }).rotate().toColourspace("srgb");
  const output = decoded.frames > 1 || signature.mimeType === "image/gif" || signature.mimeType === "image/webp"
    ? await pixels.webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true, loop: 0 }).toBuffer()
    : signature.mimeType === "image/jpeg"
      ? await pixels.jpeg({ quality: 90, chromaSubsampling: "4:2:0", progressive: false, optimizeCoding: true }).toBuffer()
      : await pixels.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();

  if (output.byteLength > ATTACHMENT_LIMITS.maxBytes) throw new Error("ATTACHMENT_TOO_LARGE");
  const canonicalMime: CanonicalImage["mimeType"] =
    decoded.frames > 1 || signature.mimeType === "image/gif" || signature.mimeType === "image/webp"
      ? "image/webp"
      : signature.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  const reprobe = await sharp(output, {
    animated: decoded.frames > 1,
    failOn: "error",
    limitInputPixels: ATTACHMENT_LIMITS.maxTotalPixels,
    unlimited: false,
  }).metadata().catch(() => { throw new Error("ATTACHMENT_DECODE_FAILED"); });
  if ((reprobe.pages ?? 1) !== decoded.frames) throw new Error("ATTACHMENT_DECODE_FAILED");
  return {
    bytes: output,
    mimeType: canonicalMime,
    ...decoded,
    size: output.byteLength,
    contentSha256: createHash("sha256").update(output).digest("hex"),
  };
}

export async function validateAttachmentBytes(bytes: Uint8Array, declaredMimeType: string) {
  const mimeType = declaredMimeType.toLowerCase();
  if (mimeType.startsWith("image/")) return validateImageBytes(bytes, mimeType);
  if (bytes.byteLength === 0) throw new Error("ATTACHMENT_EMPTY");
  if (bytes.byteLength > ATTACHMENT_LIMITS.maxBytes) throw new Error("ATTACHMENT_TOO_LARGE");
  if (mimeType === "application/pdf") {
    if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
      throw new Error("ATTACHMENT_MIME_TYPE_FORBIDDEN");
    }
    return { bytes, mimeType, size: bytes.byteLength, contentSha256: createHash("sha256").update(bytes).digest("hex") };
  }
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error("ATTACHMENT_DECODE_FAILED"); }
    if (text.includes("\0")) throw new Error("ATTACHMENT_DECODE_FAILED");
    return { bytes, mimeType, size: bytes.byteLength, contentSha256: createHash("sha256").update(bytes).digest("hex") };
  }
  throw new Error("ATTACHMENT_MIME_TYPE_FORBIDDEN");
}
```

The first `stats()` forces full input decode and the second probe validates canonical
output inside the one-shot process. No branch calls `keepMetadata()` or
`withMetadata()`. Pin Sharp/libvips only in the canonicalizer image and add a
deterministic corpus for PNG/JPEG/GIF/WebP, animation, orientation, metadata, and
image-plus-ZIP/HTML/JS/PDF polyglots.

`lib/attachments/validation.ts` contains no decoder. It verifies the authority's exact
signed receipt schema, operation/storage-key binding, closed MIME/container mapping,
bounded size, lowercase SHA-256, identity token, and signature, then compares those
values to a bounded authority `READ_VERIFIED` result. Lifecycle code uses only the
verified `validated.bytes`, `validated.size`, and `validated.contentSha256`; it never
falls back to `input.bytes`, a worker declaration, or an unsigned receipt.

- [ ] **Step 5: Consume and regression-test only the Task 2 UDS authority**

Do not recreate or weaken the native authority/canonicalizer. Web imports only the
bounded `AttachmentStorageClient`, receipt verifier, and `READ_VERIFIED` result. Keep
the syscall/peer/cgroup/receipt suites in the focused run and add non-printing source/
image/Compose scans that fail if Web imports the native addon, Sharp/libvips, a storage
root, attachment volume, pathname `readFile`/`stat`/`rename`/`rm`, direct unlink, or a
writable FD. The raw fetcher has the same Sharp/native prohibition. Expected: Task 2
authority suites remain green and no lexical or privilege fallback is introduced.
- [ ] **Step 6: Implement reservation, compensation, finalization, and reads**

Create `lib/attachments/lifecycle.ts` with these exports and exact defaults:

```ts
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Prisma, type AttachmentSource, type PrismaClient } from "@prisma/client";
import { lockDocumentBoundary } from "@/lib/authorization/active-resource-locks";
import { resolveActiveDocumentForActor } from "@/lib/authorization/active-resources";
import { prisma } from "@/lib/db/client";
import {
  attachmentStorageClient,
} from "@/lib/attachments/storage";
import { verifyCanonicalAttachmentReceipt } from "@/lib/attachments/validation";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { appendSecurityJournalEvent, deriveSecurityJournalOperationId } from "@/lib/security/journal";

type AttachmentDb = Prisma.TransactionClient | PrismaClient;
const DEFAULT_PENDING_TTL_HOURS = 24;
const DEFAULT_REMOTE_CONCURRENCY = 2;

function pendingTtlHours() {
  const value = Number(process.env.MUNJIB_ATTACHMENT_PENDING_TTL_HOURS ?? DEFAULT_PENDING_TTL_HOURS);
  return Number.isInteger(value) && value >= 1 && value <= 168 ? value : DEFAULT_PENDING_TTL_HOURS;
}

function remoteConcurrency() {
  const value = Number(process.env.MUNJIB_ATTACHMENT_REMOTE_CONCURRENCY ?? DEFAULT_REMOTE_CONCURRENCY);
  return Number.isInteger(value) && value >= 1 && value <= 8 ? value : DEFAULT_REMOTE_CONCURRENCY;
}

function sanitizeFileName(fileName: string) {
  const safe = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 128);
  return safe || "image";
}

export async function lockAttachmentQuota(tx: Prisma.TransactionClient, workspaceId: string) {
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`attachment-quota:${workspaceId}`}, 0))
  `);
  return tx.workspaceAttachmentUsage.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });
}

export type PendingAttachmentWriteDeps = {
  canonicalizeNoReplace(input: {
    storageKey: string;
    bytes: Uint8Array;
    declaredMimeType: string;
  }): Promise<CanonicalAttachmentReceipt>;
  abortUnpublished(operationId: string): Promise<void>;
};

const defaultWriteDeps: PendingAttachmentWriteDeps = {
  canonicalizeNoReplace: (input) => attachmentStorageClient.createCanonicalNoReplace(input),
  abortUnpublished: (operationId) => attachmentStorageClient.abortUnpublished(operationId),
};

export async function createPendingAttachment(
  input: {
    documentId: string;
    actorId: string;
    fileName: string;
    declaredMimeType: string;
    bytes: Uint8Array;
    source: AttachmentSource;
  },
  deps: PendingAttachmentWriteDeps = defaultWriteDeps,
) {
  const provisionalReservation = BigInt(5 * 1024 * 1024);
  const pending = await prisma.$transaction(async (tx) => {
    const candidate = await tx.document.findUniqueOrThrow({
      where: { id: input.documentId }, select: { workspaceId: true },
    });
    const usage = await lockAttachmentQuota(tx, candidate.workspaceId);
    await lockDocumentBoundary(tx, input.documentId);
    const { document } = await resolveActiveDocumentForActor(tx, {
      documentId: input.documentId,
      actorId: input.actorId,
      access: "write",
    });
    if (document.workspaceId !== candidate.workspaceId) throw new Error("ATTACHMENT_LOCK_DRIFT");
    const [{ databaseNow }] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
      SELECT statement_timestamp() AS "databaseNow"
    `;
    const expiresAt = new Date(databaseNow.getTime() + pendingTtlHours() * 60 * 60 * 1_000);
    if (input.source === "REMOTE_IMPORT") {
      const currentImports = await tx.attachment.count({
        where: {
          workspaceId: document.workspaceId,
          uploadedById: input.actorId,
          source: "REMOTE_IMPORT",
          status: "PENDING",
          expiresAt: { gt: databaseNow },
        },
      });
      if (currentImports >= remoteConcurrency()) throw new Error("ATTACHMENT_IMPORT_CONCURRENCY_EXCEEDED");
    }
    const bytes = provisionalReservation;
    if (usage.reservedBytes + usage.readyBytes + usage.deletingBytes + bytes > usage.quotaBytes) {
      throw new Error("ATTACHMENT_QUOTA_EXCEEDED");
    }
    await tx.workspaceAttachmentUsage.update({
      where: { workspaceId: document.workspaceId },
      data: { reservedBytes: { increment: bytes } },
    });
    return tx.attachment.create({
      data: {
        workspaceId: document.workspaceId,
        documentId: document.id,
        fileName: sanitizeFileName(input.fileName),
        mimeType: "application/octet-stream",
        size: 0,
        contentSha256: null,
        reservedBytes: bytes,
        status: "PENDING",
        source: input.source,
        uploadedById: input.actorId,
        expiresAt,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const storageKey = `${pending.workspaceId}/pending/${pending.id}`;
  let receipt: CanonicalAttachmentReceipt;
  let validated: Awaited<ReturnType<typeof verifyCanonicalAttachmentReceipt>>;
  try {
    receipt = await deps.canonicalizeNoReplace({
      storageKey,
      bytes: input.bytes,
      declaredMimeType: input.declaredMimeType,
    });
    validated = await verifyCanonicalAttachmentReceipt(receipt);
    if (validated.bytes.byteLength !== validated.size) {
      throw new Error("ATTACHMENT_CANONICAL_RECEIPT_INVALID");
    }
  } catch {
    await compensatePendingFailure(pending.id, "ATTACHMENT_CANONICALIZE_FAILED", null);
    throw new Error("ATTACHMENT_CANONICALIZE_FAILED");
  }

  const completed = await prisma.$transaction(async (tx) => {
    await lockAttachmentQuota(tx, pending.workspaceId);
    const [locked] = await tx.$queryRaw<Array<{ id: string; reservedBytes: bigint }>>`
      SELECT "id", "reservedBytes" FROM "Attachment"
      WHERE "id" = ${pending.id} AND "status" = 'PENDING' FOR UPDATE
    `;
    if (!locked) throw new Error("ATTACHMENT_PENDING_CHANGED");
    await tx.workspaceAttachmentUsage.update({
      where: { workspaceId: pending.workspaceId },
      data: { reservedBytes: { decrement: locked.reservedBytes - BigInt(validated.size) } },
    });
    return tx.attachment.update({
      where: { id: pending.id },
      data: {
        storageKey,
        mimeType: validated.mimeType,
        size: validated.size,
        contentSha256: validated.contentSha256,
        reservedBytes: BigInt(validated.size),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(async () => {
    await compensatePendingFailure(pending.id, "ATTACHMENT_DB_PUBLISH_FAILED", storageKey);
    throw new Error("ATTACHMENT_DB_PUBLISH_FAILED");
  });
  return {
    ...completed,
    storageKey,
    markdown: completed.mimeType.startsWith("image/")
      ? `![${completed.fileName}](/api/attachments/${completed.id})`
      : `[${completed.fileName}](/api/attachments/${completed.id})`,
    pendingPreviewUrl: `/api/attachments/${completed.id}/pending`,
  };
}

async function compensatePendingFailure(
  attachmentId: string,
  failureCode: string,
  retainedStorageKey: string | null,
) {
  const rootOperationId = randomUUID();
  await prisma.$transaction(async (tx) => {
    const candidate = await tx.attachment.findUnique({
      where: { id: attachmentId }, select: { workspaceId: true },
    });
    if (!candidate) return;
    await lockAttachmentQuota(tx, candidate.workspaceId);
    const [attachment] = await tx.$queryRaw<Array<Attachment>>`
      SELECT * FROM "Attachment" WHERE "id" = ${attachmentId} FOR UPDATE
    `;
    if (!attachment || attachment.status !== "PENDING") return;
    const [{ databaseNow }] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
      SELECT statement_timestamp() AS "databaseNow"
    `;
    await tx.workspaceAttachmentUsage.update({
      where: { workspaceId: attachment.workspaceId },
      data: retainedStorageKey ? {
        reservedBytes: { decrement: attachment.reservedBytes },
        deletingBytes: { increment: attachment.reservedBytes },
      } : { reservedBytes: { decrement: attachment.reservedBytes } },
    });
    await tx.attachment.update({
      where: { id: attachment.id },
      data: retainedStorageKey ? {
        status: "DELETE_PENDING",
        storageKey: retainedStorageKey,
        reservedBytes: 0n,
        deletingChargeBytes: attachment.reservedBytes,
        deleteOperationId: rootOperationId,
        failureCode,
        deletionReason: "COMPENSATION",
        nextDeleteAttemptAt: databaseNow,
      } : {
        status: "FAILED",
        storageKey: null,
        reservedBytes: 0n,
        failureCode,
      },
    });
    if (retainedStorageKey) {
      const kind = "ATTACHMENT_DELETE_REQUESTED" as const;
      const entry = await appendSecurityJournalEvent(tx, {
        kind,
        subjectType: "ATTACHMENT",
        subjectId: attachment.id,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId, kind, subjectType: "ATTACHMENT", subjectId: attachment.id,
        }),
        payload: { stateCode: kind, stateVersion: 1 },
      });
      await persistWriteOnceDeleteRequestProof(tx, attachment.id, {
        sequence: entry.sequence,
        entryHash: entry.entryHash,
      });
    }
  });
}

export async function abandonPendingAttachment(
  attachmentId: string,
  actorId: string,
  failureCode: string,
) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, uploadedById: actorId, status: "PENDING" },
  });
  if (!attachment) return;
  await compensatePendingFailure(attachment.id, failureCode, attachment.storageKey);
}

export async function finalizeReferencedPendingAttachments(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    documentId: string;
    actorId: string;
    attachmentIds: string[];
    rootOperationId: string;
  },
) {
  if (input.attachmentIds.length === 0) return [];
  await lockAttachmentQuota(tx, input.workspaceId);
  await lockDocumentBoundary(tx, input.documentId);
  const { document } = await resolveActiveDocumentForActor(tx, {
    documentId: input.documentId,
    actorId: input.actorId,
    access: "write",
  });
  if (document.workspaceId !== input.workspaceId) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  const [{ databaseNow }] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
    SELECT statement_timestamp() AS "databaseNow"
  `;
  const pending = await tx.attachment.findMany({
    where: {
      id: { in: [...new Set(input.attachmentIds)] },
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      uploadedById: input.actorId,
      status: "PENDING",
      storageKey: { not: null },
      expiresAt: { gt: databaseNow },
    },
    orderBy: { id: "asc" },
  });
  const requestedPending = await tx.attachment.count({
    where: {
      id: { in: [...new Set(input.attachmentIds)] },
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      status: "PENDING",
    },
  });
  if (pending.length !== requestedPending) throw new Error("ATTACHMENT_NOT_FINALIZABLE");
  if (pending.length === 0) return [];
  for (const attachment of pending) {
    const verified = await readAttachmentVerified(attachment.storageKey!);
    if (!attachment.contentSha256 || verified.size !== attachment.size ||
      verified.contentSha256 !== attachment.contentSha256) {
      await quarantineAttachmentInTransaction(tx, attachment, input.rootOperationId);
      throw new Error("ATTACHMENT_NOT_FINALIZABLE");
    }
  }
  const bytes = pending.reduce((sum, attachment) => sum + attachment.reservedBytes, 0n);
  await tx.workspaceAttachmentUsage.update({
    where: { workspaceId: input.workspaceId },
    data: { reservedBytes: { decrement: bytes }, readyBytes: { increment: bytes } },
  });
  await tx.attachment.updateMany({
    where: { id: { in: pending.map(({ id }) => id) }, status: "PENDING" },
    data: { status: "READY", reservedBytes: 0n, readyAt: databaseNow, expiresAt: null },
  });
  return pending.map(({ id }) => id);
}

export async function getReadableAttachment(attachmentId: string, actorId: string) {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, status: "READY", documentId: { not: null }, storageKey: { not: null } },
  });
  if (!attachment?.documentId || !attachment.storageKey) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND);
  }
  await resolveActiveDocumentForActor(prisma, {
    documentId: attachment.documentId,
    actorId,
    access: "read",
  });
  try {
    const verified = await readAttachmentVerified(attachment.storageKey);
    if (!attachment.contentSha256 || verified.size !== attachment.size ||
      verified.contentSha256 !== attachment.contentSha256) {
      await quarantineAttachment(attachment.id, randomUUID());
      throw new Error("ATTACHMENT_INTEGRITY_MISMATCH");
    }
    return { attachment, bytes: verified.bytes };
  } catch {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND);
  }
}

export async function getPendingAttachmentForUploader(attachmentId: string, actorId: string) {
  const databaseNow = await readDatabaseStatementTime(prisma);
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: attachmentId,
      uploadedById: actorId,
      status: "PENDING",
      expiresAt: { gt: databaseNow },
      documentId: { not: null },
      storageKey: { not: null },
    },
  });
  if (!attachment?.documentId || !attachment.storageKey) {
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND);
  }
  await resolveActiveDocumentForActor(prisma, {
    documentId: attachment.documentId,
    actorId,
    access: "write",
  });
  const verified = await readAttachmentVerified(attachment.storageKey);
  if (!attachment.contentSha256 || verified.size !== attachment.size ||
    verified.contentSha256 !== attachment.contentSha256) {
    await quarantineAttachment(attachment.id, randomUUID());
    throw new Error(SERVICE_ERROR_CODES.ATTACHMENT_NOT_FOUND);
  }
  return { attachment, bytes: verified.bytes };
}
```

Implement `quarantineAttachmentInTransaction(tx, attachment, rootOperationId)` in this same file: lock the attachment/quota rows, idempotently move `PENDING.reservedBytes` or `READY.size` into workspace `deletingBytes`, persist that exact amount in `Attachment.deletingChargeBytes`, set `DELETE_PENDING`, `deletionReason: "COMPENSATION"`, `deleteOperationId: rootOperationId`, and append `ATTACHMENT_QUARANTINED` then `ATTACHMENT_DELETE_REQUESTED` with `subjectType: "ATTACHMENT"`, the attachment id, deterministic `deriveSecurityJournalOperationId(...)`, and payload `{stateCode: kind,stateVersion: 1}`. `quarantineAttachment()` creates one root UUID outside its Serializable callback so retries reuse it. Tests cover null digest, size mismatch, digest mismatch, file replacement during the same-descriptor read, idempotent quarantine, exact quota movement, exact two-event payloads, and rollback when journal insertion fails.

Rewrite `lib/attachments/service.ts` as a compatibility boundary. Remove `fetchPastedImageUrl()`, `resolvePublicHttpUrl()`, and all Node HTTP/DNS imports; Task 4 is the only server-side remote fetch path. Preserve the existing exported calls with:

```ts
import { prisma } from "@/lib/db/client";
import { updateDocument } from "@/lib/documents/service";
import {
  abandonPendingAttachment,
  createPendingAttachment,
  getPendingAttachmentForUploader,
  getReadableAttachment,
} from "@/lib/attachments/lifecycle";

export { createPendingAttachment, getPendingAttachmentForUploader, getReadableAttachment };

export type UploadDocumentAttachmentInput = {
  documentId: string;
  actorId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export async function uploadPastedDocumentImageAttachment(input: UploadDocumentAttachmentInput) {
  return createPendingAttachment({
    documentId: input.documentId,
    actorId: input.actorId,
    fileName: input.fileName,
    declaredMimeType: input.mimeType,
    bytes: input.bytes,
    source: "CLIPBOARD_FILE",
  });
}

export async function uploadDocumentAttachment(input: UploadDocumentAttachmentInput) {
  const pending = await createPendingAttachment({
    documentId: input.documentId,
    actorId: input.actorId,
    fileName: input.fileName,
    declaredMimeType: input.mimeType,
    bytes: input.bytes,
    source: "MANUAL_UPLOAD",
  });
  const document = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: { title: true, contentMarkdown: true },
  });
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  const trimmed = document.contentMarkdown.trimEnd();
  try {
    await updateDocument({
      documentId: input.documentId,
      actorId: input.actorId,
      title: document.title,
      contentMarkdown: trimmed ? `${trimmed}\n\n${pending.markdown}` : pending.markdown,
    });
  } catch (error) {
    await abandonPendingAttachment(pending.id, input.actorId, "DOCUMENT_SAVE_FAILED");
    throw error;
  }
  return { ...pending, documentId: input.documentId };
}
```

- [ ] **Step 7: Finalize only attachment ids referenced by the saved document**

Add to `lib/documents/service.ts`:

```ts
import { finalizeReferencedPendingAttachments } from "@/lib/attachments/lifecycle";

export function extractInternalAttachmentIds(contentMarkdown: string) {
  return [...new Set(
    [...contentMarkdown.matchAll(/\/api\/attachments\/([A-Za-z0-9_-]+)(?![A-Za-z0-9_-])/g)]
      .map((match) => match[1]),
  )];
}
```

Inside the existing `updateDocument()` transaction, after `lockDocumentBoundary()` and the active/write recheck but before creating the version and before the transaction returns, add:

```ts
const attachmentIds = extractInternalAttachmentIds(input.contentMarkdown);
await finalizeReferencedPendingAttachments(tx, {
  workspaceId: existing.workspaceId,
  documentId: existing.id,
  actorId: input.actorId,
  attachmentIds,
  rootOperationId: attachmentOperationId,
});
```

Create `const attachmentOperationId = randomUUID()` once in `updateDocument()` before entering its Serializable retry/transaction callback; every retry passes that same root UUID. Do not create a journal root inside the callback.

For the manual upload compatibility path, `uploadDocumentAttachment()` creates a pending row, appends its returned Markdown to the document, and calls `updateDocument()`; this preserves the existing one-click upload while still promoting only inside the active save transaction. Clipboard/data paste returns pending Markdown to the editor and waits for the normal save.

- [ ] **Step 8: Separate pending preview from normal READY reads**

Replace `app/api/attachments/[attachmentId]/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { getReadableAttachment } from "@/lib/attachments/lifecycle";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireCurrentUser();
  try {
    const { attachmentId } = await params;
    const { attachment, bytes } = await getReadableAttachment(attachmentId, user.id);
    const inline = INLINE_IMAGE_TYPES.has(attachment.mimeType);
    return new NextResponse(bytes, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": attachment.mimeType,
        "content-length": String(attachment.size),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${attachment.fileName.replace(/["\\\r\n]/g, "")}"`,
        "content-security-policy": "sandbox; default-src 'none'",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "ATTACHMENT_NOT_FOUND" }, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
```

Create `app/api/attachments/[attachmentId]/pending/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { getPendingAttachmentForUploader } from "@/lib/attachments/lifecycle";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const user = await requireCurrentUser();
  try {
    const { attachmentId } = await params;
    const { attachment, bytes } = await getPendingAttachmentForUploader(attachmentId, user.id);
    const inline = INLINE_IMAGE_TYPES.has(attachment.mimeType);
    return new NextResponse(bytes, {
      headers: {
        "cache-control": "private, no-store",
        "content-type": attachment.mimeType,
        "content-length": String(attachment.size),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${attachment.fileName.replace(/["\\\r\n]/g, "")}"`,
        "content-security-policy": "sandbox; default-src 'none'",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "ATTACHMENT_NOT_FOUND" }, {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
```

Both lifecycle getters return only the completed `VerifiedAttachmentRead.bytes` buffer together with row metadata already compared to that buffer. Construct `NextResponse` directly from those bytes, use the canonical MIME and exact verified byte length, and never pass a file path, fd-backed stream, or second storage read to the response. Canonicalization changes GIF and animated inputs to `image/webp`, so `image/gif` is not an inline stored MIME.

Replace `tests/attachments/route.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getReady } from "@/app/api/attachments/[attachmentId]/route";
import { GET as getPending } from "@/app/api/attachments/[attachmentId]/pending/route";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  getPendingAttachmentForUploader,
  getReadableAttachment,
} from "@/lib/attachments/lifecycle";

vi.mock("@/lib/auth/session", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/attachments/lifecycle", () => ({
  getReadableAttachment: vi.fn(),
  getPendingAttachmentForUploader: vi.fn(),
}));

describe("attachment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: "user-1", email: "user@example.com", name: "User",
    });
  });

  it("keeps a pending attachment off the normal route", async () => {
    vi.mocked(getReadableAttachment).mockRejectedValue(new Error("ATTACHMENT_NOT_FOUND"));
    const response = await getReady(new Request("http://test.local/api/attachments/pending-1"), {
      params: Promise.resolve({ attachmentId: "pending-1" }),
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "ATTACHMENT_NOT_FOUND" });
  });

  it("returns an uploader-authorized pending preview without caching", async () => {
    vi.mocked(getPendingAttachmentForUploader).mockResolvedValue({
      attachment: { id: "pending-1", mimeType: "image/png", size: 4, fileName: "image.png" },
      bytes: new Uint8Array([1, 2, 3, 4]),
    } as Awaited<ReturnType<typeof getPendingAttachmentForUploader>>);
    const response = await getPending(new Request("http://test.local/api/attachments/pending-1/pending"), {
      params: Promise.resolve({ attachmentId: "pending-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="image.png"');
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    await expect(response.arrayBuffer()).resolves.toEqual(Uint8Array.from([1, 2, 3, 4]).buffer);
  });

  it("forces verified non-images to download under sandbox CSP", async () => {
    vi.mocked(getReadableAttachment).mockResolvedValue({
      attachment: { id: "file-1", mimeType: "application/pdf", size: 4, fileName: "report.pdf" },
      bytes: new Uint8Array([1, 2, 3, 4]),
    } as Awaited<ReturnType<typeof getReadableAttachment>>);
    const response = await getReady(new Request("http://test.local/api/attachments/file-1"), {
      params: Promise.resolve({ attachmentId: "file-1" }),
    });
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="report.pdf"');
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
  });

  it("returns the same 404 when the pending caller is not the uploader", async () => {
    vi.mocked(getPendingAttachmentForUploader).mockRejectedValue(new Error("ATTACHMENT_NOT_FOUND"));
    const response = await getPending(new Request("http://test.local/api/attachments/pending-1/pending"), {
      params: Promise.resolve({ attachmentId: "pending-1" }),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "ATTACHMENT_NOT_FOUND" });
  });
});
```

- [ ] **Step 9: Activate only the Issue 6-reserved Leaf 11 projection slot**

Add `listVerifiedReadyAttachmentIds(documentId)` to `lib/attachments/lifecycle.ts`. Query only `READY` rows with non-null storage key and digest, order by id, and call `readAttachmentVerified()` for each. Return an id only when exact size/digest match; on null, missing, or mismatch, call the idempotent quarantine transition and omit it. Never expose a `PENDING`, archived-document, `DELETE_PENDING`, `DELETED`, `FAILED`, null-integrity, or mismatched id.

Also export `verifyRestoredAttachmentIntegrity({documentIds,rootOperationId})`. Lock attachment/quota rows in sorted order, use the same descriptor reader to verify every byte-bearing row, and quarantine null/mismatch/missing rows with the caller-provided stable root; return only opaque counts and the verified attachment ids. Issue 14 calls this seam before making a restored workspace readable. Tests prove a restore containing one corrupt attachment remains locked, the corrupt row is charged in `deletingBytes`, exact canonical quarantine/delete-request events commit, and a retry with the same root is idempotent. Issue 11 exports this seam but never imports Issue 14.

Do not modify `lib/documents/current-view.ts` or `lib/documents/history.ts`; Issue 6
already routes both projections through `lib/documents/downstream/leaf11-attachments.ts`
after its active-document/read authorization. Replace only that reserved baseline so
its two frozen functions call the lifecycle helper and return READY+verified IDs/minimal
history rows. Add tests proving all other state exclusions, a file changed after
promotion is quarantined and absent, a document archived between authorization and
projection returns not found, and both DTOs contain only the previously frozen fields—
never storage keys, hashes, paths, or bytes.

In the same signed Child A candidate, transition the existing owner-map entry for the
slot from its exact `document-acl-closure`-created version-0 baseline to version 1,
state `ACTIVE`, owner `attachment-integrity-lifecycle`, and the new exact hash. The
capability and downstream extension tests reject an absent/mismatched baseline, owner
substitution, unchanged activation hash, direct version jump, any Leaf 11 claim on
Issue 6 core, or any byte diff to current-view/history.

- [ ] **Step 10: Run focused and regression tests to verify green**

Run:

```bash
pnpm exec vitest run tests/attachments/storage-linux.integration.test.ts tests/attachments/service.test.ts tests/attachments/route.test.ts tests/documents/current-view.test.ts tests/documents/history.test.ts tests/documents/service.test.ts tests/workspace-actions.test.ts tests/security/document-downstream-extension-contract.test.ts --reporter=dot
pnpm exec tsc --noEmit
```

Expected: PASS; concurrent reservation never exceeds quota, compensation releases counters, pending reads are uploader-only, and a saved reference promotes to `READY`.

- [ ] **Step 11: Commit the local attachment lifecycle**

```bash
git add package.json pnpm-lock.yaml lib/attachments/validation.ts lib/attachments/lifecycle.ts lib/attachments/service.ts lib/documents/service.ts lib/documents/downstream/leaf11-attachments.ts deploy/security/protected-artifact-owners.json app/api/attachments/\[attachmentId\]/route.ts app/api/attachments/\[attachmentId\]/pending/route.ts tests/attachments/service.test.ts tests/attachments/route.test.ts tests/documents/current-view.test.ts tests/documents/history.test.ts tests/documents/service.test.ts tests/workspace-actions.test.ts tests/security/document-downstream-extension-contract.test.ts wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: validate and finalize pending attachments"
```

Expected: commit succeeds after lifecycle tests and type checking pass.

### Task 3A: Publish, Deploy, and Converge Child Release A Capability v1

**Files:**
- Create: `deploy/security/capabilities/attachment-integrity-lifecycle.json`
- Create: `tests/security/attachment-capability.test.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify: `tests/security/document-downstream-extension-contract.test.ts`
- Create: `lib/attachments/backfill-gate.ts`
- Create: `scripts/attachments/create-backfill-gate.ts`
- Create: `scripts/attachments/verify-backfill-gate.ts`
- Create: `tests/attachments/backfill-gate.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, canonical Leaf 2/4/5/6/13 floor ids, exact release evidence,
  isolated storage/canonicalizer authority evidence, Web no-volume/no-native/no-Sharp
  proof, and pinned KMS trust.
- Produces: `attachment-integrity-lifecycle@1`, a root-owned signed backfill-completion
  record, and the exact verifier later used to authorize only the Child B candidate.

- [ ] **Step 1: Write RED capability, monotonicity, and backfill-gate tests**

Reject a missing/lower dependency, id/version decrease, unknown field, wrong leaf,
wrong candidate/source/floor/live digest, incomplete cursor, any nonzero defect count
including duplicate non-null storage keys or delete-pending rows missing their proof
tuple, failed sampled rehash/canonicalization, Web storage/native/Sharp capability,
authority/canonicalizer peer or self-test failure, stale completion, reused nonce, wrong
signer, invalid signature, and any forbidden row id, storage key, path, filename, MIME,
digest, URL, or content field.

The capability tests also require the exact Leaf 6-reserved slot baseline and permit
only `attachment-integrity-lifecycle@1` to activate its changed hash. They reject any
protected-artifact claim or diff for `lib/documents/current-view.ts` and
`lib/documents/history.ts`. Child A also requires the exact Leaf 4 external-image-import
seam to remain version `0`, state `RESERVED`, with both Leaf 4 renderer-core hashes
unchanged; v1 does not activate or claim that Child B-only seam.

- [ ] **Step 2: Add and compile the Child A v1 fragment**

```json
{"format":"munjib-security-capability-v1","id":"attachment-integrity-lifecycle","version":1,"leaf":11,"requires":["security-journal-auth-tombstones@1","zero-ambient-media-egress@1","active-resource-boundaries@1","document-acl-closure@1","immutable-private-runtime@1"],"evidenceTests":["tests/prisma/attachment-lifecycle-migration.test.ts","tests/attachments/storage-linux.integration.test.ts","tests/attachments/media-canonicalizer.integration.test.ts","tests/security/attachment-media-compromise-chain.test.ts","tests/attachments/image-normalization.test.ts","tests/attachments/backfill-integrity.test.ts","tests/attachments/service.test.ts","tests/attachments/route.test.ts","tests/security/document-downstream-extension-contract.test.ts","tests/security/attachment-capability.test.ts","tests/docker/compose.test.ts"]}
```

The id is stable across both children. Do not create a second Leaf 11 capability id.

- [ ] **Step 3: Implement the exact candidate-bound gate schema**

```ts
export type AttachmentBackfillGateV1 = {
  format: "munjib-attachment-backfill-gate-v1";
  candidateDigest: `sha256:${string}`;
  candidateSourceSha: string;
  observedLiveDigest: `sha256:${string}`;
  observedFloorSha256: string;
  requiredFloorSha256: string;
  capabilityFrom: "attachment-integrity-lifecycle@1";
  capabilityTo: "attachment-integrity-lifecycle@2";
  cursorComplete: true;
  byteBearingNullOrMalformedRows: 0;
  duplicateNonNullStorageKeys: 0;
  deletePendingWithoutJournalProof: 0;
  noncanonicalImageRows: 0;
  quotaLedgerImbalances: 0;
  webStoragePrivilegeViolations: 0;
  skippedRows: 0;
  sampledSameDescriptorRehash: "passed";
  sampledCanonicalReencode: "passed";
  backfillCompletionSha256: string;
  completedAt: string;
  nonce: string;
  signerKeyId: string;
  signature: string;
};
```

Canonical signing covers every field except `signature`. Creation safe-reads fixed
root-owned release/backfill inputs, performs fresh live zero-defect queries, and emits
no row or storage metadata. Verification requires exact Child B candidate
digest/source/floor plus the currently live v1 deployment identity.

- [ ] **Step 4: Verify, review, deploy, and promote Child A**

Run Tasks 1-3 tests, capability/floor compilation, full type/build/wiki gates, then
review and deploy the Child A exact digest. Promote
`attachment-integrity-lifecycle@1` before any execute-mode backfill. Pre-v1 images
become rollback-ineligible at that promotion.

- [ ] **Step 5: Complete production convergence under v1**

Run dry-run, bounded canary, and full execute batches. Require cursor completion, zero
byte-bearing null/malformed rows, zero duplicate non-null storage keys, zero
delete-pending rows without the write-once journal proof tuple, zero noncanonical image
rows, zero quota imbalance, zero Web storage/native/Sharp privilege violations, zero
skipped rows, sampled same-descriptor rehash and one-shot canonical-reencode success,
and no unresolved replacement recovery record. All counts use fresh DB-time queries.
Sign the root-only completion record; do not create or apply a contract migration in
Child A.

### Task 3B: Prepare the Guarded Child B Contract Without Activating v2

**Files:**
- Create in Child B only: the repository-monotonic migration generated with suffix `_require_attachment_integrity`
- Create: `scripts/attachments/run-contract-migration.ts`
- Modify: `tests/attachments/backfill-gate.test.ts`
- Create: `tests/prisma/attachment-lifecycle-contract-migration.test.ts`

**Interfaces:**
- Consumes: deployed v1 with signed convergence evidence and deployed Leaf 10 migration
  `20260712060000_ai_provider_policy`, signed completion evidence, exact Child B
  candidate digest/source/floor, and `verifyAttachmentBackfillGate()`.
- Produces: an unapplied guarded migration containing
  `Attachment_live_integrity_check`, proof-pair constraints, and unique non-null
  `storageKey`, plus the prepared base for Tasks 4–7. It does not modify a capability,
  owner tuple, external-image seam, or production schema.

- [ ] **Step 1: Allocate the migration only after the Child B branch is rebased**

Only after Leaf 10 `20260712060000_ai_provider_policy` is deployed and Child A v1's
signed production convergence passes, create/rebase Child B and use Leaf 13's
`deploy/security/migration-ledger.json` allocator to
reserve the next UTC identifier strictly greater than `20260712060000`, then run Prisma create-only with suffix
`require_attachment_integrity` against the isolated development database. Require the generated
identifier to sort strictly after every migration then present and record it back into
the signed candidate migration ledger. Tests discover the
single directory by suffix and fail if it exists in Child A, is duplicated, sorts
earlier, or uses any contract identifier preallocated before the Child B rebase.

- [ ] **Step 2: Add the contract and its mandatory preflight**

```sql
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_live_integrity_check"
  CHECK (
    "status" IN ('DELETED', 'FAILED') OR
    ("status" = 'PENDING' AND "storageKey" IS NULL AND
      "contentSha256" IS NULL AND "size" = 0) OR
    ("storageKey" IS NOT NULL AND
      "contentSha256" ~ '^[0-9a-f]{64}$' AND "size" >= 0)
  ) NOT VALID;
ALTER TABLE "Attachment" VALIDATE CONSTRAINT "Attachment_live_integrity_check";

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_delete_request_proof_check"
  CHECK (
    ("deleteRequestSequence" IS NULL AND "deleteRequestEntryHash" IS NULL) OR
    ("deleteRequestSequence" > 0 AND
      "deleteRequestEntryHash" ~ '^[0-9a-f]{64}$')
  ) NOT VALID;
ALTER TABLE "Attachment"
  VALIDATE CONSTRAINT "Attachment_delete_request_proof_check";

CREATE UNIQUE INDEX "Attachment_storageKey_nonnull_key"
  ON "Attachment" ("storageKey")
  WHERE "storageKey" IS NOT NULL;
```

Immediately before applying, the guarded runner rechecks zero duplicate non-null
storage keys, zero live/delete-pending integrity defects, zero missing/partial/mismatched
proof tuples, exact one journal owner for each tuple, zero unresolved authority recovery
records, and zero Web storage privilege violations. It then verifies the KMS-signed
`munjib-attachment-backfill-gate-v1` against the exact running v1 state and Child B
candidate before invoking the fixed migrator path. Direct generic migration execution
that can apply this contract without the gate fails deploy-source tests.

- [ ] **Step 3: Build Child B and prepare its gate without migrating**

Build and attest the Child B candidate without applying migrations. Exercise gate
creation against an isolated copy using the signed completion record plus a fresh live
check, but production application remains deferred to Task 8. Any live digest/floor/
count/cursor/recovery/nonce/signature drift blocks. Validation failure leaves v1 live
and the expand schema intact; never drop or weaken a constraint.

- [ ] **Step 4: Freeze the pending final-activation inputs**

Record the migration hash, exact greater-than-`060000` ledger entry, current v1
capability/hash, Leaf 4 version-0 seam and safe-URL-closed renderer hashes, authority/
canonicalizer/worker artifacts, and Task 8 evidence checklist. Tasks 4–7 exist only in
Child B but do not publish v2 or activate the external-image seam. Production remains
on the expand schema and v1 floor until final Task 8.

### Task 4: Stage Remote Images and Require Explicit Import

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `components/document-editor/remote-image-candidates.ts`
- Create: `components/document-editor/clipboard-html.ts`
- Create: `components/document-editor/remote-image-import-dialog.tsx`
- Create: `components/markdown/leaf11-external-image-import-controls.tsx`
- Modify: `components/document-editor.tsx`
- Modify: `components/document-editor/types.ts`
- Verify unchanged: `components/markdown/downstream/leaf11-external-image-import.tsx`
- Verify unchanged: `deploy/security/protected-artifact-owners.json`
- Modify: `tests/components/document-editor-preview.test.tsx`
- Create: `tests/components/remote-image-candidates.test.ts`
- Create: `tests/components/clipboard-html.test.ts`
- Create: `tests/security/external-image-import-slot.test.ts`
- Create: `tests/e2e/explicit-image-import.spec.ts`

**Interfaces:**
- Consumes: Issue 4's exact passive `components/markdown/downstream/leaf11-external-image-import.tsx` version-0 baseline, its `ExternalMediaRequest { kind, href, originLabel, label }`/`prepareLeaf11ExternalMediaRequest()` contract, the safe-URL/backslash-closed `safeMarkdownLinkHref`, the already-delegating byte-identical `ExternalMediaInterstitial`/`buildSafeMarkdownComponents()` cores, and Task 3 pending attachment result `{ markdown, pendingPreviewUrl }`.
- Produces: Leaf 11-owned controls/dialog/context helpers, opaque `RemoteImageCandidate`, one pure bounded parse5 AST traversal, staged confirmation UI, and `importExternalImageAction(formData): Promise<{ markdown: string; pendingPreviewUrl: string }>` consumed by Task 5. The reserved seam remains byte-identical at version 0 until Task 8. No current or compatibility paste path can fetch before authentication, active-write authorization, explicit confirmation, and durable PENDING reservation. Issue 4's safe-media/interstitial/seam and owner map are not modified or staged in Task 4.

- [ ] **Step 1: Write bounded candidate-filter and zero-fetch-before-confirm tests**

Create `tests/components/remote-image-candidates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractRemoteImageCandidates } from "@/components/document-editor/remote-image-candidates";

describe("remote image candidate extraction", () => {
  it("returns only opaque visible http(s) candidates and exposes origins without paths", () => {
    const result = extractRemoteImageCandidates(`
      <img src="https://cdn.example.test/private/a.png?token=synthetic" alt="A">
      <img hidden src="https://hidden.example.test/a.png">
      <img width="1" height="1" src="https://pixel.example.test/p.gif">
      <img style="display:none" src="https://style.example.test/p.png">
      <img src="data:image/png;base64,AA==">
      <img src="javascript:alert(1)">
    `);
    expect(result).toEqual({
      candidates: [{
        id: expect.any(String),
        origin: "https://cdn.example.test",
      }],
      rejectedCount: 5,
      tooMany: false,
    });
  });

  it("rejects the entire remote batch when the visible count exceeds eight", () => {
    const html = Array.from({ length: 9 }, (_, index) =>
      `<img src="https://cdn.example.test/${index}.png" alt="${index}">`,
    ).join("");
    expect(extractRemoteImageCandidates(html)).toMatchObject({
      candidates: [],
      rejectedCount: 9,
      tooMany: true,
    });
  });

  it("fails closed on parser limits and ignores every non-img URL-bearing construct", () => {
    const hostile = `
      <base href="https://attacker.invalid/base/">
      <iframe src="https://attacker.invalid/frame"></iframe>
      <object data="https://attacker.invalid/object"></object>
      <svg><image href="https://attacker.invalid/svg"></image></svg>
      <style>@import url(https://attacker.invalid/css)</style>
      <meta http-equiv="refresh" content="0;url=https://attacker.invalid/meta">
      <img srcset="https://attacker.invalid/a 1x" src="https://cdn.example.test/a.png">
    `;
    expect(extractRemoteImageCandidates(hostile)).toMatchObject({
      candidates: [],
      unsafe: true,
    });
    expect(extractRemoteImageCandidates("<div>".repeat(33))).toMatchObject({
      candidates: [],
      unsafe: true,
    });
    expect(extractRemoteImageCandidates("x".repeat(65_537))).toMatchObject({
      candidates: [],
      unsafe: true,
    });
  });
});
```

Replace the existing automatic remote-rich-HTML test in `tests/components/document-editor-preview.test.tsx` with:

```ts
it("stages rich HTML remote images and calls the server only after confirmation", async () => {
  const importExternalImageAction = vi.fn(async () => ({
    markdown: "![remote](/api/attachments/pending-remote)",
    pendingPreviewUrl: "/api/attachments/pending-remote/pending",
  }));
  renderEditor("Intro", { importExternalImageAction });
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  await screen.findByLabelText("Markdown editor");
  const replaceSelection = vi.fn((text: string) => ({ changes: text }));
  const dispatch = vi.fn();
  const event = {
    preventDefault: vi.fn(),
    clipboardData: {
      files: [],
      items: [],
      getData: (type: string) => type === "text/html"
        ? '<p><img src="https://cdn.example.test/private/source.png?synthetic=1" alt="diagram"></p>'
        : "",
    },
  } as unknown as ClipboardEvent;

  expect(codeMirrorHarness.pasteHandlers[0](event, {
    state: { replaceSelection, doc: { toString: () => "Intro" }, selection: { ranges: [] }, sliceDoc: () => "" },
    dispatch,
  })).toBe(true);
  expect(replaceSelection).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  expect(importExternalImageAction).not.toHaveBeenCalled();
  expect(await screen.findByText("1 external image from https://cdn.example.test")).toBeTruthy();
  expect(screen.queryByText(/private\/source\.png/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Import into workspace" }));
  await vi.waitFor(() => expect(importExternalImageAction).toHaveBeenCalledTimes(1));
  const form = importExternalImageAction.mock.calls[0][0];
  expect(form.get("documentId")).toBe("doc-1");
  expect(form.get("imageUrl")).toBe("https://cdn.example.test/private/source.png?synthetic=1");
  expect(form.has("fileName")).toBe(false);
  await vi.waitFor(() => expect(saveDocumentDraft).toHaveBeenCalledBefore(closeRemoteImageDialog));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
    changes: expect.arrayContaining([
      expect.objectContaining({ insert: "![remote](/api/attachments/pending-remote)" }),
    ]),
  }));
});

it("keeps a plain remote image URL as a link until Import as image is selected", async () => {
  const importExternalImageAction = vi.fn(async () => ({
    markdown: "![plain](/api/attachments/pending-plain)",
    pendingPreviewUrl: "/api/attachments/pending-plain/pending",
  }));
  renderEditor("https://cdn.example.test/plain.png", { importExternalImageAction });
  expect(importExternalImageAction).not.toHaveBeenCalled();
  expect(screen.queryByRole("img", { name: /plain/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Import as image" }));
  expect(await screen.findByText("1 external image from https://cdn.example.test")).toBeTruthy();
  expect(importExternalImageAction).not.toHaveBeenCalled();
});
```

Create `tests/security/external-image-import-slot.test.ts`. Snapshot the exact merged
Issue 4 hashes of `components/markdown/safe-media.tsx` and
`components/markdown/external-media-interstitial.tsx`; require them to remain unchanged.
Require the owner-map baseline for
`components/markdown/downstream/leaf11-external-image-import.tsx` to be version `0`,
state `RESERVED`, reserved owner `attachment-integrity-lifecycle`, and require it to
remain byte-identical throughout Tasks 4–7. Exercise the Leaf 11 helper directly: it
must perform zero network/action/storage work before the user clicks `Import as image`
and separately confirms the dialog. Link requests and a missing active-document import
context render no import control. A separate Task 8 fixture RED-expects the sole exact
`0 -> 1` activation after every final gate.

- [ ] **Step 2: Run component tests to verify red**

Run: `pnpm exec vitest run tests/components/clipboard-html.test.ts tests/components/remote-image-candidates.test.ts tests/components/document-editor-preview.test.tsx tests/security/external-image-import-slot.test.ts --reporter=dot`

Expected: FAIL because remote image paste calls the server immediately, candidate
staging does not exist, and no pure bounded parser contract exists. The Leaf 4 reserved
slot remaining at version 0 is required GREEN behavior for this task.

- [ ] **Step 3: Install and implement a pure, bounded parse5 AST extractor**

Run `pnpm add parse5` so the parser is a direct production dependency. Do not use
`DOMParser`, `innerHTML`, `createContextualFragment`, a browser document, React
rendering, Markdown rendering, image decoders, or any other URL-consuming sink to
inspect clipboard HTML. A detached `text/html` document is not an acceptable
security boundary because parsing can initiate subresource downloads. The same
pure function runs in every supported browser bundle and in tests.

Create `components/document-editor/remote-image-candidates.ts`:

```ts
import {
  parseFragment,
  type DefaultTreeAdapterMap,
} from "parse5";

export const MAX_REMOTE_IMAGE_CANDIDATES = 8;
const MAX_CLIPBOARD_HTML_BYTES = 64 * 1024;
const MAX_AST_NODES = 2_048;
const MAX_AST_DEPTH = 32;
const MAX_ATTRIBUTES_PER_ELEMENT = 32;
const MAX_ATTRIBUTE_VALUE_BYTES = 2_048;
const MAX_TOTAL_ATTRIBUTE_BYTES = 64 * 1024;
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const FORBIDDEN_URL_BEARING_TAGS = new Set([
  "audio", "base", "embed", "iframe", "link", "meta", "object", "script",
  "source", "style", "track", "video",
]);
const encoder = new TextEncoder();

export type RemoteImageCandidate = Readonly<{
  id: string;
  origin: string;
}>;

const remoteUrls = new WeakMap<RemoteImageCandidate, string>();

function createOpaqueCandidate(url: URL): RemoteImageCandidate {
  const candidate = Object.freeze({
    id: globalThis.crypto.randomUUID(),
    origin: url.origin,
  });
  remoteUrls.set(candidate, url.href);
  return candidate;
}

export function remoteImageUrlForCandidate(candidate: RemoteImageCandidate) {
  const url = remoteUrls.get(candidate);
  if (!url) throw new Error("REMOTE_IMAGE_CANDIDATE_EXPIRED");
  return url;
}

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

function attributes(element: Element) {
  return new Map(element.attrs.map(({ name, value }) => [name.toLowerCase(), value]));
}

function hiddenOrTrackingPixel(attrs: Map<string, string>, ancestorHidden: boolean) {
  const style = (attrs.get("style") ?? "").replace(/\s+/g, "").toLowerCase();
  const width = Number(attrs.get("width") ?? 0);
  const height = Number(attrs.get("height") ?? 0);
  return ancestorHidden || attrs.has("hidden") || attrs.get("aria-hidden") === "true" ||
    style.includes("display:none") || style.includes("visibility:hidden") ||
    /(?:^|;)opacity:0(?:;|$)/.test(style) ||
    (width > 0 && width <= 1) || (height > 0 && height <= 1);
}

export function extractRemoteImageCandidates(html: string) {
  const empty = {
    candidates: [] as RemoteImageCandidate[],
    rejectedCount: 0,
    tooMany: false,
    unsafe: false,
  };
  if (!html.trim()) return empty;
  if (encoder.encode(html).byteLength > MAX_CLIPBOARD_HTML_BYTES) {
    return { ...empty, rejectedCount: 1, unsafe: true };
  }

  const fragment = parseFragment(html, { sourceCodeLocationInfo: false });
  const candidates: RemoteImageCandidate[] = [];
  let rejectedCount = 0;
  let nodeCount = 0;
  let attributeBytes = 0;
  let unsafe = false;

  const visit = (node: Node, depth: number, ancestorHidden: boolean): void => {
    if (unsafe) return;
    nodeCount += 1;
    if (nodeCount > MAX_AST_NODES || depth > MAX_AST_DEPTH) { unsafe = true; return; }
    if ("tagName" in node) {
      const element = node as Element;
      if (element.attrs.length > MAX_ATTRIBUTES_PER_ELEMENT) { unsafe = true; return; }
      for (const { name, value } of element.attrs) {
        const bytes = encoder.encode(`${name}\0${value}`).byteLength;
        if (bytes > MAX_ATTRIBUTE_VALUE_BYTES) { unsafe = true; return; }
        attributeBytes += bytes;
        if (attributeBytes > MAX_TOTAL_ATTRIBUTE_BYTES) { unsafe = true; return; }
      }
      const attrs = attributes(element);
      const presentUrlAttributes = [
        "action", "data", "formaction", "href", "poster", "src", "srcset", "xlink:href",
      ].filter((name) => attrs.has(name));
      const allowedUrlAttributes =
        (element.tagName === "a" && presentUrlAttributes.every((name) => name === "href")) ||
        (element.tagName === "img" && presentUrlAttributes.every((name) => name === "src"));
      if (FORBIDDEN_URL_BEARING_TAGS.has(element.tagName) ||
          (presentUrlAttributes.length > 0 && !allowedUrlAttributes) ||
          (element.namespaceURI !== HTML_NAMESPACE && presentUrlAttributes.length > 0) ||
          (attrs.get("style") ?? "").toLowerCase().includes("url(")) {
        unsafe = true;
        return;
      }
      const hidden = hiddenOrTrackingPixel(attrs, ancestorHidden);
      if (element.tagName === "img") {
        if (attrs.has("srcset")) { unsafe = true; return; }
        const raw = attrs.get("src")?.trim() ?? "";
        let url: URL;
        try { url = new URL(raw); } catch { rejectedCount += 1; return; }
        const defaultPort = (url.protocol === "http:" && (!url.port || url.port === "80")) ||
          (url.protocol === "https:" && (!url.port || url.port === "443"));
        if (!defaultPort || url.username || url.password || hidden) {
          rejectedCount += 1;
          return;
        }
        candidates.push(createOpaqueCandidate(url));
      }
      for (const child of element.childNodes) visit(child, depth + 1, hidden);
      return;
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) visit(child, depth + 1, ancestorHidden);
    }
  };
  visit(fragment, 0, false);

  if (unsafe) {
    return { ...empty, rejectedCount: rejectedCount + candidates.length + 1, unsafe: true };
  }
  if (candidates.length > MAX_REMOTE_IMAGE_CANDIDATES) {
    return { ...empty, rejectedCount: rejectedCount + candidates.length, tooMany: true };
  }
  return { candidates, rejectedCount, tooMany: false, unsafe: false };
}
```

The production implementation preserves these exact caps and fail-closed
results. It never serializes the AST, appends any parsed node, or returns any
attribute except an opaque candidate plus normalized origin. `srcset` makes the
whole batch unsafe; `iframe`, `object`, `embed`, `link`, `style`, `meta`, `base`,
SVG URL attributes, CSS URLs, and every non-`img[src]` URL-bearing construct are
inert AST data and never become candidates or DOM nodes. A parse/cap failure
stages nothing and shows one fixed local error without echoing clipboard input.

The parse5 traversal itself lives in `components/document-editor/clipboard-html.ts`
and is the only rich-HTML clipboard parser. Export:

```ts
export type ClipboardMarkdownSegment =
  | Readonly<{ kind: "markdown"; value: string }>
  | Readonly<{ kind: "remote-image"; candidate: RemoteImageCandidate }>
  | Readonly<{ kind: "data-image"; id: string; mimeType: string }>;

export type ParsedClipboardHtml = Readonly<{
  segments: readonly ClipboardMarkdownSegment[];
  candidates: readonly RemoteImageCandidate[];
  dataImages: ReadonlyMap<string, Uint8Array>;
  rejectedCount: number;
  unsafe: boolean;
}>;

export function parseClipboardHtml(input: {
  html: string;
  plainText: string;
}): ParsedClipboardHtml;
```

One bounded AST pass converts only text, paragraphs, breaks, emphasis/strong,
code/pre, blockquote, headings, ordered/unordered lists, and safe `a[href]` into escaped
Markdown segments. Unknown elements flatten text children and never serialize HTML or
attributes. `img[data:]` becomes an opaque data-image segment after bounded strict
base64/MIME decoding; `img[http(s):]` becomes an opaque remote candidate segment;
neither URL/data value enters React props or DOM. `a[href]` is normalized through
Issue 4 `safeMarkdownLinkHref`; unsafe schemes flatten to label text. Any URL-bearing
attribute outside exact `a[href]` or `img[src]`, any `srcset`, CSS `url(`, forbidden
active/media element, AST cap, malformed data URL, duplicate placeholder id, or parser
failure makes the whole HTML result `unsafe`. Then the paste handler inserts only the
clipboard's separately supplied `text/plain` value after normal text caps/escaping, or
rejects with a fixed message when plain text is absent. It never calls the former
`htmlToMarkdownWithImagePlaceholders()`.

When there are no image segments, insert the pure Markdown result immediately. When
there are images, insert nothing until data-image upload and remote confirmation
complete. The staged state stores segments, opaque id/origin, and bounded data bytes;
URLs remain only in module-private maps. Success replaces every image segment with an
internal attachment Markdown result and inserts the complete segment list once.
Cancel replaces remote image segments with origin-only text and never persists the
source path/query. Add tests for ordinary formatted HTML, mixed text/data/remote
images, plain-text fallback, caps, malformed markup, and every hostile non-img URL
carrier (`video`, `audio`, `source`, `track`, `script`, `iframe`, `object`, `embed`,
`form[action]`, `button[formaction]`, CSS URL, SVG href, meta refresh, base, link).

- [ ] **Step 4: Add a confirmation dialog that never renders or logs the URL path**

Create `components/document-editor/remote-image-import-dialog.tsx`:

```tsx
"use client";

import type { RemoteImageCandidate } from "@/components/document-editor/remote-image-candidates";
import { Button } from "@/components/ui/button";

export function RemoteImageImportDialog(props: {
  candidates: RemoteImageCandidate[];
  rejectedCount: number;
  importing: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const origins = [...new Set(props.candidates.map(({ origin }) => origin))];
  if (props.candidates.length === 0) return null;
  return (
    <div role="dialog" aria-label="External image import" className="rounded border p-3">
      <p>{props.candidates.length} external image{props.candidates.length === 1 ? "" : "s"} from {origins.join(", ")}</p>
      {props.rejectedCount > 0 ? <p>{props.rejectedCount} hidden, tiny, or unsupported image{props.rejectedCount === 1 ? " was" : "s were"} rejected.</p> : null}
      <p>Importing sends the selected URLs to the isolated image fetcher.</p>
      <Button type="button" variant="outline" disabled={props.importing} onClick={props.onCancel}>Keep as links</Button>
      <Button type="button" disabled={props.importing} onClick={props.onConfirm}>Import into workspace</Button>
    </div>
  );
}
```

- [ ] **Step 5: Wire rich HTML, plain URL, document preview, and AI output to one explicit action**

Add to `components/document-editor/types.ts`:

```ts
export type ImportExternalImageAction = (formData: FormData) => Promise<{
  markdown: string;
  pendingPreviewUrl: string;
}>;
```

In `components/document-editor.tsx`, keep the current immediate `File`/`data:` branch, but replace the remote branch with these state and callbacks:

```tsx
const [remoteImageStage, setRemoteImageStage] = useState<{
  candidates: RemoteImageCandidate[];
  rejectedCount: number;
} | null>(null);
const [isImportingRemoteImages, setIsImportingRemoteImages] = useState(false);

const stageRemoteImages = useCallback((html: string, view: EditorView) => {
  const extracted = extractRemoteImageCandidates(html);
  if (extracted.unsafe) {
    toast.error("External image markup was rejected.");
    return true;
  }
  if (extracted.tooMany) {
    toast.error("Too many external images; no images were imported.");
    return true;
  }
  if (extracted.candidates.length === 0) return false;
  setRemoteImageStage(extracted);
  return true;
}, []);

const confirmRemoteImageImport = useCallback(async () => {
  if (!document || !remoteImageStage || !importExternalImageAction) return;
  setIsImportingRemoteImages(true);
  try {
    const replacements: string[] = [];
    for (const candidate of remoteImageStage.candidates) {
      const formData = new FormData();
      formData.set("documentId", document.id);
      formData.set("imageUrl", remoteImageUrlForCandidate(candidate));
      const result = await importExternalImageAction(formData);
      replacements.push(result.markdown);
    }
    const view = editorViewRef.current;
    if (!view) throw new Error("EDITOR_UNAVAILABLE");
    view.dispatch(view.state.replaceSelection(replacements.join("\n\n")));
    await saveDocumentDraft(view.state.doc.toString());
    setRemoteImageStage(null);
  } catch {
    toast.error("External image import failed");
  } finally {
    setIsImportingRemoteImages(false);
  }
}, [document, importExternalImageAction, remoteImageStage]);
```

Render `RemoteImageImportDialog` beside the editor and pass the callbacks. Delete the
old DOM-based rich paste helper. The paste handler always calls
`parseClipboardHtml({html,plainText})` once, follows its unsafe/plain-text fallback,
inserts pure Markdown immediately only when there are no image segments, and otherwise
stages the opaque segment result. There is no second HTML parse or local-data fallback
that can construct a document. Detect an exact selected/plain `http(s)` image URL and
expose an `Import as image` button that stages one candidate without calling the
action.

Do not edit Issue 4's `safe-media.tsx`, `external-media-interstitial.tsx`, or reserved
downstream seam. Prepare the Leaf 11 helper and tests now, but reserve the following
exact version-1 seam body for Task 8 only; it must not exist in the Task 4–7 staged diff:

```tsx
"use client";

import { Leaf11ExternalImageImportControls } from "@/components/markdown/leaf11-external-image-import-controls";

export type ExternalMediaRequest = {
  kind: "link" | "image";
  href: string;
  originLabel: string;
  label: string;
};

export const leaf11ExternalImageImportSlotVersion = 1 as const;

export function prepareLeaf11ExternalMediaRequest(
  request: ExternalMediaRequest,
): ExternalMediaRequest {
  return Object.freeze({ ...request });
}

export function Leaf11ExternalImageImportSlot(props: {
  request: ExternalMediaRequest | null;
  onClose(): void;
}) {
  return <Leaf11ExternalImageImportControls {...props} />;
}
```

Create `components/markdown/leaf11-external-image-import-controls.tsx` as a Leaf 11-
owned helper. It exports the provider/registration hook plus controls. The provider is
fail closed until it has an active writable document id, the bound authenticated import
action, and an insertion/save callback registered by that document's `DocumentEditor`;
a stale document id unregisters the callback. Controls render nothing for a null/link
request or without that exact context. For an image request received after the Issue 4
click, controls render only an `Import as image` button. That button calls the context's
pure `stageExternalImageRequest(request)` helper, stores the URL only in the module-
private candidate map behind a new opaque id, closes the existing external-open dialog,
and opens `RemoteImageImportDialog` with origin/count only. It performs no browser or
server fetch. The separate dialog confirmation is the only call to the authenticated
server importer; success hands only returned internal attachment Markdown to the
registered editor callback and awaits the document save before clearing the stage.

Task 8 alone transitions the existing owner-map entry from the exact safe-URL-closed
`zero-ambient-media-egress` version-0 hash to version `1`, state `ACTIVE`, owner
`attachment-integrity-lifecycle`, and the new exact hash. Reject an absent/stale
pre-backslash-fix baseline, owner substitution, same-hash activation, version skip, or
any diff/claim/staging entry for `components/markdown/safe-media.tsx` or
`components/markdown/external-media-interstitial.tsx`.

Before confirmation, raw URL bytes exist only in Issue 4's post-click closure/request
and the module-private WeakMap. Serializable React candidate state, props crossing a
server boundary, DOM attributes, hidden fields, and telemetry contain only opaque id,
origin, and fixed labels. The helper stages the URL behind a new opaque id and closes
the external-open dialog; it performs no server/browser fetch. Confirmation in
`RemoteImageImportDialog` creates exactly one transient `FormData` and is the separate
action that calls the server importer. Link requests never receive the import action.

Ask AI, Workspace AI, raw Markdown import, and direct editor preview reuse Issue 4's
post-click `ExternalMediaRequest` interstitial hook; they do not parse rendered DOM.
The browser URL exists only in the module-private `WeakMap`, Issue 4's click closure/
post-click request, and the one confirmed `FormData`; candidate state and DOM contain
only opaque id and origin. After confirmation it exists transiently only in that
`FormData`, the Server Action local, one bounded app-to-fetcher request, and fetcher/
canonicalizer pipe memory. It never enters DB state, a filename, redirect/revalidation,
audit, telemetry, log, long-lived cache, or serialized error. Insert only returned
internal attachment Markdown and await document save before closing the dialog.

- [ ] **Step 6: Add a multi-browser zero-request checkpoint**

Create `tests/e2e/explicit-image-import.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("all hostile rich HTML stays network inert until explicit confirmation", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("attacker.invalid")) requests.push(request.url());
  });
  await page.goto("/workspaces/company-handbook?document=getting-started");
  await page.getByRole("button", { name: /edit/i }).click();
  const editor = page.getByLabel("Markdown editor");
  await editor.focus();
  await page.evaluate(() => {
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    event.clipboardData?.setData(
      "text/html",
      [
        '<img src="https://attacker.invalid/private.png?synthetic=1" alt="synthetic">',
        '<img srcset="https://attacker.invalid/srcset.png 1x">',
        '<iframe src="https://attacker.invalid/frame"></iframe>',
        '<object data="https://attacker.invalid/object"></object>',
        '<video poster="https://attacker.invalid/poster"><source src="https://attacker.invalid/video"></video>',
        '<audio src="https://attacker.invalid/audio"></audio>',
        '<script src="https://attacker.invalid/script"></script>',
        '<form action="https://attacker.invalid/form"><button formaction="https://attacker.invalid/button">x</button></form>',
        '<svg><image href="https://attacker.invalid/svg"></image></svg>',
        '<style>@import url(https://attacker.invalid/style)</style>',
        '<meta http-equiv="refresh" content="0;url=https://attacker.invalid/meta">',
        '<base href="https://attacker.invalid/base/">',
      ].join(""),
    );
    document.activeElement?.dispatchEvent(event);
  });
  await expect(page.getByText("External image markup was rejected.")).toBeVisible();
  expect(requests).toEqual([]);
  await expect(page.getByRole("button", { name: "Import into workspace" })).toHaveCount(0);
});
```

Add a second clean `<img src>` case that proves one candidate is staged, no
request occurs before confirmation, and exactly one action request occurs after
confirmation. Run both cases under Chromium, Firefox, and WebKit. Add a static
source-contract assertion that the clipboard candidate module and paste helper
contain none of `DOMParser`, `innerHTML`, `outerHTML`,
`createContextualFragment`, `document.implementation`, or JSX/React rendering.
The editor source also contains no call or definition of
`htmlToMarkdownWithImagePlaceholders`; `clipboard-html.ts` is the sole HTML parser.
The repository source contract also rejects `fetchPastedImageUrl`, `resolvePublicHttpUrl`,
any URL-taking branch of `pasteDocumentImageAttachmentAction`, and any worker call that
is reachable before `requireCurrentUser()` plus `reserveRemoteImport()` completes.
Action tests assert exact order `authenticate -> active-write lock/authorization ->
PENDING quota reservation -> worker request`; denial or reservation failure produces
zero worker calls and no attachment/quota mutation.
The browser request listener and a catch-all route interceptor both fail on any
external scheme/host before confirmation, including requests created during
parsing rather than by the application action.

- [ ] **Step 7: Run UI and zero-egress tests to verify green**

Run:

```bash
pnpm exec vitest run tests/components/clipboard-html.test.ts tests/components/remote-image-candidates.test.ts tests/components/document-editor-preview.test.tsx tests/components/ai-answer.test.tsx tests/security/external-image-import-slot.test.ts --reporter=dot
pnpm exec playwright test tests/e2e/explicit-image-import.spec.ts --project=chromium --project=firefox --project=webkit
```

Expected: PASS; the action call count is zero before confirmation and exactly one
afterward, the browser never requests the external host, the reserved slot remains
version 0 and byte-identical, and both Leaf 4 renderer-core hashes are unchanged.

- [ ] **Step 8: Commit explicit staging UI**

```bash
git add package.json pnpm-lock.yaml components/document-editor/clipboard-html.ts components/document-editor/remote-image-candidates.ts components/document-editor/remote-image-import-dialog.tsx components/document-editor.tsx components/document-editor/types.ts components/markdown/leaf11-external-image-import-controls.tsx tests/components/clipboard-html.test.ts tests/components/remote-image-candidates.test.ts tests/components/document-editor-preview.test.tsx tests/security/external-image-import-slot.test.ts tests/e2e/explicit-image-import.spec.ts wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
if git diff --cached --name-only | rg -q '^components/markdown/(safe-media|external-media-interstitial)\.tsx$'; then echo 'Leaf 4 renderer core staged' >&2; exit 1; fi
if git diff --cached --name-only | rg -q '^components/markdown/downstream/leaf11-external-image-import\.tsx$|^deploy/security/protected-artifact-owners\.json$'; then echo 'Task 8 activation staged early' >&2; exit 1; fi
git commit -m "security: require explicit external image import"
```

Expected: commit succeeds with no external URL or restricted plan staged.
The staged file list must not contain `components/markdown/safe-media.tsx` or
`components/markdown/external-media-interstitial.tsx`.

### Task 5: Fetch Through a Credential-Free, Public-Web-Only Worker

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `services/attachment-fetch-worker/url-policy.mjs`
- Verify absent: `services/attachment-fetch-worker/validate-image.mjs`
- Create: `services/attachment-fetch-worker/fetch-image.mjs`
- Create: `services/attachment-fetch-worker/server.mjs`
- Create: `deploy/attachments/attested-root-bundle/manifest.json`
- Create: `deploy/attachments/attested-root-bundle/munjib-attachment-egress-policy`
- Create: `deploy/attachments/attested-root-bundle/munjib-attachment-fetch-lifecycle`
- Create: `deploy/attachments/attested-root-bundle/docker-compose.attachment-fetch.yml`
- Create: `deploy/attachments/attested-root-bundle/dispatcher-operation.json`
- Create: `scripts/attachments/build-egress-root-bundle-manifest.ts`
- Create: `scripts/attachments/verify-egress-policy.ts`
- Create: `tests/attachments/egress-policy.test.ts`
- Create: `tests/attachments/egress-bootstrap.test.ts`
- Create: `tests/attachments/worker-lifecycle.test.ts`
- Create: `lib/attachments/remote-import.ts`
- Modify: `lib/attachments/lifecycle.ts`
- Modify: `app/workspaces/[workspaceSlug]/actions.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Modify: `Dockerfile`
- Modify: `scripts/docker/release-entrypoint.sh`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `.env.example`
- Modify: `.env.docker.example`
- Create: `tests/attachments/url-policy.test.ts`
- Create: `tests/attachments/remote-import.test.ts`
- Create: `tests/attachments/worker-errors.test.ts`
- Create: `tests/attachments/worker-transport.test.ts`
- Modify: `tests/workspace-actions.test.ts`
- Modify: `tests/docker/compose.test.ts`

**Interfaces:**
- Consumes: Task 3 signed-receipt/storage/quota client, the Task 2 one-shot media canonicalizer, and Task 4's fail-closed external-image-import provider, registered editor insertion callback, and `importExternalImageAction` prop.
- Produces: raw-fetch worker `POST /fetch` accepting `{ url: string, operationId: string }`, streaming only bounded undecoded bytes to the one-shot canonicalizer, and returning only its signed canonical receipt; app `importExternalDocumentImage()` and server action `importExternalDocumentImageAction()`; page-level action/provider wiring shared by preview, Ask AI, and Workspace AI. No other code may fetch a remote image URL, and no Web/fetcher path may decode or re-encode.

- [ ] **Step 1: Install the IP parser and write failing URL-policy tests**

Run: `pnpm add ipaddr.js`

Expected: `ipaddr.js` is a direct production dependency and the lockfile changes.

Create `tests/attachments/url-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateRemoteImageUrl } from "../../services/attachment-fetch-worker/url-policy.mjs";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

describe("remote image URL policy", () => {
  it.each([
    "ftp://example.test/image.png",
    "//example.test/image.png",
    "https://user:pass@example.test/image.png",
    "http://example.test:443/image.png",
    "https://example.test:80/image.png",
    "https://example.test:444/image.png",
  ])("rejects forbidden scheme, credentials, or effective port: %s", async (raw) => {
    await expect(validateRemoteImageUrl(raw, { lookup: publicLookup, blockedHosts: [] }))
      .rejects.toThrow("REMOTE_IMAGE_URL_FORBIDDEN");
  });

  it.each([
    "0.0.0.1", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.168.0.1", "198.18.0.1",
    "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1",
    "::", "::1", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1",
    "64:ff9b::7f00:1", "64:ff9b:1::7f00:1", "2002:7f00:1::", "2001:0000::1",
    "::ffff:127.0.0.1",
  ])("rejects special address %s", async (address) => {
    await expect(validateRemoteImageUrl("https://image.example.test/a.png", {
      lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
      blockedHosts: [],
    })).rejects.toThrow("REMOTE_IMAGE_ADDRESS_FORBIDDEN");
  });

  it("rejects the whole DNS answer set when any answer is private", async () => {
    await expect(validateRemoteImageUrl("https://image.example.test/a.png", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ],
      blockedHosts: [],
    })).rejects.toThrow("REMOTE_IMAGE_ADDRESS_FORBIDDEN");
  });

  it.each(["api.openai.com", "sub.api.openai.com", "admin.munjib.internal"])(
    "rejects configured provider/admin host %s before DNS",
    async (host) => {
      let lookedUp = false;
      await expect(validateRemoteImageUrl(`https://${host}/image.png`, {
        lookup: async () => { lookedUp = true; return [{ address: "93.184.216.34", family: 4 }]; },
        blockedHosts: ["api.openai.com", "admin.munjib.internal"],
      })).rejects.toThrow("REMOTE_IMAGE_HOST_FORBIDDEN");
      expect(lookedUp).toBe(false);
    },
  );

  it("returns every approved answer and the exact effective port for pinning", async () => {
    await expect(validateRemoteImageUrl("https://image.example.test/a.png", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
      blockedHosts: [],
    })).resolves.toMatchObject({
      hostname: "image.example.test",
      port: 443,
      addresses: [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
    });
  });
});
```

Create `tests/attachments/egress-policy.test.ts`,
`tests/attachments/egress-bootstrap.test.ts`, and
`tests/attachments/worker-lifecycle.test.ts` now. The policy test source-checks the
fixed worker IP/subnet, `DOCKER-USER` hook, established-response rule, public
80/443-only allow, complete IPv4/IPv6/NAT64/private/metadata/provider denies, one-image
equality, no `NET_ADMIN`, and the entrypoint's exact credential-free worker command. A
synthetic ruleset parser test proves any missing or reordered broad allow fails closed.

The bootstrap test supplies a fake separately attested deterministic OCI host-bundle
artifact plus signed release manifest. It requires Leaf 13A's forced dispatcher to
accept only a bounded signed current app digest, literal `attachment-fetch-v2`, and
allowlisted lifecycle action, then resolve the bound artifact by
digest, verify its independent provenance/source/ref/signer plus app digest/source/
floor binding, and parse only manifest-listed regular files. Tests cover symlink,
hardlink, sparse, directory, FIFO/socket/device, absolute/traversal/confusable path,
duplicate/extra/trailing member, archive/member/count oversize, changed manifest/
helper/Compose/operation-descriptor byte, caller artifact/tag/path/environment override, stale or
non-current app digest, and mismatched artifact subject. Valid installation uses
`O_EXCL`/fsync/rename and exact root modes. The branch never installs its bootstrap,
extracts an app container, or runs a repository path with `sudo`.

The lifecycle test models the root wrapper with fake `nft` and Docker executors and
asserts the exclusive order: acquire the shared global deployment lock; derive current digest, fixed
root-installed Compose set, project, service, label, static IP, and network; create a
root-only one-use lifecycle generation; atomically install and verify nftables; start
only the exact worker service; inspect and pin the container image digest, job label,
network ID/static IP, UID, command, mounts, and capabilities; re-verify nftables; then
mark the generation active. Every failure must stop/remove the exact labeled worker
before policy removal. `stop` must first disable the generation, stop and verify the
worker absent, and only then remove the matching policy; a stop failure leaves the
deny policy installed. Reject all extra arguments, caller `-f`/project/env/image/IP,
Docker socket/group access, direct profile start without a lifecycle generation, and
any cleanup trace that removes policy before the worker is absent.

- [ ] **Step 2: Run URL/egress contracts to verify red**

Run: `pnpm exec vitest run tests/attachments/url-policy.test.ts tests/attachments/egress-policy.test.ts tests/attachments/egress-bootstrap.test.ts tests/attachments/worker-lifecycle.test.ts tests/docker/compose.test.ts --reporter=dot`

Expected: FAIL because the worker URL policy, attested root bundle, exclusive root
lifecycle boundary, same-image worker, and entrypoint discriminator do not exist.

- [ ] **Step 3: Implement full URL/DNS/address policy**

Create `services/attachment-fetch-worker/url-policy.mjs`:

```js
import { lookup as dnsLookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

const explicitDeniedV6 = [
  ipaddr.parseCIDR("64:ff9b::/96"),
  ipaddr.parseCIDR("64:ff9b:1::/48"),
  ipaddr.parseCIDR("2001:0000::/32"),
  ipaddr.parseCIDR("2002::/16"),
];

function hostBlocked(hostname, blockedHosts) {
  const canonical = hostname.toLowerCase().replace(/\.$/, "");
  return blockedHosts.some((raw) => {
    const blocked = raw.trim().toLowerCase().replace(/\.$/, "");
    return blocked && (canonical === blocked || canonical.endsWith(`.${blocked}`));
  });
}

export function publicAddress(address) {
  let parsed;
  try { parsed = ipaddr.parse(address); } catch { return false; }
  if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
    return publicAddress(parsed.toIPv4Address().toString());
  }
  if (parsed.range() !== "unicast") return false;
  if (parsed.kind() === "ipv6" && explicitDeniedV6.some((cidr) => parsed.match(cidr))) return false;
  return true;
}

function abortError() {
  return new Error("REMOTE_IMAGE_DEADLINE_EXCEEDED");
}

async function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();
  return Promise.race([
    promise,
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(abortError()), { once: true })),
  ]);
}

export async function validateRemoteImageUrl(raw, options = {}) {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 2_048 || raw.startsWith("//")) {
    throw new Error("REMOTE_IMAGE_URL_FORBIDDEN");
  }
  let url;
  try { url = new URL(raw); } catch { throw new Error("REMOTE_IMAGE_URL_FORBIDDEN"); }
  const secure = url.protocol === "https:";
  const insecure = url.protocol === "http:";
  const effectivePort = Number(url.port || (secure ? 443 : insecure ? 80 : 0));
  if (
    (!secure && !insecure) || url.username || url.password ||
    (secure && effectivePort !== 443) || (insecure && effectivePort !== 80) ||
    !url.hostname
  ) throw new Error("REMOTE_IMAGE_URL_FORBIDDEN");

  const blockedHosts = options.blockedHosts ?? [];
  if (hostBlocked(url.hostname, blockedHosts)) throw new Error("REMOTE_IMAGE_HOST_FORBIDDEN");
  const lookup = options.lookup ?? ((hostname) => dnsLookup(hostname, { all: true, verbatim: true }));
  const literal = ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, ""));
  const addresses = literal
    ? [{ address: url.hostname.replace(/^\[|\]$/g, ""), family: url.hostname.includes(":") ? 6 : 4 }]
    : await withAbort(Promise.resolve(lookup(url.hostname)), options.signal);
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some(({ address }) => !publicAddress(address))) {
    throw new Error("REMOTE_IMAGE_ADDRESS_FORBIDDEN");
  }
  return {
    url,
    hostname: url.hostname.toLowerCase(),
    port: effectivePort,
    addresses: [...new Map(addresses.map((entry) => [`${entry.family}:${entry.address}`, entry])).values()],
  };
}
```

- [ ] **Step 4: Reuse the one-shot decoder and implement pinned raw fetch plus URL-only server**

Do not create `services/attachment-fetch-worker/validate-image.mjs`. The following is
the already-pinned Task 2 implementation in
`services/attachment-media-canonicalizer/canonicalize-image.mjs`; carry its exact digest
forward rather than copying it into the fetcher:

```js
import sharp from "sharp";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 8_192;
const MAX_TOTAL_PIXELS = 25_000_000;
const MAX_FRAMES = 10;

function detectedMimeType(bytes) {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const prefix6 = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
  if (prefix6 === "GIF87a" || prefix6 === "GIF89a") return "image/gif";
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

export async function validateWorkerImage(bytes, declaredMimeType) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) throw new Error("ATTACHMENT_EMPTY");
  if (bytes.byteLength > MAX_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
  const mimeType = detectedMimeType(bytes);
  if (!mimeType || mimeType !== declaredMimeType.toLowerCase()) {
    throw new Error("ATTACHMENT_MIME_TYPE_FORBIDDEN");
  }
  try {
    const image = sharp(bytes, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_TOTAL_PIXELS,
      unlimited: false,
    });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.pageHeight ?? metadata.height ?? 0;
    const frames = metadata.pages ?? 1;
    if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new Error("ATTACHMENT_DIMENSIONS_EXCEEDED");
    }
    if (frames < 1 || frames > MAX_FRAMES) throw new Error("ATTACHMENT_FRAMES_EXCEEDED");
    if (width * height * frames > MAX_TOTAL_PIXELS) {
      throw new Error("ATTACHMENT_TOTAL_PIXELS_EXCEEDED");
    }
    await image.clone().stats();
    const pixels = sharp(bytes, {
      animated: frames > 1,
      failOn: "error",
      limitInputPixels: MAX_TOTAL_PIXELS,
      unlimited: false,
    }).rotate().toColourspace("srgb");
    const canonicalBytes = frames > 1 || mimeType === "image/gif" || mimeType === "image/webp"
      ? await pixels.webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true, loop: 0 }).toBuffer()
      : mimeType === "image/jpeg"
        ? await pixels.jpeg({ quality: 90, chromaSubsampling: "4:2:0", progressive: false, optimizeCoding: true }).toBuffer()
        : await pixels.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
    if (canonicalBytes.byteLength > MAX_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
    const canonicalMimeType = frames > 1 || mimeType === "image/gif" || mimeType === "image/webp"
      ? "image/webp"
      : mimeType;
    const reprobe = await sharp(canonicalBytes, {
      animated: frames > 1, failOn: "error", limitInputPixels: MAX_TOTAL_PIXELS, unlimited: false,
    }).metadata();
    if ((reprobe.pages ?? 1) !== frames) throw new Error("ATTACHMENT_DECODE_FAILED");
    return { bytes: canonicalBytes, mimeType: canonicalMimeType, width, height, frames };
  } catch (error) {
    if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) throw error;
    throw new Error("ATTACHMENT_DECODE_FAILED");
  }
}
```

Create `services/attachment-fetch-worker/fetch-image.mjs`:

```js
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { validateRemoteImageUrl } from "./url-policy.mjs";
import { submitRawImageToCanonicalizer } from "./canonicalizer-pipe.mjs";

const MAX_BYTES = 5 * 1024 * 1024;
const TOTAL_DEADLINE_MS = 8_000;

function readBounded(response, signal) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    response.on("data", (chunk) => {
      size += chunk.byteLength;
      if (size > MAX_BYTES) response.destroy(new Error("ATTACHMENT_TOO_LARGE"));
      else chunks.push(chunk);
    });
    response.once("end", () => resolve(Buffer.concat(chunks, size)));
    response.once("error", reject);
    signal.addEventListener("abort", () => response.destroy(new Error("REMOTE_IMAGE_DEADLINE_EXCEEDED")), { once: true });
  });
}

function requestPinned(policy, address, signal) {
  const request = policy.url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: policy.url.protocol,
      hostname: address.address,
      family: address.family,
      port: policy.port,
      method: "GET",
      path: `${policy.url.pathname}${policy.url.search}`,
      servername: policy.hostname,
      headers: {
        host: policy.hostname,
        accept: "image/png,image/jpeg,image/gif,image/webp",
        "accept-encoding": "identity",
        connection: "close",
      },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      agent: false,
      insecureHTTPParser: false,
      signal,
    }, resolve);
    req.once("error", reject);
    req.end();
  });
}

export async function fetchRemoteImage(rawUrl, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.deadlineMs ?? TOTAL_DEADLINE_MS);
  try {
    const policy = await validateRemoteImageUrl(rawUrl, {
      lookup: options.lookup,
      blockedHosts: options.blockedHosts ?? [],
      signal: controller.signal,
    });
    let lastCode = "REMOTE_IMAGE_FETCH_FAILED";
    for (const address of policy.addresses) {
      try {
        const response = await requestPinned(policy, address, controller.signal);
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          throw new Error("REMOTE_IMAGE_REDIRECT_FORBIDDEN");
        }
        if (status < 200 || status >= 300) {
          response.resume();
          throw new Error("REMOTE_IMAGE_FETCH_FAILED");
        }
        const rawHeaderNames = response.rawHeaders
          .filter((_value, index) => index % 2 === 0)
          .map((value) => value.toLowerCase());
        const count = (name) => rawHeaderNames.filter((value) => value === name).length;
        if (count("content-length") > 1 || count("content-encoding") > 1 ||
          (count("content-length") === 1 && count("transfer-encoding") === 1)) {
          response.destroy();
          throw new Error("REMOTE_IMAGE_HEADERS_INVALID");
        }
        const contentEncoding = String(response.headers["content-encoding"] ?? "").trim().toLowerCase();
        if (contentEncoding && contentEncoding !== "identity") {
          response.destroy();
          throw new Error("REMOTE_IMAGE_ENCODING_FORBIDDEN");
        }
        const contentLength = Number(response.headers["content-length"] ?? 0);
        if (contentLength > MAX_BYTES) {
          response.destroy();
          throw new Error("ATTACHMENT_TOO_LARGE");
        }
        const declaredMimeType = String(response.headers["content-type"] ?? "").split(";", 1)[0].trim();
        const bytes = await readBounded(response, controller.signal);
        return submitRawImageToCanonicalizer({
          inputBytes: bytes,
          declaredMimeType,
          operationId: options.operationId,
          signal: controller.signal,
        });
      } catch (error) {
        lastCode = publicWorkerErrorCode(error);
      }
    }
    throw new Error(lastCode);
  } finally {
    clearTimeout(timer);
  }
}
```

Create `services/attachment-fetch-worker/server.mjs`:

```js
import { createServer } from "node:http";
import { fetchRemoteImage } from "./fetch-image.mjs";

const FORBIDDEN_PROXY_ENV = [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "NODE_USE_ENV_PROXY", "GLOBAL_AGENT_HTTP_PROXY", "GLOBAL_AGENT_HTTPS_PROXY",
  "UNDICI_PROXY", "NODE_OPTIONS",
];
if (FORBIDDEN_PROXY_ENV.some((name) => process.env[name])) {
  throw new Error("REMOTE_IMAGE_PROXY_ENV_FORBIDDEN");
}

const blockedHosts = [
  "api.openai.com", "openrouter.ai", "api.anthropic.com", "generativelanguage.googleapis.com",
  "cloud.langfuse.com", "localhost", "host.docker.internal",
  ...(process.env.ATTACHMENT_FETCH_BLOCKED_HOSTS ?? "").split(","),
].map((value) => value.trim()).filter(Boolean);

const PUBLIC_ERROR_CODES = new Set([
  "REMOTE_IMAGE_REQUEST_TOO_LARGE", "REMOTE_IMAGE_REQUEST_INVALID",
  "REMOTE_IMAGE_URL_INVALID", "REMOTE_IMAGE_SCHEME_FORBIDDEN",
  "REMOTE_IMAGE_PORT_FORBIDDEN", "REMOTE_IMAGE_DESTINATION_FORBIDDEN",
  "REMOTE_IMAGE_REDIRECT_FORBIDDEN", "REMOTE_IMAGE_DEADLINE_EXCEEDED",
  "REMOTE_IMAGE_FETCH_FAILED", "REMOTE_IMAGE_HEADERS_INVALID",
  "REMOTE_IMAGE_ENCODING_FORBIDDEN", "REMOTE_IMAGE_PROXY_ENV_FORBIDDEN",
  "ATTACHMENT_TOO_LARGE",
  "ATTACHMENT_MIME_TYPE_FORBIDDEN", "ATTACHMENT_DECODE_FAILED",
  "ATTACHMENT_DIMENSIONS_EXCEEDED", "ATTACHMENT_FRAMES_EXCEEDED",
  "ATTACHMENT_TOTAL_PIXELS_EXCEEDED",
]);

export function publicWorkerErrorCode(error) {
  const candidate = error instanceof Error ? error.message : "";
  return PUBLIC_ERROR_CODES.has(candidate) ? candidate : "REMOTE_IMAGE_FETCH_FAILED";
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > 4_096) {
      request.destroy();
      throw new Error("REMOTE_IMAGE_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/fetch") {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await bodyJson(request);
    if (Object.keys(body).sort().join(",") !== "operationId,url" ||
        typeof body.url !== "string" || typeof body.operationId !== "string") {
      throw new Error("REMOTE_IMAGE_REQUEST_INVALID");
    }
    const result = await fetchRemoteImage(body.url, {
      blockedHosts, operationId: body.operationId,
    });
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(serializeBoundedCanonicalReceipt(result));
  } catch (error) {
    const code = publicWorkerErrorCode(error);
    console.error("attachment fetch rejected", { code });
    response.writeHead(422, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: code }));
  }
}).listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
```

The release entrypoint unsets every forbidden variable before executing Node and the worker rejects any value still present. The error log contains only a fixed allowlisted code. Create `tests/attachments/worker-errors.test.ts`: inject `getaddrinfo`, TLS certificate, socket, parser, and downstream canonicalizer failures whose native messages contain sentinel URLs, hostnames, paths, and IP addresses; assert response body and captured stdout/stderr contain none of the sentinels and contain only the normalized code. Feed corrupt/truncated PNG, JPEG, GIF, and WebP bodies plus dimension/frame/decompression bombs through the real raw-fetch-to-one-shot pipe and assert each maps to the exact allowlisted attachment code. The oversized-control-body test must assert `request.destroy()` is called immediately; the over-limit response-stream test asserts cancellation/destruction at the first over-limit chunk. No native error object is serialized or logged. A source/import/image test proves the fetcher contains no Sharp/libvips/native addon and cannot decode locally.

Create `tests/attachments/worker-transport.test.ts`. Set every upper/lower proxy variable, `NODE_USE_ENV_PROXY`, `GLOBAL_AGENT_*`, `UNDICI_PROXY`, and `NODE_OPTIONS` to a sentinel connector and prove startup fails before a socket or proxy module is used. Test `gzip`, `br`, `zstd`, duplicate/multiple `Content-Encoding`, duplicate/conflicting `Content-Length`, `Content-Length` plus `Transfer-Encoding`, malformed raw headers, redirect bodies, chunked over-limit, and compressed bombs; all must destroy the response and return a stable code without decompression. Assert the outbound request header set is exactly `Host`, `Accept`, `Accept-Encoding: identity`, and `Connection: close`, with no Cookie, Authorization, Proxy-Authorization, forwarded header, ambient agent, or custom dispatcher.

- [ ] **Step 5: Reserve before egress and verify the canonical receipt in Web**

Add these exports to `lib/attachments/lifecycle.ts`, import `randomUUID`, the fixed input
cap, `verifyCanonicalAttachmentReceipt`, and the bounded storage client, and reuse the
already exported `lockAttachmentQuota()`. Web imports no decoder:

```ts
import { verifyCanonicalAttachmentReceipt } from "@/lib/attachments/validation";

export async function reserveRemoteImport(input: {
  documentId: string;
  actorId: string;
}) {
  const reservedBytes = BigInt(ATTACHMENT_LIMITS.maxBytes);
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.document.findUniqueOrThrow({
      where: { id: input.documentId }, select: { workspaceId: true },
    });
    const usage = await lockAttachmentQuota(tx, candidate.workspaceId);
    await lockDocumentBoundary(tx, input.documentId);
    const { document } = await resolveActiveDocumentForActor(tx, {
      documentId: input.documentId,
      actorId: input.actorId,
      access: "write",
    });
    if (document.workspaceId !== candidate.workspaceId) throw new Error("ATTACHMENT_LOCK_DRIFT");
    const [{ databaseNow }] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
      SELECT statement_timestamp() AS "databaseNow"
    `;
    const expiresAt = new Date(databaseNow.getTime() + pendingTtlHours() * 60 * 60 * 1_000);
    const activeRemoteImports = await tx.attachment.count({
      where: {
        workspaceId: document.workspaceId,
        uploadedById: input.actorId,
        source: "REMOTE_IMPORT",
        status: "PENDING",
        expiresAt: { gt: databaseNow },
      },
    });
    if (activeRemoteImports >= remoteConcurrency()) {
      throw new Error("ATTACHMENT_IMPORT_CONCURRENCY_EXCEEDED");
    }
    if (usage.reservedBytes + usage.readyBytes + usage.deletingBytes + reservedBytes > usage.quotaBytes) {
      throw new Error("ATTACHMENT_QUOTA_EXCEEDED");
    }
    await tx.workspaceAttachmentUsage.update({
      where: { workspaceId: document.workspaceId },
      data: { reservedBytes: { increment: reservedBytes } },
    });
    return tx.attachment.create({
      data: {
        workspaceId: document.workspaceId,
        documentId: document.id,
        fileName: `remote-${randomUUID()}`,
        mimeType: "application/octet-stream",
        size: 0,
        deletingChargeBytes: 0n,
        reservedBytes,
        source: "REMOTE_IMPORT",
        status: "PENDING",
        uploadedById: input.actorId,
        expiresAt,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeReservedRemoteImport(input: {
  attachmentId: string;
  actorId: string;
  receipt: unknown;
}) {
  const validated = await verifyCanonicalAttachmentReceipt(input.receipt);
  const candidate = await prisma.attachment.findUnique({
    where: { id: input.attachmentId }, select: { workspaceId: true },
  });
  if (!candidate) throw new Error("ATTACHMENT_NOT_FINALIZABLE");
  const storageKey = `${candidate.workspaceId}/pending/${input.attachmentId}`;
  if (validated.storageKey !== storageKey || validated.operationId !== input.attachmentId) {
    throw new Error("ATTACHMENT_CANONICAL_RECEIPT_INVALID");
  }
  const stored = await attachmentStorageClient.readVerified(storageKey);
  const expectedHash = validated.contentSha256;
  if (stored.size !== validated.size || stored.contentSha256 !== expectedHash ||
    !Buffer.from(stored.bytes).equals(Buffer.from(validated.bytes))) {
    await abandonPendingAttachment(attachment.id, input.actorId, "ATTACHMENT_INTEGRITY_MISMATCH");
    throw new Error("ATTACHMENT_INTEGRITY_MISMATCH");
  }
  const extension = ({
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  } as const)[validated.mimeType];
  let finalFileName = "";
  try {
    await prisma.$transaction(async (tx) => {
      await lockAttachmentQuota(tx, candidate.workspaceId);
      const [current] = await tx.$queryRaw<Array<Attachment>>`
        SELECT * FROM "Attachment"
        WHERE "id" = ${input.attachmentId} FOR UPDATE
      `;
      if (!current) throw new Error("ATTACHMENT_NOT_FINALIZABLE");
      const [{ databaseNow }] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
        SELECT statement_timestamp() AS "databaseNow"
      `;
      if (current.uploadedById !== input.actorId || current.source !== "REMOTE_IMPORT" ||
          current.status !== "PENDING" || current.storageKey !== null ||
          !current.expiresAt || current.expiresAt <= databaseNow) {
        throw new Error("ATTACHMENT_NOT_FINALIZABLE");
      }
      await lockDocumentBoundary(tx, current.documentId!);
      await resolveActiveDocumentForActor(tx, {
        documentId: current.documentId!,
        actorId: input.actorId,
        access: "write",
      });
      finalFileName = `${current.fileName}.${extension}`;
      const actualBytes = BigInt(validated.size);
      await tx.workspaceAttachmentUsage.update({
        where: { workspaceId: current.workspaceId },
        data: { reservedBytes: { decrement: current.reservedBytes - actualBytes } },
      });
      await tx.attachment.update({
        where: { id: current.id },
        data: {
          storageKey,
          mimeType: validated.mimeType,
          fileName: finalFileName,
          size: validated.size,
          contentSha256: expectedHash,
          reservedBytes: actualBytes,
        },
      });
    });
  } catch (error) {
    await abandonPendingAttachment(input.attachmentId, input.actorId, "ATTACHMENT_DB_PUBLISH_FAILED");
    throw error;
  }
  return {
    id: input.attachmentId,
    markdown: `![${finalFileName}](/api/attachments/${input.attachmentId})`,
    pendingPreviewUrl: `/api/attachments/${input.attachmentId}/pending`,
  };
}
```

Create `lib/attachments/remote-import.ts`:

```ts
import {
  abandonPendingAttachment,
  completeReservedRemoteImport,
  reserveRemoteImport,
} from "@/lib/attachments/lifecycle";
import { request as httpRequest } from "node:http";
import { verifyCanonicalAttachmentReceipt } from "@/lib/attachments/validation";
import { verifyAttachmentFetchReadiness } from "@/lib/attachments/fetch-readiness";

export async function fetchRemoteImageReceipt(
  imageUrl: string,
  operationId: string,
  requestImpl: typeof httpRequest = httpRequest,
) {
  if (process.env.MUNJIB_REMOTE_IMAGE_IMPORT_ENABLED !== "true") {
    throw new Error("REMOTE_IMAGE_IMPORT_DISABLED");
  }
  await verifyAttachmentFetchReadiness();
  const body = Buffer.from(JSON.stringify({ operationId, url: imageUrl }), "utf8");
  if (body.byteLength > 4_096) throw new Error("REMOTE_IMAGE_REQUEST_TOO_LARGE");
  const raw = await directBoundedWorkerRequest({
    requestImpl,
    hostname: "attachment-fetch-worker",
    port: 8080,
    path: "/fetch",
    method: "POST",
    agent: false,
    insecureHTTPParser: false,
    headers: {
      host: "attachment-fetch-worker:8080",
      "content-type": "application/json",
      "content-length": String(body.byteLength),
      "accept-encoding": "identity",
      connection: "close",
    },
    body,
    deadlineMs: 10_000,
    maxBytes: 4_096,
  });
  if (raw.statusCode !== 200) throw new Error("REMOTE_IMAGE_FETCH_FAILED");
  if (raw.contentEncoding && raw.contentEncoding !== "identity") {
    throw new Error("REMOTE_IMAGE_ENCODING_FORBIDDEN");
  }
  if (raw.duplicateContentLength || raw.contentLengthTransferEncodingConflict ||
    raw.contentLength !== raw.bytes.byteLength) {
    throw new Error("REMOTE_IMAGE_HEADERS_INVALID");
  }
  if (raw.contentType !== "application/json") throw new Error("REMOTE_IMAGE_HEADERS_INVALID");
  return verifyCanonicalAttachmentReceipt(parseStrictCanonicalReceipt(raw.bytes));
}

export async function importExternalDocumentImage(input: {
  documentId: string;
  actorId: string;
  imageUrl: string;
}, requestImpl: typeof httpRequest = httpRequest) {
  const reservation = await reserveRemoteImport({
    documentId: input.documentId,
    actorId: input.actorId,
  });
  try {
    const receipt = await fetchRemoteImageReceipt(input.imageUrl, reservation.id, requestImpl);
    return await completeReservedRemoteImport({
      attachmentId: reservation.id,
      actorId: input.actorId,
      receipt,
    });
  } catch (error) {
    await abandonPendingAttachment(reservation.id, input.actorId, "REMOTE_IMAGE_IMPORT_FAILED");
    throw error;
  }
}
```

Implement `directBoundedWorkerRequest()` in the same module with Node core
`http.request` only. It accepts exactly the fixed options shown above, rejects any
other hostname/port/path/method/header, uses no global/custom proxy dispatcher,
detects duplicate raw `Content-Length`/`Content-Encoding` and CL+TE before body
processing, rejects non-identity encoding without decompression, destroys on the first
over-limit/deadline/error chunk, and returns only a bounded 4 KiB strict signed-receipt
envelope plus normalized status/content headers. Neither the remote worker transport nor this internal transport
uses `fetch`, Undici environment proxy support, cookies, authorization, forwarded
headers, redirects, or ambient agents.

No catch block logs `input.imageUrl`; route/action error mapping returns only a stable code.

- [ ] **Step 6: Add the explicit server action and bind it to the editor**

Replace the URL branch of `pasteDocumentImageAttachmentAction()` in `app/workspaces/[workspaceSlug]/actions.ts` so that action accepts `File`/`data:` uploads only. Add:

```ts
import { importExternalDocumentImage } from "@/lib/attachments/remote-import";

export async function importExternalDocumentImageAction(
  workspaceSlug: string,
  formData: FormData,
) {
  const user = await requireCurrentUser();
  const imageUrl = String(formData.get("imageUrl") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const result = await importExternalDocumentImage({
    documentId,
    actorId: user.id,
    imageUrl,
  });
  revalidatePath(`/workspaces/${workspaceSlug}`);
  return { markdown: result.markdown, pendingPreviewUrl: result.pendingPreviewUrl };
}
```

In `app/workspaces/[workspaceSlug]/page.tsx`, import the action, bind it with
`workspaceSlug`, and wrap the workspace layout plus `WorkspaceChatbot` in the Leaf 11
provider with the exact selected document id, write permission, and bound action. Keep
passing the same action to `DocumentEditor`, which registers the current editor-only
insert/save callback with the provider. This makes document preview, Ask AI, and
Workspace AI use the already-delegating Issue 4 interstitial without modifying either
renderer core. A missing/stale/read-only document or unmounted editor removes the
`Import as image` control. Do not place the URL in `revalidatePath`, query parameters,
redirects, or audit metadata.

- [ ] **Step 7: Write app-client and action tests**

Create `tests/attachments/remote-import.test.ts` with a fake Node core request
transport and fake signed readiness verifier. Assert the request targets only fixed
`attachment-fetch-worker:8080/fetch`, uses the exact allowlisted headers and direct
agent, carries only `{url}`, and cannot be redirected or routed through proxy state.
Return a metadata/polyglot image fixture from the worker and prove the app stores and
returns only its independently canonicalized bytes/hash/MIME. Reject missing/stale
readiness, response encoding, CL/TE ambiguity, short/long body, corrupt canonical
output, and worker failure. For every failure, assert the pessimistic PENDING quota is
released/quarantined exactly once and no URL or native error reaches logs.

Add an explicit call-order test around the Server Action: `requireCurrentUser`, active
write lock/authorization, PENDING quota reservation, then direct worker request. An
anonymous user, archived/read-only document, quota/concurrency denial, or reservation
failure must produce zero DNS/socket/worker calls and no database/file mutation.

In `tests/workspace-actions.test.ts`, mock `importExternalDocumentImage`, call `importExternalDocumentImageAction("workspace", formData)`, and assert the mock receives exactly `{ documentId, actorId, imageUrl }`, the form contains no `fileName`, and the result exposes only internal Markdown/pending preview. In the lifecycle test assert the stored filename matches `^remote-[0-9a-f-]+\\.(png|jpg|webp)$` after app canonical MIME is known and does not contain URL pathname, query, alt text, metadata, or any client field. Generate the neutral basename from a server UUID and append the extension mapped from canonical MIME only. No redirect/revalidation path contains the remote URL.

- [ ] **Step 8: Run app-side remote import tests to verify green**

Run: `pnpm exec vitest run tests/attachments/remote-import.test.ts tests/workspace-actions.test.ts tests/components/document-editor-preview.test.tsx --reporter=dot`

Expected: PASS; the app reserves before fetch, forwards no credentials, repeats decode validation, and releases quota on failure.

- [ ] **Step 9: Publish and install the separate attested worker host bundle**

CI deterministically packages `manifest.json`, the fixed Compose overlay, nftables
policy, internal root unit, and forced-dispatch operation descriptor as the `attachment-fetch-v2` OCI
host-bundle artifact. The signed release manifest binds its artifact digest and
manifest hash to the exact app digest, source SHA, required floor, bundle id, and
signing identity. The app image never carries or exports privileged payloads.

The protected deploy workflow submits one bounded signed release envelope to Leaf
13A's forced `/usr/local/libexec/munjib-release-dispatch`; it contains the exact app
digest, `attachment-fetch-v2` artifact digest/binding, monotonic sequence, nonce,
expiry, expected previous generation, and literal lifecycle operation. The dispatcher
resolves the artifact by digest, verifies independent provenance, then uses
the strict bounded archive parser. Only manifest-listed regular files with exact
path/size/hash/owner/group/mode/destination install; symlink, hardlink, sparse,
directory, FIFO/socket/device, traversal/absolute/confusable path, duplicate/extra/
trailing member, oversize, digest drift, or app/artifact binding mismatch fails before
any destination changes. Installation uses root-owned `O_EXCL` temporaries, fsync, and
atomic rename. No checkout path, app-container extraction, tag, caller artifact,
Compose path, destination, environment, or KMS key is accepted.

The installed lifecycle owns an independent atomic nftables deny policy in
`DOCKER-USER`: established replies only, complete special/private/metadata/NAT64/
provider denies, and new public TCP 80/443 only for the fixed worker address. It never
grants `NET_ADMIN`, mounts Docker into the container, or owns a credential.

- [ ] **Step 10: Enforce one root-owned start/verify/stop lifecycle and fixed overlay**

Do not add another production image. Web, migrations, RAG, deletion jobs, and the
worker use the exact same attested app digest, UID/GID `10001:10001`, read-only
filesystem, dropped capabilities, and security floor. Extend the release entrypoint
with `MUNJIB_DATABASE_ROLE=attachment-fetch-worker`: require
`attachment-integrity-lifecycle@2`, the exact command
`node services/attachment-fetch-worker/server.mjs`, and a valid one-use root start
ticket; clear every proxy/agent/`NODE_OPTIONS` variable before Node starts and load no
database credential.

Production base `docker-compose.yml` contains PostgreSQL and Web only. It must contain
no `attachment-fetch-worker`, no worker profile, no worker URL override, and no
operator-selectable worker network. The root-installed
`docker-compose.attachment-fetch.yml` alone defines the worker, control network, Web
network attachment, exact image supplied by the sanitized lifecycle environment,
three non-secret floor/evidence/deny mounts, one-use start-ticket mount, and live
readiness mount. The lifecycle selects the fixed root-installed Leaf 13 base generation
plus this overlay; it never reads a checkout Compose file.

The forced dispatcher accepts signed action `start`, `verify`, or `stop` and invokes
the internal fixed root unit with no caller arguments. No deploy/human sudoers entry or
direct helper command exists. The unit clears caller environment and derives app digest, source,
floor, overlay hash, project, service, network/subnet/static IP, UID, command, labels,
mounts, and policy from root-owned current records. Caller `-f`, project, env file,
image/digest, IP, hostname, path, key, Docker argument, or extra token is rejected.

`start` acquires the same global deployment lock used by exact-digest deploy/edge
activation; verifies the installed artifact and current release binding; creates the
root-only one-use start ticket; atomically installs and verifies the nftables deny
policy; starts only the exact worker through the fixed Compose set; inspects exact
digest, label, network id/static IP, UID, command, mounts, capabilities, no socket, and
no credentials; re-verifies nftables; then publishes the root-owned live lifecycle
capability and exposes it read-only to Web. Import remains disabled until
`verifyAttachmentFetchReadiness()` matches this live generation and worker health.

Every start failure revokes readiness, stops/removes the exact labeled worker, verifies
it absent, and retains the deny policy until absence is proven. `stop` first revokes
readiness, then stops/removes and verifies absence, and only then removes the matching
policy. A stop/inspection failure leaves deny rules installed. `verify` performs these
checks plus fixed in-namespace negative reachability probes and prints only a stable
result code. A Boolean environment value alone never enables import.

`docker-compose.dev.yml` may contain an explicitly marked local-only fixture; the
production lifecycle rejects it. Web keeps only pending TTL/concurrency/deletion
defaults plus the root readiness mount; the internal endpoint is a code constant, not
an operator environment override.

- [ ] **Step 11: Assert the isolation contract from Compose**

In `tests/docker/compose.test.ts`, parse base production Compose and the separately
installed overlay fixture. Assert the base has no worker service, worker profile,
worker URL, worker network, or production `build:`. Assert the overlay has exactly one
worker using Web's exact immutable digest, UID/GID `10001:10001`, read-only root,
`cap_drop: [ALL]`, no-new-privileges, fixed command/static IP/network, only the three
non-secret security mounts plus root start ticket, and no credential/storage/socket/
host-network/extra-host/published-port/`NET_ADMIN` surface. The overlay's Web addition
contains only fixed network/readiness mounts and no caller-selected endpoint.

`tests/attachments/egress-bootstrap.test.ts` uses a deterministic OCI artifact and
signed release manifest fixture, not an app-container export. Mutate artifact digest,
app binding, provenance, manifest/member bytes/modes/destinations, and every archive
attack class; installation must remain all-or-nothing. `tests/attachments/worker-lifecycle.test.ts`
models the shared global lock and exact start/verify/stop order, every injected failure,
readiness revocation, exact worker inspection, absent-before-policy-removal invariant,
and fail-deny retention. `tests/attachments/fetch-readiness.test.ts` rejects stale/
wrong digest, floor, overlay, policy, generation, signature, or health and proves the
enable Boolean alone is insufficient.

Add a repository/runbook source scan that fails on `docker compose.*attachment-fetch`,
`--profile attachment-fetch`, `sudo deploy/attachments`, checkout-root helper
execution, a second installer, a caller worker URL, or any lifecycle invocation with
extra arguments outside explicit negative test fixtures.

Document these non-secret defaults in `.env.example` and `.env.docker.example`:

```dotenv
MUNJIB_REMOTE_IMAGE_IMPORT_ENABLED=false
MUNJIB_ATTACHMENT_PENDING_TTL_HOURS=24
MUNJIB_ATTACHMENT_REMOTE_CONCURRENCY=2
MUNJIB_ATTACHMENT_DELETION_WORKER_ENABLED=false
```

Do not expose `MUNJIB_ATTACHMENT_FETCH_WORKER_URL`; the direct internal address is a
code/fixed-overlay contract and Web still requires the signed live readiness record.

- [ ] **Step 12: Run policy, network, and full remote-import verification**

Run:

```bash
pnpm exec vitest run tests/attachments/url-policy.test.ts tests/attachments/egress-policy.test.ts tests/attachments/egress-bootstrap.test.ts tests/attachments/worker-errors.test.ts tests/attachments/worker-transport.test.ts tests/attachments/worker-lifecycle.test.ts tests/attachments/fetch-readiness.test.ts tests/attachments/remote-import.test.ts tests/workspace-actions.test.ts tests/docker/compose.test.ts --reporter=dot
docker compose config --quiet
pnpm exec tsc --noEmit
```

Expected: PASS; all alternate-port/credentials/special-address/provider-host cases reject, the worker has no credentials or trusted network, and Compose is valid.

- [ ] **Step 13: Commit the isolated fetch path**

```bash
git add package.json pnpm-lock.yaml services/attachment-fetch-worker deploy/attachments/attested-root-bundle scripts/attachments/build-egress-root-bundle-manifest.ts scripts/attachments/verify-egress-policy.ts scripts/docker/release-entrypoint.sh lib/attachments/lifecycle.ts lib/attachments/remote-import.ts lib/attachments/fetch-readiness.ts app/workspaces/\[workspaceSlug\]/actions.ts app/workspaces/\[workspaceSlug\]/page.tsx components/document-editor/types.ts Dockerfile docker-compose.yml docker-compose.dev.yml .env.example .env.docker.example tests/attachments/url-policy.test.ts tests/attachments/egress-policy.test.ts tests/attachments/egress-bootstrap.test.ts tests/attachments/worker-errors.test.ts tests/attachments/worker-transport.test.ts tests/attachments/worker-lifecycle.test.ts tests/attachments/fetch-readiness.test.ts tests/attachments/remote-import.test.ts tests/workspace-actions.test.ts tests/docker/compose.test.ts wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: isolate explicit image fetch egress"
```

Expected: commit succeeds; the diff contains no URL fixture outside `.test` files and no secrets.

### Task 6: Add Durable Deletion, Retry, Expiry, and Gated Legacy GC

**Files:**
- Create: `lib/attachments/deletion.ts`
- Create: `lib/attachments/journal-replay.ts`
- Create: `lib/attachments/purge-readiness.ts`
- Consume unchanged: `lib/retention/downstream/leaf14-production-readiness.ts`
- Create: `scripts/attachments/process-deletion-queue.ts`
- Create: `scripts/attachments/deletion-worker-adapter.ts`
- Create: `scripts/attachments/gc.ts`
- Modify: `package.json`
- Modify: `lib/documents/purge-archived.ts`
- Create: `tests/attachments/deletion.test.ts`
- Create: `tests/attachments/journal-replay.test.ts`
- Create: `tests/attachments/gc-cli.test.ts`
- Modify: `tests/documents/purge-archived-cli.test.ts`

**Interfaces:**
- Core consumes Issue 5 `PurgeLeafReadiness`/`PurgeEvaluationState` types, Task 3 quota
  locks/UDS reads, Task 1 deletion reason/proof fields, and an internal authorization
  closure that defaults fail-closed. Core never imports Issue 14 or its reservation.
  `assertCandidate(tx,candidate,state)` receives state only from Issue 5's in-transaction
  composite evaluator; Leaf 11 accepts no caller environment/digest/evidence or
  readiness variable.
- The outer `deletion-worker-adapter.ts` alone imports unchanged Leaf 5
  `lib/retention/downstream/leaf14-production-readiness.ts`, prechecks
  `productionPurgeReadiness.authorizePhysicalDeletion({subjectKind,subjectId,journalSequence,eventHash})`,
  obtains the independent remote-journal fence, and invokes the core under the fixed
  global-lock writer. Production API accepts only a bounded batch limit; no `enabled`,
  proof, path, checkpoint, digest, verifier, remover, or readiness injection exists.
- Produces: candidate-scoped `attachmentPurgeReadiness`, DB-time
  `enqueueExpiredPendingAttachments()`, fail-closed physical worker, exact
  `leaf11JournalReplayReducers`, and dry-run-first logical-intent GC. Issue 5 owns the
  final purge composite; Leaf 14 alone changes its existing reservation `0 -> 1`.

- [ ] **Step 1: Write failing queue, retry, and gate tests**

Create `tests/attachments/deletion.test.ts`:

The production-shaped tests mock only the existing Leaf 5 reservation module and use a
synthetic storage-authority delete socket with exact peer credentials. They cover:

- quota-before-attachment canonical lock order and post-lock DB statement time;
- atomic `DELETE_PENDING` plus returned journal `sequence`/`entryHash` write-once tuple;
- wrong, partial, stale, missing, locally advanced, cached, or another-subject proof;
- an independent signed immutable remote batch/high-water that does and does not cover
  the exact tuple;
- fence precheck outside the global lock, non-waiting acquisition, immediate in-lock
  reverify, and claim through unlink/verified-ENOENT through `DELETED` as one global-lock
  writer;
- exact single non-null `storageKey` owner recheck immediately before delete;
- crash after unlink but before DB finalize, retry through verified `ENOENT`, and exactly
  one quota release/`ATTACHMENT_DELETED`;
- unlimited backoff retries remaining `DELETE_PENDING`; five failures never become
  `FAILED`; only an audited manual-repair invariant violation may do so;
- preserved `deleteOperationId`, `deleteRequestSequence`, and
  `deleteRequestEntryHash` after `DELETED`;
- older-snapshot replay of remote `ATTACHMENT_DELETE_REQUESTED` keeping bytes
  inaccessible and queued rather than resurrecting authorization.

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  enqueueExpiredPendingAttachments,
} from "@/lib/attachments/deletion";
import { runAttachmentDeletionWorkerOnce } from "@/scripts/attachments/deletion-worker-adapter";
import { setTestDatabaseTime, syntheticDeleteAuthority } from "../helpers/attachment-deletion-authorities";
import { attachmentPurgeReadiness } from "@/lib/attachments/purge-readiness";
import { createDocument } from "@/lib/documents/service";
import type { PurgeEvaluationState } from "@/lib/retention/purge-readiness";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

const TEST_ROOT_OPERATION_ID = "6f080172-7c65-4f86-9256-463e29ea0d42";
const TEST_DEPLOYMENT_DIGEST = `sha256:${"a".repeat(64)}`;
const TEST_PURGE_STATE: PurgeEvaluationState = {
  environment: "production",
  deploymentDigest: TEST_DEPLOYMENT_DIGEST,
  securityFloorSha256: "b".repeat(64),
  deploymentEvidenceSha256: "c".repeat(64),
  restoreEvidenceSha256: "d".repeat(64),
  journalCheckpoint: { sequence: "10", hash: "e".repeat(64) },
  journalHighWater: { sequence: "10", hash: "e".repeat(64) },
  evaluationEpoch: "2026-07-11T00:00:00.000Z",
  leafEvidence: [
    { name: "ai-lineage", issue: 9, evidenceSha256: "f".repeat(64) },
    { name: "attachments", issue: 11, evidenceSha256: "1".repeat(64) },
  ],
  databaseNow: "2026-07-11T00:00:00.000Z",
};

function purgeBatchInput(workspaceId: string, documentIds: string[]) {
  return {
    workspaceId,
    rootOperationId: TEST_ROOT_OPERATION_ID,
    documentIds,
  };
}

async function seedQueuedAttachment(status: "PENDING" | "READY", storageKey = "workspace/pending/file") {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
  const document = await createDocument({
    workspaceSlug: fixture.workspace.slug,
    actorId: fixture.user.id,
    title: `Delete ${fixture.workspace.id}`,
    contentMarkdown: "# synthetic",
  });
  await prisma.workspaceAttachmentUsage.upsert({
    where: { workspaceId: fixture.workspace.id },
    create: {
      workspaceId: fixture.workspace.id,
      reservedBytes: status === "PENDING" ? 12n : 0n,
      readyBytes: status === "READY" ? 12n : 0n,
    },
    update: {
      reservedBytes: status === "PENDING" ? 12n : 0n,
      readyBytes: status === "READY" ? 12n : 0n,
    },
  });
  const attachment = await prisma.attachment.create({
    data: {
      workspaceId: fixture.workspace.id,
      documentId: document.id,
      uploadedById: fixture.user.id,
      fileName: "synthetic.png",
      mimeType: "image/png",
      size: 12,
      contentSha256: "0".repeat(64),
      reservedBytes: status === "PENDING" ? 12n : 0n,
      storageKey,
      source: "CLIPBOARD_FILE",
      status,
      expiresAt: status === "PENDING" ? new Date("2026-07-10T00:00:00.000Z") : null,
      readyAt: status === "READY" ? new Date("2026-07-10T00:00:00.000Z") : null,
    },
  });
  return { fixture, document, attachment };
}

describe("attachment deletion queue", () => {
  beforeEach(resetTestData);

  it("expires PENDING rows once and releases their reservation once", async () => {
    const { fixture, attachment } = await seedQueuedAttachment("PENDING");
    const now = new Date("2026-07-11T00:00:00.000Z");
    await setTestDatabaseTime(now);
    await expect(enqueueExpiredPendingAttachments({ limit: 20, rootOperationId: TEST_ROOT_OPERATION_ID })).resolves.toEqual({ enqueued: 1 });
    await expect(enqueueExpiredPendingAttachments({ limit: 20, rootOperationId: TEST_ROOT_OPERATION_ID })).resolves.toEqual({ enqueued: 0 });
    await expect(prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } }))
      .resolves.toMatchObject({
        status: "DELETE_PENDING",
        deletionReason: "PENDING_EXPIRED",
        reservedBytes: 0n,
      });
    await expect(prisma.workspaceAttachmentUsage.findUniqueOrThrow({
      where: { workspaceId: fixture.workspace.id },
      select: { reservedBytes: true, deletingBytes: true },
    })).resolves.toEqual({ reservedBytes: 0n, deletingBytes: 12n });
  });

  it("marks READY files before document deletion and preserves the queue row", async () => {
    const { fixture, document, attachment } = await seedQueuedAttachment("READY");
    await prisma.$transaction(async (tx) => {
      await attachmentPurgeReadiness.assertCandidate(tx, {
        ...purgeBatchInput(fixture.workspace.id, [document.id]),
      }, TEST_PURGE_STATE);
      await tx.document.delete({ where: { id: document.id } });
    });
    await expect(prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } }))
      .resolves.toMatchObject({
        documentId: null,
        status: "DELETE_PENDING",
        deletionReason: "DOCUMENT_RETENTION",
      });
    await expect(prisma.workspaceAttachmentUsage.findUniqueOrThrow({
      where: { workspaceId: fixture.workspace.id },
      select: { readyBytes: true, deletingBytes: true },
    })).resolves.toEqual({ readyBytes: 0n, deletingBytes: 12n });
  });

  it("queues candidate attachment deletion in the caller transaction with stable provenance", async () => {
    const { fixture, document, attachment } = await seedQueuedAttachment("READY");
    const rootOperationId = "6f080172-7c65-4f86-9256-463e29ea0d42";
    await prisma.$transaction((tx) => attachmentPurgeReadiness.assertCandidate(tx, {
      ...purgeBatchInput(fixture.workspace.id, [document.id]), rootOperationId,
    }, TEST_PURGE_STATE));
    await expect(prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } }))
      .resolves.toMatchObject({
        status: "DELETE_PENDING",
        deletionReason: "DOCUMENT_RETENTION",
        deleteOperationId: rootOperationId,
      });
    await expect(loadJournalForSubject("ATTACHMENT", attachment.id)).resolves.toEqual([
      expect.objectContaining({
        kind: "ATTACHMENT_DELETE_REQUESTED",
        payload: { stateCode: "ATTACHMENT_DELETE_REQUESTED", stateVersion: 1 },
      }),
    ]);
  });

  it("retries unlink with backoff and tombstones exactly once after success", async () => {
    const { attachment } = await seedQueuedAttachment("PENDING");
    const now = new Date("2026-07-11T00:00:00.000Z");
    await setTestDatabaseTime(now);
    await enqueueExpiredPendingAttachments({ limit: 10, rootOperationId: TEST_ROOT_OPERATION_ID });
    syntheticDeleteAuthority.failNext("ATTACHMENT_STORAGE_IO_FAILED");
    await expect(runAttachmentDeletionWorkerOnce({ limit: 10 }))
      .resolves.toEqual({ deleted: 0, retried: 1 });
    const retry = await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
    expect(retry).toMatchObject({ status: "DELETE_PENDING", deleteAttempts: 1 });
    expect(retry.nextDeleteAttemptAt!.getTime()).toBeGreaterThan(now.getTime());

    await setTestDatabaseTime(new Date(retry.nextDeleteAttemptAt!.getTime() + 1));
    await expect(runAttachmentDeletionWorkerOnce({ limit: 10 }))
      .resolves.toEqual({ deleted: 1, retried: 0 });
    await expect(runAttachmentDeletionWorkerOnce({ limit: 10 }))
      .resolves.toEqual({ deleted: 0, retried: 0 });
    expect(syntheticDeleteAuthority.deleteCalls).toBe(2);
    await expect(prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } }))
      .resolves.toMatchObject({
        status: "DELETED",
        storageKey: null,
        fileName: "",
        mimeType: "application/octet-stream",
        size: 0,
      });
    await expect(prisma.workspaceAttachmentUsage.findUniqueOrThrow({
      where: { workspaceId: attachment.workspaceId },
      select: { deletingBytes: true },
    })).resolves.toEqual({ deletingBytes: 0n });
  });

  it("never passes an escaping key to the filesystem remover", async () => {
    const { attachment } = await seedQueuedAttachment("PENDING", "../outside");
    const now = new Date("2026-07-11T00:00:00.000Z");
    await setTestDatabaseTime(now);
    await enqueueExpiredPendingAttachments({ limit: 10, rootOperationId: TEST_ROOT_OPERATION_ID });
    await runAttachmentDeletionWorkerOnce({ limit: 10 });
    expect(syntheticDeleteAuthority.deleteCalls).toBe(0);
    await expect(prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } }))
      .resolves.toMatchObject({ status: "DELETE_PENDING", failureCode: "ATTACHMENT_UNLINK_FAILED" });
  });
});
```

- [ ] **Step 2: Run deletion tests to verify red**

Run: `pnpm exec vitest run tests/attachments/deletion.test.ts tests/attachments/journal-replay.test.ts tests/documents/purge-archived-cli.test.ts --reporter=dot`

Expected: FAIL because queue transitions, durable retries, and document pre-delete enqueueing do not exist.

- [ ] **Step 3: Implement idempotent queue transitions and retry**

Create `lib/attachments/deletion.ts`:

```ts
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { attachmentStorageClient } from "@/lib/attachments/storage";
import { lockAttachmentQuota } from "@/lib/attachments/lifecycle";
import { appendSecurityJournalEvent, deriveSecurityJournalOperationId } from "@/lib/security/journal";

type Db = Prisma.TransactionClient | PrismaClient;

export async function enqueueExpiredPendingAttachments(input: {
  limit: number;
  rootOperationId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const candidates = await selectExpiredCandidateIdsAtDatabaseTime(tx, input.limit);
    for (const workspaceId of [...new Set(candidates.map((row) => row.workspaceId))].sort()) {
      await lockAttachmentQuota(tx, workspaceId);
    }
    const rows = await lockExpiredAttachmentRowsInCanonicalOrder(tx, candidates);
    const [{ databaseNow }] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
      SELECT statement_timestamp() AS "databaseNow"
    `;
    for (const row of rows) {
      await tx.workspaceAttachmentUsage.update({
        where: { workspaceId: row.workspaceId },
        data: {
          reservedBytes: { decrement: row.reservedBytes },
          deletingBytes: { increment: row.reservedBytes },
        },
      });
      await tx.attachment.update({
        where: { id: row.id },
        data: {
          status: "DELETE_PENDING",
          deletionReason: "PENDING_EXPIRED",
          deleteOperationId: input.rootOperationId,
          reservedBytes: 0n,
          deletingChargeBytes: row.reservedBytes,
          nextDeleteAttemptAt: databaseNow,
        },
      });
      const kind = "ATTACHMENT_DELETE_REQUESTED" as const;
      const entry = await appendSecurityJournalEvent(tx, {
        kind,
        subjectType: "ATTACHMENT",
        subjectId: row.id,
        operationId: deriveSecurityJournalOperationId({
          rootOperationId: input.rootOperationId,
          kind,
          subjectType: "ATTACHMENT",
          subjectId: row.id,
        }),
        payload: { stateCode: kind, stateVersion: 1 },
      });
      await persistWriteOnceDeleteRequestProof(tx, row.id, {
        sequence: entry.sequence,
        entryHash: entry.entryHash,
      });
    }
    return { enqueued: rows.length };
  });
}

// lib/attachments/deletion.ts continues below.
```

Continue `lib/attachments/deletion.ts` with the exported candidate-only transition:

```ts
import { Prisma } from "@prisma/client";
import { lockAttachmentQuota } from "@/lib/attachments/lifecycle";
import { appendSecurityJournalEvent, deriveSecurityJournalOperationId } from "@/lib/security/journal";

export async function markDocumentAttachmentsDeletePending(
  tx: Prisma.TransactionClient,
  documentId: string,
  rootOperationId: string,
) {
  const candidates = await selectDocumentAttachmentIdentitiesWithoutLock(tx, documentId);
  for (const workspaceId of [...new Set(candidates.map((row) => row.workspaceId))].sort()) {
    await lockAttachmentQuota(tx, workspaceId);
  }
  const attachments = await lockAttachmentRowsInCanonicalOrder(tx, candidates);
  const [{ databaseNow }] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
    SELECT statement_timestamp() AS "databaseNow"
  `;
  for (const attachment of attachments) {
    if (attachment.status === "PENDING" && attachment.reservedBytes > 0n) {
      await tx.workspaceAttachmentUsage.update({
        where: { workspaceId: attachment.workspaceId },
        data: {
          reservedBytes: { decrement: attachment.reservedBytes },
          deletingBytes: { increment: attachment.reservedBytes },
        },
      });
    }
    if (attachment.status === "READY") {
      await tx.workspaceAttachmentUsage.update({
        where: { workspaceId: attachment.workspaceId },
        data: {
          readyBytes: { decrement: BigInt(attachment.size) },
          deletingBytes: { increment: BigInt(attachment.size) },
        },
      });
    }
    await tx.attachment.update({
      where: { id: attachment.id },
      data: {
        status: "DELETE_PENDING",
        deletionReason: "DOCUMENT_RETENTION",
        reservedBytes: 0n,
        deletingChargeBytes: attachment.status === "PENDING"
          ? attachment.reservedBytes
          : BigInt(attachment.size),
        deleteOperationId: rootOperationId,
        nextDeleteAttemptAt: databaseNow,
      },
    });
    const kind = "ATTACHMENT_DELETE_REQUESTED" as const;
    const entry = await appendSecurityJournalEvent(tx, {
      kind,
      subjectType: "ATTACHMENT",
      subjectId: attachment.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId, kind, subjectType: "ATTACHMENT", subjectId: attachment.id,
      }),
      payload: { stateCode: kind, stateVersion: 1 },
    });
    await persistWriteOnceDeleteRequestProof(tx, attachment.id, {
      sequence: entry.sequence,
      entryHash: entry.entryHash,
    });
  }
  return attachments.length;
}
```

Then create `lib/attachments/purge-readiness.ts`:

```ts
import { markDocumentAttachmentsDeletePending } from "@/lib/attachments/deletion";
import type { PurgeEvaluationState, PurgeLeafReadiness } from "@/lib/retention/purge-readiness";

export const attachmentPurgeReadiness: PurgeLeafReadiness = {
  name: "attachments",
  async assertCandidate(tx, input, _state: PurgeEvaluationState) {
    if (!input.rootOperationId) throw new Error("PURGE_ROOT_OPERATION_ID_REQUIRED");
    for (const documentId of [...input.documentIds].sort()) {
      await markDocumentAttachmentsDeletePending(tx, documentId, input.rootOperationId);
    }
  },
};
```

Continue `lib/attachments/deletion.ts`:

```ts

async function recordDeletionIntegrityQuarantine(candidate: {
  id: string;
  deleteOperationId: string | null;
}) {
  if (!candidate.deleteOperationId) throw new Error("ATTACHMENT_DELETE_PROVENANCE_REQUIRED");
  await prisma.$transaction(async (tx) => {
    const kind = "ATTACHMENT_QUARANTINED" as const;
    await appendSecurityJournalEvent(tx, {
      kind,
      subjectType: "ATTACHMENT",
      subjectId: candidate.id,
      operationId: deriveSecurityJournalOperationId({
        rootOperationId: candidate.deleteOperationId,
        kind,
        subjectType: "ATTACHMENT",
        subjectId: candidate.id,
      }),
      payload: { stateCode: kind, stateVersion: 1 },
    });
  });
}

function retryAt(databaseNow: Date, attempts: number) {
  const delayMs = Math.min(24 * 60 * 60 * 1_000, 60_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(databaseNow.getTime() + delayMs);
}

type AuthorizedPhysicalDeletionPort = Readonly<{
  runCandidate<T>(input: { candidateId: string }, writer: (input: {
    deleteClient: AttachmentDeleteSocketClient;
    databaseNow: Date;
  }) => Promise<T>): Promise<T>;
}>;

const failClosedPhysicalDeletion: AuthorizedPhysicalDeletionPort = {
  async runCandidate() { throw new Error("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED"); },
};

export async function processAttachmentDeletionQueueCore(
  input: { limit: number },
  authorization: AuthorizedPhysicalDeletionPort = failClosedPhysicalDeletion,
) {
  const candidateIds = await selectDueDeleteCandidateIdsUsingDatabaseTime(input.limit);
  let deleted = 0;
  let retried = 0;
  for (const candidateId of candidateIds) {
    try {
      await authorization.runCandidate({ candidateId }, async ({ deleteClient, databaseNow }) => {
        await prisma.$transaction(async (tx) => {
          const identity = await readCandidateWorkspaceWithoutLock(tx, candidateId);
          await lockAttachmentQuota(tx, identity.workspaceId);
          const candidate = await lockDeletePendingAttachment(tx, candidateId);
          assertCompleteWriteOnceDeleteProof(candidate);
          await assertExactlyOneStorageKeyOwner(tx, candidate.storageKey, candidate.id);
          const stored = candidate.storageKey
            ? await attachmentStorageClient.readVerified(candidate.storageKey)
            : null;
          if (stored && (!candidate.contentSha256 || stored.size !== candidate.size ||
              stored.contentSha256 !== candidate.contentSha256)) {
            await recordDeletionIntegrityQuarantineInTransaction(tx, candidate);
          }

          // The distinct delete socket has already verified SO_PEERCRED and the exact
          // independently signed remote-journal fence. Verified ENOENT is success.
          if (candidate.storageKey) {
            await deleteClient.deleteVerified({
              subjectKind: "ATTACHMENT",
              subjectId: candidate.id,
              storageKey: candidate.storageKey,
              expectedIdentity: stored?.identityToken,
              journalSequence: candidate.deleteRequestSequence!,
              eventHash: candidate.deleteRequestEntryHash!,
            });
          }
          await tx.workspaceAttachmentUsage.update({
            where: { workspaceId: candidate.workspaceId },
            data: { deletingBytes: { decrement: candidate.deletingChargeBytes } },
          });
          await tx.attachment.update({
            where: { id: candidate.id },
            data: {
              status: "DELETED",
              storageKey: null,
              documentId: null,
              fileName: "",
              mimeType: "application/octet-stream",
              size: 0,
              reservedBytes: 0n,
              deletingChargeBytes: 0n,
              deletedAt: databaseNow,
              nextDeleteAttemptAt: null,
              failureCode: null,
              // deleteOperationId/deleteRequestSequence/deleteRequestEntryHash remain.
            },
          });
          const kind = "ATTACHMENT_DELETED" as const;
          await appendSecurityJournalEvent(tx, {
            kind,
            subjectType: "ATTACHMENT",
            subjectId: candidate.id,
            operationId: deriveSecurityJournalOperationId({
              rootOperationId: candidate.deleteOperationId!, kind,
              subjectType: "ATTACHMENT", subjectId: candidate.id,
            }),
            payload: { stateCode: kind, stateVersion: 1 },
          });
        });
      });
      deleted += 1;
    } catch {
      await recordRetryWithDatabaseTime(candidateId); // always remains DELETE_PENDING
      retried += 1;
    }
  }
  return { deleted, retried };
}
```

`scripts/attachments/deletion-worker-adapter.ts` is the sole production constructor for
the non-default authorization port. For each opaque candidate id it:

1. safe-reads a fresh independent signed immutable remote journal batch/high-water and
   verifies it covers the exact DB `deleteRequestSequence`/`deleteRequestEntryHash`;
2. calls unchanged
   `productionPurgeReadiness.authorizePhysicalDeletion({subjectKind:"ATTACHMENT",subjectId,journalSequence,eventHash})`
   outside the shared global lock; v0 always denies;
3. attempts the shared global deployment/backup lock once without waiting;
4. inside the lock, re-reads the DB tuple and re-verifies the same remote fence,
   signature, high-water, peer UID/socket, and authorization with no network call, sleep,
   retry wait, or operator input;
5. invokes the core writer and holds that global lock continuously from row claim and
   exact single-owner check through descriptor verification, delete/verified ENOENT,
   quota release, `DELETED`, and `ATTACHMENT_DELETED` commit.

The core default remains fail closed and imports no Leaf 14 file. A local journal export,
local checkpoint, merely advanced local high-water, cached proof, CLI `--execute`, queue
provenance, caller digest, or a proof for another subject/sequence/hash is insufficient.
The storage authority's distinct delete socket checks exact `SO_PEERCRED` and fence
again. Native unlink treats `ENOENT` as idempotent success only after resolving and
verifying the parent descriptor. Every operational error updates DB-time backoff while
remaining `DELETE_PENDING`; attempts never trigger automatic `FAILED`. No deletion path
calls `rm`, `stat`, joins a root pathname, or gives Web a delete opcode.

- [ ] **Step 4: Register the candidate-scoped leaf with Issue 5**

After rebasing on Issue 5, add `attachmentPurgeReadiness` to its final typed composite. Do not add a direct call or readiness environment variable in `lib/documents/purge-archived.ts`: the existing purge executor already passes `{documentIds,rootOperationId}` to the composite inside the same Serializable transaction before deleting document rows. The attachment leaf locks quota rows first and attachment rows second in canonical order, reads DB time after locks, moves only those candidates to `DELETE_PENDING`, writes their stable `deleteOperationId`, appends the canonical journal event, and persists its returned proof tuple before the document delete. A leaf exception rolls back queue, quota, journal, proof, and document deletion together.

Because `Attachment.documentId` is `SET NULL`, successful document deletion preserves
the deny-only queue rows, server-generated storage keys, and journal proof tuples. The
queue is durable intent, not physical authorization; the outer adapter independently
proves the remote fence on every attempt. Add a rollback test that throws after leaf
completion but before document delete and proves no attachment, quota, journal, or proof
change commits. No environment variable or Boolean represents destructive readiness.

- [ ] **Step 5: Write failing legacy-orphan dry-run/grace tests**

Create `tests/attachments/gc-cli.test.ts`:

```ts
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAttachmentGc, scanLegacyOrphans } from "@/scripts/attachments/gc";
import { createAttachmentMaintenanceClient } from "@/scripts/attachments/storage-maintenance-client";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "munjib-attachment-gc-"));
  roots.push(root);
  await mkdir(path.join(root, "workspace"), { recursive: true });
  return root;
}

it("reports only unreferenced files older than the seven-day grace period", async () => {
  const root = await makeRoot();
  const now = new Date("2026-07-11T00:00:00.000Z");
  for (const key of ["workspace/referenced", "workspace/old-orphan", "workspace/young-orphan"]) {
    await writeFile(path.join(root, key), "synthetic");
  }
  await utimes(path.join(root, "workspace/referenced"), new Date("2026-06-01"), new Date("2026-06-01"));
  await utimes(path.join(root, "workspace/old-orphan"), new Date("2026-06-01"), new Date("2026-06-01"));
  await utimes(path.join(root, "workspace/young-orphan"), new Date("2026-07-10"), new Date("2026-07-10"));
  await expect(scanLegacyOrphans({
    store: await createSyntheticMaintenanceAuthority(root),
    now,
    graceMs: 7 * 24 * 60 * 60 * 1_000,
    referencedStorageKeys: new Set(["workspace/referenced"]),
  })).resolves.toEqual([{
    storageKey: "workspace/old-orphan", size: 9, identityToken: expect.any(String),
  }]);
});

it("defaults to dry run and requires the injected typed readiness port for --execute", async () => {
  const root = await makeRoot();
  const old = path.join(root, "workspace/old-orphan");
  await writeFile(old, "synthetic");
  await utimes(old, new Date("2026-06-01"), new Date("2026-06-01"));
  const log = vi.fn();
  const store = await createSyntheticMaintenanceAuthority(root);
  await expect(runAttachmentGc([], { log, store, now: new Date("2026-07-11") }))
    .resolves.toMatchObject({ dryRun: true, candidates: 1, deleted: 0 });
  await expect(runAttachmentGc(["--execute"], {
    log, store, now: new Date("2026-07-11"), readiness: failClosedPurgeReadiness,
    environment: "test", deploymentDigest: "sha256:synthetic",
  })).rejects.toThrow("DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED");
  await expect(readFile(old)).resolves.toBeInstanceOf(Buffer);
});
```

Add `readFile` to the first import in this test.

- [ ] **Step 6: Implement dry-run-first legacy inventory and logical-intent entry point**

`runAttachmentGc --execute` never unlinks. After Issue 5 candidate readiness it creates
or reconciles a durable `LEGACY_ORPHAN` logical intent, appends
`ATTACHMENT_DELETE_REQUESTED`, and stores the returned write-once proof tuple; anything
that cannot be mapped to one canonical attachment subject remains an inventory finding
for audited repair. The common Leaf14-gated worker is the only physical path.

Create `scripts/attachments/gc.ts`:

```ts
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import {
  attachmentMaintenanceClient,
  type AttachmentMaintenanceClient,
} from "@/scripts/attachments/storage-maintenance-client";
import type { DestructivePurgeReadiness } from "@/lib/retention/purge-readiness";
import { failClosedPurgeReadiness } from "@/lib/retention/purge-readiness";

export async function scanLegacyOrphans(input: {
  now: Date;
  graceMs: number;
  referencedStorageKeys: Set<string>;
  store?: AttachmentMaintenanceClient;
}) {
  const candidates: Array<{ storageKey: string; size: number; identityToken: string }> = [];
  for (const file of await (input.store ?? attachmentMaintenanceClient).listVerifiedFiles()) {
    if (input.referencedStorageKeys.has(file.storageKey)) continue;
    if (input.now.getTime() - file.mtimeMs < input.graceMs) continue;
    candidates.push({ storageKey: file.storageKey, size: file.size, identityToken: file.identityToken });
  }
  return candidates.sort((left, right) => left.storageKey.localeCompare(right.storageKey));
}

function parseArgs(args: string[]) {
  let execute = false;
  let graceDays = 7;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--execute") { execute = true; continue; }
    if (arg === "--grace-days") {
      graceDays = Number(args[index + 1]);
      index += 1;
      if (!Number.isInteger(graceDays) || graceDays < 7 || graceDays > 365) {
        throw new Error("--grace-days must be an integer from 7 to 365");
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { execute, graceDays };
}

export async function runAttachmentGc(
  args = process.argv.slice(2),
  options: {
    log?: (line: string) => void;
    store?: AttachmentMaintenanceClient;
    now?: Date;
    readiness?: DestructivePurgeReadiness;
    environment?: string;
    deploymentDigest?: string;
  } = {},
) {
  const log = options.log ?? console.log;
  const store = options.store ?? attachmentMaintenanceClient;
  const now = options.now ?? await readDatabaseStatementTime(prisma);
  const { execute, graceDays } = parseArgs(args);
  const readiness = options.readiness ?? failClosedPurgeReadiness;
  const referenced = await prisma.attachment.findMany({
    where: { storageKey: { not: null } },
    select: { storageKey: true },
  });
  const candidates = await scanLegacyOrphans({
    now,
    graceMs: graceDays * 24 * 60 * 60 * 1_000,
    referencedStorageKeys: new Set(referenced.flatMap(({ storageKey }) => storageKey ? [storageKey] : [])),
    store,
  });
  if (execute) {
    if (!options.environment || !options.deploymentDigest) {
      throw new Error("PURGE_DEPLOYMENT_IDENTITY_REQUIRED");
    }
    await readiness.prepare({
      environment: options.environment,
      deploymentDigest: options.deploymentDigest,
      now,
    });
  }
  let deleted = 0;
  for (const candidate of candidates) {
    const fingerprint = createHash("sha256").update(candidate.storageKey).digest("hex").slice(0, 12);
    log(`${execute ? "delete" : "dry run"}: orphan ${fingerprint} (${candidate.size} bytes)`);
    if (execute) {
      await enqueueLegacyOrphanDeleteIntent({
        candidate,
        databaseNow: now,
        readiness,
      });
      deleted += 0; // physical deletion is performed only by the common fenced worker
    }
  }
  log(`${execute ? "queued" : "dry run candidates"}: ${execute ? candidates.length : candidates.length}`);
  return { dryRun: !execute, candidates: candidates.length, queued: execute ? candidates.length : 0, deleted };
}

if (process.argv[1]?.endsWith("scripts/attachments/gc.ts")) {
  runAttachmentGc().catch(() => {
    console.error("ATTACHMENT_GC_FAILED");
    process.exitCode = 1;
  });
}
```

Create `scripts/attachments/process-deletion-queue.ts`:

```ts
import {
  enqueueExpiredPendingAttachments,
} from "@/lib/attachments/deletion";

async function main() {
  if (process.argv.length !== 2) throw new Error("ATTACHMENT_DELETION_ARGUMENT_FORBIDDEN");
  const rootOperationId = await readFixedRootIssuedDeletionOperationId();
  const expired = await enqueueExpiredPendingAttachments({ limit: 100, rootOperationId });
  console.log(JSON.stringify({ expired: expired.enqueued, physicalDeleted: 0 }));
}

main().catch(() => {
  console.error("ATTACHMENT_DELETION_FAILED");
  process.exitCode = 1;
});
```

Add to `package.json`:

```json
"attachments:deletion-intent": "tsx scripts/attachments/process-deletion-queue.ts",
"attachments:deletion-worker": "tsx scripts/attachments/deletion-worker-adapter.ts",
"attachments:gc": "tsx scripts/attachments/gc.ts"
```

Create `leaf11JournalReplayReducers` with exactly `ATTACHMENT_QUARANTINED`,
`ATTACHMENT_DELETE_REQUESTED`, and `ATTACHMENT_DELETED`. Under Leaf 2's branded
restore context, quarantine/request handlers idempotently force unreadable
`DELETE_PENDING` while retaining the exact quota charge and the replayed sequence/hash
proof tuple; a restored older snapshot cannot make bytes readable or authorize them
again. `DELETED` may release quota only when the independent remote fence and distinct
delete authority have confirmed physical absence/removal. Missing targets are never
recreated. No reducer serves bytes, restores READY, appends, trusts a local checkpoint,
or mutates journal/checkpoint state. RED tests cover exact map membership, subject/
payload/proof mismatch, repeated execution, older-snapshot resurrection, crash
boundaries, and no-append/fenced-delete source contracts.

- [ ] **Step 7: Run deletion/GC/purge regression tests to verify green**

Run:

```bash
pnpm exec vitest run tests/attachments/deletion.test.ts tests/attachments/journal-replay.test.ts tests/attachments/gc-cli.test.ts tests/documents/purge-archived-cli.test.ts tests/attachments/service.test.ts --reporter=dot
pnpm exec tsc --noEmit
```

Expected: PASS; expiry and repeated queue calls move quota once, proof tuples are
write-once, fenced delete/verified-ENOENT retries are idempotent, five failures remain
`DELETE_PENDING`, document deletion preserves deny rows/proofs, and legacy GC only
inventories or queues intent.

- [ ] **Step 8: Commit deletion lifecycle without enabling it**

```bash
git add lib/attachments/deletion.ts lib/attachments/journal-replay.ts lib/attachments/purge-readiness.ts scripts/attachments/process-deletion-queue.ts scripts/attachments/deletion-worker-adapter.ts scripts/attachments/gc.ts package.json lib/documents/purge-archived.ts tests/attachments/deletion.test.ts tests/attachments/journal-replay.test.ts tests/attachments/purge-readiness.test.ts tests/attachments/gc-cli.test.ts tests/documents/purge-archived-cli.test.ts wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "security: add durable attachment deletion queue"
```

Expected: commit succeeds. Remote import remains disabled by documented runtime policy;
the intent CLI cannot authorize physical deletion, the existing Leaf 5 production seam
remains fail-closed v0 until Leaf 14, and no readiness Boolean is introduced.

### Task 7: Verify Isolation, Lifecycle, Disabled Defaults, and Remote-Safe Documentation

**Files:**
- Modify after disclosure review: `wiki/Markdown Import And Clipboard Paste Workflow.md`
- Modify after disclosure review: `wiki/Auth And Permissions Workflow.md`
- Modify after disclosure review: `wiki/RAG Process Workflow.md`
- Modify after disclosure review: `wiki/index.md`
- Modify after disclosure review: `wiki/log.md`
- Modify after disclosure review: `wiki/manifest.json`

**Interfaces:**
- Consumes: Tasks 1–6 and Issues 4/5/6/13 seams.
- Produces: verified zero-fetch staging, credential/network isolation, lifecycle compensation, dry-run defaults, an owner-valid Leaf 11 projection-slot with the external-image-import slot still reserved at version 0, Issue 6 and Leaf 4 cores unchanged, and a disclosure-reviewed remote-safe diff. It does not enable remote import, physical deletion, purge readiness, the contract migration, or capability v2.

- [ ] **Step 1: Run all attachment and cross-boundary tests**

Run:

```bash
pnpm exec vitest run tests/prisma/attachment-lifecycle-migration.test.ts tests/prisma/attachment-lifecycle-contract-migration.test.ts tests/security/attachment-capability.test.ts tests/security/document-downstream-extension-contract.test.ts tests/security/external-image-import-slot.test.ts tests/security/attachment-media-compromise-chain.test.ts tests/attachments/backfill-integrity.test.ts tests/attachments/backfill-gate.test.ts tests/attachments/storage-linux.integration.test.ts tests/attachments/media-canonicalizer.integration.test.ts tests/attachments/image-normalization.test.ts tests/attachments/service.test.ts tests/attachments/route.test.ts tests/attachments/url-policy.test.ts tests/attachments/egress-bootstrap.test.ts tests/attachments/worker-errors.test.ts tests/attachments/worker-transport.test.ts tests/attachments/worker-lifecycle.test.ts tests/attachments/fetch-readiness.test.ts tests/attachments/remote-import.test.ts tests/attachments/deletion.test.ts tests/attachments/journal-replay.test.ts tests/attachments/purge-readiness.test.ts tests/attachments/gc-cli.test.ts tests/components/clipboard-html.test.ts tests/components/remote-image-candidates.test.ts tests/components/document-editor-preview.test.tsx tests/components/ai-answer.test.tsx tests/workspace-actions.test.ts tests/documents/current-view.test.ts tests/documents/history.test.ts tests/documents/service.test.ts tests/documents/purge-archived-cli.test.ts tests/docker/compose.test.ts --reporter=dot
pnpm exec playwright test tests/e2e/zero-egress-rendering.spec.ts tests/e2e/explicit-image-import.spec.ts --project=chromium
pnpm exec prisma validate
pnpm run db:generate
pnpm exec tsc --noEmit
pnpm test
pnpm run build
```

Expected: every command exits 0. The Playwright request recorder observes zero remote-
host requests before confirmation; lifecycle tests cover both compensation directions,
quota concurrency, archive races, DB-time retry, peer/fence/global-lock confinement,
and Web no-volume/no-native/no-Sharp containment. The slot contract proves the Leaf 4
reserved downstream seam remains version 0 and byte-identical through Task 7 and both
renderer cores retain their exact safe-URL-closed Leaf 4 hashes.

- [ ] **Step 2: Exercise only the installed attested worker lifecycle**

Use the protected Leaf 13A delivery job to sign and submit three bounded envelopes to
the forced SSH dispatcher, in order: operation `attachment-fetch-lifecycle` with
action `start`, then `verify`, then `stop`. Each request binds the current app/bundle/
floor/previous-generation identities, monotonic sequence, expiry, and unique nonce.
There is no host shell, sudo, direct helper, Docker, or caller argument command.

Expected: stable `ATTACHMENT_FETCH_LIFECYCLE_ACTIVE`,
`ATTACHMENT_FETCH_LIFECYCLE_OK`, and `ATTACHMENT_FETCH_LIFECYCLE_STOPPED` codes only.
The helper's fixed namespace probes prove trusted services, metadata, providers,
private/special addresses, non-80/443 ports, proxy transport, and encoded responses
unreachable/denied. No URL, response, container/network id, address, digest, or ruleset
is printed. Operators never invoke Docker or checkout helpers; stop removes policy only
after the exact worker is absent, and any uncertainty leaves deny policy installed.

- [ ] **Step 3: Verify disabled defaults and typed destructive readiness**

Run:

```bash
pnpm attachments:deletion-worker
pnpm attachments:gc
pnpm documents:purge-archived
```

Expected: the physical deletion adapter accepts no arguments and fails closed with
`DESTRUCTIVE_PURGE_INTEGRATION_NOT_INSTALLED` while the existing Leaf 5 reservation is
v0; attachment GC and document purge report dry-run/logical-intent counts only; no file,
row, AI history, RAG chunk, or audit record is physically deleted. Candidate purge
creates intent only through Issue 5's final typed composite. No environment variable,
CLI `--execute`, local checkpoint, or Boolean represents physical readiness.

- [ ] **Step 4: Record the remote-safe operating contract**

Update the wiki with these exact durable claims, without copying the restricted threat model or any real URL/file/content:

```markdown
- External rich-HTML images are staged and show only candidate count plus origin. The server fetch action is not called until explicit confirmation.
- Plain remote image URLs and model-authored external images remain click-only until `Import as image`; successful imports save only `/api/attachments/<id>`.
- Remote image fetching runs in a credential-free raw-fetch worker behind independent default-deny egress, then pipes bytes to a no-network/no-DB one-shot canonicalizer. Web has no attachment volume, native addon, or Sharp/libvips. Only effective HTTP 80 and HTTPS 443 are eligible; redirects, URL credentials, special IP ranges, provider/control-plane hosts, and mixed public/private DNS answers are denied.
- Attachments move through `PENDING -> READY -> DELETE_PENDING -> DELETED`; upload/manual-repair failures may use `FAILED`, but physical retry count never does. Pending rows reserve workspace quota, are uploader-only, use database time, and finalize only in an active writable document save.
- Existing attachment rows remain non-servable until a bounded same-descriptor exact-size/SHA-256 backfill verifies them; null or mismatched integrity is quarantined and remains charged in `deletingBytes` until unlink succeeds.
- Remote import deploys disabled by default. Logical delete atomically stores its journal sequence/hash and remains unreadable; physical deletion requires a fresh independent signed remote high-water proof and the Leaf 14-activated existing production seam under the shared global lock. Legacy orphan execution only queues the same intent.
```

Add links from `wiki/index.md` to the Markdown import/attachment lifecycle section and append `wiki/log.md` with the implementation commit ids only. Run `pnpm wiki:manifest` to regenerate the manifest; do not put production counts, storage keys, URLs, private document text, or incident detail in the wiki.

- [ ] **Step 5: Stage, lint, and inspect the remote-safe diff**

Run:

```bash
pnpm wiki:install-hooks
git add prisma/schema.prisma prisma/migrations/20260712050000_attachment_lifecycle_transition/migration.sql package.json pnpm-lock.yaml rust-toolchain.toml native/attachment-storage services/attachment-storage-authority services/attachment-media-canonicalizer services/attachment-fetch-worker lib/attachments lib/documents/service.ts lib/documents/downstream/leaf11-attachments.ts lib/documents/purge-archived.ts app/api/attachments app/workspaces/\[workspaceSlug\]/actions.ts app/workspaces/\[workspaceSlug\]/page.tsx components/document-editor.tsx components/document-editor components/markdown/leaf11-external-image-import-controls.tsx deploy/attachments/attested-root-bundle scripts/attachments Dockerfile docker-compose.yml docker-compose.dev.yml .env.example .env.docker.example tests/prisma/attachment-lifecycle-migration.test.ts tests/prisma/attachment-lifecycle-contract-migration.test.ts tests/security/attachment-capability.test.ts tests/security/document-downstream-extension-contract.test.ts tests/security/external-image-import-slot.test.ts tests/security/attachment-media-compromise-chain.test.ts tests/attachments tests/components/remote-image-candidates.test.ts tests/components/document-editor-preview.test.tsx tests/e2e/explicit-image-import.spec.ts tests/workspace-actions.test.ts tests/documents/current-view.test.ts tests/documents/history.test.ts tests/documents/service.test.ts tests/documents/purge-archived-cli.test.ts tests/docker/compose.test.ts wiki/Markdown\ Import\ And\ Clipboard\ Paste\ Workflow.md wiki/Auth\ And\ Permissions\ Workflow.md wiki/RAG\ Process\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
git diff --cached --name-only
if git diff --cached --name-only | rg -q '^components/markdown/(safe-media|external-media-interstitial)\.tsx$'; then echo 'Leaf 4 renderer core staged' >&2; exit 1; fi
if git diff --cached --name-only | rg -q '^components/markdown/downstream/leaf11-external-image-import\.tsx$|^deploy/security/protected-artifact-owners\.json$|^deploy/security/capabilities/attachment-integrity-lifecycle\.json$|^prisma/migrations/.*_require_attachment_integrity/'; then echo 'Task 8 activation staged early' >&2; exit 1; fi
if git diff --cached --unified=0 | rg -q 'NEXTAUTH_SECRET|(?:OPENAI|ANTHROPIC|LANGFUSE|SENTRY|GOOGLE)_[A-Z_]*KEY\s*[:=]\s*[^$[:space:]]|password(Hash)?\s*[:=]|https?://[^/[:space:]]+/[^[:space:]]*\?(?:token|key|signature)=|docs/superpowers/(plans|specs)/2026-07-11-security'; then echo 'restricted staged content detected' >&2; exit 1; fi
```

Expected: sync/lint/check commands pass; the final `rg` exits 1; no restricted plan/spec, secret value, signed URL, private content, or remote URL path/query is staged. Synthetic remote URL fixtures remain confined to test files and contain no credentials.

### Task 8: Apply the Guarded Contract, Activate Explicit Import, and Publish v2 Last

**Files:**
- Apply the dynamically allocated migration strictly after
  `20260712060000_ai_provider_policy` with suffix `_require_attachment_integrity`
- Modify: `components/markdown/downstream/leaf11-external-image-import.tsx`
- Modify: `deploy/security/protected-artifact-owners.json`
- Modify: `deploy/security/capabilities/attachment-integrity-lifecycle.json`
- Modify: `tests/security/external-image-import-slot.test.ts`
- Modify: `tests/security/attachment-capability.test.ts`

- [ ] **Step 1: Reverify every final gate and apply the contract**

Require deployed v1, the merged/deployed Leaf 10 `060000` migration, exact candidate,
signed completion record, zero duplicate non-null storage keys, zero integrity/proof/
quota/recovery/Web-privilege defects, current authority/canonicalizer/addon digests, and
DB-time live queries. Reverify immediately before the fixed migrator; then apply and
validate the integrity/proof constraints plus partial unique storage-key index. Any
drift leaves v1 and the expand schema live.

- [ ] **Step 2: Activate only the pre-reserved Leaf 4 seam**

Require the final safe-URL/backslash-closed `zero-ambient-media-egress@1` baseline and
exact renderer hashes. Apply the prepared seam body as the sole `0 -> 1` transition,
update only its owner tuple to `attachment-integrity-lifecycle@2`, and rerun the
multi-browser zero-request-before-confirmation suite. `safe-media.tsx` and
`external-media-interstitial.tsx` remain byte-identical.

- [ ] **Step 3: Publish the stable capability id at v2**

```json
{"format":"munjib-security-capability-v1","id":"attachment-integrity-lifecycle","version":2,"leaf":11,"requires":["security-journal-auth-tombstones@1","zero-ambient-media-egress@1","active-resource-boundaries@1","document-acl-closure@1","issue-10-ai-provider-policy@1","immutable-private-runtime@1"],"evidenceTests":["tests/prisma/attachment-lifecycle-migration.test.ts","tests/prisma/attachment-lifecycle-contract-migration.test.ts","tests/attachments/storage-linux.integration.test.ts","tests/attachments/media-canonicalizer.integration.test.ts","tests/security/attachment-media-compromise-chain.test.ts","tests/attachments/image-normalization.test.ts","tests/attachments/backfill-integrity.test.ts","tests/attachments/backfill-gate.test.ts","tests/attachments/service.test.ts","tests/attachments/route.test.ts","tests/attachments/remote-import.test.ts","tests/attachments/egress-bootstrap.test.ts","tests/attachments/worker-lifecycle.test.ts","tests/attachments/fetch-readiness.test.ts","tests/attachments/deletion.test.ts","tests/attachments/journal-replay.test.ts","tests/components/remote-image-candidates.test.ts","tests/security/external-image-import-slot.test.ts","tests/e2e/explicit-image-import.spec.ts","tests/docker/compose.test.ts"]}
```

The capability proves Web has no attachment volume/native addon/Sharp, every image path
crosses the one-shot canonicalizer, the raw fetcher cannot decode, storage-key uniqueness
and delete proof tuples are enforced, and physical delete remains fail-closed until Leaf
14 activates the existing Leaf 5 production seam. After v2 promotion, rollback is only
another eligible v2 digest or fix-forward.

Rerun the complete Task 7 Vitest/Playwright/type/build/Compose matrix after the contract
and seam activation, plus the exact capability/floor compiler. No pre-activation result
may satisfy the v2 evidence list.

- [ ] **Step 4: Stage final activation files only after all evidence passes**

```bash
git add prisma/migrations/*_require_attachment_integrity/migration.sql components/markdown/downstream/leaf11-external-image-import.tsx deploy/security/protected-artifact-owners.json deploy/security/capabilities/attachment-integrity-lifecycle.json tests/security/external-image-import-slot.test.ts tests/security/attachment-capability.test.ts wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
```

Expected: the contract, sole reserved-slot activation, owner update, exact v2 fragment,
and evidence land together after Tasks 4–7; no Leaf 4 core or restricted plan is staged.

- [ ] **Step 5: Commit the final activation only when non-empty**

```bash
if ! git diff --cached --quiet; then git commit -m "docs: record hardened attachment lifecycle"; fi
```

Expected: a non-empty staged delta commits; an empty staged delta exits 0 without manufacturing a commit. Do not push until the separate disclosure review explicitly approves the exact remote diff.

- [ ] **Step 6: Push, open the PR, and poll CI plus unresolved review threads**

After disclosure approval, push the issue branch, create the PR, mark it ready, and poll every 60 seconds for at least five minutes. Each cycle must run `gh pr checks --watch=false` and the bundled review-thread GraphQL query; a pending/failing check, requested change, actionable inline comment, or unresolved thread blocks completion. Fix on the same branch, rerun the focused/full verification and wiki gates, commit, push, and repeat until checks are green and the GraphQL unresolved-thread count is zero. Never print comment bodies or restricted evidence in logs. Report the final PR URL, exact head SHA, check conclusion summary, and zero unresolved threads.
