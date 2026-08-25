# Security Encrypted Backup and Restore Implementation Plan

**Tracking:** Issue #168 · remote branch `issue-168-security-backup-restore`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted, append-only off-host snapshots plus indefinite Leaf 2 security-journal export and a measured disposable restore drill that keeps database and attachments in one quiesced epoch, uses an independently attested current recovery image, replays every canonical deny-only event, and proves RPO 24 hours/RTO 4 hours without exposing production credentials.

**Architecture:** A fixed Leaf 13 broker and root coordinator hold the shared security-state lock only while they quiesce production, supervise two non-root capture principals, seal one local ciphertext generation, and prove complete unfreeze. `munjib-capture-reader` can read only the maintenance DB and attachment root and can write plaintext only to root-opened bounded anonymous pipes; `munjib-capture-encryptor` can read only those pipes, the pinned public age recipient set, and root-opened ciphertext descriptors. After both producer cgroups are empty, root same-FD seals and hashes the ciphertext, unfreezes immediately, and a separate ciphertext-only uploader performs conditional exact-key publication. A separately administered fetcher and outbound-isolated decryptor must exact-fetch and successfully authenticate/decrypt that object before purpose-bound signing and independent catalog/high-water publication. Snapshot lifecycle is 7 daily/4 weekly/3 monthly, while Leaf 2's DB-owned BIGINT hash-chain journal is exported indefinitely through the same publish-after-decrypt rule. Restore keeps object read, age identity, DB loading, and root coordination in four disjoint principals, uses only fixed Leaf 13 broker operations and a no-route rootless runtime, never executes the snapshot image, and proves current-compatible recovery, replay, auth normalization, READY integrity, RAG, RPO/RTO, and teardown.

**Tech Stack:** PostgreSQL 16/pgvector, Prisma, Next.js/NextAuth, age, SHA-256, purpose-bound KMS brokers, conditional exact-key object transfer, a fixed no-route rootless OCI runtime, systemd timers, TypeScript/Vitest, Bash, and Leaf 13 attested static host brokers.

## Global Constraints

- The emergency two-phase recovery gate is an immediate, manual, restricted incident prerequisite before Issue 2 cleanup or any data-changing security migration. It is separate from Issue 14 automation and must be completed even if this implementation has not started.
- Issue 14 automation starts only after Issue 2's launch-membership cleanup, Issue 8's session-version/revocation contract, Issue 9's destructive document/AI purge hooks, Issue 11's attachment lifecycle contract, and Leaf 13B's immutable digest/deployment record are merged. Issues 2, 8, 9, 11, and 13B are explicit rebase inputs, not work duplicated here.
- Leaf 13B must already gate every schema-changing P1 release. This plan's own schema migration uses the exact-digest, provenance, expand/contract, and rollback checks.
- Initial objectives are RPO `86400` seconds (24 hours), RTO `14400` seconds (4 hours), and retention of 7 daily, 4 weekly, and 3 monthly recovery points.
- Backup data includes PostgreSQL and attachment bytes from one write-frozen epoch. `DocumentChunk` rows are excluded and rebuilt after restore.
- Capture acquires the same exclusive `/run/lock/munjib-security-state.lock` used by deploy, rollback, evidence rescan/refresh, capability publication, recovery-pointer promotion, attachment-worker lifecycle, edge generation activation, and destructive purge. It quiesces Web plus every registered database/file writer before reading the epoch. Caddy maintenance and database read-only mode alone are insufficient; an unregistered or unconfirmed writer blocks capture, and no listed operation may use an independent overlapping lock.
- Freeze state records independent edge, Web, worker, and database flags. Cleanup never swallows errors, and success/evidence is written only after every started freeze is reversed and Web/writer health passes. A failed unfreeze is a failed backup and pages immediately.
- A root-owned signed capture policy sets a hard monotonic freeze deadline. Before edge freeze, the coordinator requires healthy state storage, a reserved emergency state margin, projected ciphertext capacity, bounded pipe capacity, measured reader/encryptor throughput headroom, and a closed circuit breaker. An incomplete database/attachment epoch, producer timeout, producer descendant, capacity shortfall, state-fsync failure, or deadline breach invalidates the generation and starts unfreeze immediately. Repeated SLO failures open the circuit and page instead of repeatedly taking production into maintenance.
- Recovery state and ciphertext spool live on different fixed mount points, quotas, and capacity reservations. Filling or corrupting the ciphertext spool cannot starve the small root recovery journal needed to reverse Caddy, Web, writer, and database state. A partial generation without a root seal is moved to an unpublished quarantine and is never uploadable, signable, or catalog-visible.
- Database capture connects through a maintenance database, verifies the configured application database name using `current_database()`/catalog lookup, terminates only application-database writer sessions, and never applies a global read-only toggle through an application-DB connection.
- The production host stores only public age recipients. The age identity/private decryption key is never stored on the production host, in Git, in the backup destination, or in the backup-writer credential.
- `munjib-capture-reader` and `munjib-capture-encryptor` are distinct no-login UIDs with no shared supplementary group. The reader receives only file-backed read-only DB service material, a read-only attachment descriptor, and root-opened bounded anonymous output pipes. It has no recipient file, ciphertext path, object/KMS credential, external network, host log socket, D-Bus, or writable durable path. The encryptor receives only the pipe read ends, root-pinned public recipient descriptors, and root-opened write-only ciphertext descriptors. It has no DB socket, attachment path, object/KMS credential, age private identity, external network, host log socket, or caller-selected recipient/path.
- Unencrypted database dumps, attachment archives, private manifests, decrypted journal bundles, and restore payloads never enter a persistent filesystem, process argument, environment, stdout/stderr, journald, `/dev/log`, D-Bus, host Unix socket, or caller-visible diagnostic. They flow only through bounded root-opened anonymous pipes or exist beneath a guarded per-job `/run` tmpfs namespace with output disabled. `/tmp`, `/var/tmp`, the Git checkout, home directories, attachment volumes, and durable spool are forbidden for plaintext. The root coordinator waits for both producer units and their complete cgroups to die, proves no retained writable producer descriptor remains, then fsyncs, same-FD hashes, and seals the root-owned ciphertext inode and parent. `chmod`, `chown`, rename, path reopening, or producer-authored receipts are not adoption.
- Every snapshot and journal bundle is encrypted to both a long-term offline recovery recipient and the current operational restore recipient. Its signed, non-secret envelope records an immutable recipient-set version plus envelope-signer key ID/version. Verification accepts only a root-owned, pinned historical trust allowlist; old public verification roots and offline decryption capability are retained indefinitely, while no private identity is ever copied to production. Rotation adds a new recipient/version and proves the oldest retained snapshot plus every journal generation decrypts before any operational recipient is retired. Compromise rollback is additive signed metadata or rewrap at a new exact key; it never overwrites prior ciphertext.
- `munjib-backup-uploader` receives one root-sealed ciphertext descriptor plus conditional exact-key create/checksum authority. It has no DB/attachment access, age material, object list/read/overwrite/delete, KMS endpoint, signing credential, cloud/instance principal, metadata endpoint, ambient host credential, arbitrary local path, or catalog/high-water authority. It cannot author public envelope fields.
- `munjib-envelope-signer`, `munjib-snapshot-catalog-publisher`, and `munjib-journal-high-water-publisher` are three separate no-login principals and purpose-bound broker operations. The signer sees only the exact public envelope bytes and a root-owned `DecryptVerification` receipt after the sealed ciphertext has been uploaded, exact-fetched by the read-only recovery fetcher, and actually authenticated/decrypted by the isolated decryptor. It has no ciphertext, age identity, DB, object writer, catalog, or high-water authority. Catalog/high-water publishers consume only signed envelopes, independent exact-read/decrypt receipts, expected previous-generation digests, and fixed policy; they cannot sign, fetch plaintext, list storage, or use a mutable pointer.
- Exact publication order is invariant: complete DB/attachment epoch -> both capture producers dead -> root same-FD ciphertext fsync/seal/hash -> verified unfreeze -> conditional immutable ciphertext upload/checksum -> separate restore-fetch exact ciphertext read -> isolated decryptor AEAD/decrypt plus manifest/batch verification -> purpose-bound public-envelope signature -> immutable catalog or journal publication record -> monotonic high-water handoff. A signature, catalog entry, export checkpoint, or high-water created before successful decrypt verification is invalid. Every object is addressed by exact key, immutable provider generation/version, size, and SHA-256; no latest-key read or mutable pointer is trusted.
- Each publication phase has a root-owned fsynced state transition and deterministic retry. A crash may leave only an unreferenced ciphertext object; it cannot expose a signed envelope/catalog/high-water. Recovery exact-checks the sealed local receipt, immutable remote object generation, independent decrypt receipt, signature, and expected previous generation, then resumes the next missing phase without listing or overwriting.
- Journal tail discovery never lists storage or trusts a mutable object pointer. Every advanced batch produces an immutable KMS-signed high-water record at a sequence-derived exact key; a separately replicated root-owned recovery handoff supplies the exact record/key to restore, which verifies its monotonic hash chain and signature.
- Credentials are supplied only through root-owned PostgreSQL service/pass files and systemd credentials. Never put passwords, database URLs, age identities, rclone credentials, OAuth tokens, signing secrets, or real identity values in process arguments, source, tests, logs, manifests, issues, PRs, or telemetry.
- Restore-loader, migrator, prerequisite, finalizer, and verification connections discard caller `PGOPTIONS` and service-file `options`, then set one fixed `PGOPTIONS=-c search_path=pg_catalog,public`; an allowlisted extension schema may follow `public`, never precede `pg_catalog`. `$user`, an empty component, caller override, or a writable schema before `pg_catalog` fails admission. Every actual connection verifies `current_schemas(true)[1] = 'pg_catalog'`.
- Leaf 14 owns capability `encrypted-recovery-readiness`. It covers encrypted snapshot/spool, immutable offline artifact mirror, non-superuser restore, journal replay, final high-water, two-run qualification, recovery-pointer promotion, purge composition, and only its Leaf 5-reserved `lib/retention/downstream/leaf14-production-readiness.ts` seam plus Leaf 14 helpers. It never modifies or republishes Leaf 5 `lib/retention/purge-readiness.ts`. Leaf 13B binds it to the exact recovery candidate; no other leaf may republish it.
- Restore never overwrites production. It must pass in an isolated disposable environment before any recovery decision.
- Restore has no outbound provider, OAuth callback, email, production network, Docker socket, host network, or cloud metadata access. Only a loopback test port is published.
- Restore uses a new random `NEXTAUTH_SECRET`, deletes restored `Session` and `VerificationToken` rows, removes every restored OAuth access/refresh/id/session token, raises each user to one persisted restore invalidation floor without incrementing again on retry, and creates a synthetic test identity only after isolation, initial scrub, replay, and final normalization pass.
- Restore order is exact: roles-only bootstrap -> fixed allowlisted restore prerequisites -> non-superuser `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges` -> ownership/default-ACL finalization -> fresh local PRE emit/live verification -> current root prerequisites/migrations/final ACLs -> fresh JOURNAL_READY bound to that PRE -> safe attachment extraction -> initial idempotent auth scrub -> capability-pair refresh/live re-verification -> canonical journal replay -> invitation/support/attachment cleanup -> final auth normalization -> capability-pair refresh/live re-verification -> signed final journal high-water verification -> synthetic fixture -> Web. No later phase may move before an earlier one, and Web startup consumes the exact final pair/replay/high-water digests.
- `pg_restore` runs as an ephemeral LOGIN role with NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, and NOINHERIT, no privileged role membership, and no `pg_execute_server_program`, `pg_read_server_files`, or `pg_write_server_files`. Before DB mutation, a fixed parser validates `pg_restore --list` plus schema-only SQL, excludes dump-controlled EXTENSION/ACL/OWNER entries, and rejects `COPY ... PROGRAM`, `ALTER SYSTEM`, foreign server/wrapper, subscription, event-trigger, unallowlisted language/extension, or privileged `SET ROLE`. Required extensions are installed only by a root fixed allowlist, never by archive text.
- Leaf 13 exclusively creates the `munjib_journal_owner`/`munjib_journal_exporter` NOLOGIN roles and returns `VerifiedDatabaseRoleCapability { phase: "PRE_JOURNAL" }`; Leaf 2 consumes that capability, provisions its root-only extension prerequisite, creates journal objects through the migrator/schema owner, finalizes ownership/ACLs, initializes the Wave-envelope-bound genesis, and only then enables fixed append/export grants and emits `VerifiedSecurityJournalCapability { phase: "JOURNAL_READY" }`. Leaf 2 exclusively owns the journal tables, genesis, append function, immutable triggers, exact per-kind SQL validation, and minimal first export. Leaf 14 consumes JOURNAL_READY plus the typed journal interface and takes over continuous multi-batch export/checkpoint/replay without creating roles, granting privileges, or adding a mutable outbox flag.
- Journal sequence/checkpoint values are canonical unsigned BIGINT decimal strings in TypeScript/JSON and PostgreSQL `bigint`. JavaScript `number`, Prisma `Int`, auto-incrementing 32-bit sequences, per-entry export timestamps, row updates, compaction, and deletion are forbidden.
- Journal rows and chain state are retained indefinitely outside snapshot 7/4/3 lifecycle. Export progress lives in a separate DB-owned checkpoint; journal entries remain immutable.
- Snapshot manifests record the captured `current.json` image/source/floor/evidence as audit identity and independently record the recovery record/artifact-set/compatibility proof observed at capture. Current and recovery digests, source commits, and evidence generations need not be equal. The recovery generation must independently satisfy the current security floor and a signed `acceptedSnapshotContractSha256` covering the snapshot migration ledger and schema fingerprint. `snapshotImageDigest` is never executable or a recovery selector.
- Every qualified recovery generation has one KMS-signed immutable artifact-set manifest binding the exact application/Web/tools image, pinned PostgreSQL/pgvector image, restore-edge image, every required host-helper OCI bundle, provenance, SBOM, scan, capability-floor, protected-artifact-map, and signature bundle by digest. The complete set is copied to a separately administered immutable offline OCI/object mirror before `recovery.json` promotion. Registry-outage restore imports only those mirrored digest-addressed artifacts and applies the identical trust policy; tags, unknown local cache, snapshot image, missing artifact, or reduced verification fail closed.
- Restore has no default route, provider/email/OAuth credentials, browser telemetry, Sentry, analytics, or external AI access. Every external-provider opt-in is forced false before service access.
- Before synthetic access, restore terminates active invitation attempts/credentials/invitations, support grants, sessions, OAuth accounts/tokens, password/reset/verification material, and reapplies auth-disable/session-version invariants.
- Attachment verification requires DB state `READY`, a safe relative storage key, exact size, and non-empty `contentSha256` matching restored bytes. Unsafe tar paths, links, devices, duplicate paths, and manifest/archive disagreement fail before extraction.
- Replay pending attachment TTL cleanup and the durable Issue 11 deletion queue before sample access checks. No `PENDING`, `DELETE_PENDING`, `DELETED`, or `FAILED` attachment is served as a normal readable file.
- RPO/RTO evidence contains only backup identifier, UTC timestamps, durations, aggregate counts, and pass/fail codes; never include credentials, emails, workspace slugs, document titles/bodies, storage keys, URLs, or raw database errors.
- Keep this plan, the restricted design, incident backup identifiers, actual counts, topology, and production evidence local-only. Implementation branches contain only generic tooling, synthetic fixtures, and public-safe documentation.
- Restore uses four disjoint principals. `munjib-restore-fetch` has exact-version ciphertext object read and network only, with no age identity, DB role, runtime control, KMS signing, list/write/delete, metadata credential, or plaintext path. `munjib-restore-decryptor` has the age private identity and root-adopted ciphertext read descriptors only, with no DB, object credential, network, host log/Unix socket, runtime control, or persistent write. `munjib-restore-loader` has only the fixed non-superuser DB service and root-opened verified plaintext descriptors, with no age identity, object/network/KMS access, runtime control, or host socket. The root coordinator has no DB/object/age/KMS credential, host network, cloud metadata, generic container socket, caller-selected runtime/config/path/environment, checkout bytes, or plaintext logging path; it can request only fixed Leaf 13 broker operations for job create/start/verify/destroy and crash reconciliation.
- No backup or restore principal uses `sudo`, setuid elevation, a host Docker-compatible socket, host network, or a generic container command. Production root helpers, fixed rootless runtime policy, systemd units, broker operations, signer policies, and publisher policies arrive only in the exact attested `backup-restore-v1` host-bundle OCI artifact through the already installed Leaf 13 dispatcher. No privileged process executes mutable checkout bytes.
- Backups run every 12 hours so the 24-hour RPO has an early missed-run alert. Monthly drills always select the oldest retained snapshot.
- Issue 5 owns only fail-closed readiness types/unavailable stubs and has already wired its CLI through the separately protected Leaf 14 version-0 seam; Issues 9 and 11 each own their provider. Issue 14 activates only that seam as the first and only production composite. Destructive purge stays disabled until signed restore evidence and all live provider evidence agree on digest, epoch, and journal checkpoint.

---

## Dependency Interfaces and Assumptions

