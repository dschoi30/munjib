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

Without a production-history export the checker reports the ledger and pending
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
file, and set `search_path` with `pg_catalog` first. The migration operation is
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
