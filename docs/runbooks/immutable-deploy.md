# Immutable deploy: migration and database authority

This runbook records the public-safe Leaf 13B database gate. It does not contain
credentials, host topology, release evidence, or journal contents.

## Admission checks

1. Build the image migration list from the exact `prisma/migrations/*/migration.sql`
   bytes and compare it with `deploy/security/migration-ledger.json`.
2. Require successful production rows to be an exact name/checksum prefix of the
   image list. A failed, rolled-back, unresolved, edited, or nonmonotonic row
   stops admission; do not skip or rewrite history.
3. Classify migrations as additive `EXPAND` or explicitly marked `CONTRACT`.
   Destructive SQL is never valid in `EXPAND`; data-destructive statements are
   rejected even in `CONTRACT`.

```bash
pnpm exec tsx scripts/deploy/check-migration-history.ts
# When a broker-provided, public-safe export of _prisma_migrations is available:
pnpm exec tsx scripts/deploy/check-migration-history.ts <production-history.json>
pnpm exec tsx scripts/deploy/check-expand-contract.ts <migration.sql> EXPAND
```

The optional production export accepts either Prisma's exact snake_case columns
(`migration_name`, `finished_at`, `rolled_back_at`, `applied_steps_count`) or
their explicit camelCase adapter names; every required field is validated and
partial rows fail closed. Rows are canonically sorted by migration name before
the prefix validator runs. Without a production-history export the checker reports the ledger and pending
allocation as `production_prefix=not_provided`; it does not claim a live database
admission. The broker's signed operation must provide the JSON rows to activate
the exact prefix/checksum gate before migration.

## Role boundary

The root-held bootstrap operation creates a `NOLOGIN` schema owner, a
`NOINHERIT` migration login, and separate `NOINHERIT` Web/RAG logins. Only the
fixed migration operation may set `ROLE munjib_schema_owner`. Web and RAG have
application DML/read privileges only; they cannot create schema objects,
truncate, alter ownership, or use journal roles. The bootstrap assigns public
schema ownership to the schema owner before the first migration; Web/RAG are
then denied all access to Prisma's `_prisma_migrations` ledger. Journal
owner/exporter roles remain `NOLOGIN` placeholders until their independently
reviewed migration.

All entrypoints clear caller-provided libpq variables, use one fixed credential
file, URL-encodes the file contents into the password component of `DATABASE_URL`,
and carries `search_path`/migrator role through PostgreSQL's URL `options` query
parameter. The migration operation is
the only operation that adds the owner role. A public-schema shadow must never
change security-sensitive name resolution.

## database-role-v1

`deploy/host-bundles/database-role-v1/manifest.json` is the sole allowlist for
the pre-journal SQL bundle. The builder copies only manifest-listed regular
files, verifies their SHA-256 digests, and emits mode `0400` destinations. The
bundle carries `PRE_JOURNAL` evidence and creates neither `pgcrypto` nor journal
tables/genesis rows.

```bash
pnpm exec tsx scripts/deploy/build-database-role-bundle.ts <output-dir>
```

The broker verifies the manifest and digest before installation. It never reads
privileged files from a checkout selected by an untrusted caller.

## Verification

```bash
pnpm exec vitest run \
  tests/deploy/migration-history.test.ts \
  tests/deploy/migration-policy.test.ts \
  tests/deploy/database-role-separation.test.ts \
  tests/deploy/database-role-bundle.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

## Exact-digest private blue/green gate

The production Compose source is an immutable security projection. Web,
migrator, and tools consume the same exact application image digest while the
PostgreSQL and storage-init images are independently digest-pinned. The base
runtime has no PostgreSQL host port, binds Web only to loopback, runs as
`10001:10001` read-only with `CAP_DROP=ALL`, `no-new-privileges`, and `/tmp`
and `/run` tmpfs writes. Runtime credentials are separate file-backed secrets
with uid/gid `10001` and mode `0400`.

Candidate Web is a distinct private service. It publishes no port, has no
attachment volume, and disables email, OAuth callbacks, background jobs,
indexing, external providers, and attachment writes. Candidate qualification
requires native `linux/arm64`, exact app/PostgreSQL/host-bundle digests,
attestation and fresh evidence, an exact migration prefix, candidate smoke
evidence, private-binding verification, and an independently revalidated
broker envelope.

The GitHub deploy job remains fail-closed until the installed root broker
advertises the fixed `MIGRATE` and `PROMOTE` operations and the repository
variable `MUNJIB_PRIVATE_RUNTIME_BROKER_READY=true` is enabled. Leaf 13A's
current policy intentionally contains only substrate operations; enabling this
flag before the broker extension is installed would be unsafe.

Promotion is crash-safe and monotonic: `PREPARED` → `TRAFFIC_SWITCHED` →
`COMMITTED`. The broker owns fixed Compose/network/command descriptors; callers
cannot select tags, paths, host ports, environment keys, entrypoints, or
commands. Pre-switch interruption removes the candidate. A rollback is
admitted only when its recorded capability floor is not below the current
floor; otherwise maintenance/fix-forward is required.

```bash
pnpm exec tsx scripts/deploy/verify-private-bindings.ts <private-bindings.json>
pnpm exec tsx scripts/deploy/qualify-candidate.ts <candidate.json>
```