- Issue 11 produces `AttachmentStatus = "PENDING" | "READY" | "DELETE_PENDING" | "DELETED" | "FAILED"` plus `enqueueExpiredPendingAttachments({ now, limit, rootOperationId }): Promise<{ enqueued: number }>`, exported `markDocumentAttachmentsDeletePending(tx, documentId, rootOperationId): Promise<number>`, and `processAttachmentDeletionQueue({ now, limit, enabled, remove? }): Promise<{ disabled: boolean; deleted: number; retried: number; failed: number }>` in `lib/attachments/deletion.ts`. Leaf 14 supplies one persisted root operation UUID per restore cleanup and never substitutes `env` or an untyped Boolean readiness flag for Issue 5 authorization.
- Backup inventory reads Issue 11 `Attachment` rows as `{ id, documentId, status, storageKey, size, updatedAt }`; each included `READY` file receives a required `contentSha256` in the private snapshot manifest. Non-READY states are inventory-only and never extracted as readable content.
- Issue 13 writes root-owned `/var/lib/munjib/security/current/current.json` and
  `/var/lib/munjib/security/current/recovery.json`. No alternate deployment-record path
  is valid. Recovery selection accepts only the independently current, attested
  `recovery.json.image` digest whose own floor/evidence and signed snapshot-compatibility
  contract satisfy the current security generation. It need not equal the captured
  `current.json` digest, source commit, or evidence generation;
  `snapshotImageDigest` is evidence only.
- Issue 2 exports `SecurityJournalEventKind`, discriminated generic `SecurityJournalPayload<K>`, `SecurityJournalEvent`, `parseSecurityJournalEvent`, canonical serialization/hash helpers, DB-owned `SecurityJournalChainState`, minimal exporter, and exact privilege contracts from `lib/security/journal.ts`. Issue 8 uses `User.sessionVersion: BigInt`; Issues 5/9/11 expose readiness type/stubs, AI-lineage provider, and attachment provider respectively. Issue 14 rebases onto Leaves 2, 5, 6, 7, 8, 9, 10, 11, 12, and 13 before editing capture, replay, restore, or readiness composition.
- The canonical journal kind union is exactly `AUTH_USER_DISABLED`, `AUTH_CREDENTIAL_INVALIDATED`, `AUTH_OAUTH_ACCOUNT_REVOKED`, `AUTH_SESSION_REVOKED`, `AUTH_USER_SESSIONS_REVOKED`, `TRIAL_IDENTITY_QUARANTINED`, `SUPPORT_ACCESS_REVOKED`, `SUPPORT_ACCESS_EXPIRED`, `ORGANIZATION_MEMBERSHIP_REVOKED`, `WORKSPACE_MEMBERSHIP_REVOKED`, `WORKSPACE_ARCHIVED`, `FOLDER_ARCHIVED`, `DOCUMENT_ARCHIVED`, `DOCUMENT_PURGED`, `DOCUMENT_PERMISSION_REDUCED`, `INVITATION_CREDENTIAL_INVALIDATED`, `INVITATION_CONSUMED`, `INVITATION_REVOKED`, `INVITATION_EXPIRED`, `AI_SOURCE_ACCESS_REVOKED`, `AI_HISTORY_REDACTED`, `AI_DERIVED_DATA_PURGED`, `AI_EXTERNAL_PROVIDER_DISABLED`, `ATTACHMENT_QUARANTINED`, `ATTACHMENT_DELETE_REQUESTED`, `ATTACHMENT_DELETED`. Backup imports this union; it never redeclares aliases.
- The off-host provider remains an operator choice only after its integration proves conditional create, immutable provider generation/version identity, server-side or independent exact-read SHA-256 verification, exact-key access without list, and destination-side lock/retention. Generic latest-key reads, mutable overwrite semantics, weak multipart ETags, ambient instance principals, and a caller-configured remote are not admissible.
- The production Caddy template from Issue 12 imports `/etc/caddy/conf.d/munjib-maintenance.caddy`; the Leaf 13 broker's fixed `backup-capture-freeze`, `backup-capture-unfreeze`, and `backup-capture-reconcile` operations are the only production write-freeze authority. No backup principal invokes a generic service manager, container client, host socket, sudo, or shell command.

## File Structure

- Create `docs/runbooks/isolated-recovery-gate.md`: immediate manual snapshot/isolated-restore gate, explicitly separate from Issue 14.
- Create `tests/backup/runbooks.test.ts`: separation, isolation, credential, and recovery-objective documentation contract.
- Create `lib/backup/manifest.ts`: private manifest/public envelope schemas and validation.
- Create `scripts/backup/build-manifest.ts`: aggregate DB/attachment/deploy metadata without printing content.
- Create `tests/backup/manifest.test.ts`: schema, checksum, and sensitive-field rejection tests.
- Create `lib/backup/recovery-artifact-set.ts`, `scripts/backup/mirror-qualified-recovery-artifacts.ts`, `scripts/backup/verify-recovery-artifact-mirror.ts`, and `tests/backup/recovery-artifact-mirror.test.ts`: signed immutable app/PostgreSQL/tool/edge/host-bundle artifact sets and registry-outage recovery.
- Create `deploy/security/capabilities/encrypted-recovery-readiness.json` and `tests/security/encrypted-recovery-readiness-capability.test.ts`: leaf-owned protected-artifact fragment and evidence-code contract.
- Create `deploy/caddy/conf.d/munjib-maintenance.enabled.caddy`: write/auth freeze used only by the fixed capture broker.
- Create `deploy/backup/capture-policy-v1.json`, `deploy/backup/principal-policy-v1.json`, and `deploy/backup/broker-operations-v1.json`: fixed freeze SLO/capacity, disjoint UID/credential, and no-argument Leaf 13 broker contracts.
- Create `scripts/backup/read-capture-epoch.ts`, `scripts/backup/encrypt-capture-stream.ts`, `scripts/backup/adopt-ciphertext.ts`, `scripts/backup/upload-sealed-ciphertext.ts`, `scripts/backup/publish-snapshot-catalog.ts`, and `scripts/backup/reconcile-capture.ts`: reader/encryptor separation, root same-FD adoption, ciphertext-only upload, post-decrypt catalog publication, and crash recovery.
- Create `tests/backup/capture-principals.test.ts`, `tests/backup/capture-capacity.test.ts`, `tests/backup/capture-publication.test.ts`, and `tests/backup/capture-reconcile.test.ts`: UID/cgroup/FD isolation, freeze SLO and state/spool capacity, decrypt-before-sign/catalog ordering, and every crash boundary.
- Verify Leaf 2 journal migration/schema/roles/genesis/minimal exporter unchanged; Leaf 14 creates no second outbox or event table.
- Create `lib/backup/journal-batch.ts`, `scripts/backup/export-security-journal.ts`, and `tests/backup/journal-export.test.ts`: immutable multi-batch export from a separate checkpoint.
- Create `lib/backup/immutable-upload.ts`, `lib/backup/decrypt-verification.ts`, and `lib/backup/snapshot-catalog.ts`: conditional exact-key ciphertext create/checksum, independent actual decrypt receipts, and immutable monotonic publication generations without list/read/delete in the uploader.
- Create `lib/backup/journal-replay.ts` and `tests/backup/journal-replay.test.ts`: canonical parser, chain/checkpoint-tail verification, and exhaustive per-kind deny handlers.
- Create `lib/backup/restore-auth.ts`, `scripts/backup/sanitize-restored-auth.ts`, and `tests/backup/restore-auth.test.ts`: session/OAuth invalidation.
- Create `lib/backup/restore-loader.ts`, `scripts/backup/preflight-restore-archive.ts`, and `tests/backup/restore-loader.test.ts`: ephemeral non-superuser role, TOC/schema-SQL rejection, fixed pg_restore flags, and pg_catalog-first connection policy.
- Create `lib/backup/safe-tar.ts` and `lib/backup/recovery-image.ts`: pre-extraction validation and independent current attested image selection.
- Create `lib/retention/recovery-readiness.ts` and modify only `lib/retention/downstream/leaf14-production-readiness.ts`: Issue 14's first/only signed restore plus live Issue 9/11 composite; Leaf 5 readiness core remains byte-identical.
- Modify `deploy/security/protected-artifact-owners.json` and `tests/security/active-resource-downstream-extension-contract.test.ts`: reserved-owner `0 -> 1` activation and Leaf 5 core boundary.
- Create `deploy/backup/restore-runtime-v1.json` and `deploy/backup/restore-broker-policy-v1.json`: exact no-route rootless OCI topology and fixed Leaf 13 job operations; no host container socket or caller-selected runtime/config/path/environment.
- Create `scripts/backup/reindex-restore-sample.ts`: deterministic no-egress RAG rebuild oracle.
- Create `scripts/backup/run-restore-cleanup.ts`: Issue 11 pending-expiry/deletion-queue drain.
- Create `scripts/backup/create-restore-fixture.ts`: post-isolation synthetic login/document fixture.
- Create `lib/backup/recovery-objectives.ts`, `scripts/backup/verify-restore.ts`, and `tests/backup/recovery-objectives.test.ts`: RPO/RTO/count/file/auth/RAG verification.
- Create `scripts/backup/restore-drill.ts` and `tests/backup/restore-script.test.ts`: fixed-broker complete isolated restore sequence and teardown without a shell/container client.
- Create `scripts/backup/fetch-restore-ciphertext.ts`, `scripts/backup/decrypt-restore-inputs.ts`, and `scripts/backup/load-restored-database.ts`: mutually exclusive exact-key read, age decrypt, and fixed DB-loader principals.
- Create `tests/backup/restore-fetch.test.ts`, `tests/backup/restore-decryptor.test.ts`, `tests/backup/restore-staging.test.ts`, and `tests/backup/restore-broker.test.ts`: producer-death/same-FD handoff, AEAD verification, no plaintext side channel, no ambient principal, and fixed broker-only runtime control.
- Modify `deploy/host-helpers/manifest-v1.json` and `tests/deploy/attested-helper-bootstrap.test.ts`: literal attested `backup-restore-v1` root bundle with only the fixed capture/restore/reconcile/sign/publish broker operations; checkout installers, sudoers, setuid, generic container commands, and caller-selected unit/path/env are forbidden.
- Create `deploy/backup/retention-policy.json`: 7/4/3 retention contract.
- Create hardened reader/encryptor/adopter/uploader/signer/catalog/capture-reconcile and separate fetch/decrypt/loader/coordinator/restore-reconcile units and modify Leaf 2's
  existing one-shot journal-export/capability-refresh units: 12-hour snapshots,
  <=60-second journal export cadence, five-minute capability refresh, early alert, and
  monthly oldest-snapshot drill.
- Create `tests/backup/automation.test.ts`: timer, retention, append-only credential, and staleness checks.
- Create `docs/runbooks/backup-restore.md`: installation, alerting, drill, evidence, and recovery runbook.
- Modify `package.json`, public-safe wiki pages, and `wiki/manifest.json`.

### Task 1: Enforce the Emergency Two-Phase Recovery Gate

**Files:**
- Create: `tests/backup/runbooks.test.ts`
- Create: `docs/runbooks/isolated-recovery-gate.md`

**Interfaces:**
- Phase A immediately consumes a global lock, current writer inventory, maintenance DB
  service, an independently attested emergency broker bundle, separate reader/
  encryptor/uploader/fetcher/decryptor principals, public age recipients, pinned
  PostgreSQL/archive primitives, and a separate isolated host. It has no Leaf 13B
  runtime dependency, uses no host container socket or elevation wrapper, and executes
  no application image. Its purpose-bound signer and publisher run only after the
  isolated decryptor has authenticated the exact uploaded ciphertext.
- Phase B, after Leaf 13B but before Leaf 2 mutation, consumes the exact same signed
  Phase-A snapshot/envelope plus current recovery/floor evidence and Leaf 2
  genesis/replay/auth primitives.
- Produces two restricted phase records bound to one original envelope hash. This gate
  remains separate from Issue 14 automation.

- [ ] **Step 1: Write RED runbook/source-contract tests**

Require explicit Phase A/Phase B boundaries; `flock` on a fixed global lock; edge
freeze followed by current Web stop/pause and every registered
worker stop before epoch; maintenance-DB/datname verification; independent
`EDGE_FROZEN`, `WEB_QUIESCED`, `WORKERS_QUIESCED`, and `DB_READ_ONLY` flags; the exact
same current workload resumed through a fixed broker operation (never a generic
container client, compose/build/pull, socket, or caller-selected service); unfreeze error aggregation;
post-unfreeze DB-write, writer, Caddy, and login oracles before success; guarded work
directory identity/ownership; safe tar preflight before either extraction; Phase A
pinned PostgreSQL-only restore/count/file/auth-table scrub without app-image execution;
Phase B current recovery-image selection, new signing secret, Leaf 2 genesis/replay,
synthetic auth; outbound isolation; disjoint capture-reader/encryptor UIDs; fixed
root-opened bounded pipes; producer cgroup death; same-FD ciphertext seal; freeze
deadline/capacity/circuit-breaker admission; state/spool filesystem separation; and
upload -> exact fetch -> actual decrypt -> signature -> publication ordering.

Reject any `|| true`, swallowed unfreeze error, snapshot-image execution,
generic container/systemd command, host container socket, sudo/setuid, host rebuild/
pull during unfreeze, plaintext socket/log/disk, shared reader/encryptor identity,
sign-before-decrypt, upload-and-immediate-catalog, unsafe tar extraction, full
environment copy, ambient cloud principal, production identity, or credential in argv.

```bash
pnpm exec vitest run tests/backup/runbooks.test.ts --reporter=dot
```

Expected: RED because the corrected manual gate does not exist.

- [ ] **Step 2: Write the exact capture/freeze procedure**

Create `docs/runbooks/isolated-recovery-gate.md` around one independently attested
`wave-half-a-capture-v1` offline host bundle. The bundle is verified from a pinned
public root and installs only fixed no-argument broker operations, unit definitions,
principal policy, writer registry, archive validator, and state reconciler. It has no
checkout installer, sudoers/setuid file, generic container or service command, host
container socket, network-capable root process, or caller-selected path/env. The
operator may start only the literal `munjib-wave-half-capture.service`; the service
itself uses the fixed broker and holds the shared lock FD.

Root-owned policy fixes the database/role identities, writer registry digest, current
edge/workload selectors, attachment root descriptor, public recipient-set digest,
freeze deadline, state reserve, spool quota, and health probes. DB/pass material is
mounted only into `munjib-wave-half-reader`; public recipients only into
`munjib-wave-half-encryptor`; object create/checksum only into
`munjib-wave-half-uploader`; exact object read only into the separate restore-host
fetcher; age private identity only into the outbound-isolated restore-host decryptor.
No single process receives two of those authorities.

Phase A exact-validates configured identifiers and records current Web workload
ID/image/running state only as signed evidence plus the registered writer set/hash. It
does not require `current.json`, `recovery.json`, a capability floor, or a Leaf 2
checkpoint. Freeze order is fixed:

1. validate the already installed current Caddy configuration and require the existing
   signup/Trial containment probes to remain denied; Phase A does not install an Issue
   12 include or any future repository artifact;
2. invoke the broker's fixed stop-exact-current-workload operation, verify the observed
   workload identity/digest equals the pre-freeze selector, and set
   `WEB_QUIESCED=true`; do not remove or recreate it;
   then verify public write probes fail closed at the existing edge before proceeding;
3. no-follow read the attested writer registry, record which exact units are active,
   invoke only the broker's fixed writer-stop operation for that registry digest,
   require each inactive, and verify no registered DB/file writer remains;
4. connect with `PGSERVICE=munjib-maintenance --dbname=postgres`, query `pg_database`
   for the exact configured app DB, set that DB read-only, terminate only configured
   app-role sessions, and verify no non-maintenance writer transaction remains;
5. only then set `EPOCH_UTC`, start the monotonic deadline, and spawn the two producer
   cgroups with root-created anonymous pipes and root-owned ciphertext descriptors.

The root state machine fsyncs `PREPARED`, `EDGE_FROZEN`, `WEB_QUIESCED`,
`WORKERS_QUIESCED`, `DB_READ_ONLY`, `CAPTURE_RUNNING`, `PRODUCERS_DEAD`,
`CIPHERTEXT_SEALED`, `UNFREEZING`, and `UNFROZEN` before their corresponding side
effects. Its state mount has an independently reserved capacity and cannot be filled
by the ciphertext spool. Cleanup and the boot/OnFailure reconciler try every inverse
whose flag is true, record a separate failure bit for DB writable restore, restart only
the previously active exact writers and workload through fixed broker operations, and
perform unchanged-current-Caddy validation, DB-write, writer, workload-image, and
login oracles. It never short-circuits. Only the data-free coordinator emits the
stable `WAVE_HALF_UNFREEZE_MANUAL_INTERVENTION_REQUIRED` code; producer stdout/stderr
is not connected to journald or any host socket. Capture success is returned only when
unfreeze fully succeeds, while off-host backup success remains false until
decrypt-verified publication completes.

The reader uses `pg_dump --format=custom --no-owner --no-privileges` excluding only
`DocumentChunk` row data and writes the canonical database/attachment/manifest frame
only to the anonymous pipe. The encryptor reads only that pipe and streams it through
same-stream SHA-256 and the pinned age recipient set into the root-opened ciphertext
FD. Any bounded intermediate exists only in its private `/run` tmpfs namespace;
neither principal can open the other's credential, a host log socket, or a durable
plaintext path. Attachment enumeration uses `find -P` on one mounted source,
regular files only, same filesystem, safe relative path validation, deterministic
NUL-sort, per-file SHA-256/size, and a no-follow open/fstat recheck. It creates the
archive from the validated list with no recursion. Phase A writes a minimal exact-key
`wave-half-a-v1` manifest binding backup ID, epoch, dump/archive/inventory hashes,
aggregate counts, writer-registry hash, captured container ID hash and image reference
as non-executable evidence only. Its `wave-half-a-envelope-v1` contains only format,
backup ID, epoch, encrypted-payload SHA-256, manifest SHA-256, createdAt, and random
nonce. Both exact-key reject unknown/sensitive fields; it has no Issue 13 fields. Task
2's exhaustive manifest is used later by Issue 14 automation after its dependencies
exist.

The coordinator accepts a local generation only after reader and encryptor exit,
their systemd cgroups are empty, no descendant or writable producer FD remains, all
tmpfs plaintext inodes are absent, and the same root-owned ciphertext FD plus parent
directory fsync and hash match the bounded capture receipt. It then unfreezes and
passes an `O_RDONLY` ciphertext FD to the separate uploader. The uploader conditionally
creates one immutable exact object and verifies checksum; it cannot sign or publish.
The restore-host fetcher exact-fetches that provider generation, root adopts it only
after fetcher death, and the no-network decryptor uses the operational age identity to
perform real AEAD/decrypt plus manifest/hash validation. Only that redacted
verification permits the purpose-bound signer to sign public envelope bytes and the
separate catalog publisher to create the immutable Phase-A publication record. A
crash at any phase resumes from the sealed receipt and exact object generation; an
unsealed or partial object remains unpublished quarantine. No mutable pointer or list
is used.

- [ ] **Step 3: Specify immediate Phase A restore and post-Issue-13 Phase B**

The attested emergency bundle contains the complete bounded source and installed digest
of `wave-half-safe-tar-v1.py`, not a reference to Task 7 or mutable runbook bytes. The
offline verifier checks its literal SHA-256, owner/mode, single-link regular inode, and
fixed broker manifest before the operator can start capture; any existing different
bytes abort.
The stdlib-only validator opens the archive by descriptor, rejects compressed-format
bombs outside the allowed gzip/zstd/none set, and exact-inventories every member before
extraction: absolute/empty/dot/dot-dot/control/non-NFC paths, duplicate/case-fold
collisions, component/path limits, excessive count/declared/expanded bytes, symlink,
hardlink, device, FIFO, socket, GNU sparse map or overlapping extent, PAX path/linkpath/
sparse override, unknown typeflag, and manifest path/type/size/hash disagreement all
fail. It emits only a canonical inventory digest and stable code. Extraction then uses
GNU tar with `--keep-old-files --no-overwrite-dir --no-same-owner
--no-same-permissions` into a newly created empty no-follow root, after the archive hash
is pinned; the archive hash is rechecked after extraction and every resulting regular
file is no-follow walked/hashed against inventory. `tests/backup/runbooks.test.ts`
extracts the embedded validator into a temp file and executes malicious fixtures for
every rejection above. Both outer payload and attachment archive use this exact
installed primitive.

Phase A immediately verifies the signed snapshot, restores with the pinned PostgreSQL
digest, safely extracts/rehashes attachments, compares aggregate counts, and runs fixed
SQL proving auth/session/OAuth/verification tables can be scrubbed in the disposable
copy. It has no Web, app image, current migrations, synthetic login, or Issue 13
dependency. Captured image identity is evidence only. It records
`PHASE_A_RESTORE_OK` only after teardown.

On only the disposable Phase-A database, first inventory `pg_catalog` against a
checked-in exact allowlist of current authentication/session/OAuth/verification/reset/
invitation/support tables and columns. An unknown credential-bearing table blocks the
gate. For each future-named table in the allowlist, the signed result records either
`absent` or `scrubbed_zero`; absence is acceptable because Phase A predates Leaves 2,
7, and 8. Then run this fixed current-schema scrub and verify each present-surface
count is zero; no production DB is targeted:

```sql
BEGIN;
DELETE FROM "Session";
DELETE FROM "VerificationToken";
UPDATE "Account"
SET refresh_token = NULL, access_token = NULL, id_token = NULL, session_state = NULL;
UPDATE "User" SET "passwordHash" = NULL, "emailVerified" = NULL;
COMMIT;
```

A fixed `DO` block guarded only by `to_regclass` also clears/revokes the exact
allowlisted optional `AuthSessionRegistry`, password-reset, invitation credential/
attempt, `WorkspaceInvitation`, `SupportAccessGrant`, and support-derived membership
tables when they already exist in the captured schema. It never builds identifiers
from input. The result file lists stable table codes and `absent|scrubbed_zero` only,
not row values or counts. Phase B and full Leaf 14 rerun the richer versioned reducers
after those schemas exist.

The isolated restore also compares pre-scrub organization/workspace/document/
attachment aggregate counts and every attachment inventory hash from the Phase-A
manifest. It uses the pinned PostgreSQL artifact only through the fixed no-route
rootless runtime broker for `pg_restore`/SQL and the attested safe-tar validator; it
never starts Web or accesses a host container socket.

After Leaf 13B and inside the Leaf 2 candidate gate—but before any Leaf 2 production
mutation—Phase B must reuse the exact same encrypted payload/envelope/signature. It
verifies `recovery.json` and current floor/evidence, uses that exact attested recovery
image for current migrations, provisions the Leaf 2 root prerequisite, initializes
Leaf 2 genesis bound to the original Phase-A envelope SHA-256, and verifies the Leaf 2
minimal export plus an empty/synthetic Leaf-2-only replay on two independent restores.
It runs a Phase-B-local scrub limited to schemas present at that candidate (the Phase A
auth scrub plus deployed Leaf 1/2 fields), then synthetic auth/document/offline-RAG
checks. It must not invoke Task 5 or Task 6, because those full Leaf 14 routines consume
later Leaf 7/8/9/10/11 schemas and reducers that do not yet exist. `PHASE_B_RECOVERY_OK`
opens Leaf 2 mutation only when both signed records name the same original envelope
hash and both restores agree. Both phases have no default route or provider/telemetry
credentials and verify full teardown.

For each disposable restore cluster, Phase B first runs Leaf 13B's roles/flags bootstrap
plus the fixed allowlisted restore prerequisites; it cannot claim PRE_JOURNAL before
application objects exist. A TOC/schema-only preflight rejects privileged archive
objects, then the ephemeral non-superuser loader restores the Phase-A dump with
`--exit-on-error --single-transaction --no-owner --no-privileges` and fixed
`search_path=pg_catalog,public`, runs restore-local
ownership/default-ACL finalization, then emits and live-verifies that cluster's own
PRE_JOURNAL capability. Production role OIDs are never reused because PostgreSQL
roles/OIDs are cluster-global and absent from `pg_dump`. It next applies the Leaf 2
root extension prerequisite, current migration and journal finalization, refreshes
PRE, then invokes Leaf 2's restore-candidate-only genesis initializer bound to Phase A.
That path requires the signed isolation proof, grants no production app/exporter
authority, and does not require or emit the not-yet-created Phase-B gate. Minimal
export/replay runs through the fixed isolated bootstrap authority. Only after two
restores with distinct cluster identifiers, job IDs, isolation nonces, and signed
exact-schema result files produce identical non-sensitive results does the
Leaf 2 candidate run `create-wave-half-b-gate.ts`. That command safe-reads the original
Phase A envelope, both root-owned restore result files, sorts and binds exactly two
distinct lowercase SHA-256 values as `restoreResultSha256s`, current exact source/recovery
evidence, and the new-secret/unusable-auth proofs; it writes the exact
`wave-half-b-gate-v1` schema, sets `createdAt`/`expiresAt` no more than 15 minutes apart,
creates a fresh 256-bit nonce, KMS-signs the canonical bytes through the purpose-bound
Phase-B gate signer broker after both redacted result receipts verify,
and atomically installs root:root mode 0400
`/run/munjib-security/wave-half-b-gate.json`. It prints only
`WAVE_HALF_B_GATE_CREATED`. The initializer consumes that file plus the unchanged
Phase A envelope before expiry; nonce reuse, path/symlink/permission drift, signature
failure, or teardown disagreement invalidates and deletes the Phase B gate.

Tests reject one result, duplicate digests, non-canonical ordering, shared
cluster/job/nonce identity, result substitution, a valid signature over another Phase
A/source/floor, or a teardown-failed result.

- [ ] **Step 4: GREEN, exact wiki delta, gates, and commit**

```bash
pnpm exec vitest run tests/backup/runbooks.test.ts --reporter=dot
if rg -q '\|\| true|docker compose up|snapshotImageDigest.*(docker run|image:)|tar -x' docs/runbooks/isolated-recovery-gate.md; then
  printf 'unsafe isolated recovery runbook contract detected\n' >&2
  exit 1
fi
```

Add to `wiki/CI CD And Monitoring Workflow.md`:

```markdown
The isolated recovery Phase A is an immediate prerequisite with no immutable-delivery dependency.
It locks capture globally, freezes edge,
the exact current Web container, every registered writer, and the application DB
before one epoch; unfreeze failures force manual-intervention status and success waits
for DB/writer/Caddy/login oracles. Restore validates tar input before extraction and
uses only pinned database/archive primitives. After Leaf 13B, Phase B reuses that same
signed snapshot, applies current code with the attested recovery image, and binds Leaf
2 genesis to the original envelope before mutation.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:25:00+09:00 - isolated recovery gate

- Source evidence: guarded isolated-recovery runbook and runbook contract tests.
- Affected pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: immediate Phase A now quiesces and safely restores without Issue 13/app-image execution; Phase B later reuses the same envelope, current attested image, and genesis binding before mutation.
- Verification: runbook tests, nonprinting safety scan, wiki manifest/lint, and staged sync check.
```

Then run the standard staged wiki sequence and commit:

```bash
git add docs/runbooks/isolated-recovery-gate.md tests/backup/runbooks.test.ts 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "docs: enforce isolated recovery gate"
```

Expected: Phase A passes immediately without Issue 13/application-image execution;
Phase B later reuses the exact envelope and binds Leaf 2 genesis before mutation.
Neither phase can succeed while production remains frozen or archive input is unsafe.

### Task 2: Define the Exhaustive Private Snapshot Manifest and Public Envelope

**Files:**
- Create: `lib/backup/manifest.ts`
- Create: `scripts/backup/build-manifest.ts`
- Create: `tests/backup/manifest.test.ts`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: quiesced-epoch dump/archive checksums, safe attachment inventory, Prisma
  migration table, Issue 13 deployment/recovery records, current capability floor and
  release evidence, Leaf 2 journal checkpoint, and registered-writer evidence.
- Produces: exact-key private `SnapshotManifestV2` and a minimal signed public envelope.
  The snapshot image is audit evidence only.

```ts
type SnapshotManifestV2 = Readonly<{
  format: "munjib-snapshot-manifest-v2";
  backupId: string;
  epochUtc: string;
  databaseNameHash: string;
  database: {
    format: "postgres-custom";
    sha256: string;
    sizeBytes: string;
    excludedTableData: ["DocumentChunk"];
  };
  attachments: {
    archiveSha256: string;
    archiveSizeBytes: string;
    entries: readonly {
      id: string;
      documentId: string | null;
      status: "PENDING" | "READY" | "DELETE_PENDING" | "DELETED" | "FAILED";
      relativePath: string | null;
      sizeBytes: string;
      contentSha256: string | null;
    }[];
  };
  aggregateCounts: {
    organizations: string;
    workspaces: string;
    documents: string;
    attachments: string;
  };
  migrations: {
    appliedIds: readonly string[];
    orderedIdsSha256: string;
    schemaFingerprintSha256: string;
  };
  snapshotRuntime: {
    imageDigest: `sha256:${string}`;
    sourceCommit: string;
    capabilityFloorSha256: string;
    releaseEvidenceSha256: string;
  };
  recoveryPointerAtCapture: {
    recordSha256: string;
    imageDigest: `sha256:${string}`;
    capabilityFloorSha256: string;
    releaseEvidenceSha256: string;
    artifactSetSha256: string;
    acceptedSnapshotContractSha256: string;
  };
  registeredWritersSha256: string;
  captureSealPolicySha256: string;
  journal: {
    genesisHash: string;
    chainAtSnapshot: { sequence: string; entryHash: string };
    exportCheckpointAtSnapshot: {
      sequence: string;
      entryHash: string;
      latestExportBatchDigest: string | null;
      containingBatchFirstSequence: string | null;
      containingBatchDigest: string | null;
    };
  };
}>;

type SnapshotEnvelopeV2 = Readonly<{
  format: "munjib-snapshot-envelope-v2";
  backupId: string;
  epochUtc: string;
  encryptedPayloadSha256: string;
  encryptedPayloadSizeBytes: string;
  ciphertextObject: {
    keySha256: string;
    providerGeneration: string;
    sha256: string;
    sizeBytes: string;
  };
  manifestSha256: string;
  snapshotImageDigest: `sha256:${string}`;
  capabilityFloorSha256: string;
  journalSequence: string;
  captureSealSha256: string;
  decryptVerificationSha256: string;
  createdAt: string;
  nonce: string;
}>;
```

Every count/size/sequence is a canonical unsigned decimal string. All hashes are
lowercase SHA-256. IDs have bounded canonical syntax. The private manifest is encrypted;
`containingBatchFirstSequence`/`containingBatchDigest` are both null only at genesis
and otherwise identify the exact immutable first-sequence bundle containing the
checkpoint pair; capture verifies that membership before publication. The public
envelope is constructed and signed only after its exact ciphertext object generation
has passed independent AEAD/decrypt verification. It contains no raw object key,
paths, row values, names, URLs, host, provider,
credential, or attachment identifiers.

- [ ] **Step 1: Write RED manifest exactness and integrity tests**

Create fixtures for a complete manifest and reject: unknown/missing fields; duplicate
migration/attachment IDs or relative paths; noncanonical decimal/hash/time/digest;
unsafe/absolute/dot-dot/control-character paths; symlink metadata; a `READY` entry
without document/path/nonzero size/nonempty `contentSha256`; a non-READY entry with a
path/hash; archive entries missing from the manifest or vice versa; mismatched
database/archive/file hashes; invalid current or recovery evidence; a recovery floor
or signed compatibility contract that cannot accept the current migration-ledger/
schema-fingerprint tuple; journal checkpoint above the signed export high-water; and
any sensitive-key match at any nesting depth. Accept different current/recovery image,
source, and evidence generations when both records verify independently and the
compatibility contract passes. Assert `snapshotImageDigest` is never returned as an
executable restore selection. Reject an envelope without root ciphertext seal,
immutable provider generation, same-byte exact-read checksum, or actual decrypt
verification, and reject signing before those receipts exist.

```bash
pnpm exec vitest run tests/backup/manifest.test.ts --reporter=dot
```

Expected: RED because v2 manifest validation does not exist.

- [ ] **Step 2: Implement exact-key recursive validation**

`lib/backup/manifest.ts` implements `parseSnapshotManifest`, `parseSnapshotEnvelope`,
`assertManifestPayloadIntegrity`, and `assertNoSensitiveKeys`. Use allowlisted exact
keys at every schema path, bounded arrays/strings, canonical decimals converted to
bigint only after validation, stable sort by attachment ID/migration ID, and
constant-time hash comparison. The schema-path allowlist explicitly permits only the
hashed/safe intended keys `databaseNameHash`, `attachments.entries[].relativePath`,
`attachments.entries[].contentSha256`, and `snapshotImageDigest`; their values still
must pass hash/digest/safe-relative-path validation. After exact schema parsing, the
recursive denylist rejects every unexpected key matching password, secret, token,
cookie, email, name, path/query/url/body/content, provider payload, private key,
database URL, or credential. No allowlisted hashed/safe field is copied into the
public envelope except the already declared snapshot digest.

- [ ] **Step 3: Build the manifest only after full quiescence**

`scripts/backup/build-manifest.ts` runs only with `MUNJIB_CAPTURE_STATE=quiesced`. It:

1. exact-validates root-owned `current.json` and independently promoted `recovery.json`;
2. records each record's own digest/source/floor/evidence, requires the recovery image
   to satisfy the current floor, and verifies its signed compatibility contract accepts
   the exact current migration-ledger/schema-fingerprint tuple without requiring image,
   source, or evidence equality;
3. reads applied migration IDs from `_prisma_migrations`, rejects failed/rolled-back
   rows, sorts by actual `finished_at` then ID, and hashes the ordered list;
4. separately reads Leaf 2 live chain state and export checkpoint as decimal strings
   without mutating either;
5. inventories every attachment row and every regular archive source file;
6. hashes every `READY` file and requires exact size; non-READY states are never
   archived as readable bytes;
7. hashes the registered-writer/quiesce evidence;
8. writes the canonical manifest only to the root-opened reader/encryptor pipe and
   prints no manifest field. The data-free coordinator emits only
   `BACKUP_MANIFEST_OK` after the producer cgroups die and root seals ciphertext.

The script never reads a mutable schema label from source and never invents a migration
identifier.

- [ ] **Step 4: Verify GREEN, write the exact wiki delta, gate, and commit**

```bash
pnpm exec vitest run tests/backup/manifest.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Add to `wiki/CI CD And Monitoring Workflow.md`:

```markdown
Each encrypted snapshot has an exhaustive private v2 manifest binding the quiesced
database dump, every attachment state and READY byte hash, applied migrations,
snapshot audit digest, current capability/evidence hashes, registered writers, and
the Leaf 2 journal checkpoint. The snapshot digest is never executed during restore;
the independently current attested recovery image is selected from `recovery.json`.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:15:00+09:00 - recovery manifest

- Source evidence: `lib/backup/manifest.ts`, manifest builder, Issue 13 records, Leaf 2 checkpoint, and manifest integrity tests.
- Affected pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: snapshot evidence now exhaustively binds database, migrations, attachment states/READY hashes, writer quiescence, floor evidence, and journal checkpoint without making the snapshot image executable.
- Verification: focused manifest tests, TypeScript, wiki manifest/lint, and staged sync check.
```

Then:

```bash
git add lib/backup/manifest.ts scripts/backup/build-manifest.ts tests/backup/manifest.test.ts 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat: bind exhaustive snapshot manifest"
```

Expected: the private manifest is exhaustive and the public envelope remains
non-sensitive.

### Task 3: Capture, Seal, Unfreeze, Verify, and Publish One Epoch

**Files:**
- Create: `deploy/caddy/conf.d/munjib-maintenance.enabled.caddy`
- Create: `deploy/backup/writer-registry.json`
- Create: `deploy/backup/capture-policy-v1.json`
- Create: `deploy/backup/principal-policy-v1.json`
- Create: `deploy/backup/broker-operations-v1.json`
- Modify: `deploy/host-helpers/manifest-v1.json`
- Modify: `tests/deploy/attested-helper-bootstrap.test.ts`
- Create: `scripts/backup/read-capture-epoch.ts`
- Create: `scripts/backup/encrypt-capture-stream.ts`
- Create: `scripts/backup/adopt-ciphertext.ts`
- Create: `scripts/backup/upload-sealed-ciphertext.ts`
- Create: `scripts/backup/publish-snapshot-catalog.ts`
- Create: `scripts/backup/reconcile-capture.ts`
- Create: `tests/backup/capture-principals.test.ts`
- Create: `tests/backup/capture-capacity.test.ts`
- Create: `tests/backup/capture-publication.test.ts`
- Create: `tests/backup/capture-reconcile.test.ts`
- Modify: `package.json`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: fixed Leaf 13 no-argument broker operations, global capture lock, exact
  current workload selector, writer registry, maintenance DB service, Task 2 manifest
  builder, pinned public recipients, purpose-separated object/signer/catalog
  principals, and a separate restore-host fetch/decrypt verifier.
- Produces: one root-sealed quiesced ciphertext generation, complete immediate
  unfreeze/health, independently decrypt-verified immutable ciphertext, then a signed
  envelope and monotonic catalog generation. Local capture, off-host object, and
  published recovery-point success are distinct states.

- [ ] **Step 1: Write RED authority, ordering, capacity, crash, and disclosure tests**

The four focused suites inject failure or process death at every boundary and require:

1. state/spool capacity and throughput preflight -> shared lock -> edge freeze -> exact
   workload stop -> registered writers stop -> maintenance DB verify/read-only -> epoch;
2. root-created bounded anonymous pipes and root-owned ciphertext FDs -> reader and
   encryptor under distinct UIDs/cgroups -> both exit -> cgroups empty -> no retained
   writable producer FD -> plaintext absence -> same-FD ciphertext fsync/seal/hash;
3. immediate reverse DB/writer/workload/edge unfreeze and DB-write/writer/Caddy/login
   health, regardless of later object/KMS availability;
4. uploader conditional exact create/checksum -> separate fetch exact immutable
   generation -> fetcher death/root adoption -> no-network decryptor AEAD/decrypt and
   manifest/hash verification -> envelope signer -> catalog publisher -> independent
   handoff.

Reject a shared reader/encryptor UID, pipe or plaintext via a named/Unix socket,
producer output to logs, producer-owned spool path/receipt, adoption by chmod/chown/
rename, live producer or descendant at seal, uploader object read/list/delete or KMS/
age/ambient instance principal, signer ciphertext/DB/object authority, catalog signer
fusion, sign-before-decrypt, catalog-before-sign, missing immutable provider
generation, mutable pointer, host container socket/network, generic container/service
command, sudo/setuid, checkout execution, caller-selected path/env, or success from an
EXIT trap. Test a retained duplicated write FD, disk/state starvation, SLO timeout,
circuit breaker, object/KMS outage, and crash after every state fsync. Every pre-seal
failure unfreezes and quarantines partial ciphertext; every post-seal failure leaves
production healthy and resumes publication idempotently.

```bash
pnpm exec vitest run tests/backup/capture-principals.test.ts tests/backup/capture-capacity.test.ts tests/backup/capture-publication.test.ts tests/backup/capture-reconcile.test.ts --reporter=dot
```

Expected: RED because the separated principals, fixed brokers, sealed handoff,
capacity/SLO policy, and decrypt-verified publication state machine do not exist.

- [ ] **Step 2: Implement fixed broker and principal policy**

`deploy/backup/writer-registry.json` exact-key lists every production DB/file writer by
stable service ID, fixed broker selector, and required capability; no arbitrary
command/path is accepted. `broker-operations-v1.json` extends the already installed
Leaf 13 dispatcher with only these no-argument operations, each reading its request
from a fixed root-owned job slot:

```text
backup-capture-freeze
backup-capture-adopt
backup-capture-unfreeze
backup-capture-reconcile
backup-envelope-sign
backup-catalog-publish
backup-journal-high-water-publish
restore-fetch-adopt
restore-job-create
restore-job-start
restore-job-verify
restore-job-destroy
restore-job-reconcile
```

The broker policy, principal policy, writer registry, maintenance Caddy include,
rootless runtime policy, unit definitions, and fixed binaries are literal members of
the `backup-restore-v1` attested bundle installed only by Leaf 13. No operation accepts
a container/systemd selector, Compose/runtime file, image, path, environment, command,
shell text, or extra argument from its caller. No operation exposes a generic host
container socket. There is no sudoers or setuid member.

`principal-policy-v1.json` pins distinct numeric UIDs, empty supplementary groups,
credential IDs, fixed read/write descriptors, network namespaces, inaccessible host
log/metadata/credential/socket paths, and cgroup policies for reader, encryptor,
uploader, signer, catalog publisher, journal publisher, fetcher, decryptor, loader, and
data-free coordinator. The coordinator can use only the broker operations above and
has no DB/object/age/KMS/network/checkout/container-socket access. The uploader's
network policy permits only the fixed object endpoint and explicitly denies KMS plus
IPv4/IPv6 cloud metadata. The purpose-bound signer can reach only its KMS operation
and cannot access object or ciphertext bytes.

- [ ] **Step 3: Implement the capture state machine**

The coordinator preflights the signed `maxFreezeSeconds`, state-journal reserve,
ciphertext quota, pending-spool ceiling, current DB/attachment byte estimate, and
recent measured throughput with fixed headroom. It never freezes when the circuit is
open or capacity cannot cover the projected generation. State uses atomic
write/fsync/rename plus directory fsync on a mount that the spool quota cannot exhaust.

After the fixed broker proves all writers and DB quiesced, the coordinator records the
DB-authored epoch and starts `CLOCK_MONOTONIC_RAW` deadline enforcement. It creates the
bounded anonymous pipes and root-owned ciphertext inode itself. The reader receives
only pipe write ends and reads the fixed DB/attachment descriptors; the encryptor
receives only pipe read ends, pinned public-recipient descriptors, and ciphertext
write FDs. Neither can reopen the spool path. Both have `StandardOutput=null`,
`StandardError=null`, no host journal/`/dev/log`/D-Bus/socket, and no ambient cloud
identity. A data-free supervisor emits stable results.

Only after the complete DB/attachment frame finishes, reader and encryptor exit,
their cgroups are empty, and no producer write FD survives does the coordinator fsync
and same-FD hash/size the ciphertext, fsync its parent, write the root-owned seal, and
set `CIPHERTEXT_SEALED`. It then immediately invokes fixed reverse-unfreeze and health
operations. Object, KMS, fetch, decrypt, or catalog latency is outside the freeze
window. An incomplete frame, timeout, descendant, capacity error, or failed seal
invalidates the job, unfreezes, and quarantines the partial ciphertext without an
envelope or catalog entry. Repeated deadline/capacity failure opens the circuit.

After verified unfreeze, the uploader gets one read-only sealed FD and conditionally
creates the exact immutable ciphertext object. A separate restore-host fetcher reads
that exact provider generation and exits; root proves its cgroup empty and same-FD
adopts a read-only copy. The isolated decryptor receives only that FD plus the age
identity, authenticates/decrypts, validates outer framing/manifest/dump/archive hashes,
and returns one bounded redacted receipt. Only then may the purpose-bound signer sign
the public envelope and the catalog publisher create a generation chained to the
expected previous digest. An independent registrar advances the recovery handoff by
compare-and-swap. Spool deletion occurs only after that handoff verifies. Crash
reconciliation resumes the first missing immutable phase and never repeats freeze,
signs unverified bytes, or asks storage for a latest object.

- [ ] **Step 4: GREEN, wiki delta, gates, and commit**

```bash
pnpm exec vitest run tests/backup/capture-principals.test.ts tests/backup/capture-capacity.test.ts tests/backup/capture-publication.test.ts tests/backup/capture-reconcile.test.ts tests/backup/manifest.test.ts tests/deploy/attested-helper-bootstrap.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Add to `wiki/CI CD And Monitoring Workflow.md`:

```markdown
A snapshot epoch starts only after one global lock freezes edge, the exact current Web
workload, every registered DB/file writer, and the named application database through
a maintenance connection. A DB/attachment-only reader and a separate public-recipient
encryptor communicate only through root-opened bounded pipes. After both producer
cgroups die, root same-FD seals ciphertext and unfreezes immediately. A ciphertext-only
uploader, independent fetch/decrypt verifier, purpose-bound signer, and separate
catalog publisher then advance the recovery point. No external publication latency
extends the freeze window.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:30:00+09:00 - quiesced snapshot capture

- Source evidence: fixed broker/principal policy, reader/encryptor/adopter/uploader/publisher state machine, exhaustive manifest, and failure-injection tests.
- Affected pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: encrypted snapshots now come from a fully quiesced writer epoch and cannot report success before complete verified unfreeze.
- Verification: shell syntax, capture/manifest tests, TypeScript, wiki manifest/lint, and staged sync check.
```

Then run the standard staged wiki sequence and commit:

```bash
git add deploy/caddy/conf.d/munjib-maintenance.enabled.caddy deploy/backup/writer-registry.json deploy/backup/capture-policy-v1.json deploy/backup/principal-policy-v1.json deploy/backup/broker-operations-v1.json deploy/host-helpers/manifest-v1.json scripts/backup/read-capture-epoch.ts scripts/backup/encrypt-capture-stream.ts scripts/backup/adopt-ciphertext.ts scripts/backup/upload-sealed-ciphertext.ts scripts/backup/publish-snapshot-catalog.ts scripts/backup/reconcile-capture.ts tests/backup/capture-principals.test.ts tests/backup/capture-capacity.test.ts tests/backup/capture-publication.test.ts tests/backup/capture-reconcile.test.ts tests/deploy/attested-helper-bootstrap.test.ts package.json 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat: capture fully quiesced encrypted snapshot"
```

Expected: capture and unfreeze are bounded, fail-closed, principal-separated, and
secret-safe; no signed/catalog-visible recovery point exists before independent
fetch/decrypt verification.

### Task 4: Extend Leaf 2 Into Continuous Immutable Journal Export

**Files:**
- Verify unchanged: Leaf 2 journal migration, roles, append function, immutable triggers, genesis state, canonical parser, and minimal exporter.
- Create: `lib/backup/journal-batch.ts`
- Create: `lib/backup/journal-high-water.ts`
- Create: `lib/backup/immutable-upload.ts`
- Create: `scripts/backup/export-security-journal.ts`
- Create: `scripts/backup/encrypt-security-journal.ts`
- Create: `scripts/backup/publish-security-journal.ts`
- Create: `tests/backup/journal-export.test.ts`
- Create: `tests/backup/journal-publication.test.ts`
- Modify: `package.json`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: Leaf 2 `VerifiedSecurityJournalCapability { phase: "JOURNAL_READY" }`, `SecurityJournalEvent`, `SecurityJournalChainState`, minimal exporter/checkpoint procedure, `parseSecurityJournalEvent`, canonical genesis hash, the exact deny-only kind union, a DB-only journal reader, a separate public-recipient encryptor, ciphertext-only uploader, independent restore fetch/decrypt verifier, purpose-bound envelope signer, and separate high-water publisher. The Leaf 13 PRE_JOURNAL capability alone is insufficient.
- Produces: contiguous immutable ciphertext objects, decrypt-verified signed publication records, monotonic separate checkpoint advancement, and separately published signed high-water generations. Event rows and chain state are never updated or deleted.

The JSON boundary uses canonical unsigned BIGINT decimal strings matching
`^(0|[1-9][0-9]*)$`. Convert to `bigint` only after regex validation and serialize
with `.toString(10)`. JavaScript number conversion is forbidden.

- [ ] **Step 1: Write RED ownership, chain, crash-resume, and payload tests**

Create `tests/backup/journal-export.test.ts` that proves:

- no Leaf 14 migration/model/table duplicates Leaf 2 journal storage;
- no Leaf 14 SQL creates a role, changes ownership/default ACLs, grants application privileges, or uses owner/migrator credentials; verified backup/export access is journal SELECT plus fixed checkpoint procedure EXECUTE only;
- the export path contains no event update/delete/truncate, mutable export marker, or
  32-bit sequence declaration;
- genesis through at least three batches is contiguous by sequence, entry hash,
  previous-batch digest, and checkpoint;
- every advanced batch has an exact-schema signed high-water record chained to the
  previous record; missing/stale/forked/unsigned records, a record published before
  decrypt verification or checkpoint advance, and recovery handoff/key mismatch fail;
- sequence values above `Number.MAX_SAFE_INTEGER` round-trip as decimal strings;
- an empty tail is a successful no-op;
- a gap, duplicate, reordered event, wrong previous hash, wrong event hash, changed
  payload, wrong genesis, unknown field/kind, or noncanonical decimal rejects before
  encryption/upload/checkpoint;
- every event is parsed by Leaf 2's discriminated exact per-kind parser, including
  exact keys/types/length/byte cap and recursive sensitive-key denial;
- Leaf 2 known hash vectors with Unicode, quotes, backslashes, underscore subject
  types, and sequences above `Number.MAX_SAFE_INTEGER` match exactly;
- a crash or complete local-spool/host loss before ciphertext upload, after ciphertext
  creation, after exact fetch, after decrypt verification, after envelope signature,
  after publication-record creation, before/after checkpoint, or before high-water
  handoff resumes the deterministic range without listing;
- a same key with a different exact checksum fails `JOURNAL_REMOTE_CONFLICT`;
- the DB reader and encryptor use different UIDs, root-opened pipes/FDs, producer-death
  and same-FD sealing; plaintext never reaches logs, argv, a named/Unix socket, or disk;
- uploader has no read/list/delete/KMS/age/ambient principal; signer sees only public
  envelope bytes after independent decrypt receipt; high-water publisher cannot read
  DB, ciphertext, or age material;
- checkpoint advances only after the decrypt-verified signed publication record exists
  with its exact checksum; no ciphertext object alone is replay-visible;
- no object-list, latest-key read, overwrite, delete, or snapshot-retention call occurs.

Also add a source-contract assertion that the canonical union contains exactly:

```text
AUTH_USER_DISABLED
AUTH_CREDENTIAL_INVALIDATED
AUTH_OAUTH_ACCOUNT_REVOKED
AUTH_SESSION_REVOKED
AUTH_USER_SESSIONS_REVOKED
TRIAL_IDENTITY_QUARANTINED
SUPPORT_ACCESS_REVOKED
SUPPORT_ACCESS_EXPIRED
ORGANIZATION_MEMBERSHIP_REVOKED
WORKSPACE_MEMBERSHIP_REVOKED
WORKSPACE_ARCHIVED
FOLDER_ARCHIVED
DOCUMENT_ARCHIVED
DOCUMENT_PURGED
DOCUMENT_PERMISSION_REDUCED
INVITATION_CREDENTIAL_INVALIDATED
INVITATION_CONSUMED
INVITATION_REVOKED
INVITATION_EXPIRED
AI_SOURCE_ACCESS_REVOKED
AI_HISTORY_REDACTED
AI_DERIVED_DATA_PURGED
AI_EXTERNAL_PROVIDER_DISABLED
ATTACHMENT_QUARANTINED
ATTACHMENT_DELETE_REQUESTED
ATTACHMENT_DELETED
```

Run:

```bash
pnpm exec vitest run tests/backup/journal-export.test.ts tests/backup/journal-publication.test.ts tests/security/journal.test.ts --reporter=dot
```

Expected: RED because continuous batching and exact-key upload do not exist.

- [ ] **Step 2: Implement exact immutable batch validation**

Create `lib/backup/journal-batch.ts` around the Leaf 2 exports; do not redeclare the
event union or payload schemas:

```ts
import {
  encodeSecurityJournalHashPreimage,
  recomputeSecurityJournalEventHash,
  parseSecurityJournalEvent,
  type SecurityJournalEvent,
} from "@/lib/security/journal";

export type SecurityJournalBatchV1 = Readonly<{
  format: "munjib-security-journal-batch-v1";
  genesisHash: string;
  firstSequence: string;
  lastSequence: string;
  previousEntryHash: string;
  lastEntryHash: string;
  previousBatchDigest: string | null;
  sourceImageDigest: `sha256:${string}`;
  sourceCommit: string;
  createdAt: string;
  nonce: string;
  events: readonly SecurityJournalEvent[];
}>;

export function parseJournalSequence(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("JOURNAL_SEQUENCE_INVALID");
  }
  return BigInt(value);
}
```

`buildSecurityJournalBatch(input)` exact-key validates the batch, parses every event
with `parseSecurityJournalEvent`, requires each sequence to equal the prior sequence
plus `1n`, recomputes every entry only through Leaf 2's imported canonical preimage/
hash helpers and known vectors (never independent `JSON.stringify`), binds the first entry to the
checkpoint's prior entry hash, binds `previousBatchDigest`, and returns canonical
UTF-8 JSON with recursively sorted object keys and one trailing newline. It accepts no
generic `Record<string, unknown>` payload after parsing.

- [ ] **Step 3: Implement the separate checkpoint and high-water algorithm**

`export-security-journal.ts` opens a read-only repeatable-read exporter transaction,
reads the Leaf 2 chain high-water `(lastSequence,lastEntryHash)` and separate export
checkpoint `(lastExportedSequence,lastExportedEntryHash,lastBatchDigest)`, and reads
only the contiguous tail `checkpoint+1 ... min(checkpoint+BATCH_SIZE, highWater)`.
All DB BIGINT values are received as strings.

The exporter uses only Leaf 2's fixed-search-path `SECURITY DEFINER` procedures with
their exact signatures:

```text
begin_security_journal_export_bundle(
  first_sequence_decimal,
  last_sequence_decimal,
  bundle_key,
  bundle_sha256,
  ciphertext_sha256,
  envelope_sha256
)
reset_security_journal_export_pending_after_absence(
  expected_first_sequence_decimal,
  expected_last_sequence_decimal,
  bundle_key,
  expected_bundle_sha256,
  expected_ciphertext_sha256,
  expected_envelope_sha256,
  new_bundle_sha256,
  new_ciphertext_sha256,
  new_envelope_sha256,
  signed_absence_proof_sha256
)
advance_security_journal_export_checkpoint(
  expected_first_sequence_decimal,
  expected_last_sequence_decimal,
  bundle_key,
  bundle_sha256,
  ciphertext_sha256,
  envelope_sha256,
  last_entry_hash,
  batch_digest
)
```

Each procedure locks the singleton checkpoint, exact-validates decimal/key/hash/digest
arguments, compares the full pending tuple, verifies the immutable event at the last
sequence/hash before advance, and updates only the checkpoint row. The exporter role
has event/state/checkpoint SELECT and these three procedure EXECUTEs; it has no table
UPDATE. A concurrent exporter loses the compare-and-swap and retries from the new
checkpoint.

- [ ] **Step 4: Implement deterministic locator keys, atomic bundles, and host-loss resume**

`lib/backup/immutable-upload.ts` exposes only:

```ts
type ExactKeyWriter = {
  createConditional(
    key: string,
    sealedCiphertext: Readonly<{ fd: number; sha256: string; sizeBytes: string }>,
  ): Promise<Readonly<{
    key: string;
    providerGeneration: string;
    sha256: string;
    sizeBytes: string;
  }>>;
  checksumExact(ref: Readonly<{
    key: string;
    providerGeneration: string;
  }>): Promise<string>;
  health(): Promise<"healthy">;
};
```

The ciphertext locator is
`journal/v2/<canonical-first-sequence>.age`; the separately published recovery record
is `journal/v2/<canonical-first-sequence>.bundle`. The DB-only journal reader parses
and frames the batch into a root-opened anonymous pipe. A distinct public-recipient
encryptor reads that pipe and writes only the root-opened ciphertext FD. The root
coordinator requires both producer cgroups empty and no retained writable FD, then
same-FD fsyncs/seals/hashes ciphertext before the uploader sees an `O_RDONLY` FD.

The uploader conditionally creates only the `.age` object and returns its immutable
provider generation/size/SHA-256; it cannot read it back, sign, or publish the bundle.
The restore-host fetcher exact-reads that generation, exits, and root same-FD adopts
it. The no-network decryptor with the age identity performs real AEAD/decrypt, parses
the canonical journal batch, and verifies every event/hash/range. Only its bounded
redacted `JournalDecryptVerificationV1` permits the purpose-bound signer to sign the
public envelope. The envelope carries first/last sequence, last hash, previous-batch
digest, source/floor, exact ciphertext object reference/checksum, decrypt-receipt
digest, nonce, immutable recipient-set version, and signer key ID/version.

After signing, build one small canonical `.bundle` publication record containing only
the exact ciphertext reference, public envelope, detached signature, decrypt-receipt
digest, and previous publication digest. Now call Leaf 2 `begin...` with the final
publication key plus whole-publication/ciphertext/envelope SHA-256 tuple, conditionally
create and exact-check the `.bundle`, then call `advance...` with the same tuple plus
last-entry/batch digests. A ciphertext object without a decrypt-verified signed bundle
is an unpublished orphan and never advances checkpoint or replay.

After host/spool loss, retry exact-checks the immutable ciphertext and publication
object generations from the root state receipt. A different checksum/generation is a
conflict. Healthy exact-key absence produces a purpose-bound signed absence proof;
only then may `reset...after_absence` compare-and-swap the same pending publication
range to a new tuple. No prefix list, latest-key lookup, unsigned absence, or overwrite
is accepted.

The signed snapshot checkpoint includes
`containingBatchFirstSequence` and `containingBatchDigest` for the batch containing
its `(sequence,entryHash)`. Restore exact-fetches
`journal/v2/<containingBatchFirstSequence>.bundle`, verifies its signature/decrypt
receipt, exact-fetches the referenced immutable `.age` generation, independently
decrypts/verifies the entire containing batch, and locates the checkpoint pair. It
discards entries at or below it, then derives each next publication key from
`lastSequence + 1`. For a checkpoint at genesis with no containing bundle, the first
key is `journal/v2/1.bundle`. Not-found is tail only when a
separately signed remote high-water equals the last verified sequence and storage
health passes; no unsigned absence is trusted.

Tests delete spool and the post-snapshot DB checkpoint after every boundary and still
discover/replay only decrypt-verified published bundles. Journal objects use
indefinite object lock and a dedicated prefix/policy excluded from
snapshot 7/4/3 expiration. There is no compaction or delete command in v1.
Tests also rotate both recipient and envelope-signer generations, prove the offline
identity decrypts the oldest retained snapshot and every journal generation, reject
an unknown signer/recipient-set downgrade, and prove a compromised operational key
cannot overwrite an earlier bundle or its signed envelope.

Only after decrypt-verified publication and checkpoint advance, the separate
high-water publisher constructs exact `JournalRemoteHighWaterV1` with only:
`format`, canonical `lastSequence`, `lastEntryHash`, `lastBatchDigest`, exact
`lastBundleKey`, `phaseAEnvelopeSha256`, source digest, capability-floor digest,
recipient-set version, signer key id/version, `previousHighWaterDigest`, DB
`occurredAt`, and random nonce. Its own purpose-bound broker signs the canonical bytes
and creates the immutable
object `journal/v2/high-water/<lastSequence>.json`; never overwrite a `current` key.
Crash after checkpoint but before record publication is repaired idempotently from the
DB checkpoint, decrypt receipt, and exact publication checksum before exporting another
batch. The journal reader, encryptor, uploader, envelope signer, and high-water
publisher are different UIDs and no one of them can both access plaintext and publish
recovery authority.

A separate least-privilege recovery registrar exact-fetches that just-created record,
verifies its KMS signature, and atomically replicates only the signed record plus exact
key to root-owned, dedicated `munjib-recovery` group mode-0440
`/var/lib/munjib/recovery/journal-high-water.json` and an independent recovery control
plane. Only the unprivileged restore service account belongs to that group; backup/Web
users do not. Tests run the same-FD reader as the effective restore UID and prove read
success plus write/chown denial. Restore requires this file as explicit input and verifies the entire immutable
`previousHighWaterDigest` chain back to the snapshot's recorded record; it never asks
the object store which record is latest. A stale but valid record is allowed only
within the 60-second export/5-minute alert budget and never below the snapshot
checkpoint. Tests crash at bundle create, checkpoint advance, high-water create, and
registrar handoff boundaries and prove deterministic recovery without prefix listing.

- [ ] **Step 5: Add CLI, GREEN verification, wiki delta, gates, and commit**

Add:

```json
"backup:export-journal": "tsx scripts/backup/export-security-journal.ts"
```

Run:

```bash
pnpm exec vitest run tests/backup/journal-export.test.ts tests/backup/journal-publication.test.ts tests/security/journal.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
LEGACY_JOURNAL_PATTERN='Security''TombstoneOutbox|security''TombstoneOutbox|recordSecurity''Tombstone|add_security_''tombstone_outbox|journal[^\n]*exported''At'
if rg -q "$LEGACY_JOURNAL_PATTERN" lib/backup/journal-batch.ts scripts/backup/export-security-journal.ts tests/backup/journal-export.test.ts; then
  printf 'legacy journal implementation detected\n' >&2
  exit 1
fi
NONCANONICAL_SEQUENCE_PATTERN='SER''IAL|Number\([^\n]*sequence|sequence[^\n]*Number\('
if rg -q "$NONCANONICAL_SEQUENCE_PATTERN" lib/backup/journal-batch.ts scripts/backup/export-security-journal.ts tests/backup/journal-export.test.ts; then
  printf 'legacy or mutable journal implementation detected\n' >&2
  exit 1
fi
```

Add this exact wiki statement to `wiki/Document Knowledge Model.md`:

```markdown
Security journal rows and DB chain state are Leaf 2-owned immutable, deny-only,
BIGINT-sequenced records retained indefinitely. Leaf 14 exports a contiguous
checkpoint tail through distinct reader/encryptor principals into root-sealed
ciphertext. A ciphertext-only uploader publishes it, an independent fetch/decrypt
principal verifies the exact object, and only then do purpose-bound envelope and
high-water publishers create the signed immutable publication. The separate DB-owned
checkpoint advances only after that publication checksum verifies. Snapshot retention
never expires journal rows or batches.
```

Append this exact `wiki/log.md` entry:

```markdown
## 2026-07-12T00:10:00+09:00 - security journal export

- Source evidence: Leaf 2 journal interfaces, `lib/backup/journal-batch.ts`, separated reader/encryptor/uploader/fetch-decrypt/sign/high-water publication, and journal export tests.
- Affected pages: [[Document Knowledge Model]], [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: continuous recovery export now uses immutable canonical BIGINT journal batches and a separate monotonic checkpoint, with no event mutation or snapshot-retention expiry.
- Verification: journal unit/integration/crash-resume tests, TypeScript, wiki manifest/lint, and staged sync check.
```

Then:

```bash
git add lib/backup/journal-batch.ts lib/backup/journal-high-water.ts lib/backup/immutable-upload.ts scripts/backup/export-security-journal.ts scripts/backup/encrypt-security-journal.ts scripts/backup/publish-security-journal.ts tests/backup/journal-export.test.ts tests/backup/journal-publication.test.ts package.json 'wiki/Document Knowledge Model.md' 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat: extend immutable security journal export"
```

Expected: Leaf 2 storage/roles are unchanged; multi-batch export is contiguous,
crash-resumable, immutable, and indefinitely retained.

### Task 5: Disable Every Restored Real Authentication and External-Access Surface

**Files:**
- Create: `lib/backup/restore-auth.ts`
- Create: `scripts/backup/sanitize-restored-auth.ts`
- Create: `tests/backup/restore-auth.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: a restored database after current migrations and leaf-owned auth,
  invitation, support, OAuth, session, and AI-consent schemas.
- Produces: one serializable scrub transaction after which no restored real user,
  credential, session, invitation, support grant, OAuth identity, or external-provider
  consent can authenticate or authorize. Only a later synthetic fixture may log in.

- [ ] **Step 1: Write RED exhaustive scrub/idempotence tests**

Seed real users covering active/pre-disabled auth, password hashes, BigInt session
versions above safe-number range, Session, VerificationToken/password-reset material,
AuthSessionRegistry, OAuth Account plus every token field, active invitation/
credential/attempt, support grant/support-derived membership, and true external AI
provider opt-ins. Assert scrub:

- preserves an earlier `authDisabledAt`, sets one for every other restored real user,
  nulls password/reset/verification secrets, and raises each BigInt session version to
  one persisted restore floor without Number conversion or a second-run increment;
- deletes Session and VerificationToken rows; preserves already revoked
  AuthSessionRegistry metadata while marking only active registries
  `RESTORE_INVALIDATED` once; deletes invitation attempt/credential and OAuth token
  ability without overwriting an earlier revoke reason/time;
- revokes/terminates every invitation and support grant using restore-only deny reducers,
  removing support-derived membership;
- forces every workspace/user external-provider opt-in false;
- is transactionally all-or-nothing and idempotently deny-only on rerun;
- produces byte-identical auth state and zero new changes on a second initial scrub;
  rejects session-version overflow; and after replay normalizes each user to
  `GREATEST(current, persistedRestoreFloor, replayedMinimumSessionVersion)`;
- leaves Leaf 2 event rows, chain state, and export checkpoint byte-for-byte unchanged;
- leaves document/audit/content rows intact;
- creates no synthetic identity itself and emits no telemetry/provider/network call.

```bash
pnpm exec vitest run tests/backup/restore-auth.test.ts --reporter=dot
```

Expected: RED because the exhaustive scrub helper does not exist.

- [ ] **Step 2: Implement the serializable deny-only scrub**

`sanitizeRestoredAuthentication(prisma, { phase: "initial" | "final" })` runs one
serializable transaction using the database timestamp. Before the first initial scrub,
fixed restore-local SQL creates a disposable singleton `_MunjibRestoreAuthState` with
`sessionVersionFloor bigint`, `replayedMinimumSessionVersion bigint`,
`initialScrubCompletedAt`, and `finalNormalizationCompletedAt`. It atomically sets the
floor once to `MAX(User.sessionVersion) + 1`, rejects BIGINT overflow, and reuses that
same value on every retry. It uses explicit restore-only deny mutations (or leaf-exported
pure restore reducers) that cannot call the production append function and has no
journal-role privilege. It snapshots and rechecks Leaf 2 event/chain/export-checkpoint
hashes around the transaction; any change fails the drill. Recovery audit is separate
signed evidence after teardown. It exact-returns aggregate decimal strings:

```ts
type RestoreAuthScrubResult = Readonly<{
  usersDisabled: string;
  passwordCredentialsInvalidated: string;
  sessionsDeleted: string;
  registriesInvalidated: string;
  verificationSecretsDeleted: string;
  oauthAccountsDisabled: string;
  invitationCredentialsInvalidated: string;
  invitationsTerminated: string;
  supportGrantsTerminated: string;
  externalOptInsDisabled: string;
}>;
```

Initial SQL uses `sessionVersion = GREATEST(sessionVersion, persisted_floor)` and
`authDisabledAt = COALESCE(authDisabledAt, db_now)`. It never casts through number.
Only active registries receive `RESTORE_INVALIDATED`; prior revoked state remains
byte-for-byte unchanged. OAuth access/refresh/ID/session fields are nulled and an
active restored account is marked revoked according to the Leaf 8 model without
overwriting earlier revoke metadata. Invitation attempts/credentials are
deleted and invitations terminally revoked by restore-only reducers. Support grants are revoked and
support-derived memberships removed. External AI consent is false regardless of the
snapshot value. Every real user remains disabled until a separately reviewed recovery
procedure after the drill; the drill never reenables one.

Leaf 8 replay reducers may advance only the singleton's
`replayedMinimumSessionVersion`; they never consume an arbitrary version payload. The
final phase reruns the deny scrub and applies
`GREATEST(current, persisted_floor, replayed_minimum)` before synthetic access. Initial
scrub -> replay -> final normalization is mandatory, and each phase is independently
idempotent.

`scripts/backup/sanitize-restored-auth.ts` prints only
`RESTORE_AUTH_SCRUB_OK` plus bounded aggregate decimal counts. Any error prints
`RESTORE_AUTH_SCRUB_FAILED` without raw DB detail and exits nonzero.

- [ ] **Step 3: Verify GREEN, wiki delta, gates, and commit**

```bash
pnpm exec vitest run tests/backup/restore-auth.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Add to `wiki/Auth And Permissions Workflow.md`:

```markdown
Restored real identities start disabled. Current migrations are followed by an
idempotent deny-only initial scrub using one persisted BigInt invalidation floor,
canonical replay, and a final normalization using the greater replayed minimum.
Existing revoke metadata is preserved; active registries are invalidated once, while
session/password/reset/verification/OAuth ability, invitation/support access, and all
external AI opt-ins are removed. Only a post-normalization synthetic drill identity
may authenticate.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:35:00+09:00 - restored auth scrub

- Source evidence: `lib/backup/restore-auth.ts`, scrub CLI, and exhaustive restored-auth tests.
- Affected pages: [[Auth And Permissions Workflow]], [[log|Wiki Log]].
- Result: restored real identities, sessions, credentials, invitations, support access, OAuth ability, and external-provider consent now fail closed before synthetic access.
- Verification: restored-auth tests, TypeScript, wiki manifest/lint, and staged sync check.
```

Run the standard staged wiki sequence and commit:

```bash
git add lib/backup/restore-auth.ts scripts/backup/sanitize-restored-auth.ts tests/backup/restore-auth.test.ts 'wiki/Auth And Permissions Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat: disable restored authentication surfaces"
```

Expected: only post-scrub synthetic credentials can authenticate.

### Task 6: Verify the Checkpoint Tail and Replay Every Canonical Deny Event

**Files:**
- Create: `lib/backup/journal-replay.ts`
- Create: `scripts/backup/replay-security-journal.ts`
- Create: `tests/backup/journal-replay.test.ts`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: signed snapshot checkpoint, deterministic first-sequence bundle locators,
  current signed remote journal high-water, the fixed root-mounted restore-local
  `/run/munjib-restore/capabilities/journal-capability-pair.json`, Leaf 2 `parseSecurityJournalEvent`,
  event-to-subject mapping, and deny-only handler exports from Leaves 2/5/6/7/8/9/10/11.
- Produces: verified contiguous replay of only entries strictly after the snapshot
  checkpoint, plus a restore-only BIGINT checkpoint advanced in the same transaction
  as each handler. Service cannot start before the final checkpoint equals the signed
  high-water.

- [ ] **Step 1: Write RED chain, checkpoint-tail, subject, and exhaustive-handler tests**

Create tests that reject before any handler transaction: bad batch signature/ciphertext
checksum; wrong genesis; forked/overlapping/gapped/reordered batch; checkpoint sequence
not found with matching entry hash; noncanonical decimal; sequence above safe-number
range coerced to number; bad previous-entry/entry/batch hash; source/floor mismatch;
unknown event/field; per-kind payload key/type/length/byte-cap failure; recursive
sensitive key; subject-type mismatch; mutable replay target; and a missing handler.

Use a snapshot checkpoint in the middle of a batch. Verify the whole containing batch,
discard entries at or below the checkpoint only after its exact sequence/hash matches,
then replay the tail. A crash after a handler transaction must resume at the next
decimal-string sequence without reapplying. A repeated complete run applies zero
events. Empty tail succeeds only when checkpoint equals signed high-water.
Assert Leaf 2 event rows, chain state, and production export checkpoint remain
byte-for-byte unchanged; only business deny state and the restore-only checkpoint may
change.

Before any handler transaction, tests reject a missing/stale/mixed capability pair,
wrong cluster/database/source/image/floor, PRE-parent mismatch, live DB drift, pair
replacement after verification, a replay result produced by another generation, and
a final signed high-water that advances before Web startup. The successful result must
bind the pair generation plus both artifact digests and the signed high-water digest.

Test every canonical event kind and subject mapping:

```text
AUTH_USER_DISABLED -> USER
AUTH_CREDENTIAL_INVALIDATED -> USER
AUTH_OAUTH_ACCOUNT_REVOKED -> OAUTH_ACCOUNT
AUTH_SESSION_REVOKED -> AUTH_SESSION
AUTH_USER_SESSIONS_REVOKED -> USER
TRIAL_IDENTITY_QUARANTINED -> USER
SUPPORT_ACCESS_REVOKED|SUPPORT_ACCESS_EXPIRED -> SUPPORT_GRANT
ORGANIZATION_MEMBERSHIP_REVOKED -> ORGANIZATION_MEMBERSHIP
WORKSPACE_MEMBERSHIP_REVOKED -> WORKSPACE_MEMBERSHIP
WORKSPACE_ARCHIVED -> WORKSPACE
FOLDER_ARCHIVED -> FOLDER
DOCUMENT_ARCHIVED|DOCUMENT_PURGED -> DOCUMENT
DOCUMENT_PERMISSION_REDUCED -> DOCUMENT_PERMISSION
INVITATION_CREDENTIAL_INVALIDATED|INVITATION_CONSUMED|INVITATION_REVOKED|INVITATION_EXPIRED -> INVITATION
AI_SOURCE_ACCESS_REVOKED -> AI_SOURCE_ACCESS
AI_HISTORY_REDACTED -> AI_CHAT_TURN|AI_CHAT_MEMORY
AI_DERIVED_DATA_PURGED -> AI_DERIVED_DATA
AI_EXTERNAL_PROVIDER_DISABLED -> WORKSPACE
ATTACHMENT_QUARANTINED|ATTACHMENT_DELETE_REQUESTED|ATTACHMENT_DELETED -> ATTACHMENT
```

`subjectId` is the immutable replay-target ID of that type, never a parent ID. There is
no alias, generic subject string, or fallback handler.

```bash
pnpm exec vitest run tests/backup/journal-replay.test.ts --reporter=dot
```

Expected: RED because the canonical checkpoint-tail dispatcher does not exist.

- [ ] **Step 2: Implement signed batch-index and tail verification**

`loadVerifiedJournalTail(input)` must:

1. exact-validate the snapshot checkpoint and signed current high-water as canonical
   decimal strings and hashes;
2. if the checkpoint is non-genesis, exact-fetch
   `journal/v1/<containingBatchFirstSequence>.bundle` from the signed snapshot field,
   require its digest to equal `containingBatchDigest`, and locate the checkpoint
   `(sequence,entryHash)` inside it; for genesis start at `journal/v1/1.bundle`; then
   exact-fetch each `journal/v1/<lastSequence+1>.bundle`, never listing a prefix;
3. verify KMS signature and ciphertext checksum before age decryption;
4. parse each batch with `buildSecurityJournalBatch`/Leaf 2 event parser;
   verify Unicode/quote/backslash/large-sequence hashes only through Leaf 2's imported
   canonical encoder/hash helper, never independent field serialization;
5. require one genesis, one linear previous-batch digest chain, no gaps/overlaps/forks,
   and matching source/floor evidence;
6. locate the snapshot `(sequence,entryHash)` inside the verified chain;
7. accept not-found only after storage health and signed remote-high-water equality,
   then return events greater than snapshot checkpoint while preserving that high-water.

Temporary plaintext exists only beneath the guarded verified `/run` tmpfs generation,
is opened `O_NOFOLLOW`, verified by same-FD `fstat`, bounded, mode 0600, and removed on
every path. No batch event or payload is logged and no durable spool contains plaintext.

- [ ] **Step 3: Implement the exhaustive deny-only dispatcher**

`lib/backup/journal-replay.ts` imports the canonical parser and builds a
`satisfies Record<SecurityJournalEventKind, ReplayHandler>` object. Handler ownership:

- Leaf 2 `leaf2JournalReplayReducers`: disabled/quarantined user, support revoke/expiry,
  and organization/workspace membership reduction (exactly six kinds);
- Leaf 5: workspace/folder/document archive and document purge;
- Leaf 6: document permission reduction;
- Leaf 7: invitation credential invalidation/consume/revoke/expire;
- Leaf 8: credential invalidation, OAuth account revoke, one/all session revoke;
- Leaf 9: AI source-access revoke and history redaction;
- Leaf 5: also owns `AI_DERIVED_DATA_PURGED` because its document-purge transaction
  produces that event and deletes `DocumentChunk` rows;
- Leaf 10: external-provider disable;
- Leaf 11: attachment quarantine/delete-request/delete.

Composition imports the eight named `leafNJournalReplayReducers` maps, rejects a
duplicate key before construction, and uses TypeScript `satisfies` plus a runtime sorted
key equality assertion against the canonical 26-kind union. Tests source-scan that each
kind appears in exactly one leaf map and that the backup module defines no handler body
or alias. `AI_SOURCE_ACCESS_REVOKED` additionally requires Leaf 9's canonical
`TURN_SOURCE:<id>|MEMORY_SOURCE:<id>` target parser; the backup dispatcher never guesses
which lineage table an untyped ID belongs to.

Each imported handler is a leaf-exported pure/idempotent
`apply...FromVerifiedJournal(tx, event, replayContext)` reducer. The unforgeable
restore context has no append-function/table privilege. Reducers exact-validate the
payload again, preserve/reduce access, and never append or alter production
chain/export state. Role downgrade replays as reduction/revoke, never role assignment.
Auth/session handlers delete restored live sessions, preserve prior registry revoke
metadata and `authDisabledAt`, invalidate only active registries, and advance only the
restore singleton's replayed minimum. Final normalization applies the greatest current,
persisted-floor, and replayed-minimum value; handlers do not depend on an arbitrary
version payload. AI external-provider disable forces opt-in
false. Invitation handlers terminate credentials/attempts and the invitation. No
handler creates identities, grants roles, unarchives, reenables auth/provider access,
or restores bytes.

For each event, one serializable transaction asserts immutable hashes of production
event/chain/export state, locks the restore-only checkpoint,
requires `nextSequence == checkpoint + 1n`, invokes the exact handler, and advances the
checkpoint to the event sequence/hash, then reasserts production hashes. A handler
failure rolls back both. Checkpoint
schema is `sequence bigint` plus hash; CLI JSON uses decimal string.

- [ ] **Step 4: Implement the fail-closed replay CLI and startup marker**

`scripts/backup/replay-security-journal.ts` accepts no caller-selected capability,
manifest, high-water, reader, checkpoint, or result path. The root orchestrator mounts
the fixed job layout and refreshes
`/run/munjib-restore/capabilities/journal-capability-pair.json` immediately after the
initial scrub. The verifier safe-reads that single regular signed bundle, verifies its
PRE and JOURNAL_READY binding/freshness plus live restore DB facts, and pins its inode
and canonical digest for the replay admission. The CLI uses no directory listing or
environment fallback and writes with `wx`/0600 an exact result:

```ts
type RestoreJournalReplayResultV2 = Readonly<{
  format: "munjib-restore-journal-replay-result-v2";
  capabilityGeneration: string;
  preJournalSha256: string;
  journalReadySha256: string;
  finalSequence: string;
  finalHash: string;
  signedHighWaterSha256: string;
  appliedEventCount: string;
  result: "passed";
}>;
```

Normal output is only `SECURITY_JOURNAL_REPLAY_OK`.

After replay, leaf cleanup, and final auth normalization, root refreshes and
live-verifies the pair again, exact-fetches/re-verifies the final signed high-water,
and creates a root-mounted marker binding current recovery image, new pair generation,
replay result digest, and final sequence/hash. Restore Web startup requires all of
those bytes to agree. Missing/stale/wrong result, mixed pair, or high-water drift yields
`RESTORE_JOURNAL_REPLAY_REQUIRED`.

- [ ] **Step 5: Verify GREEN, write wiki delta, gate, and commit**

```bash
pnpm exec vitest run tests/backup/journal-replay.test.ts tests/backup/journal-export.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
LEGACY_REPLAY_PATTERN='Security''Tombstone|security''Tombstone|TOMB''STONE|journal'' event|Number\([^)]*sequence|minimumSessionVersion'
if rg -q "$LEGACY_REPLAY_PATTERN" lib/backup/journal-replay.ts scripts/backup/replay-security-journal.ts tests/backup/journal-replay.test.ts; then
  printf 'legacy replay contract detected\n' >&2
  exit 1
fi
```

Add to `wiki/CI CD And Monitoring Workflow.md`:

```markdown
Restore verifies the signed journal chain through the snapshot checkpoint, then replays
the contiguous tail to the signed current high-water. Leaf 2 exact payload and
event-to-subject validation run before an exhaustive deny-only handler registry; each
handler and the restore-only BIGINT checkpoint commit atomically. Unknown, missing,
forked, or access-increasing input keeps service closed.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:20:00+09:00 - recovery journal replay

- Source evidence: Leaf 2 parser/subject mapping, `lib/backup/journal-replay.ts`, replay CLI, leaf-owned deny handlers, and exhaustive replay tests.
- Affected pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: restore now verifies a signed contiguous checkpoint tail and dispatches every canonical event through exact deny-only handlers with an atomic BIGINT checkpoint.
- Verification: replay/export tests, TypeScript, wiki manifest/lint, and staged sync check.
```

Then run the standard staged wiki sequence and commit:

```bash
git add lib/backup/journal-replay.ts scripts/backup/replay-security-journal.ts tests/backup/journal-replay.test.ts 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat: replay canonical security journal tail"
```

Expected: replay is exhaustive, idempotent, deny-only, and bound to the signed current
high-water before service access.

### Task 7: Restore the Oldest Snapshot With the Current Recovery Image and Compose Purge Readiness

**Files:**
- Create: `lib/backup/safe-tar.ts`
- Create: `lib/backup/recovery-image.ts`
- Create: `lib/backup/recovery-artifact-set.ts`
- Create: `lib/backup/restore-loader.ts`
- Create: `lib/backup/recovery-objectives.ts`
- Create: `lib/retention/recovery-readiness.ts`
- Modify: `lib/retention/downstream/leaf14-production-readiness.ts`
- Modify: `deploy/security/protected-artifact-owners.json`
- Create: `deploy/security/capabilities/encrypted-recovery-readiness.json`
- Create: `scripts/backup/select-oldest-retained.ts`
- Create: `scripts/backup/verify-safe-tar.ts`
- Create: `scripts/backup/run-restore-cleanup.ts`
- Create: `scripts/backup/create-restore-fixture.ts`
- Create: `scripts/backup/reindex-restore-sample.ts`
- Create: `scripts/backup/verify-restore.ts`
- Create: `scripts/backup/restore-drill.ts`
- Create: `scripts/backup/fetch-restore-ciphertext.ts`
- Create: `scripts/backup/decrypt-restore-inputs.ts`
- Create: `scripts/backup/load-restored-database.ts`
- Create: `scripts/backup/preflight-restore-archive.ts`
- Create: `scripts/backup/mirror-qualified-recovery-artifacts.ts`
- Create: `scripts/backup/verify-recovery-artifact-mirror.ts`
- Create: `deploy/backup/restore-runtime-v1.json`
- Create: `deploy/backup/restore-broker-policy-v1.json`
- Modify: `deploy/host-helpers/manifest-v1.json`
- Create: `tests/backup/safe-tar.test.ts`
- Create: `tests/backup/recovery-image.test.ts`
- Create: `tests/backup/recovery-artifact-mirror.test.ts`
- Create: `tests/backup/restore-loader.test.ts`
- Create: `tests/backup/restore-fetch.test.ts`
- Create: `tests/backup/restore-decryptor.test.ts`
- Create: `tests/backup/restore-staging.test.ts`
- Create: `tests/backup/recovery-objectives.test.ts`
- Create: `tests/backup/restore-script.test.ts`
- Create: `tests/backup/restore-broker.test.ts`
- Modify: `tests/deploy/attested-helper-bootstrap.test.ts`
- Create: `tests/retention/recovery-readiness.test.ts`
- Modify: `tests/security/active-resource-downstream-extension-contract.test.ts`
- Create: `tests/security/encrypted-recovery-readiness-capability.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: signed exact-key retention index, oldest retained encrypted snapshot,
  deterministic journal bundles/signed remote high-water, independent current `recovery.json`, its immutable offline recovery artifact set, current
  required floor/deny/evidence, Leaf 2 parser/handlers, Task 5 scrub, Issue 9 and Issue
  11 live readiness providers, fresh restore-only secrets, and Leaf 5's exact reserved
  version-0 production-readiness seam.
- Produces: signed `munjib-restore-evidence-v2`, measured RPO/RTO, destroyed disposable
  environment, the first/only production purge-readiness composite, and the owner-valid
  slot transition to `encrypted-recovery-readiness@1`. Snapshot image identity is never
  executable; Leaf 5 core remains byte-identical.

- [ ] **Step 1: Write RED selection, isolation, archive, ordering, and readiness tests**

Tests require:

- `select-oldest-retained` exact-validates a KMS-signed retention index fetched by one
  exact key, selects the oldest retained snapshot across 7 daily/4 weekly/3 monthly,
  and never lists a prefix;
- `selectCurrentRecoveryImage` rejects tag-only, snapshot digest selection, wrong
  current source/floor/evidence, denied/expired/unattested image, and accepts only the
  current root-owned `recovery.json.image`;
- registry-outage selection imports the exact KMS-signed offline artifact set and
  requires complete digest-addressed app/Web/tools, PostgreSQL/pgvector, restore-edge,
  host-bundle OCI, provenance, SBOM, scan, floor, and signature artifacts; a missing,
  stale, substituted, tag-only, or differently trusted member fails before restore;
- safe-tar rejects absolute/dot/dot-dot/control paths, duplicates, links, devices,
  FIFOs/sockets, sparse/overlapping entries, excessive file count/expanded bytes, and
  archive/manifest disagreement before extraction;
- the attested restore-runtime policy uses the current recovery image for tools/Web,
  current pinned PostgreSQL, and pinned credential-free restore edge in one no-route
  rootless job namespace. There is no host container socket, host network, registry
  pull, caller-selected runtime/config/path/env, or generic container command. Only a
  loopback TLS test port is exposed by the fixed edge; every workload is non-root,
  read-only, cap-drop, no-new-privileges, and bounded-tmpfs;
- root prepares and same-FD validates the secret inode owner/mode, passes it through a
  fixed broker mount slot, force-recreates Web through a fixed operation after every
  secret/capability-pair generation, and verifies the in-job inode/digest before
  readiness. No declarative runtime-file uid/gid/mode claim is trusted;
- restore-loader tests prove its exact non-superuser flags and forbidden memberships;
  TOC/schema-only preflight rejects COPY PROGRAM/untrusted extension/privileged
  objects, and actual loader/migrator connections have explicit `pg_catalog` first;
- restore order is signed catalog/exact immutable object reference -> fetcher exact
  ciphertext read -> fetcher death/root same-FD adoption -> isolated decryptor AEAD/
  decrypt plus outer framing/hash verification -> decryptor death -> exhaustive
  manifest -> registry-or-offline-mirror current artifact-set verification -> fixed
  broker rootless job -> clean internal DB -> roles-only/fixed restore prerequisites -> non-superuser
  `pg_restore --exit-on-error --single-transaction --no-owner --no-privileges` ->
  ownership/default ACL -> fresh PRE -> current prerequisites/migrations/final ACL ->
  fresh JOURNAL_READY -> safe attachment extraction -> initial idempotent auth scrub ->
  fresh pair verification -> canonical journal replay -> invitation/support/attachment
  cleanup -> final auth normalization -> fresh pair/final signed high-water verification
  -> synthetic fixture -> offline RAG -> forced Web recreate -> auth/RSC/READY hash/
  no-egress checks -> signed evidence -> teardown;
- Task 5/6 failure prevents Web;
- oldest snapshot and a journal checkpoint above safe-number range succeed;
- only `READY` attachment bytes with exact `contentSha256` are readable;
- all old cookies/password/OAuth/invitation/support access fail and only synthetic
  login succeeds;
- recovery evidence binds current digest/floor, snapshot ID/epoch, final journal
  decimal sequence/hash, manifest/payload hashes, RPO/RTO, cleanup/provider results,
  and teardown result without sensitive values;
- Issue 5 remains an unavailable fail-closed type/stub, Issues 9/11 own live providers,
  and Issue 14 alone composes them with verified current restore evidence;
- only the exact Leaf 5-created `leaf14-production-readiness.ts` version-0 baseline may
  transition to version 1 under `encrypted-recovery-readiness`; owner substitution,
  unchanged hash, direct version jump, a Leaf 14 claim on Leaf 5 core, or any diff to
  `lib/retention/purge-readiness.ts` fails;
- digest/epoch/checkpoint/provider changes during purge-readiness evaluation fail the
  race and destructive purge remains disabled.
- two purge batches obtain two authorizations; current deployment/floor/restore/
  checkpoint/high-water/Issue 9/11 drift between or during batches fails before the
  affected batch's first mutation, and no caller can supply environment/digest facts;
- fetcher, decryptor, loader, and data-free root coordinator have distinct credentials,
  UIDs/cgroups, no shared groups, and no privilege elevation. The fetcher has no age/
  plaintext/DB authority; decryptor has no object/DB/runtime/network authority; loader
  has no object/age/runtime/network authority; coordinator has no object/age/DB/KMS/
  host-network/container-socket authority. Arbitrary runtime file, image, path,
  environment, shell, subcommand, and extra argument are rejected; crash cleanup uses
  only the fixed Leaf 13 broker operations.

```bash
pnpm exec vitest run tests/backup/safe-tar.test.ts tests/backup/recovery-image.test.ts tests/backup/recovery-artifact-mirror.test.ts tests/backup/restore-fetch.test.ts tests/backup/restore-decryptor.test.ts tests/backup/restore-loader.test.ts tests/backup/restore-staging.test.ts tests/backup/recovery-objectives.test.ts tests/backup/restore-script.test.ts tests/backup/restore-broker.test.ts tests/retention/recovery-readiness.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/encrypted-recovery-readiness-capability.test.ts --reporter=dot
```

Expected: RED because current-image restore/composite do not exist.

- [ ] **Step 2: Implement safe archive and current recovery selection**

Add `tar-stream` as a direct production dependency with the lockfile version frozen.
`inspectSafeTar({ archive, allowlist, maxEntries, maxExpandedBytes })` invokes that
pinned streaming parser without extraction, exact-validates every header/PAX field,
entry/type/path/declared size,
and returns a canonical inventory hash. `extractSafeTar` requires an empty root-owned
mode-0700 destination, opens archive/destination no-follow, uses no-overwrite, then
walks and hashes extracted regular files to require exact inventory equality. The
outer payload has an exact filename allowlist; attachments must exactly match Task 2
READY paths/sizes/hashes.

`selectCurrentRecoveryImage` exact-key reads root-owned
`/var/lib/munjib/security/current/recovery.json`, current
generation floor/evidence/deny records, verifies the two OCI attestations and source
SHA/ref/signer workflow/digest/hosted runner, requires unexpired high/critical scan and
floor satisfaction, verifies `acceptedSnapshotContractSha256` covers the exact
snapshot migration-ledger/schema-fingerprint tuple, and returns only its fully
qualified recovery digest. The current and recovery image/source/evidence values may
differ; each record verifies independently. Manifest `snapshotImageDigest` is compared
for audit provenance and is never passed to a runtime selector or broker operation.

`buildQualifiedRecoveryArtifactSet()` exact-binds that app/Web/tools digest, the
pinned PostgreSQL/pgvector and restore-edge digests, every required attested
`backup-restore`/database/journal/edge host-bundle OCI digest, and canonical provenance,
SBOM, scan, floor, protected-artifact, and signature bundle hashes. Promotion copies
the complete signed set to a separately administered immutable offline OCI/object
mirror and verifies it by exact key before `recovery.json` can advance. During a
registry outage `selectCurrentRecoveryImage` imports only the matching OCI layouts,
recomputes every digest, and applies the identical signer/source/workflow/scan/floor
policy. Qualified generations remain retained while referenced by a recovery pointer
or retained drill; neither backup nor restore credentials can delete them.

- [ ] **Step 3: Build the isolated fixed-broker restore runtime**

`deploy/backup/restore-runtime-v1.json` exact-binds the current recovery tools/Web
digest, pinned PostgreSQL/pgvector digest, credential-free edge digest, fixed commands,
numeric UIDs, read-only roots, cap-drop, no-new-privileges, bounded tmpfs, disposable
DB/attachment volumes, one no-route rootless network namespace, and the sole loopback
TLS port. It is an attested host-bundle member, not caller input. The Leaf 13 broker
accepts only fixed `restore-job-create/start/verify/destroy/reconcile` operations for a
root-owned job receipt. It cannot pull/build, use host network, attach a host container
socket, execute a generic runtime command, or accept a runtime file, image, path,
environment, unit, command, or extra argument. The test client trusts exactly the
temporary loopback CA; insecure TLS bypass is forbidden.

`munjib-restore-fetch` exact-fetches only catalog-bound ciphertext object versions and
has no age identity or plaintext path. After it exits and its cgroup is empty, the
coordinator same-FD adopts a root-owned read-only ciphertext copy.
`munjib-restore-decryptor` receives only those descriptors plus its systemd age
identity inside `PrivateNetwork=true`, with no DB/runtime/object/KMS credential, host
log/Unix socket, stdout/stderr, or persistent write. It authenticates and decrypts into
root-opened descriptors backed only by the job tmpfs, emits one bounded redacted
receipt, exits, and loses the credential. Only then does `munjib-restore-loader`
receive the verified dump/archive descriptors plus its fixed non-superuser DB service;
it has no age/object/network/runtime authority. The root coordinator has none of those
credentials and controls lifecycle only through the fixed broker.

The coordinator creates a guarded root-owned secret generation on job tmpfs, writes a
canonical base64url value decoding to at least 32 bytes, sets the exact workload
UID/GID and mode 0400, and passes its already-open descriptor through the fixed secret
slot. Web receives `NEXTAUTH_SECRET_FILE`, canonical loopback HTTPS URL, secure-cookie
mode, staging deployment mode, and disabled development login. It receives no direct
secret, Google/provider/email/Sentry/browser-telemetry variable, or production env.
Every secret or capability-pair generation forces a fixed broker recreation and live
inode/digest verification before readiness. Teardown deletes secret, CA, key, DB,
attachment, plaintext, and runtime generations and the reconcile operation proves no
job object remains.

The bootstrap connection creates the empty database, the ephemeral
`munjib_restore_loader` role, and only the fixed repository allowlisted restore
prerequisites, then disconnects. The loader is LOGIN only for the bounded job,
NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS/NOINHERIT, and has no
server-file/program or privileged-role membership. `preflight-restore-archive.ts`
validates `pg_restore --list` and schema-only output before mutation, produces a fixed
use-list that excludes EXTENSION/ACL/OWNER entries, and rejects COPY PROGRAM, ALTER
SYSTEM, FDW/server, subscription, event trigger, unallowlisted language/extension, or
privileged SET ROLE. Restore uses exactly
`--exit-on-error --single-transaction --no-owner --no-privileges`, fixed
`PGOPTIONS=-c search_path=pg_catalog,public`, and verifies the live search path before
the first archive statement. Finalization disables/drops the ephemeral login after
ownership transfer. Privilege or preflight failure destroys the database.

`reindex-restore-sample.ts` injects the repository's deterministic restore-only local
embedder and never calls a network/provider. `run-restore-cleanup.ts` consumes a
restore-only readiness object produced from verified journal/snapshot evidence and
the actual Issue 11 handler; it does not set production purge booleans.

- [ ] **Step 4: Implement the ordered restore drill**

`scripts/backup/restore-drill.ts` is an unprivileged data-free coordinator. It accepts
no path, runtime, image, environment, command, or credential and never opens a host
container socket or network. It verifies root-owned job receipts and requests only the
fixed Leaf 13 broker operations. A root-owned fsynced job state records fetch,
fetcher-death/adoption, decrypt, decryptor-death, loader, runtime, verification,
teardown, and evidence phases. Boot/OnFailure reconciliation destroys only exact
receipt-bound job objects and prevents a passed result unless none remain.

The fixed order is signed catalog and exact immutable object refs -> fetcher exact
ciphertext read -> fetcher exit/cgroup-empty -> root same-FD adoption -> isolated
decryptor AEAD/decrypt plus outer framing/hash verification -> decryptor exit ->
exhaustive manifest -> independently current-compatible recovery artifact set from
registry or offline mirror -> fixed no-route rootless job -> clean internal DB ->
roles-only plus fixed restore prerequisites -> TOC/schema preflight -> exact
non-superuser pg_restore flags -> finalizes
ownership/default ACLs; emits/live-verifies a fresh local PRE; applies current root
prerequisites/migrations/final ACLs with fixed pg_catalog-first search paths; emits a
fresh JOURNAL_READY bound to that PRE; restores safe attachment bytes; performs Task 5
initial scrub; refreshes/live-verifies the fixed capability pair; performs Task 6
replay; runs leaf-owned invitation/support/attachment cleanup; performs Task 5 final
normalization; refreshes/live-verifies the pair and final signed high-water; forces
external opt-ins false; creates a synthetic invalid.example fixture/password file;
performs offline RAG rebuild; force-recreates Web with the exact current secret and
pair bind inodes through the fixed broker; and verifies old-auth denial,
synthetic auth/RSC, counts, migrations, every READY size/hash, non-READY unreadability,
and failed metadata/public/provider egress. Readiness loops use at most 30 two-second
waits.

After all checks it writes an unsigned redacted evidence candidate, requests complete
fixed-broker teardown, verifies no runtime/plaintext/secret/job object remains, and
only then sends the bounded public evidence bytes to the separate purpose-bound
evidence signer. No plaintext principal can reach that broker. Normal output contains
only stable codes and bounded decimal aggregates.

Fetcher handoff mirrors capture adoption: root creates the inaccessible destination,
passes only a write FD, waits for fetcher exit and an empty cgroup, then same-FD
fsyncs/hashes and creates a root-owned read-only copy. Permission changes or moving a
fetcher-owned tree do not count as adoption. Decryptor and loader receive only
pre-opened descriptors, have no host log socket or stdout/stderr, and cannot create a
named/plaintext Unix socket. Their supervisor exact-parses one bounded deterministic
receipt with no free-form data. No principal has both ciphertext object read and an age
identity, or both plaintext and external/runtime publication authority.

- [ ] **Step 5: Implement RPO/RTO and the first/only purge composite**

`verifyRecoveryObjectives` uses signed epoch/incident/start/completion timestamps and
requires `RPO <= 86400` and `RTO <= 14400` seconds. No application clock authors the
snapshot epoch.

`buildProductionPurgeReadiness(input)` lives only in
`lib/retention/recovery-readiness.ts` and implements Issue 5's sole
`authorizeBatch(tx, candidate)` method. Replace only the reserved
`lib/retention/downstream/leaf14-production-readiness.ts` baseline so its frozen
`productionPurgeReadiness` export is the composite configured with the fixed trusted
readers/providers below. Do not modify `lib/retention/purge-readiness.ts` or the Leaf 5
CLI that already imports the slot. The purge caller cannot pass environment, deployment
digest, floor, evidence, checkpoint, or leaf results. For every locked SERIALIZABLE
batch, immediately before its first mutation, it reads canonical bytes for:

1. current deployment digest/floor/evidence;
2. signed latest restore evidence for the oldest retained snapshot;
3. final replay checkpoint/high-water;
4. Issue 9 live AI-lineage provider result;
5. Issue 11 live attachment-lifecycle/deletion provider result.

The exact leaf set is `ai-lineage`/Issue 9 and `attachments`/Issue 11. After both leaf
checks it re-reads every source in the same transaction and byte-compares deployment,
floor, deployment evidence, signed oldest-restore evidence, journal checkpoint/high-
water, evaluation epoch, and leaf evidence. It canonical-hashes root operation,
workspace, sorted document IDs, and count, and returns a v2 authorization with DB time
and maximum five-minute life. Any drift, stale cached evidence, duplicate/missing leaf,
candidate substitution, noncanonical BIGINT decimal, or a second batch that skips its
own evaluation fails before mutation. There is no environment boolean, default-ready
provider, prepared authorization, or duplicate production composer. Destructive purge
remains separately operator-approved even when the composite passes and the shared
security-state lock remains held for the root operation.

In the same signed candidate, transition only the existing owner-map entry for
`lib/retention/downstream/leaf14-production-readiness.ts` from its exact
`active-resource-boundaries`-created version-0 baseline to version 1/`ACTIVE`, retaining
owner `encrypted-recovery-readiness` and recording the new exact hash. The capability
fragment claims the slot and `lib/retention/recovery-readiness.ts`, but no Leaf 5 core
path. Capability and downstream extension tests pin the baseline, transition, and
byte-identical Leaf 5 core.

- [ ] **Step 6: Verify GREEN, exact wiki delta, gates, and commit**

```bash
pnpm exec vitest run tests/backup/safe-tar.test.ts tests/backup/recovery-image.test.ts tests/backup/recovery-artifact-mirror.test.ts tests/backup/restore-fetch.test.ts tests/backup/restore-decryptor.test.ts tests/backup/restore-loader.test.ts tests/backup/restore-staging.test.ts tests/backup/recovery-objectives.test.ts tests/backup/restore-script.test.ts tests/backup/restore-broker.test.ts tests/retention/recovery-readiness.test.ts tests/backup/restore-auth.test.ts tests/backup/journal-replay.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/encrypted-recovery-readiness-capability.test.ts tests/deploy/attested-helper-bootstrap.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Add to `wiki/CI CD And Monitoring Workflow.md`:

```markdown
Monthly recovery drills select the oldest retained snapshot by signed exact-key index,
validate archives before extraction, and restore with the independently current
attested recovery image that satisfies today's floor. The no-egress drill applies
current migrations, disables all real auth/invitations/support/provider opt-ins,
replays the canonical journal tail, verifies READY bytes and offline RAG, measures
RPO/RTO, and proves teardown. Issue 14 is the only production purge-readiness composer
and requires matching signed restore plus live Issue 9/11 evidence.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:40:00+09:00 - isolated current-image restore

- Source evidence: safe-tar/current-image selection, disjoint fetch/decrypt/loader principals, fixed no-route broker runtime, auth/journal handlers, recovery objectives, Issue 9/11 readiness composition, and restore/race tests.
- Affected pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: the oldest snapshot now drills under zero egress with the current attested image, exhaustive deny replay/READY integrity, measured objectives, verified teardown, and first/only production purge composition.
- Verification: fixed broker/runtime policy, focused restore/readiness tests, TypeScript, wiki manifest/lint, and staged sync check.
```

Run the standard staged wiki sequence and commit:

```bash
git add deploy/backup/restore-runtime-v1.json deploy/backup/restore-broker-policy-v1.json deploy/backup/broker-operations-v1.json deploy/backup/principal-policy-v1.json deploy/host-helpers/manifest-v1.json package.json pnpm-lock.yaml lib/backup/safe-tar.ts lib/backup/recovery-image.ts lib/backup/recovery-artifact-set.ts lib/backup/restore-loader.ts lib/backup/recovery-objectives.ts lib/retention/recovery-readiness.ts lib/retention/downstream/leaf14-production-readiness.ts deploy/security/protected-artifact-owners.json deploy/security/capabilities/encrypted-recovery-readiness.json scripts/backup/select-oldest-retained.ts scripts/backup/verify-safe-tar.ts scripts/backup/fetch-restore-ciphertext.ts scripts/backup/decrypt-restore-inputs.ts scripts/backup/load-restored-database.ts scripts/backup/preflight-restore-archive.ts scripts/backup/mirror-qualified-recovery-artifacts.ts scripts/backup/verify-recovery-artifact-mirror.ts scripts/backup/run-restore-cleanup.ts scripts/backup/create-restore-fixture.ts scripts/backup/reindex-restore-sample.ts scripts/backup/verify-restore.ts scripts/backup/restore-drill.ts tests/backup tests/deploy/attested-helper-bootstrap.test.ts tests/retention/recovery-readiness.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/encrypted-recovery-readiness-capability.test.ts 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat: drill current-image isolated recovery"
```

Expected: oldest-snapshot restore meets RPO/RTO, uses current attested code, leaves no
egress/artifacts, and cannot enable production purge without live matching evidence.

### Task 8: Automate 12-Hour Snapshots, Continuous Journal Export, and Separate-Host Drills

**Files:**
- Create: `deploy/backup/retention-policy.json`
- Create: `deploy/systemd/munjib-backup.service`
- Create: `deploy/systemd/munjib-backup.timer`
- Create: `deploy/systemd/munjib-capture-reader.service`
- Create: `deploy/systemd/munjib-capture-encryptor.service`
- Create: `deploy/systemd/munjib-backup-uploader.service`
- Create: `deploy/systemd/munjib-envelope-signer.service`
- Create: `deploy/systemd/munjib-snapshot-catalog-publisher.service`
- Create: `deploy/systemd/munjib-capture-reconcile.service`
- Modify: `deploy/systemd/munjib-journal-export.service`
- Modify: `deploy/systemd/munjib-journal-export.timer`
- Modify: `deploy/systemd/munjib-security-capability-refresh.service`
- Modify: `deploy/systemd/munjib-security-capability-refresh.timer`
- Create: `deploy/systemd/munjib-backup-staleness.service`
- Create: `deploy/systemd/munjib-backup-staleness.timer`
- Create: `deploy/systemd/munjib-restore-drill.service`
- Create: `deploy/systemd/munjib-restore-drill.timer`
- Create: `deploy/systemd/munjib-restore-fetch.service`
- Create: `deploy/systemd/munjib-restore-decryptor.service`
- Create: `deploy/systemd/munjib-restore-loader.service`
- Create: `deploy/systemd/munjib-restore-reconcile.service`
- Modify: `deploy/host-helpers/manifest-v1.json`
- Create: `tests/backup/automation.test.ts`
- Modify: `tests/deploy/attested-helper-bootstrap.test.ts`
- Create: `docs/runbooks/backup-restore.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: fixed Leaf 13 broker policy; separate capture-reader, encryptor, uploader,
  signer, catalog/high-water publisher, restore-fetch, decryptor, and loader
  credentials; exporter-only DB role; and independent recovery handoffs. No principal
  combines plaintext read, ciphertext publication, decryption, signing, catalog,
  high-water, DB loading, or runtime authority.
- Produces: snapshots every 12 hours, one-shot journal export with at most
  60-second cadence and a five-minute signed-high-water lag page, five-minute signed
  capability-pair refresh, warning at 18
  hours, hard RPO breach at 24 hours, 7/4/3 snapshot retention, indefinite journal
  retention, and monthly oldest-retained restore on a separate host.

- [ ] **Step 1: Write RED unit/permission/schedule tests**

Assert exact JSON retention `{daily:7,weekly:4,monthly:3}` applies only to snapshots;
journal policy is `indefinite` with no delete/expire/compact. Require backup calendar
`*-*-* 00,12:05:00`, a one-shot exporter timer with mandatory <=60-second cadence,
root capability-pair refresh every five minutes, and lag page above five minutes,
staleness hourly with warning 18h/breach 24h, and
monthly restore selecting oldest retained. Every listed principal must have a distinct
UID and credential set, `SupplementaryGroups=` empty, no host container group/socket,
no full `/etc/munjib/env`, no
shell, narrow read/write paths, private tmp, protect system/home/kernel, no-new-
privileges, and explicit systemd credentials. Restore unit must be marked
`ConditionPathExists=/etc/munjib/restore-host.marker`.
The fetcher's primary group supplies read-only access only to the signed catalog/
high-water handoff; decryptor alone gets the age identity; loader alone gets the DB
credential. Tests prove cross-read, write, chown, host-container, metadata, KMS, log
socket, and unrelated recovery-file denial.

Credential tests reject list/read/overwrite/delete for uploader and list/write/delete
for restore fetcher; both support only their exact immutable-object operation. Uploader
cannot reach KMS/metadata; signer/publishers cannot access ciphertext, DB, age, or an
ambient cloud principal. Unit source contains no prefix listing or latest-key lookup.
Key-lifecycle tests require the signed recipient-set and signer versions, retain all
pinned historical public verification roots, reject unknown/downgraded versions, and
prove the offline recovery identity decrypts the oldest snapshot plus every retained
journal generation before an operational recipient can be retired.
Require the monthly drill to pass with the primary registry unavailable, importing
the complete immutable qualified recovery artifact set from the offline mirror. Unit
installation tests require attested `backup-restore-v1` bundle bytes, shared lock use,
`systemd-analyze verify`, daemon-reload, initial capability-pair refresh, and atomic
rollback to the prior attested unit generation on activation failure.

```bash
pnpm exec vitest run tests/backup/automation.test.ts --reporter=dot
```

Expected: RED because units/policy/runbook do not exist.

- [ ] **Step 2: Create exact policies and hardened units**

`retention-policy.json` is:

```json
{"format":"munjib-backup-retention-v2","snapshots":{"daily":7,"weekly":4,"monthly":3},"securityJournal":"indefinite","rpoSeconds":86400,"rtoSeconds":14400,"snapshotIntervalSeconds":43200,"warningAfterSeconds":64800}
```

Snapshot timer uses:

```ini
[Timer]
OnCalendar=*-*-* 00,12:05:00
Persistent=true
RandomizedDelaySec=10m
Unit=munjib-backup.service
```

Journal export is a hardened `Type=oneshot` service triggered at least every 60 seconds.
It uses one `LoadCredential=journal_pair:/var/lib/munjib/security/capabilities/journal/current.json`
for the atomic signed PRE/JOURNAL_READY regular bundle plus a distinct exporter DB
credential, verifies the pair/live DB, exports one bounded batch, and exits. Two
independent capability credentials, a `current` symlink, or mixed generations are
forbidden.
There is no LISTEN-only or persistent process. A root-only capability-refresh oneshot
runs every five minutes, writes/verifies an atomic pair generation, and is ordered
before export. Expired/missing/mixed evidence fails export and pages without blocking
journal appends. Staleness uses `OnCalendar=hourly`; the
separate restore host uses `OnCalendar=monthly`. Exact timers include:

```ini
# munjib-journal-export.timer
[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=1s
Unit=munjib-journal-export.service

# munjib-security-capability-refresh.timer
[Timer]
OnBootSec=15s
OnUnitActiveSec=5m
AccuracySec=5s
Unit=munjib-security-capability-refresh.service
```

Every unprivileged service has
`User=`/`Group=` distinct, `SupplementaryGroups=`, `NoNewPrivileges=true`,
`PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`,
`PrivateDevices=true`, `ProtectKernelTunables=true`, `ProtectKernelModules=true`,
`ProtectControlGroups=true`, `RestrictSUIDSGID=true`, `LockPersonality=true`, a tight
`SystemCallFilter`, exact descriptors, and only required paths. Plaintext-bearing
reader/decryptor/loader units also have `PrivateNetwork=true` except the reader's exact
bind-mounted PostgreSQL Unix socket, `StandardOutput=null`, `StandardError=null`, and
host journal/`/dev/log`/D-Bus/runtime/metadata sockets inaccessible. The capability
refresh coordinator is the sole data-free root unit and can request only fixed Leaf 13
broker operations; it has no object-store, container socket, shell, caller-selected
DB/KMS/path, or ambient cloud authority.

Credentials are never aggregated: reader gets DB/attachment read only; encryptor gets
public recipients and pipe/ciphertext FDs only; uploader gets one ciphertext read FD
and conditional create/checksum only; signer gets public envelope bytes and a verified
decrypt receipt only; catalog/high-water publishers get signed public records and
expected previous digests only; fetcher gets exact-version read only; decryptor gets
age identity only; loader gets fixed DB service only. Coordinators get none of these.

All fixed binaries, broker/principal/runtime policies, and units are members of the
attested `backup-restore-v1` host bundle. The Leaf 13 installer stages and hashes the
entire generation, validates units and broker operation tables, runs unit verification,
installs atomically, performs daemon-reload, refreshes/verifies capability pairs, and
then enables timers. There is no sudoer, setuid file, mutable checkout executable,
generic container command, or host container socket. Failure restores the previous
complete attested generation and leaves affected services stopped.

- [ ] **Step 3: Implement status, alert, and retention behavior**

Status separates `LOCAL_CIPHERTEXT_SEALED`, `PRODUCTION_UNFROZEN`,
`REMOTE_CIPHERTEXT_VERIFIED`, and `CATALOG_HANDED_OFF`; only the last state counts for
RPO. It contains only epoch, public digests/checkpoints, monotonic phase, and stable
result. Staleness warns at 18h and fails/pages at 24h. Freeze SLO/circuit, capacity,
producer-death, unfreeze, decrypt, KMS, exact-key conflict, journal lag, catalog CAS,
or restore teardown failures page with stable codes only.

A privileged destination lifecycle policy enforces 7/4/3 for the signed snapshot index
and encrypted snapshot objects. Neither backup service nor repository cleanup code can
delete them. Journal prefix/object lock is indefinite and excluded. Monthly restore
reads the signed index exact key and selects its oldest retained entry, without list.
Every recovery-pointer promotion also mirrors and exact-verifies its complete signed
app/PostgreSQL/tool/edge/host-bundle artifact set. The monthly registry-outage oracle
denies primary registry access and proves oldest-retained restore solely from that
immutable mirror.

- [ ] **Step 4: Write the exact operator runbook**

`docs/runbooks/backup-restore.md` gives exact installation commands for every distinct
reader/encryptor/uploader/signer/publisher/fetcher/decryptor/loader no-login user,
fixed Leaf 13 broker policy, systemd units/timers, root-owned credentials, and separate restore
host marker. It contains preflight commands that print only file presence/mode,
systemd unit verification, timers, stable status, 18h/24h alert checks, exact-key
permission denial tests, manual snapshot, continuous export, oldest-snapshot drill,
current recovery-image verification, evidence signature, and teardown. It explicitly
forbids adding either service to Docker group or copying the production environment.
It explains that a data-free coordinator requests only fixed rootless-runtime broker
operations and gives denial probes for host container/metadata/log sockets, generic
runtime/service operations, elevation, cross-principal credentials, and ambient cloud
principals.
The same runbook defines recipient and envelope-signer rotation, rollback, and
compromise response: add the new version, retain the old public verification root and
offline identity, run an isolated oldest-snapshot/all-journal-generation decrypt and
signature drill, then retire only the operational recipient. Optional rewrap writes
additive signed metadata at a new deterministic exact key and never replaces existing
ciphertext, envelopes, or signatures.

- [ ] **Step 5: GREEN, wiki delta, gates, and commit**

```bash
systemd-analyze verify deploy/systemd/munjib-*.service deploy/systemd/munjib-*.timer
pnpm exec vitest run tests/backup/automation.test.ts --reporter=dot
```

Add to `wiki/CI CD And Monitoring Workflow.md`:

```markdown
Encrypted snapshots run every 12 hours with 18-hour early warning and 24-hour RPO
breach; snapshot lifecycle is 7 daily/4 weekly/3 monthly. The immutable security
journal exports in bounded one-shot runs at <=60-second cadence and pages when
signed remote high-water lags more than five minutes; it is retained indefinitely.
Monthly drills run on a
separate no-egress host, select the oldest retained snapshot by signed exact-key index,
and use no Docker-group/full-environment/list permission.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:45:00+09:00 - recovery automation

- Source evidence: retention policy, hardened capture/export/staleness/restore units, separate-host runbook, and automation tests.
- Affected pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: snapshots now run every 12 hours with early RPO alert, journal export runs in credential-isolated one-shot batches and remains indefinite, and oldest-snapshot drills run under separate least privilege.
- Verification: systemd verification, automation tests, wiki manifest/lint, and staged sync check.
```

Run the standard staged wiki sequence and commit:

```bash
git add deploy/backup/retention-policy.json deploy/systemd deploy/host-helpers/manifest-v1.json tests/backup/automation.test.ts tests/deploy/attested-helper-bootstrap.test.ts docs/runbooks/backup-restore.md 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "ops: automate least-privilege recovery"
```

Expected: the first alert precedes RPO breach, journal retention is indefinite, and
restore authority is separated from production capture.

### Task 9: Full Verification, Disclosure Gates, Review, and First Oldest-Snapshot Drill

**Files:**
- Verify: all files from Tasks 1-8.
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/log.md`
- Regenerate: `wiki/manifest.json`

**Interfaces:**
- Consumes: quiesced capture, exhaustive manifest, continuous immutable journal,
  exhaustive deny replay, auth scrub, current-image isolated restore, signed readiness
  composite, least-privilege automation, and all prior task wiki deltas.
- Produces: reviewed exact-digest deployment, healthy 12-hour capture plus continuous
  journal/watchdog schedules, first
  oldest-retained drill, signed evidence, and confirmation destructive purge remains
  separately disabled.

- [ ] **Step 1: Run the complete verification matrix**

```bash
pnpm exec vitest run tests/backup tests/retention/recovery-readiness.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/encrypted-recovery-readiness-capability.test.ts tests/security/journal.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm run build
systemd-analyze verify deploy/systemd/munjib-*.service deploy/systemd/munjib-*.timer
pnpm audit --prod
```

Expected: all commands exit 0; no current applicable production advisory remains.
The suite includes a registry-disabled oldest-retained restore from the immutable
mirror; actual non-superuser loader/migrator search-path and COPY PROGRAM/extension/
server-file denial oracles; two independent Phase-B result binding; initial/retry/final
auth scrub idempotence; fixed pair/final-high-water startup binding; unprivileged
exact-key staging cleanup; and shared-lock contention across deploy, refresh, capture,
worker lifecycle, and purge.

Run these nonprinting contract scans:

```bash
LEGACY_RECOVERY_PATTERN='Security''TombstoneOutbox|security''TombstoneOutbox|recordSecurity''Tombstone|add_security_''tombstone_outbox|TOMB''STONE|journal'' event|MUNJIB_.*PURGE_''READY|OnCalendar=''daily|user''mod.*docker|SupplementaryGroups=''docker'
if rg -q "$LEGACY_RECOVERY_PATTERN" docs/runbooks lib/backup lib/retention scripts/backup deploy/backup deploy/systemd tests/backup tests/retention; then
  printf 'legacy recovery contract detected\n' >&2
  exit 1
fi
NONCANONICAL_JOURNAL_PATTERN='Number\([^)]*sequence|sequence[^[:space:]]*[[:space:]]*:[[:space:]]*number|SER''IAL|exported''At'
if rg -q "$NONCANONICAL_JOURNAL_PATTERN" lib/backup/journal-batch.ts lib/backup/journal-replay.ts scripts/backup/export-security-journal.ts scripts/backup/replay-security-journal.ts tests/backup/journal-export.test.ts tests/backup/journal-replay.test.ts; then
  printf 'noncanonical journal sequence detected\n' >&2
  exit 1
fi
UNSAFE_RECOVERY_IO_PATTERN='(/tmp|/var/tmp|HOME=|\$HOME).*\.(dump|tar)|deploy/sudoers|docker-compose\.restore|restore-drill\.sh|stage-restore-inputs|host.*container.*socket|plaintext.*(unix|named).*socket'
if rg -q "$UNSAFE_RECOVERY_IO_PATTERN" scripts/backup deploy/backup; then
  printf 'unsafe recovery IO or checkout-root contract detected\n' >&2
  exit 1
fi
if ! rg -q -- 'pg_restore --exit-on-error --single-transaction --no-owner --no-privileges' scripts/backup/restore-drill.ts; then
  printf 'fixed pg_restore flags missing\n' >&2
  exit 1
fi
```

- [ ] **Step 2: Add the exact local-development delta and final log entry**

Add to `wiki/Local Development Workflow.md`:

```markdown
Synthetic recovery verification runs with the focused `tests/backup` and
`tests/retention/recovery-readiness.test.ts` suites. Restore fixtures use only
invalid.example identities, current migrations, deterministic offline embeddings, and
an internal no-egress network. Never use production backup IDs, keys, env files,
accounts, provider credentials, or object listings in local tests.
```

Append to `wiki/log.md`:

```markdown
## 2026-07-12T00:50:00+09:00 - recovery program verification

- Source evidence: complete backup/restore/journal/readiness/automation implementation and verification matrix.
- Affected pages: [[Local Development Workflow]], [[CI CD And Monitoring Workflow]], [[Auth And Permissions Workflow]], [[Document Knowledge Model]], [[log|Wiki Log]].
- Result: recovery now combines 12-hour quiesced snapshots, indefinite journal export, exhaustive deny replay, current-image oldest-snapshot drills, full auth/provider scrub, READY integrity, and live signed purge readiness.
- Verification: full focused/all tests, build/type/audit, fixed broker/runtime/systemd checks, wiki manifest/lint, and staged sync check.
```

- [ ] **Step 3: Stage only public-safe implementation, run every wiki gate, and commit**

```bash
git add package.json lib/backup lib/retention/recovery-readiness.ts lib/retention/downstream/leaf14-production-readiness.ts scripts/backup deploy/backup deploy/security/capabilities/encrypted-recovery-readiness.json deploy/security/protected-artifact-owners.json deploy/systemd deploy/caddy/conf.d/munjib-maintenance.enabled.caddy tests/backup tests/retention/recovery-readiness.test.ts tests/security/active-resource-downstream-extension-contract.test.ts tests/security/encrypted-recovery-readiness-capability.test.ts docs/runbooks/backup-restore.md docs/runbooks/isolated-recovery-gate.md 'wiki/Auth And Permissions Workflow.md' 'wiki/Document Knowledge Model.md' 'wiki/CI CD And Monitoring Workflow.md' 'wiki/Local Development Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --name-only
if git diff --cached -- . ':!docs/superpowers/' | rg -q '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|NEXTAUTH_SECRET=\S+|DATABASE_URL=.+@|API_KEY=\S+|backupId\"?:\"?[^s]|https?://[^ ]+\?[^ ]+)'; then
  printf 'staged secret-or-recovery-evidence scan failed\n' >&2
  exit 1
fi
git commit -m "docs: finalize encrypted recovery operations"
```

Expected: guards pass; scan prints no match; local security plans/specs, real evidence,
destinations, counts, identities, topology, and secrets are absent.

- [ ] **Step 4: Push, review, and inspect checks/threads in bounded intervals**

```bash
git push -u origin HEAD
gh pr create --fill --draft
gh pr ready
```

Use five Codex product waits of at most 60 seconds, checking `gh pr checks` after each;
never use shell sleep. After five minutes:

```bash
gh pr checks
gh pr view --json reviewDecision,reviews,statusCheckRollup
OWNER="$(gh repo view --json owner --jq .owner.login)"
NAME="$(gh repo view --json name --jq .name)"
NUMBER="$(gh pr view --json number --jq .number)"
gh api graphql -f owner="$OWNER" -f name="$NAME" -F number="$NUMBER" -f query='
query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{author{login}body path line}}}}}}}
' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)]'
```

Expected: checks pass and GraphQL prints `[]`. Fix each failure/actionable thread with
RED-to-GREEN, repeat task-specific wiki/secret gates, push, and poll/query again.

- [ ] **Step 5: Deploy and prove the first operational cycle**

After approval, deploy the exact current attested digest through Issue 13 and verify
current floor/evidence/recovery records. Install the attested fixed broker/principal
bundle and hardened capture/export/staleness units; install fetch/decrypt/loader/
coordinator restore units only on the separate marked host.
Run one snapshot plus repeated one-shot journal export, wait for exact-key checksum/status,
then run the oldest retained snapshot drill with current recovery image. Verify signed
evidence binds current digest/floor, exhaustive manifest, final journal high-water,
auth/invitation/support/provider scrub, READY hashes, offline RAG, RPO/RTO, and teardown.

Verify 12-hour snapshot, one-shot <=60-second export cadence, five-minute journal
lag page, and the 18-hour snapshot alert oracle. Keep
destructive purge disabled. Evaluate the Issue 14 composite against live Issue 9/11
providers and signed current restore evidence, test the digest/epoch/checkpoint race,
and record only pass/fail in restricted operations evidence. Enabling purge remains a
separate reviewed operator action.

Expected: recovery objectives pass on the oldest snapshot with no egress/leftovers;
journal retention remains indefinite; no real restored identity can authenticate; and
no boolean/stale evidence can enable purge.
